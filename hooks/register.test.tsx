import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import type { ReactionSettings } from '../types'
import { blockKey, splitBlocks, xIntent } from './logic'

// A slow store in a test: a settings read waits for this to resolve. The test runner has timers; the mod's types do not.
declare function setTimeout(fn: (value?: unknown) => void, ms: number): unknown
let gate: Promise<void> | null = null
let reads = 0

const ANSWER = 'Чашка чая не спасёт, но запах до утра держится, а кухня пустая. Варенье есть, проверенное.'

const TWO = `${ANSWER}\n\nВторой абзац про другое.`
// A paragraph's address follows its text.
const BLOCK0 = `m1#${blockKey(splitBlocks(TWO), 0)}`

// The clock of the world under the mod: the test moves it itself (line folding, timers).
let clock: ReturnType<typeof mock.clock>
// What the mod asked of the world: models called, toasts shown, files written, store reads.
let models: string[] = []
// The requests the mod sent to the model, in order.
let prompts: string[] = []
let toasts: string[] = []
let files: Map<string, string>
let gets: string[] = []
// The session id the world answers; a /clear moves it on.
let sid = 'sess-1'
// Surfaces drawing the session: the desktop app attaches one, a -p run none.
let surfaces: ('terminal' | 'desktop' | 'vscode' | 'mobile')[] = []
// Cached answers the mod asked the engine to compute again.
let invalidated: string[] = []
// What the mod put on the clipboard.
let copied: string[] = []

const MESSAGE = (text: string, requestId = 'm1') =>
  ({
    plugin: 'chefkiss',
    component: 'AssistantMessage',
    requestId,
    props: { text, isFirstOfReply: true },
  }) as const

const PANE = <S extends 'terminal' | 'desktop' | 'vscode' | 'mobile'>(surface: S) =>
  ({
    plugin: 'chefkiss',
    component: 'Pane',
    requestId: 'chefkiss',
    surface,
    props: { title: 'chefkiss', isFocused: false, bodyColumns: 48, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
  }) as const

const USAGE = { input_tokens: 10, output_tokens: 8, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
const REFUSED = { isAnswered: false as const, reason: 'api-error' as const, status: 403, error: 'invalid_request' as const, usage: USAGE }

type Reply = { isAnswered: true; text: string; usage: typeof USAGE } | typeof REFUSED

type World = {
  selection?: { text: string; requestId?: string }
  // What the model answers: one line for every model, or an answer by model.
  reply?: string | ((model: string) => Reply)
  // Settings already in the store; the "paragraphs and highlight" experiment is off by default.
  settings?: Partial<ReactionSettings>
  // The engine version: from 2.1.308 text takes size and weight.
  engine?: string
}

// The world under the mod: a history with one final answer, a model that answers with a line, and an in-memory store
// of the test's own, so the test can read what the mod put there.
function world(on: Parameters<TestBody>[1], w: World = {}) {
  const mem = new Map<string, unknown>()
  models = []
  prompts = []
  toasts = []
  files = new Map()
  gets = []
  sid = 'sess-1'
  surfaces = []
  invalidated = []
  copied = []
  if (w.settings) mem.set('settings', { v: 1, pack: 'soft', journalDir: '', digest: true, modelCalls: true, paragraphs: false, ...w.settings })
  gate = null
  reads = 0
  on('store.get', (_, e) => {
    gets.push(e.key)
    // The value as it was when the read began; with a gate, it arrives only when the gate opens.
    const v = mem.get(e.key)
    if (e.key === 'settings' && gate) {
      reads++
      return gate.then(() => ({ value: v }))
    }
    return { value: v }
  })
  on('store.set', (_, e) => {
    mem.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined }
  })
  on('store.delete', (_, e) => {
    mem.delete(e.key)
    return { value: undefined }
  })
  on('store.keys', () => ({ value: [...mem.keys()] }))
  clock = mock.clock(on)
  on('command.register', () => ({ value: { command: 'chefkiss' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.copy', (_, e) => {
    copied.push(e.text)
    return { value: { isCopied: true as const } }
  })
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  // The engine hands the hook a path native to the machine: on Windows "/a" arrives as "C:\a".
  on('fs.write', (_, e) => {
    files.set(e.path.replace(/\\/g, '/').replace(/^[A-Za-z]:/, ''), e.text)
    return { value: undefined }
  })
  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? '/home/me' : undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('session.root', () => ({ value: '/work/project' }))
  on('session.id', () => ({ value: sid }))
  on('session.surfaces', () => ({ value: surfaces }))
  on('session.attach', (_, e) => ({ clientId: e.clientId }))
  on('ui.invalidate', (_, e) => {
    invalidated.push(e.event)
    return { value: undefined }
  })
  on('session.version', () => ({ value: { version: w.engine ?? '2.1.309', base: w.engine ?? '2.1.309' } }))
  on('session.messages', () => ({
    value: [
      { role: 'user', text: 'чем пахнет на кухне?', toolUses: [] },
      { role: 'assistant', text: ANSWER, toolUses: [] },
    ],
  }))
  on('ui.selection', () => ({ value: w.selection }))
  const reply = w.reply ?? '«понял: начинать с вывода»'
  on('model.complete', (_, e) => {
    models.push(e.model)
    prompts.push(e.prompt)
    return { value: typeof reply === 'string' ? { isAnswered: true, text: reply, usage: USAGE } : reply(e.model) }
  })
  return mem
}

// The app's own drawing of an answer, beneath the mod.
function engineText(on: Parameters<TestBody>[1]) {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
}

const start = (
  $: Parameters<TestBody>[0],
  surface: 'terminal' | 'desktop' | 'vscode' | 'mobile' = 'desktop',
  isInteractive = true,
) => $.session.start({ cwd: '/work/project', surface, isInteractive })

const lessonKeys = (mem: Map<string, unknown>) => [...mem.keys()].filter(k => k.startsWith('l:'))

const seedLesson = (mem: Map<string, unknown>, key: string, line: string, at: number) =>
  mem.set(key, { v: 1, key, ref: 'm0', kind: 'fire', line, at, project: 'project', session: 'sess-0' })

test('no reactions under intermediate text', async ($, on) => {
  world(on)
  engineText(on)
  await start($)
  const ui = await $.ui.mount({ ...MESSAGE('Проверю каталог плагинов.'), surface: 'desktop' })
  expect(await ui.find({ type: 'Button' })).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()
})

test('a final answer gets three reactions on every surface', async ($, on) => {
  world(on)
  engineText(on)
  await start($)
  // Phone and terminal: the answer's native text and a row of three reactions under it.
  for (const surface of ['terminal', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...MESSAGE(ANSWER), surface })
    expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
    expect((await ui.findAll({ type: 'Button' })).length).toBe(3)
    await ui.unmount()
  }
  // By default, with a mouse too, the app draws the answer: three reactions under it.
  for (const surface of ['desktop', 'vscode'] as const) {
    const ui = await $.ui.mount({ ...MESSAGE(`${ANSWER}\n\nВторой абзац.`), surface })
    expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
    expect((await ui.findAll({ type: 'Button' })).length).toBe(3)
    await ui.unmount()
  }
})

test('a finished turn puts the row under its answer; an interrupted or subagent turn does not', async ($, on) => {
  world(on)
  engineText(on)
  await start($)
  const fresh = 'Новый ответ, которого нет в истории беседы, но он финальный.'
  const turn = { durationMs: 10, isAborted: false, turnId: 't1' }
  for (const [text, end] of [
    ['Прерванный ответ, его не досказали до конца, реакции не нужны.', { ...turn, answer: '', reason: 'aborted' as const, isAborted: true }],
    ['Отчёт субагента: он уходит родителю, а не человеку под ответом.', { ...turn, answer: '', reason: 'answer' as const, agentId: 'a1' }],
  ] as const) {
    await $.turn.complete({ ...end, answer: text })
    const ui = await $.ui.mount({ ...MESSAGE(text, 'm9'), surface: 'desktop' })
    expect(await ui.find({ type: 'Button' })).toBeUndefined()
    await ui.unmount()
  }
  const ui = await $.ui.mount({ ...MESSAGE(fresh, 'm2'), surface: 'desktop' })
  expect(await ui.find({ type: 'Button' })).toBeUndefined()
  await $.turn.complete({ ...turn, answer: fresh, reason: 'answer' })
  expect((await ui.findAll({ type: 'Button' })).length).toBe(3)
  await ui.unmount()
})

test('a reaction redraws only its own message', async ($, on) => {
  world(on)
  const drawn = new Map<string, number>()
  on('ui.render', ($, e) => {
    drawn.set(e.requestId, (drawn.get(e.requestId) ?? 0) + 1)
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  await start($)
  const one = await $.ui.mount({ ...MESSAGE(ANSWER, 'm1'), surface: 'desktop' })
  const two = await $.ui.mount({ ...MESSAGE(ANSWER, 'm2'), surface: 'desktop' })
  const before = { m1: drawn.get('m1') ?? 0, m2: drawn.get('m2') ?? 0 }
  await one.press({ key: 'm1:fire' })
  await clock.advance(10000)
  expect(drawn.get('m1') ?? 0).toBeGreaterThan(before.m1)
  expect(drawn.get('m2') ?? 0).toBe(before.m2)
  await one.unmount()
  await two.unmount()
})

// The hover copy of a picture: the same icon with a plaque on the whole box.
const isPlaque = (s: { props: { source?: unknown } }) => String(s.props.source).includes('fill="rgba(128,128,128,.165)"')

test('with a mouse the row buttons carry own icons; phone and text packs get native buttons', async ($, on) => {
  world(on)
  engineText(on)
  await start($)
  const ui = await $.ui.mount({ ...MESSAGE(ANSWER), surface: 'desktop' })
  // Row icons are found by their picture's viewBox: the icon under the answer is drawn in another.
  const icons = async () =>
    (await ui.findAll({ type: 'Svg' })).filter(
      s => String(s.props.source).includes('viewBox="-6 -6 76 76"') && !String(s.props.source).includes('class="chip"') && !isPlaque(s),
    )
  // A picture under each button; the button itself is transparent.
  expect((await icons()).length).toBe(3)
  // Over each, a copy with a plaque on the whole box waits for the cursor: a frame taller than the app's own.
  expect((await ui.findAll({ type: 'Svg' })).filter(s => isPlaque(s) && !String(s.props.source).includes('class="chip"')).length).toBe(3)
  expect((await ui.find({ key: 'm1:fire' }))?.props.plain).toBe(true)
  // The reaction's name is in the picture's alt: the desktop draws the button's label, and it holds only spaces.
  expect((await icons()).map(s => s.props.alt)).toEqual(['🤌 Chef’s kiss — how it’s said', '🎯 Spot on — what it says', '💩 Slop — reads like AI'])
  await ui.press({ key: 'm1:fire' })
  // The placed one glows and says a press removes it; the other two lose colour.
  const after = await icons()
  expect(after.filter(s => String(s.props.source).includes('rxglow')).map(s => s.props.alt)).toEqual(['🎯 Spot on — remove'])
  expect(after.filter(s => String(s.props.source).includes('rxmute')).length).toBe(2)
  await ui.unmount()
  const phone = await $.ui.mount({ ...MESSAGE(ANSWER), surface: 'mobile' })
  expect((await phone.find({ key: 'm1:fire' }))?.props.plain).toBeUndefined()
  await phone.unmount()
})

test('a text pack keeps native row buttons even with a mouse', async ($, on) => {
  world(on, { settings: { pack: 'kaomoji' } })
  engineText(on)
  await start($)
  const ui = await $.ui.mount({ ...MESSAGE(ANSWER), surface: 'desktop' })
  const fire = await ui.find({ key: 'm1:fire' })
  expect(fire?.props.plain).toBeUndefined()
  expect(fire?.props.label).toBe('(⌐■_■)')
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  // With a mouse each native button stands in a box a cell wider than its label's estimate: the app cuts a label
  // that does not fit its box, and a placed button's heavier label is a few pixels wider. That cell is also the air
  // between buttons, so the row itself has no gap.
  const boxes = (await ui.findAll({ type: 'Box' })).filter(b => b.key?.startsWith('rb-'))
  expect(boxes.map(b => Math.round(Number(b.props.width) * 10) / 10)).toEqual([6.9, 9.9, 8.3])
  expect((await ui.findAll({ type: 'Box' })).some(b => b.props.gap === 1 && b.props.position === 'absolute')).toBe(false)
  // With a mouse, text buttons say what they mean on hover too, as picture buttons do.
  expect((await ui.find({ type: 'Text', text: /^🎯 Spot on · what it says$/ }))?.text).toBeDefined()
  // A placed kaomoji takes a cell as wide as its own face and the plain button's padding, set to the left:
  // (⌐■_■) with its two heavy squares takes 8 cells, so it is not cut and its neighbours sit close.
  await ui.press({ key: 'm1:fire' })
  const cells = (await ui.findAll({ type: 'Box' })).filter(b => b.props.flexShrink === 0 && b.props.justifyContent === 'flex-start')
  expect(cells.map(b => b.props.width)).toEqual([8])
  // It is as tall as a picture icon: an empty picture gives its box that height, and the plain button stretches to it.
  expect(cells[0]?.props.alignItems).toBe('stretch')
  expect((await ui.findAll({ type: 'Svg' })).filter(s => s.props.width === 1 && s.props.height === 28).length).toBe(1)
  await ui.unmount()
  // In the pane, swapping the pictures is a section of its own, apart from the packs.
  const pane = await $.ui.mount(PANE('desktop'))
  expect((await pane.find({ type: 'Text', text: /^Buttons$/ }))?.text).toBe('Buttons')
  await pane.unmount()
})

test('paragraph reaction: the piece is highlighted in the text, and that paragraph goes to Claude', async ($, on) => {
  world(on, { selection: { text: 'запах до утра держится', requestId: 'm1' }, settings: { paragraphs: true } })
  engineText(on)
  let context: readonly string[] = []
  on('prompt.submit', (_, e) => {
    context = e.context ?? []
    return { text: e.text, context: e.context }
  })
  await start($)
  const ui = await $.ui.mount({ ...MESSAGE(TWO), surface: 'desktop' })
  await ui.press({ key: `${BLOCK0}:fire` })
  // Exactly the selected piece is highlighted.
  expect((await ui.find({ type: 'Text', text: /^запах до утра держится$/ }))?.text).toBe('запах до утра держится')
  await $.prompt.submit({ text: 'дальше', wait: false, origin: { kind: 'composer' } })
  expect(context[0]).toContain('🎯 on a paragraph of your reply: «Чашка чая не спасёт')
  // The phone has no paragraphs, but a paragraph reaction shows as an icon under the answer.
  const phone = await $.ui.mount({ ...MESSAGE(TWO), surface: 'mobile' })
  expect((await phone.find({ type: 'Text', text: /¶/ }))?.text).toBe('¶')
  await phone.unmount()
  // The lit button in the row removes the reaction.
  await ui.press({ key: `${BLOCK0}:fire` })
  expect(await ui.find({ type: 'Text', text: /^запах до утра держится$/ })).toBeUndefined()
  await ui.unmount()
})

test('the whole-answer button with a selection inside a paragraph puts the reaction on that paragraph', async ($, on) => {
  const mem = world(on, { selection: { text: 'запах до утра держится', requestId: 'm1' }, settings: { paragraphs: true } })
  engineText(on)
  await start($)
  const ui = await $.ui.mount({ ...MESSAGE(TWO), surface: 'desktop' })
  await ui.press({ key: 'm1:heart' })
  expect((await ui.find({ type: 'Text', text: /^запах до утра держится$/ }))?.text).toBe('запах до утра держится')
  const saved = mem.get('m:sess-1') as { marks: Record<string, { kinds: string[] }> }
  expect(saved.marks[BLOCK0]?.kinds).toEqual(['heart'])
  expect(saved.marks.m1).toBeUndefined()
  await ui.unmount()
})

test('a selection from another paragraph does not attach to a reaction on this one', async ($, on) => {
  world(on, { selection: { text: 'Второй абзац', requestId: 'm1' }, settings: { paragraphs: true } })
  engineText(on)
  let context: readonly string[] = []
  on('prompt.submit', (_, e) => {
    context = e.context ?? []
    return { text: e.text, context: e.context }
  })
  await start($)
  const ui = await $.ui.mount({ ...MESSAGE(TWO), surface: 'desktop' })
  await ui.press({ key: `${BLOCK0}:fire` })
  await $.prompt.submit({ text: 'дальше', wait: false, origin: { kind: 'composer' } })
  expect(context[0]).not.toContain('selected:')
  await ui.unmount()
})

test('paragraphs (beta): each paragraph has its own reactions; the pane checkbox shows only once turned on', async ($, on) => {
  const mem = world(on, { settings: { paragraphs: true } })
  on('ui.render', { component: 'AssistantMessage' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  await start($)
  // The experiment is on: the mod draws the answer, each paragraph with its own three reactions.
  const ui = await $.ui.mount({ ...MESSAGE(`${ANSWER}\n\nВторой абзац.`), surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /engine/ })).toBeUndefined()
  expect((await ui.findAll({ type: 'Button' })).length).toBe(9)
  await ui.unmount()
  // Once turned on, the checkbox is shown so it can be turned off; turned off, it leaves the pane.
  const pane = await $.ui.mount(PANE('desktop'))
  await pane.press({ key: 'paragraphs' })
  expect(mem.get('settings')).toEqual(expect.objectContaining({ paragraphs: false }))
  expect(await pane.find({ key: 'paragraphs' })).toBeUndefined()
  await pane.unmount()
})

test('pane: "Sum up" turns lessons into a taste summary that opens new conversations instead of raw lessons', async ($, on) => {
  const mem = world(on, { reply: 'VERDICT: Терпит всё, кроме пересказа\n1. вывод первым\n2. «без воды»\n- тёплый тон' })
  for (const [i, line] of ['понял: вывод первым', 'понял: без воды', 'понял: тёплый тон'].entries()) seedLesson(mem, `l:${i + 1}:a`, line, i + 1)
  // Under the mod, the start of the conversation adds nothing of its own.
  on('prompt.context', (_, e) => ({ blocks: e.blocks }))
  await start($)
  const pane = await $.ui.mount(PANE('desktop'))
  expect((await pane.find({ key: 'sum-up' }))?.props.label).toBe('Sum up')
  await pane.press({ key: 'sum-up' })
  expect(mem.get('profile')).toEqual(
    expect.objectContaining({ v: 1, verdict: 'Терпит всё, кроме пересказа', text: 'вывод первым\nбез воды\nтёплый тон', from: 3, at: 3, keys: ['l:1:a', 'l:2:a', 'l:3:a'] }),
  )
  expect((await pane.find({ type: 'Text', text: /^без воды$/ }))?.text).toBe('без воды')
  expect((await pane.find({ type: 'Text', text: /^Терпит всё/ }))?.text).toBe('Терпит всё, кроме пересказа')
  expect((await pane.find({ key: 'sum-up' }))?.props.label).toBe('Update')
  // The cross on a summary line removes only that line.
  await pane.press({ key: 'drop-profile:2' })
  expect((mem.get('profile') as { text: string }).text).toBe('вывод первым\nбез воды')
  // A new conversation: the summary instead of raw lessons.
  const out = await $.prompt.context({ blocks: [] })
  const digest = out.blocks.find(b => b.name === 'chefkiss')?.text ?? ''
  expect(digest).toContain('- без воды')
  expect(digest).not.toContain('понял: вывод первым')
  // The verdict is for the person and the card: Claude does not get it.
  expect(digest).not.toContain('Терпит всё')
  // A verdict the person does not like goes alone; the lines stay.
  await pane.press({ key: 'drop-verdict' })
  expect(mem.get('profile')).not.toHaveProperty('verdict')
  expect((mem.get('profile') as { text: string }).text).toBe('вывод первым\nбез воды')
  expect(await pane.find({ key: 'drop-verdict' })).toBeUndefined()
  // What was crossed out is kept apart from the summary, and the next Update is told not to write it again.
  expect((mem.get('crossed') as { items: unknown[] }).items).toEqual([
    { kind: 'line', text: 'тёплый тон' },
    { kind: 'verdict', text: 'Терпит всё, кроме пересказа' },
  ])
  prompts = []
  await pane.press({ key: 'sum-up' })
  expect(prompts[0]).toContain('do not write these again, nor the same in other words:\n- тёплый тон')
  expect(prompts[0]).toContain('write a new one, in other words:\n- Терпит всё, кроме пересказа')
  // The model wrote both again word for word: they stay out.
  expect(mem.get('profile')).not.toHaveProperty('verdict')
  expect((mem.get('profile') as { text: string; lang: string }).text).toBe('вывод первым\nбез воды')
  expect((mem.get('profile') as { lang: string }).lang).toBe('ru')
  // A lesson from the summary's basis is forgotten, so the summary is too: it no longer goes into conversations.
  // What was crossed out stays: it is the person's correction, not a part of that summary.
  await pane.press({ key: 'forget:l:2:a' })
  expect((mem.get('crossed') as { items: unknown[] }).items).toHaveLength(2)
  expect(mem.has('profile')).toBe(false)
  const after = await $.prompt.context({ blocks: [] })
  expect(after.blocks.find(b => b.name === 'chefkiss')?.text ?? '').not.toContain('summed up')
  await pane.unmount()
})

test('🎯 with a selection: icon, Claude’s line, lesson and a note on the next message', async ($, on) => {
  const mem = world(on, { selection: { text: 'запах до утра держится', requestId: 'm1' } })
  engineText(on)
  let context: readonly string[] = []
  on('prompt.submit', (_, e) => {
    context = e.context ?? []
    return { text: e.text, context: e.context }
  })
  await start($)
  // The phone has no paragraphs: a reaction with a selection goes on the whole answer.
  const ui = await $.ui.mount({ ...MESSAGE(ANSWER), surface: 'mobile' })
  await ui.press({ key: 'm1:fire' })

  expect((await ui.find({ type: 'Text', text: /понял: начинать с вывода/ }))?.text).toBe('понял: начинать с вывода')
  expect(models).toEqual(['sonnet'])
  const lessons = lessonKeys(mem)
  expect(lessons.length).toBe(1)
  expect(mem.get(lessons[0] ?? '')).toEqual(expect.objectContaining({ kind: 'fire', line: 'понял: начинать с вывода', project: 'project' }))

  // Icons will survive a session restart: a copy of the reactions is in the store under m:<session>.
  const saved = mem.get('m:sess-1') as { marks: Record<string, { kinds: string[]; excerpt: string; frag: string }> }
  expect(saved.marks.m1?.kinds).toEqual(['fire'])
  // No quotes from the answer in the store.
  expect(saved.marks.m1?.excerpt).toBe('')
  expect(saved.marks.m1?.frag).toBe('')

  await $.prompt.submit({ text: 'дальше', wait: false, origin: { kind: 'composer' } })
  expect(context.length).toBe(1)
  expect(context[0]).toContain('🎯 on your reply starting «Чашка чая не спасёт')
  expect(context[0]).toContain('selected: «запах до утра держится»')
  expect(context[0]).toContain('you read it as: понял: начинать с вывода')
  // The note goes once.
  await $.prompt.submit({ text: 'ещё', wait: false, origin: { kind: 'composer' } })
  expect(context.length).toBe(0)
  await ui.unmount()
})

test('model calls off: no lines, lessons or summary, and the reaction still reaches Claude', async ($, on) => {
  const mem = world(on, { settings: { modelCalls: false } })
  for (const i of [1, 2, 3]) seedLesson(mem, `l:${i}:a`, `понял: урок ${i}`, i)
  engineText(on)
  let context: readonly string[] = []
  on('prompt.submit', (_, e) => {
    context = e.context ?? []
    return { text: e.text, context: e.context }
  })
  await start($)
  const ui = await $.ui.mount({ ...MESSAGE(ANSWER), surface: 'desktop' })
  await ui.press({ key: 'm1:fire' })
  await clock.advance(20000)
  expect(models).toEqual([])
  expect(lessonKeys(mem).length).toBe(3)
  expect(await ui.find({ type: 'Text', text: /понял|…/ })).toBeUndefined()
  await $.prompt.submit({ text: 'дальше', wait: false, origin: { kind: 'composer' } })
  expect(context[0]).toContain('🎯 on your reply starting «Чашка чая не спасёт')
  expect(context[0]).not.toContain('you read it as')
  // The pane says why there is no summary, and the switch turns model calls back on.
  const pane = await $.ui.mount(PANE('desktop'))
  expect(await pane.find({ key: 'sum-up' })).toBeUndefined()
  expect((await pane.find({ type: 'Text', text: /Lessons are off in Settings/ }))?.text).toBeDefined()
  expect((await pane.find({ key: 'model-calls' }))?.props.label).toBe('☐ Claude writes lessons')
  await pane.press({ key: 'model-calls' })
  expect(mem.get('settings')).toEqual(expect.objectContaining({ v: 1, modelCalls: true }))
  expect((await pane.find({ key: 'sum-up' }))?.props.label).toBe('Sum up')
  await pane.unmount()
  await ui.unmount()
})

test('model calls switched off in another open session: the next reaction here writes no line', async ($, on) => {
  const mem = world(on)
  engineText(on)
  await start($)
  // Another session saves the switch; this one started with it on.
  mem.set('settings', { ...(mem.get('settings') as object), v: 1, modelCalls: false })
  const ui = await $.ui.mount({ ...MESSAGE(ANSWER), surface: 'desktop' })
  await ui.press({ key: 'm1:fire' })
  await clock.advance(20000)
  expect(models).toEqual([])
  expect(await ui.find({ type: 'Text', text: /понял|…/ })).toBeUndefined()
  await ui.unmount()
})

test('a pack chosen in another open session reaches this one within seconds, without a reaction here', async ($, on) => {
  const mem = world(on)
  engineText(on)
  await start($)
  const ui = await $.ui.mount({ ...MESSAGE(ANSWER), surface: 'desktop' })
  expect((await ui.find({ key: 'm1:fire' }))?.props.label).not.toBe('(⌐■_■)')
  // Another session saves Kaomoji; this one finds out on its next look at the store.
  mem.set('settings', { ...(mem.get('settings') as object), v: 1, pack: 'kaomoji' })
  await clock.advance(3100)
  expect((await ui.find({ key: 'm1:fire' }))?.props.label).toBe('(⌐■_■)')
  // /clear goes on in the same process with no new start: the poll goes on with it.
  await $.session.end({ reason: 'clear', sessionId: 'sess-1', resume: { id: 'sess-1' } })
  sid = 'sess-2'
  mem.set('settings', { ...(mem.get('settings') as object), v: 1, pack: 'soft' })
  await clock.advance(3100)
  expect((await ui.find({ key: 'm1:fire' }))?.props.label).not.toBe('(⌐■_■)')
  await ui.unmount()
})

test('a refused model: Haiku stands in for Sonnet, and with both down the person hears why once', async ($, on) => {
  const down = new Set(['sonnet'])
  const mem = world(on, { reply: m => (down.has(m) ? REFUSED : { isAnswered: true, text: 'понял: коротко и прямо', usage: USAGE }) })
  engineText(on)
  await start($)
  const ui = await $.ui.mount({ ...MESSAGE(ANSWER), surface: 'mobile' })
  await ui.press({ key: 'm1:fire' })
  expect(models).toEqual(['sonnet', 'haiku'])
  expect((await ui.find({ type: 'Text', text: /понял: коротко и прямо/ }))?.text).toBe('понял: коротко и прямо')
  expect(lessonKeys(mem).length).toBe(1)
  down.add('haiku')
  await ui.press({ key: 'm1:heart' })
  await ui.press({ key: 'm1:slop' })
  expect(lessonKeys(mem).length).toBe(1)
  expect(toasts.filter(t => t.includes('Claude could not write a lesson (api-error)')).length).toBe(1)
  // No line is left hanging at "…".
  expect(await ui.find({ type: 'Text', text: /^…$/ })).toBeUndefined()
  await ui.unmount()
})

test('a line refused as a quote is asked for once more, told why; refused twice, no line and no lesson', async ($, on) => {
  const replies = ['понял: чашка чая не спасёт, но запах', 'понял: коротко, без пересказа ответа']
  const mem = world(on, { reply: () => ({ isAnswered: true, text: replies.shift() ?? 'понял: чашка чая не спасёт, но запах', usage: USAGE }) })
  engineText(on)
  await start($)
  const ui = await $.ui.mount({ ...MESSAGE(ANSWER), surface: 'desktop' })
  await ui.press({ key: 'm1:slop' })
  expect(models).toEqual(['sonnet', 'sonnet'])
  expect(prompts[1]).toContain('was refused: it repeats «чашка чая не спасёт но»')
  expect((await ui.find({ type: 'Text', text: /понял: коротко, без пересказа ответа/ }))?.text).toBe('понял: коротко, без пересказа ответа')
  expect(lessonKeys(mem).length).toBe(1)
  // Both tries quote the answer: the reaction stays, with no line, no lesson and nothing left at "…".
  await ui.press({ key: 'm1:fire' })
  expect(models.length).toBe(4)
  expect(lessonKeys(mem).length).toBe(1)
  expect(await ui.find({ type: 'Text', text: /^…$/ })).toBeUndefined()
  await ui.unmount()
})

test('a reaction removed before sending never reaches Claude, and its lesson is removed', async ($, on) => {
  const mem = world(on)
  engineText(on)
  let context: readonly string[] = []
  on('prompt.submit', (_, e) => {
    context = e.context ?? []
    return { text: e.text, context: e.context }
  })
  await start($)
  const ui = await $.ui.mount({ ...MESSAGE(ANSWER), surface: 'desktop' })
  await ui.press({ key: 'm1:slop' })
  await ui.press({ key: 'm1:slop' })
  expect(lessonKeys(mem).length).toBe(0)
  await $.prompt.submit({ text: 'дальше', wait: false, origin: { kind: 'composer' } })
  expect(context.length).toBe(0)
  await ui.unmount()
})

test('each reaction has its own line: hovering an icon opens its line', async ($, on) => {
  const mem = world(on)
  engineText(on)
  await start($)
  const ui = await $.ui.mount({ ...MESSAGE(ANSWER), surface: 'desktop' })
  await ui.press({ key: 'm1:fire' })
  await ui.press({ key: 'm1:heart' })
  // Lines are layers in the line set aside under the icons. While the fresh 🤌 shows, the 🎯 line does not open
  // at all: a frame on the desktop has no background, and two lines in one spot would lie on each other.
  const shown = async () =>
    (await ui.findAll({ type: 'Box' }))
      .filter(b => b.props.position === 'absolute' && b.props.width !== undefined && b.props.borderStyle === 'round')
      .map(b => b.props.display ?? 'flex')
  expect(await shown()).toEqual(['flex'])
  // The fresh one folded: both lines wait for a hover on their icon. (The test kit does not show hover in props.)
  await clock.advance(9001)
  expect(await shown()).toEqual(['none', 'none'])
  expect((await ui.findAll({ type: 'Text', text: /понял: начинать с вывода/ })).length).toBe(2)
  // A click on the 🎯 icon removes the reaction with its line and lesson; 🤌 stays.
  const before = lessonKeys(mem).length
  await ui.press({ key: 'un:m1:fire' })
  expect((await ui.findAll({ type: 'Text', text: /понял: начинать с вывода/ })).length).toBe(1)
  expect(lessonKeys(mem).length).toBe(before - 1)
  expect((await ui.findAll({ type: 'Svg' })).some(s => s.props.alt === '🎯 Spot on — remove')).toBe(false)
  expect((await ui.findAll({ type: 'Svg' })).some(s => s.props.alt === '🤌 Chef’s kiss — remove')).toBe(true)
  await ui.unmount()
})

test('every picture has an alt with words or a zero-width space: the desktop drops one whose alt is blank', async ($, on) => {
  world(on, { selection: { text: 'запах до утра держится', requestId: 'm1' } })
  engineText(on)
  await start($)
  const ui = await $.ui.mount({ ...MESSAGE(ANSWER), surface: 'desktop' })
  await ui.press({ key: 'm1:fire' })
  await clock.advance(20000)
  const svgs = await ui.findAll({ type: 'Svg' })
  expect(svgs.length).toBeGreaterThan(6)
  for (const s of svgs) expect(String(s.props.alt).trim().length).toBeGreaterThan(0)
  await ui.unmount()
})

test('with a mouse: the icon is its own hover area with a live copy; the piece sits in the card, not under the answer', async ($, on) => {
  world(on, { selection: { text: 'запах до утра держится', requestId: 'm1' } })
  engineText(on)
  await start($)
  const ui = await $.ui.mount({ ...MESSAGE(ANSWER), surface: 'desktop' })
  await ui.press({ key: 'm1:fire' })
  // The icon's hover area is a Box with key; the live copy in it is hidden until hover.
  expect((await ui.findAll({ type: 'Box' })).filter(b => b.key?.startsWith('chip-') && b.key.endsWith('-fire')).length).toBe(1)
  expect((await ui.findAll({ type: 'Svg' })).filter(s => String(s.props.source).includes('animation:hl')).length).toBe(1)
  // The fragment and the line share one card; there is no separate quote under the answer.
  expect((await ui.find({ type: 'Text', text: /^“запах до утра держится” · понял: начинать с вывода$/ }))?.text).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^“запах до утра держится”$/ })).toBeUndefined()
  await ui.unmount()
})

test('on an engine before 2.1.308 text has no size or weight, so the tree is not refused', async ($, on) => {
  world(on, { engine: '2.1.295' })
  engineText(on)
  await start($)
  // The test kit fills in default values for text and reads bold as semibold,
  // so look only for what the mod sets itself: sizes and medium.
  const styled = (t: { props: Record<string, unknown> }) => ['heading', 'caption'].includes(String(t.props.size)) || t.props.weight === 'medium'
  const ui = await $.ui.mount({ ...MESSAGE(ANSWER), surface: 'desktop' })
  expect((await ui.findAll({ type: 'Text' })).filter(styled).length).toBe(0)
  await ui.unmount()
  const pane = await $.ui.mount(PANE('desktop'))
  expect((await pane.findAll({ type: 'Text' })).filter(styled).length).toBe(0)
  await pane.unmount()
})

test('store records carry v: 1, and a record of another version is not taken in or deleted', async ($, on) => {
  const mem = world(on)
  mem.set('l:5:new', { v: 2, key: 'l:5:new', ref: 'm0', kind: 'heart', line: 'got it: from a newer chefkiss', at: 5, project: 'p', session: 's' })
  engineText(on)
  await start($)
  const ui = await $.ui.mount({ ...MESSAGE(ANSWER), surface: 'desktop' })
  await ui.press({ key: 'm1:fire' })
  const mine = lessonKeys(mem).find(k => k !== 'l:5:new') ?? ''
  expect(mem.get(mine)).toEqual(expect.objectContaining({ v: 1 }))
  expect(mem.get('m:sess-1')).toEqual(expect.objectContaining({ v: 1 }))
  expect(mem.get('lessons.v1')).toEqual(expect.objectContaining({ v: 1 }))
  const pane = await $.ui.mount(PANE('desktop'))
  await pane.press({ key: 'pack:googly' })
  expect(mem.get('settings')).toEqual(expect.objectContaining({ v: 1, pack: 'googly' }))
  // The newer record is not taken in, and it stays in the store.
  expect(await pane.find({ type: 'Text', text: /from a newer chefkiss/ })).toBeUndefined()
  expect(mem.has('l:5:new')).toBe(true)
  await pane.unmount()
  await ui.unmount()
})

test('lessons: one copy in the store, two reads per conversation, and another session’s lesson is picked up', async ($, on) => {
  const mem = world(on)
  for (const i of [1, 2, 3]) seedLesson(mem, `l:${i}:a`, `понял: урок ${i}`, i)
  on('prompt.context', (_, e) => ({ blocks: e.blocks }))
  await start($)
  // The start builds the copy from the lesson keys.
  expect((mem.get('lessons.v1') as { lessons: unknown[] }).lessons.length).toBe(3)
  gets = []
  const out = await $.prompt.context({ blocks: [] })
  expect(out.blocks.find(b => b.name === 'chefkiss')?.text).toContain('понял: урок 3')
  expect(gets).toEqual(['lessons.v1', 'profile'])
  // Another session writes a lesson of its own and forgets one: the copy is behind, the read mends it.
  seedLesson(mem, 'l:9:z', 'понял: из другой сессии', 9)
  mem.delete('l:1:a')
  const next = (await $.prompt.context({ blocks: [] })).blocks.find(b => b.name === 'chefkiss')?.text ?? ''
  expect(next).toContain('понял: из другой сессии')
  expect(next).not.toContain('понял: урок 1')
  expect((mem.get('lessons.v1') as { lessons: { key: string }[] }).lessons.map(l => l.key)).toEqual(['l:2:a', 'l:3:a', 'l:9:z'])
})

test('journal: "~" is the home folder, a relative path sits in the project, a lesson lands in this month’s file', async ($, on) => {
  const mem = world(on)
  engineText(on)
  await start($)
  const month = (() => {
    const d = new Date()
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}`
  })()
  const pane = await $.ui.mount(PANE('desktop'))
  // What was typed, the folder the setting keeps, and where the file lands once the engine has made the path native.
  for (const [typed, kept, written] of [
    ['~/notes/', '/home/me/notes', '/home/me/notes'],
    ['notes', '/work/project/notes', '/work/project/notes'],
    ['C:\\Journal\\', 'C:/Journal', '/Journal'],
  ] as const) {
    await pane.input({ key: 'journal', text: typed })
    expect(mem.get('settings')).toEqual(expect.objectContaining({ journalDir: kept }))
    expect([...files.keys()]).toContain(`${written}/Reactions ${month}.md`)
  }
  const ui = await $.ui.mount({ ...MESSAGE(ANSWER), surface: 'desktop' })
  await ui.press({ key: 'm1:fire' })
  expect(files.get(`/Journal/Reactions ${month}.md`)).toContain('🎯 понял: начинать с вывода · project · session sess-1')
  // An empty folder turns the journal off.
  files.clear()
  await pane.input({ key: 'journal', text: '' })
  await ui.press({ key: 'm1:heart' })
  expect(files.size).toBe(0)
  await ui.unmount()
  await pane.unmount()
})

test('/clear: queued reactions never travel into the new conversation, and its icons start over', async ($, on) => {
  const mem = world(on)
  engineText(on)
  let context: readonly string[] = []
  on('prompt.submit', (_, e) => {
    context = e.context ?? []
    return { text: e.text, context: e.context }
  })
  await start($)
  const ui = await $.ui.mount({ ...MESSAGE(ANSWER), surface: 'desktop' })
  await ui.press({ key: 'm1:heart' })
  await ui.unmount()
  await $.session.end({ reason: 'clear', sessionId: 'sess-1', resume: { id: 'sess-1' } })
  sid = 'sess-2'
  await $.prompt.submit({ text: 'новая беседа', wait: false, origin: { kind: 'composer' } })
  expect(context.length).toBe(0)
  const again = await $.ui.mount({ ...MESSAGE(ANSWER), surface: 'desktop' })
  expect((await again.findAll({ type: 'Svg' })).some(s => s.props.alt === '🤌 Chef’s kiss — remove')).toBe(false)
  await again.unmount()
  // The old conversation keeps its icons for a return to it.
  expect((mem.get('m:sess-1') as { marks: Record<string, unknown> }).marks.m1).toBeDefined()
})

test('the pane works on terminal, vscode and mobile; the journal needs an input field', async ($, on) => {
  const mem = world(on)
  await start($)
  for (const surface of ['terminal', 'vscode', 'mobile'] as const) {
    const pane = await $.ui.mount(PANE(surface))
    expect((await pane.find({ key: 'model-calls' }))?.props.label).toBe('☑ Claude writes lessons')
    expect(await pane.find({ key: 'digest' })).toBeDefined()
    expect((await pane.find({ type: 'Text', text: /React to 3 more answers first/ }))?.text).toBeDefined()
    expect(await pane.find({ key: 'journal' })).toEqual(surface === 'mobile' ? undefined : expect.anything())
    const other = surface === 'vscode' ? 'pack:kaomoji' : 'pack:googly'
    await pane.press({ key: other })
    expect(mem.get('settings')).toEqual(expect.objectContaining({ pack: other.slice(5) }))
    await pane.unmount()
  }
})

test('a pack row in a narrow pane: the name goes under the pictures, the button does not shrink out of the card', async ($, on) => {
  world(on)
  await start($)
  const pane = await $.ui.mount(PANE('desktop'))
  const boxes = await pane.findAll({ type: 'Box' })
  // One wrapping left part per pack, each able to shrink below its content.
  expect(boxes.filter(b => b.props.flexWrap === 'wrap' && b.props.minWidth === 0 && b.props.flexShrink === 1).length).toBe(4)
  expect(await pane.find({ key: 'pack:kaomoji' })).toBeDefined()
  await pane.unmount()
})

test('pane: "Forget all" erases lessons only on the second press', async ($, on) => {
  const mem = world(on)
  seedLesson(mem, 'l:1:a', 'понял: урок', 1)
  mem.set('crossed', { v: 1, items: ['вывод первым'] })
  await start($)
  const ui = await $.ui.mount(PANE('desktop'))
  await ui.press({ key: 'forget-all' })
  expect(mem.has('l:1:a')).toBe(true)
  expect((await ui.find({ key: 'forget-all' }))?.props.label).toBe('Forget all 1? Press again')
  await ui.press({ key: 'forget-all' })
  expect(mem.has('l:1:a')).toBe(false)
  // What was crossed out of the summary goes too: nothing is left to correct.
  expect(mem.has('crossed')).toBe(false)
  expect((mem.get('lessons.v1') as { lessons: unknown[] }).lessons).toEqual([])
  await ui.unmount()
})

test('the reactions note does not attach to messages from other mods or of unknown origin', async ($, on) => {
  world(on)
  engineText(on)
  let context: readonly string[] = []
  on('prompt.submit', (_, e) => {
    context = e.context ?? []
    return { text: e.text, context: e.context }
  })
  await start($)
  const ui = await $.ui.mount({ ...MESSAGE(ANSWER), surface: 'desktop' })
  await ui.press({ key: 'm1:heart' })
  for (const kind of ['plugin', 'unclassified'] as const) {
    await $.prompt.submit({ text: 'служебное', wait: false, origin: { kind } as never })
    expect(context.length).toBe(0)
  }
  await $.prompt.submit({ text: 'дальше', wait: false, origin: { kind: 'composer' } })
  expect(context[0]).toContain('🤌')
  await ui.unmount()
})

test('"Forget all" takes every reaction off the answers too, with Claude’s lines, in every session', async ($, on) => {
  const mem = world(on)
  mem.set('m:old-session', { v: 1, at: Date.now(), marks: { x1: { kinds: ['fire'], lines: { fire: 'понял: старое' }, lineKind: 'fire', lineState: 'ready' } } })
  engineText(on)
  let context: readonly string[] = []
  on('prompt.submit', (_, e) => {
    context = e.context ?? []
    return { text: e.text, context: e.context }
  })
  await start($)
  const ui = await $.ui.mount({ ...MESSAGE(ANSWER), surface: 'desktop' })
  await ui.press({ key: 'm1:fire' })
  const pane = await $.ui.mount(PANE('desktop'))
  await pane.press({ key: 'forget-all' })
  await pane.press({ key: 'forget-all' })
  expect(await ui.find({ type: 'Text', text: /понял:/ })).toBeUndefined()
  // No icon under the answer, and none in the other session's saved copy.
  expect((await ui.findAll({ type: 'Svg' })).some(s => String(s.props.source).includes('class="chip"'))).toBe(false)
  expect((mem.get('m:old-session') as { marks: Record<string, unknown> }).marks).toEqual({})
  // With nothing left to forget, the button is gone: emptied copies do not count.
  expect(await pane.find({ key: 'forget-all' })).toBeUndefined()
  // The reaction placed but not yet sent never reaches Claude.
  await $.prompt.submit({ text: 'дальше', wait: false, origin: { kind: 'composer' } })
  expect(context).toEqual([])
  await pane.unmount()
  await ui.unmount()
})

test('× on a lesson takes its reaction off the answer: here at once, in another session in its saved copy', async ($, on) => {
  const mem = world(on)
  const old = { kinds: ['fire'], last: 'fire', fresh: null, freshAt: 0, frag: '', fragKind: null, fragAt: -1, fragLen: 0, excerpt: '', keys: { fire: 'l:1:a' }, lines: { fire: 'понял: старое' }, lineKind: 'fire', lineState: 'ready', folded: true }
  mem.set('m:old-session', { v: 1, at: Date.now(), marks: { x1: old } })
  mem.set('l:1:a', { v: 1, key: 'l:1:a', ref: 'x1', kind: 'fire', line: 'понял: старое', at: 1, project: 'project', session: 'old-session' })
  engineText(on)
  await start($)
  const ui = await $.ui.mount({ ...MESSAGE(ANSWER), surface: 'desktop' })
  await ui.press({ key: 'm1:fire' })
  const chips = async () => (await ui.findAll({ type: 'Svg' })).filter(s => String(s.props.source).includes('class="chip"')).length
  expect(await chips()).toBeGreaterThan(0)
  const pane = await $.ui.mount(PANE('desktop'))
  const mine = lessonKeys(mem).map(k => mem.get(k) as { key: string; session: string }).find(l => l.session === 'sess-1')!
  await pane.press({ key: `forget:${mine.key}` })
  expect(await chips()).toBe(0)
  expect(mem.has(mine.key)).toBe(false)
  await pane.press({ key: 'forget:l:1:a' })
  expect((mem.get('m:old-session') as { marks: Record<string, unknown> }).marks).toEqual({})
  expect(mem.has('l:1:a')).toBe(false)
  await pane.unmount()
  await ui.unmount()
})

test('with no person at the prompt (-p, CI) the lessons digest is not mixed in', async ($, on) => {
  const mem = world(on)
  seedLesson(mem, 'l:1:a', 'понял: вывод первым', 1)
  on('prompt.context', (_, e) => ({ blocks: e.blocks }))
  await start($, 'desktop', false)
  const out = await $.prompt.context({ blocks: [] })
  expect(out.blocks.find(b => b.name === 'chefkiss')).toBeUndefined()
})

test('the desktop app starts as not interactive, yet its attached surface brings the digest in', async ($, on) => {
  const mem = world(on)
  seedLesson(mem, 'l:1:a', 'понял: вывод первым', 1)
  on('prompt.context', (_, e) => ({ blocks: e.blocks }))
  await start($, 'desktop', false)
  surfaces = ['desktop']
  const out = await $.prompt.context({ blocks: [] })
  expect(out.blocks.find(b => b.name === 'chefkiss')?.text).toContain('понял: вывод первым')
})

test('a surface attaching after the context was computed brings the digest in, once', async ($, on) => {
  const mem = world(on)
  seedLesson(mem, 'l:1:a', 'понял: вывод первым', 1)
  on('prompt.context', (_, e) => ({ blocks: e.blocks }))
  await start($, 'desktop', false)
  expect((await $.prompt.context({ blocks: [] })).blocks.find(b => b.name === 'chefkiss')).toBeUndefined()
  surfaces = ['desktop']
  await $.session.attach({ surface: 'desktop', clientId: 'desktop:default' })
  expect(invalidated).toEqual(['prompt.context'])
  expect((await $.prompt.context({ blocks: [] })).blocks.find(b => b.name === 'chefkiss')?.text).toContain('понял: вывод первым')
  // A second client changes nothing more.
  await $.session.attach({ surface: 'mobile', clientId: 'mobile:1' })
  expect(invalidated).toEqual(['prompt.context'])
})

// A mark as the store copy keeps it: no answer text, the line folded.
const SAVED = (over: Record<string, unknown> = {}) => ({
  kinds: ['fire'],
  last: 'fire',
  fresh: null,
  freshAt: 0,
  frag: '',
  fragKind: null,
  fragAt: -1,
  fragLen: 0,
  excerpt: '',
  keys: { fire: 'l:1:a' },
  lines: { fire: 'понял: старая строка' },
  lineKind: 'fire',
  lineState: 'ready',
  folded: true,
  ...over,
})

test('a restart brings this session’s icons and lines back, paragraph marks too', async ($, on) => {
  const mem = world(on)
  mem.set('m:sess-1', {
    v: 1,
    at: Date.now(),
    marks: { m1: SAVED(), [BLOCK0]: SAVED({ kinds: ['heart'], last: 'heart', keys: { heart: 'l:2:a' }, lines: {}, lineKind: null, lineState: 'none' }) },
  })
  engineText(on)
  await start($)
  const ui = await $.ui.mount({ ...MESSAGE(TWO), surface: 'desktop' })
  // The icons under the answer (the row's lit button says "remove" too, so it is left out).
  const chips = (await ui.findAll({ type: 'Svg' })).filter(s => String(s.props.source).includes('class="chip"'))
  expect(chips.map(s => String(s.props.alt)).filter(a => a.includes('remove'))).toEqual(['🎯 Spot on — remove', '🤌 Chef’s kiss — remove'])
  expect((await ui.find({ type: 'Text', text: /понял: старая строка/ }))?.text).toBe('понял: старая строка')
  await ui.unmount()
})

test('a session copy written by another mod version is not loaded', async ($, on) => {
  const mem = world(on)
  mem.set('m:sess-1', { v: 2, at: Date.now(), marks: { m1: SAVED() } })
  engineText(on)
  await start($)
  const ui = await $.ui.mount({ ...MESSAGE(ANSWER), surface: 'desktop' })
  expect((await ui.findAll({ type: 'Svg' })).some(s => String(s.props.alt).includes('remove'))).toBe(false)
  await ui.unmount()
})

test('pane: a click switches the pack, and it is remembered', async ($, on) => {
  const mem = world(on)
  await start($)
  const ui = await $.ui.mount(PANE('desktop'))
  // Packs (the chosen one is a label, not a button) and the memory checkbox.
  expect((await ui.findAll({ type: 'Button' })).length).toBeGreaterThanOrEqual(4)
  await ui.press({ key: 'pack:googly' })
  expect(mem.get('settings')).toEqual(expect.objectContaining({ pack: 'googly' }))
  await ui.unmount()
})

test('a message that did not go through leaves the reactions for the next one', async ($, on) => {
  world(on)
  engineText(on)
  let drop = true
  let context: readonly string[] = []
  on('prompt.submit', (_, e) => {
    if (drop) {
      drop = false
      return { drop: 'нет' }
    }
    context = e.context ?? []
    return { text: e.text, context: e.context }
  })
  await start($)
  const ui = await $.ui.mount({ ...MESSAGE(ANSWER), surface: 'desktop' })
  await ui.press({ key: 'm1:heart' })
  await $.prompt.submit({ text: 'первое', wait: false, origin: { kind: 'composer' } }).catch(() => undefined)
  await $.prompt.submit({ text: 'второе', wait: false, origin: { kind: 'composer' } })
  expect(context.length).toBe(1)
  expect(context[0]).toContain('🤌')
  await ui.unmount()
})

test('a model line quoting the answer is not a lesson', async ($, on) => {
  const mem = world(on, { reply: 'понял: чашка чая не спасёт, но запах до утра держится' })
  engineText(on)
  await start($)
  const ui = await $.ui.mount({ ...MESSAGE(ANSWER), surface: 'desktop' })
  await ui.press({ key: 'm1:fire' })
  expect(lessonKeys(mem).length).toBe(0)
  await ui.unmount()
})

test('the piece quote shows only on the reaction placed on it', async ($, on) => {
  world(on, { selection: { text: 'запах до утра держится', requestId: 'm1' } })
  engineText(on)
  await start($)
  const ui = await $.ui.mount({ ...MESSAGE(ANSWER), surface: 'mobile' })
  await ui.press({ key: 'm1:heart' })
  // A second click with the same selection is a reaction on the whole answer, not the piece.
  await ui.press({ key: 'm1:fire' })
  expect((await ui.findAll({ type: 'Text', text: /“запах до утра держится”/ })).length).toBe(1)
  await ui.press({ key: 'm1:heart' })
  expect((await ui.findAll({ type: 'Text', text: /“запах до утра держится”/ })).length).toBe(0)
  await ui.unmount()
})

test('each button takes the picture the person chose; Claude and the lessons keep the meaning', async ($, on) => {
  const mem = world(on)
  engineText(on)
  let context: readonly string[] = []
  on('prompt.submit', (_, e) => {
    context = e.context ?? []
    return { text: e.text, context: e.context }
  })
  await start($)
  const pane = await $.ui.mount(PANE('desktop'))
  expect((await pane.find({ key: 'icon-heart' }))?.props.label).toBe('☐ ❤️ instead of 🤌')
  await pane.press({ key: 'icon-heart' })
  await pane.press({ key: 'icon-fire' })
  await pane.press({ key: 'icon-slop' })
  expect(mem.get('settings')).toEqual(expect.objectContaining({ icons: { heart: 'heart', fire: 'fire', slop: 'robot' } }))
  expect((await pane.find({ key: 'icon-fire' }))?.props.label).toBe('☑ 🔥 instead of 🎯')
  expect((await pane.find({ key: 'icon-slop' }))?.props.label).toBe('☑ 🤖 instead of 💩')
  expect((await pane.find({ type: 'Text', text: /^Like$/ }))?.text).toBe('Like')
  // The phone's native buttons carry the chosen emoji; the meaning stays with the button.
  const phone = await $.ui.mount({ ...MESSAGE(ANSWER), surface: 'mobile' })
  const labels = await Promise.all(['heart', 'fire', 'slop'].map(async k => (await phone.find({ key: `m1:${k}` }))?.props.label))
  expect(labels).toEqual(['❤️', '🔥', '🤖'])
  const hearts = (await pane.findAll({ type: 'Text', text: /^❤️$/ })).length
  await phone.press({ key: 'm1:heart' })
  // Claude gets one emoji per meaning, whatever the picture.
  await $.prompt.submit({ text: 'дальше', wait: false, origin: { kind: 'composer' } })
  expect(context[0]).toContain('🤌 on your reply')
  // The lesson keeps its kind; the pane lists it with the picture now on the button.
  expect((mem.get(lessonKeys(mem)[0]!) as { kind: string }).kind).toBe('heart')
  expect((await pane.findAll({ type: 'Text', text: /^❤️$/ })).length).toBe(hearts + 1)
  await phone.unmount()
  await pane.unmount()
})

test('the first 💩 ever brings one hint: it is about how it sounds, and how to take it back', async ($, on) => {
  const mem = world(on)
  engineText(on)
  await start($)
  const ui = await $.ui.mount({ ...MESSAGE(ANSWER), surface: 'desktop' })
  const hints = () => toasts.filter(t => t.includes('is for how it sounds'))
  await ui.press({ key: 'm1:fire' })
  expect(hints()).toEqual([])
  await ui.press({ key: 'm1:slop' })
  expect(hints()).toEqual(['💩 is for how it sounds. Wrong answer? Tell Claude, and click 💩 again to take it back.'])
  expect(mem.has('hint:slop')).toBe(true)
  // Taken back and placed again: no second hint, in this session or the next.
  await ui.press({ key: 'm1:slop' })
  await ui.press({ key: 'm1:slop' })
  expect(hints().length).toBe(1)
  await ui.unmount()
  await start($)
  const next = await $.ui.mount({ ...MESSAGE(ANSWER), surface: 'desktop' })
  await next.press({ key: 'm1:slop' })
  await next.press({ key: 'm1:slop' })
  expect(hints().length).toBe(1)
  await next.unmount()
})

test('with 🤖 on the third button the hint names 🤖', async ($, on) => {
  world(on, { settings: { icons: { heart: 'pinch', fire: 'target', slop: 'robot' } } })
  engineText(on)
  await start($)
  const ui = await $.ui.mount({ ...MESSAGE(ANSWER), surface: 'desktop' })
  await ui.press({ key: 'm1:slop' })
  expect(toasts).toContain('🤖 is for how it sounds. Wrong answer? Tell Claude, and click 🤖 again to take it back.')
  await ui.unmount()
})

test('a row button says what it means before a press: a caption that shows on hover, left of the row', async ($, on) => {
  world(on)
  engineText(on)
  await start($)
  const ui = await $.ui.mount({ ...MESSAGE(ANSWER), surface: 'desktop' })
  // Each button is its own hover area, and its caption waits hidden until the cursor is on it.
  expect((await ui.findAll({ type: 'Box' })).filter(b => b.key?.startsWith('rb-')).length).toBe(3)
  const hidden = (await ui.findAll({ type: 'Box' })).filter(
    b => b.props.position === 'absolute' && b.props.right === 0 && b.props.display === 'none' && b.props.justifyContent === 'flex-end',
  )
  expect(hidden.length).toBe(3)
  // Every caption ends a cell short of the row's left edge: held off from its own button's box by the boxes
  // up to it, 5 cells each, and a cell of air. Sizes in cells add up exactly, whatever a cell is in pixels.
  const margins = (await ui.findAll({ type: 'Box' })).filter(b => b.props.justifyContent === 'flex-end').map(b => b.props.marginRight).filter(v => typeof v === 'number')
  expect(margins).toEqual([6, 11, 16])
  expect((await ui.findAll({ type: 'Box' })).filter(b => b.key?.startsWith('rb-')).map(b => b.props.width)).toEqual([5, 5, 5])
  const captions = async () => (await ui.findAll({ type: 'Text' })).map(t => t.text).filter(t => / · /.test(t))
  expect(await captions()).toEqual(['🤌 Chef’s kiss · how it’s said', '🎯 Spot on · what it says', '💩 Slop · reads like AI'])
  await ui.press({ key: 'm1:fire' })
  expect(await captions()).toContain('🎯 Spot on · click to take back')
  await ui.unmount()
  // The phone has no hover: its buttons carry the emoji alone.
  const phone = await $.ui.mount({ ...MESSAGE(ANSWER), surface: 'mobile' })
  expect(await phone.find({ type: 'Text', text: /how it’s said/ })).toBeUndefined()
  await phone.unmount()
})

test('Copy and Post on X carry the card with the verdict and the link; the pane asks to sum up without the word "taste"', async ($, on) => {
  const mem = world(on)
  for (const [i, line] of ['понял: вывод первым', 'понял: без воды', 'понял: тёплый тон'].entries()) seedLesson(mem, `l:${i + 1}:a`, line, i + 1)
  await start($)
  const pane = await $.ui.mount(PANE('desktop'))
  expect((await pane.find({ type: 'Text', text: /^Sum up / }))?.text).toBe('Sum up what Claude learned from your reactions.')
  await pane.unmount()
  mem.set('profile', { v: 1, verdict: 'Терпит всё, кроме пересказа', text: 'вывод первым\nбез воды', at: 3, from: 3, keys: ['l:1:a', 'l:2:a', 'l:3:a'] })
  await start($)
  const again = await $.ui.mount(PANE('desktop'))
  await again.press({ key: 'copy-profile' })
  const card = 'У Claude ко мне пара замечаний\n\nТерпит всё, кроме пересказа\n\nвывод первым\nбез воды\n\nпо 3 реакциям · github.com/phileeppov/chefkiss'
  expect(copied).toEqual([card])
  expect(copied[0]).not.toContain('taste')
  // Post on X opens a new post with the same card in it.
  const post = await again.find({ type: 'Link' })
  expect(post?.type).toBe('Link')
  expect(post?.props.href).toBe(xIntent(card))
  // The desktop draws a Link only with an href in the form a URL parser writes back.
  expect(new URL(String(post?.props.href)).href).toBe(post?.props.href)
  expect(post?.props.label).toBe('Post on X')
  // In a narrow pane the actions wrap to the left, under the count.
  expect((await again.findAll({ type: 'Box' })).some(b => b.props.flexWrap === 'wrap' && b.props.justifyContent === 'space-between')).toBe(true)
  await again.unmount()
  // The terminal gets no X link: one without link support would print the whole encoded address.
  const term = await $.ui.mount(PANE('terminal'))
  expect(await term.find({ type: 'Link' })).toBeUndefined()
  expect(await term.find({ key: 'copy-profile' })).toBeDefined()
  await term.unmount()
  // A summary from before the verdict still opens, without one.
  mem.set('profile', { v: 1, text: 'вывод первым', at: 3, from: 3, keys: ['l:1:a', 'l:2:a', 'l:3:a'] })
  await start($)
  const old = await $.ui.mount(PANE('desktop'))
  expect(await old.find({ key: 'drop-verdict' })).toBeUndefined()
  expect((await old.find({ type: 'Text', text: /^вывод первым$/ }))?.text).toBe('вывод первым')
  await old.unmount()
})

test('a new picture on a button reaches every month of the journal', async ($, on) => {
  const mem = world(on, { settings: { journalDir: '/Journal' } })
  const october = new Date(2026, 9, 5, 12).getTime()
  mem.set('l:1:a', { v: 1, key: 'l:1:a', ref: 'm0', kind: 'heart', line: 'понял: тепло', at: october, project: 'project', session: 'sess-0' })
  await start($)
  const pane = await $.ui.mount(PANE('desktop'))
  await pane.press({ key: 'icon-heart' })
  expect(files.get('/Journal/Reactions 2026.10.md')).toContain('❤️ понял: тепло')
  await pane.press({ key: 'icon-heart' })
  expect(files.get('/Journal/Reactions 2026.10.md')).toContain('🤌 понял: тепло')
  await pane.unmount()
})

test('"Forget all" in another open session reaches this one: older reactions are not sent and do not come back', async ($, on) => {
  const mem = world(on)
  engineText(on)
  let context: readonly string[] = []
  on('prompt.submit', (_, e) => {
    context = e.context ?? []
    return { text: e.text, context: e.context }
  })
  await start($)
  const ui = await $.ui.mount({ ...MESSAGE(ANSWER), surface: 'desktop' })
  await ui.press({ key: 'm1:fire' })
  // Another session presses "Forget all" after that: it empties this session's saved copy and leaves its time.
  mem.set('m:sess-1', { v: 1, at: Date.now(), marks: {} })
  mem.set('reset', { v: 1, at: Date.now() + 1000 })
  await $.prompt.submit({ text: 'дальше', wait: false, origin: { kind: 'composer' } })
  expect(context).toEqual([])
  expect((await ui.findAll({ type: 'Svg' })).some(s => String(s.props.source).includes('class="chip"'))).toBe(false)
  // The save that follows does not bring the old reaction back.
  expect((mem.get('m:sess-1') as { marks: Record<string, unknown> }).marks).toEqual({})
  await ui.unmount()
})

test('"Forget all" in another session reaches this one open in a window within seconds, with no message', async ($, on) => {
  const mem = world(on)
  engineText(on)
  await start($)
  const ui = await $.ui.mount({ ...MESSAGE(ANSWER), surface: 'desktop' })
  await ui.press({ key: 'm1:fire' })
  const chip = async () => (await ui.findAll({ type: 'Svg' })).some(s => String(s.props.source).includes('class="chip"'))
  expect(await chip()).toBe(true)
  mem.set('m:sess-1', { v: 1, at: Date.now(), marks: {} })
  mem.set('reset', { v: 1, at: Date.now() + 1000 })
  await clock.advance(3100)
  expect(await chip()).toBe(false)
  expect((mem.get('m:sess-1') as { marks: Record<string, unknown> }).marks).toEqual({})
  await ui.unmount()
})

test('the pane counts 💩 in plain numbers once there are 40 lessons, and says nothing before', async ($, on) => {
  const mem = world(on)
  const seed = (n: number, slopAt: (i: number) => boolean) => {
    for (let i = 1; i <= n; i++) mem.set(`l:${i}:a`, { v: 1, key: `l:${i}:a`, ref: 'm0', kind: slopAt(i) ? 'slop' : 'fire', line: `понял: урок ${i}`, at: i, project: 'project', session: 'sess-0' })
  }
  seed(39, i => i % 2 === 0)
  await start($)
  let pane = await $.ui.mount(PANE('desktop'))
  expect(await pane.find({ type: 'Text', text: /of your last/ })).toBeUndefined()
  await pane.unmount()
  // 8 of the first 20 are 💩, 3 of the last 20.
  seed(40, i => (i <= 20 ? i <= 8 : i <= 23))
  // The start keeps a copy of all lessons and mends it by key; these lessons changed in place, so the copy goes.
  mem.delete('lessons.v1')
  await start($)
  pane = await $.ui.mount(PANE('desktop'))
  expect((await pane.find({ type: 'Text', text: /of your last/ }))?.text).toBe('💩 in 3 of your last 20 lessons, 8 of the 20 before')
  await pane.unmount()
})

test('the poll redraws nothing while nothing changes, even with reactions taken back elsewhere on the list', async ($, on) => {
  const mem = world(on)
  const drawn = new Map<string, number>()
  on('ui.render', ($, e) => {
    drawn.set(e.requestId, (drawn.get(e.requestId) ?? 0) + 1)
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  await start($)
  const one = await $.ui.mount({ ...MESSAGE(ANSWER, 'm1'), surface: 'desktop' })
  const two = await $.ui.mount({ ...MESSAGE(ANSWER, 'm2'), surface: 'desktop' })
  await one.press({ key: 'm1:fire' })
  await two.press({ key: 'm2:heart' })
  // A reaction taken back with × in another session, none of these: the list stays in the store.
  mem.set('forgotten', { v: 1, keys: ['l:1:elsewhere'] })
  await clock.advance(20000)
  const before = { m1: drawn.get('m1') ?? 0, m2: drawn.get('m2') ?? 0 }
  await clock.advance(30000)
  expect({ m1: drawn.get('m1') ?? 0, m2: drawn.get('m2') ?? 0 }).toEqual(before)
  await one.unmount()
  await two.unmount()
})

test('× on a lesson in another session takes the reaction off here within seconds, with no message', async ($, on) => {
  const mem = world(on)
  engineText(on)
  await start($)
  const ui = await $.ui.mount({ ...MESSAGE(ANSWER), surface: 'desktop' })
  await ui.press({ key: 'm1:fire' })
  await clock.advance(20000)
  const key = [...mem.keys()].find(k => k.startsWith('l:'))
  expect(key).toBeDefined()
  const chip = async () => (await ui.findAll({ type: 'Svg' })).some(s => String(s.props.source).includes('class="chip"'))
  expect(await chip()).toBe(true)
  mem.set('forgotten', { v: 1, keys: [key] })
  await clock.advance(3100)
  expect(await chip()).toBe(false)
  await ui.unmount()
})

test('a pack chosen while a poll is reading the store stays chosen', async ($, on) => {
  world(on)
  await start($)
  const pane = await $.ui.mount(PANE('desktop'))
  let open!: () => void
  gate = new Promise<void>(r => (open = r))
  // A poll starts reading the settings and waits; the click lands meanwhile.
  const tick = clock.advance(3100)
  await Promise.race([tick, new Promise(r => setTimeout(r, 50))])
  expect(reads).toBeGreaterThan(0)
  await pane.press({ key: 'pack:kaomoji' })
  gate = null
  open()
  await tick
  expect(await pane.find({ key: 'pack:kaomoji' })).toBeUndefined()
  await clock.advance(3100)
  expect(await pane.find({ key: 'pack:kaomoji' })).toBeUndefined()
  await pane.unmount()
})

test('× on a lesson from a session open elsewhere: that session drops the reaction on its next message', async ($, on) => {
  const mem = world(on)
  engineText(on)
  let context: readonly string[] = []
  on('prompt.submit', (_, e) => {
    context = e.context ?? []
    return { text: e.text, context: e.context }
  })
  await start($)
  const ui = await $.ui.mount({ ...MESSAGE(ANSWER), surface: 'desktop' })
  await ui.press({ key: 'm1:fire' })
  const mine = lessonKeys(mem)[0]!
  // Another session forgets this lesson with "×": it leaves the key for this one.
  mem.delete(mine)
  mem.set('forgotten', { v: 1, keys: [mine] })
  await $.prompt.submit({ text: 'дальше', wait: false, origin: { kind: 'composer' } })
  expect(context).toEqual([])
  expect((await ui.findAll({ type: 'Svg' })).some(s => String(s.props.source).includes('class="chip"'))).toBe(false)
  expect((mem.get('m:sess-1') as { marks: Record<string, unknown> }).marks).toEqual({})
  await ui.unmount()
})

test('× on a lesson Claude already got takes the reaction back with a note, as a click on the icon does', async ($, on) => {
  const mem = world(on)
  engineText(on)
  let context: readonly string[] = []
  on('prompt.submit', (_, e) => {
    context = e.context ?? []
    return { text: e.text, context: e.context }
  })
  await start($)
  const ui = await $.ui.mount({ ...MESSAGE(ANSWER), surface: 'desktop' })
  await ui.press({ key: 'm1:fire' })
  await $.prompt.submit({ text: 'дальше', wait: false, origin: { kind: 'composer' } })
  expect(context[0]).toContain('🎯 on your reply')
  const pane = await $.ui.mount(PANE('desktop'))
  await pane.press({ key: `forget:${lessonKeys(mem)[0]!}` })
  await $.prompt.submit({ text: 'ещё', wait: false, origin: { kind: 'composer' } })
  expect(context[0]).toContain('removed 🎯')
  expect(lessonKeys(mem)).toEqual([])
  await pane.unmount()
  await ui.unmount()
})

test('"Forget all" keeps a correction already queued, and shows even with no lessons when reactions are there', async ($, on) => {
  world(on, { settings: { modelCalls: false } })
  engineText(on)
  let context: readonly string[] = []
  on('prompt.submit', (_, e) => {
    context = e.context ?? []
    return { text: e.text, context: e.context }
  })
  await start($)
  const ui = await $.ui.mount({ ...MESSAGE(ANSWER), surface: 'desktop' })
  await ui.press({ key: 'm1:fire' })
  await $.prompt.submit({ text: 'дальше', wait: false, origin: { kind: 'composer' } })
  await ui.press({ key: 'm1:heart' })
  // Taken back after Claude got it: a correction waits in the queue.
  await ui.press({ key: 'un:m1:fire' })
  const pane = await $.ui.mount(PANE('desktop'))
  expect(await pane.find({ key: 'forget-all' })).toBeDefined()
  await pane.press({ key: 'forget-all' })
  expect((await pane.find({ key: 'forget-all' }))?.props.label).toBe('Forget all? Press again')
  await pane.press({ key: 'forget-all' })
  await $.prompt.submit({ text: 'ещё', wait: false, origin: { kind: 'composer' } })
  expect(context[0]).toContain('removed 🎯')
  expect(context[0]).not.toContain('🤌 on your reply')
  await pane.unmount()
  await ui.unmount()
})
