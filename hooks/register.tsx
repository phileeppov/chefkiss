import { atom, memberOf, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, RenderInput, Timer } from 'claude-code'

import type { Glyph, Kind, Lesson, Mark, Profile, ReactionSettings, Signal } from '../types'
import {
  GLYPH_EMOJI,
  HINT,
  KINDS,
  NAME,
  acceptLine,
  baseName,
  cardText,
  clip,
  digestText,
  finalsFromHistory,
  glyphsOf,
  isFinal,
  journalText,
  linePrompt,
  monthOf,
  blockKey,
  parseProfile,
  pickFragment,
  withoutCrossed,
  plain,
  profilePrompt,
  splitBlocks,
  splitFragment,
  remember,
  shortHash,
  signalText,
  slopTrend,
  xIntent,
} from './logic'
import type { Crossed } from './logic'
import { PACKS, buttonSvg, chipSvg, iconSvg, packOf, textOf } from './packs'
import type { Pack } from './packs'

const PANE = 'chefkiss'
// The shape version on every record in $.store (V in the types).
const V = 1
// The key of the copy of all lessons, with the version in its name.
const INDEX = `lessons.v${V}`
// The icon plays its appear animation, then is drawn as a static picture: scrolling does not replay it.
const FRESH_MS = 1700
// Claude's line shows right after a reaction, then folds and shows on hover.
const FOLD_MS = 9000
// The store tells no session of a change made in another one: while someone looks at this session, it reads the
// settings, the time of the last "Forget all" and the list of reactions taken back with × this often, so a pack,
// a picture or a forget made elsewhere reaches its answers within seconds.
const POLL_MS = 3000
// Icons under answers are kept for two months; lessons, 300 at most.
const MARKS_TTL = 60 * 24 * 3600 * 1000
const LESSONS_CAP = 300
// Paragraphs with highlights are an experiment: the mod draws the answer itself, and the app's layout suffers.
const DEFAULTS: ReactionSettings = {
  pack: 'soft',
  journalDir: '',
  digest: true,
  modelCalls: true,
  paragraphs: false,
  icons: { heart: 'pinch', fire: 'target', slop: 'poop' },
}
// Paragraph tint and fragment highlight in the colour of the reaction's picture, translucent: holds on any theme.
const TINT: Record<Glyph, string> = {
  pinch: 'rgba(255, 190, 60, 0.18)',
  heart: 'rgba(255, 79, 126, 0.16)',
  target: 'rgba(240, 56, 75, 0.16)',
  fire: 'rgba(255, 154, 31, 0.18)',
  poop: 'rgba(140, 120, 90, 0.20)',
  robot: 'rgba(110, 200, 255, 0.16)',
}
// Set once the person has seen the hint that comes with their first 💩.
const HINTED = 'hint:slop'
// When "Forget all" was last pressed, in any session: reactions placed before it are forgotten everywhere.
const RESET = 'reset'
// Reactions forgotten one by one with "×" while their session may be open elsewhere, by their lesson keys.
const FORGOTTEN = 'forgotten'
// Summary lines and verdicts the person crossed out, the newest 20: every Sum up is told not to write them again.
// Apart from the summary, so a summary dropped with a forgotten lesson does not take the corrections with it.
const CROSSED = 'crossed'
const CROSSED_CAP = 20
// An empty picture: air of a few pixels, where a Box can only add whole rows. Its alt is a zero-width space: the
// desktop drops a picture whose alt is empty or blank, and a reader has nothing to say about air.
const GAP = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'
const SILENT = '\u200B'
// An answer's split into blocks is cached: the app redraws messages on every scroll.
const blockCache = new Map<string, string[]>()
function blocksOf(text: string): string[] {
  const hit = blockCache.get(text)
  if (hit) return hit
  const blocks = splitBlocks(text)
  if (blockCache.size > 200) blockCache.clear()
  blockCache.set(text, blocks)
  return blocks
}
// The reactions note rides only on the person's own message, not on notifications, schedules or other sessions.
const NOT_HUMAN = new Set([
  'task-notification',
  'scheduled-trigger',
  'peer',
  'peer-send-message',
  'projects-relay',
  'channel',
  'coordinator',
  'observer',
  'observer-activity',
  'auto-continuation',
  'slack-ping',
  'plugin',
  'unclassified',
])

const marks = atom({ plugin: 'chefkiss', key: 'marks' } as const, {}, { shape: 'marks-7' })
const marked = atom({ plugin: 'chefkiss', key: 'marked' } as const, [])
const finals = atom({ plugin: 'chefkiss', key: 'finals' } as const, [])
const outbox = atom({ plugin: 'chefkiss', key: 'outbox' } as const, [], { shape: 'outbox-1' })
const settings = atom({ plugin: 'chefkiss', key: 'settings' } as const, DEFAULTS, { shape: 'settings-5' })
const lessons = atom({ plugin: 'chefkiss', key: 'lessons' } as const, [], { shape: 'lessons-2' })
const forgetArmed = atom({ plugin: 'chefkiss', key: 'forgetArmed' } as const, false)
const profile = atom({ plugin: 'chefkiss', key: 'profile' } as const, null as Profile | null, { shape: 'profile-2' })
const profileBusy = atom({ plugin: 'chefkiss', key: 'profileBusy' } as const, false)

let root = ''
let home = ''
let sessionId = ''
// After /clear and /resume it is another conversation: re-read it on the next message.
let stale = false
// One selection, one reaction: the next reaction without a new selection goes on the whole answer.
let usedSelection = ''
// The hint after the first 💩 was already shown in this session.
let hinted = false
// The "Forget all" this session has already applied to itself.
let resetSeen = 0
let journalQueue: Promise<void> = Promise.resolve()
// Grows on every forget: a summary started before it is not saved.
let forgetGen = 0
// A summary needs at least this many lessons: one or two reactions say nothing about taste.
const PROFILE_MIN = 3
let marksQueue: Promise<void> = Promise.resolve()
// One toast per kind of trouble per session: the person still hears of other troubles, but without a flood.
const warned = new Set<string>()
// The engine says a person is at the prompt (the terminal); with nobody there the lessons digest is not mixed in.
let interactive = true
// The digest was left out for want of a surface: one attaching later brings it in.
let digestWaits = false
// The poll, while a person is here; none in -p and CI runs. Three small reads of the store, no model:
// what is unchanged is not written, so an unchanged poll redraws nothing.
let watch: Timer | undefined
let polling = false
function watchStore($: EngineInterface): void {
  watch ??= $.clock.every(POLL_MS, () => void poll($))
}
function unwatchStore(): void {
  watch?.cancel()
  watch = undefined
}
async function poll($: EngineInterface): Promise<void> {
  // A slow store does not stack polls.
  if (polling) return
  polling = true
  try {
    await loadSettings($).catch(() => undefined)
    await syncedBeforeMessage($).catch(() => undefined)
  } finally {
    polling = false
  }
}
// A click in the pane and a poll in flight: the poll may have read the store just before the click's write.
// Every save bumps the count, and a read that started before a save, or runs during one, is dropped.
let settingsGen = 0
let settingsSaving = 0
// Text size and weight are accepted by the engine from 2.1.308. An older one has neither:
// a tree with them is refused whole there, so the mod draws without them.
let typeScale = false

// The engine version; an older engine may lack the call altogether, then an empty string.
async function engineVersion($: EngineInterface): Promise<string> {
  try {
    const v = await $.session.version()
    return v.base ?? v.version
  } catch {
    return ''
  }
}

// A person is here: the terminal says so at start. The desktop app and other SDK hosts start as not
// interactive and show a person by drawing, an attached surface. -p runs and CI have neither.
// An older engine may lack the call: then nobody.
async function someoneHere($: EngineInterface): Promise<boolean> {
  if (interactive) return true
  try {
    return (await $.session.surfaces()).length > 0
  } catch {
    return false
  }
}

function atLeast(version: string, min: string): boolean {
  if (!version) return false
  const a = version.split(/[.-]/).map(Number)
  const b = min.split('.').map(Number)
  for (let i = 0; i < b.length; i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (Number.isNaN(x)) return false
    if (x !== y) return x > y
  }
  return true
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

async function safely($: EngineInterface, what: string, work: () => Promise<unknown>): Promise<void> {
  try {
    await work()
  } catch (err) {
    if (warned.has(what)) return
    warned.add(what)
    void $.ui.toast(`chefkiss: ${what} (${message(err)})`)
  }
}

// The summary for sharing, laid out as the card: bare lines like "no filler" say nothing in someone else's feed without the heading.
// Where the card leads: someone who sees it finds the mod.
const REPO = 'github.com/phileeppov/chefkiss'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// A lesson's date in the pane: "Nov 3", with the year only if it is not the current one.
function shortDate(ts: number): string {
  const d = new Date(ts)
  const day = `${MONTHS[d.getMonth()]} ${d.getDate()}`
  return d.getFullYear() === new Date().getFullYear() ? day : `${day}, ${d.getFullYear()}`
}

function without(lines: Mark['lines'], kind: Kind): Mark['lines'] {
  const out = { ...lines }
  delete out[kind]
  return out
}

function isLesson(v: unknown): v is Lesson {
  const l = v as Lesson
  return !!l && typeof l === 'object' && l.v === V && typeof l.kind === 'string' && typeof l.at === 'number'
}

function lessonTime(key: string): number {
  return Number(key.split(':')[1]) || 0
}

// Lessons live in $.store, one key per lesson "l:<time>:<random>": two sessions never overwrite each other's records.
// The INDEX key keeps a copy of them all, so a read is two calls, not one per lesson. The copy may miss
// another session's latest write: each read checks it against the keys, reads only what is missing and mends it.
// The version sits in the key's name, so sessions of two mod versions side by side do not rewrite each other's copy.
async function storedLessons($: EngineInterface): Promise<Lesson[]> {
  const keys = (await $.store.keys()).filter(k => k.startsWith('l:'))
  const index = (await $.store.get(INDEX)) as { v?: number; lessons?: unknown } | undefined
  const copy = new Map<string, Lesson>()
  if (index?.v === V && Array.isArray(index.lessons)) for (const l of index.lessons) if (isLesson(l)) copy.set(l.key, l)
  const live = new Set(keys)
  let behind = !index || [...copy.keys()].some(k => !live.has(k))
  const out: Lesson[] = []
  for (const key of keys) {
    const known = copy.get(key)
    if (known) {
      out.push(known)
      continue
    }
    const v = await $.store.get(key)
    if (!isLesson(v)) continue
    out.push({ ...v, key })
    behind = true
  }
  out.sort((a, b) => a.at - b.at)
  // The copy is only a shortcut: if it cannot be written, the next read mends it.
  if (behind) await $.store.set(INDEX, { v: V, lessons: out }).catch(() => undefined)
  return out
}

// Old lessons over the cap are removed by the time in their key, without reading the records.
async function pruneLessons($: EngineInterface): Promise<void> {
  const keys = (await $.store.keys()).filter(k => k.startsWith('l:')).sort((a, b) => lessonTime(a) - lessonTime(b))
  for (const key of keys.slice(0, Math.max(0, keys.length - LESSONS_CAP))) await $.store.delete(key)
}

async function loadSettings($: EngineInterface): Promise<void> {
  const gen = settingsGen
  const v = (await $.store.get('settings')) as Partial<ReactionSettings> | undefined
  if (settingsSaving > 0 || gen !== settingsGen) return
  const merged: ReactionSettings = {
    pack: packOf(v?.pack).id,
    journalDir: typeof v?.journalDir === 'string' ? v.journalDir : DEFAULTS.journalDir,
    digest: typeof v?.digest === 'boolean' ? v.digest : DEFAULTS.digest,
    modelCalls: typeof v?.modelCalls === 'boolean' ? v.modelCalls : DEFAULTS.modelCalls,
    paragraphs: typeof v?.paragraphs === 'boolean' ? v.paragraphs : DEFAULTS.paragraphs,
    icons: {
      heart: v?.icons?.heart === 'heart' ? 'heart' : DEFAULTS.icons.heart,
      fire: v?.icons?.fire === 'fire' ? 'fire' : DEFAULTS.icons.fire,
      slop: v?.icons?.slop === 'robot' ? 'robot' : DEFAULTS.icons.slop,
    },
  }
  // Written only when it differs: the atom is read by every answer's drawing, and a write redraws them all.
  if (JSON.stringify(await read($, settings)) !== JSON.stringify(merged)) await update($, settings, () => merged)
}

// A patch, or a function of the settings at the moment of writing: two quick clicks do not undo each other.
async function saveSettings(
  $: EngineInterface,
  patch: Partial<ReactionSettings> | ((s: ReactionSettings) => Partial<ReactionSettings>),
): Promise<void> {
  settingsGen++
  settingsSaving++
  try {
    const next = await update($, settings, s => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) }))
    await safely($, 'settings were not saved', () => $.store.set('settings', { v: V, ...next }))
  } finally {
    settingsSaving--
    settingsGen++
  }
}

// A new picture on a button reaches every month's journal, not only the month of the next lesson.
async function journalAll($: EngineInterface): Promise<void> {
  await writeJournal($, [...new Set((await read($, lessons)).map(l => monthOf(l.at)))])
}

// The journal folder is stored absolute: the setting is shared by all projects,
// and a relative path would otherwise create a journal in every repository.
function absoluteDir(dir: string): string {
  let d = dir.trim().replace(/\\/g, '/').replace(/\/+$/, '')
  if (!d) return ''
  // ~ is the home folder (Mac, Linux, Windows): otherwise it becomes a "~" folder inside the project.
  if ((d === '~' || d.startsWith('~/')) && home) d = `${home.replace(/\\/g, '/').replace(/\/+$/, '')}${d.slice(1)}`
  return /^([A-Za-z]:)?\//.test(d) ? d : `${root.replace(/\\/g, '/').replace(/\/+$/, '')}/${d}`
}

function journalFile(dir: string, month: string): string {
  return `${dir}/Reactions ${month}.md`
}

// A month's journal is rebuilt from all lessons in $.store, other sessions' included.
// Writes go in a queue: an older snapshot never overwrites a newer one.
function writeJournal($: EngineInterface, months: readonly string[]): Promise<void> {
  // .catch before .then: one error does not stop the journal for good.
  journalQueue = journalQueue.catch(() => undefined).then(async () => {
    const st = await read($, settings)
    const dir = st.journalDir
    if (!dir || months.length === 0) return
    const all = await storedLessons($)
    for (const month of new Set(months)) {
      await safely($, 'the journal was not written', () => $.fs.write(journalFile(dir, month), journalText(month, all, Date.now(), glyphsOf(st.icons))))
    }
  })
  return journalQueue
}

// A label's width, measured on screenshots of the app, in units of which a cell holds 6.6 (a desktop cell is 1ch of
// the app's font, about 8.15 px there): brackets 4.3, the small breve and superscript 3.1, the heavy square and
// heart 8.5, an emoji 18, a joiner or a variation selector nothing, the rest 6.2.
function labelPx(label: string): number {
  let px = 0
  for (const ch of label) {
    px += /\p{Extended_Pictographic}/u.test(ch) ? 18 : /[\uFE0F\u200D]/.test(ch) ? 0 : /[()[\]]/.test(ch) ? 4.3 : /[\u02D8\u00B3]/.test(ch) ? 3.1 : /[\u25A0\u2661]/.test(ch) ? 8.5 : 6.2
  }
  return px
}

// The message a mark belongs to: a paragraph's mark id is "<message>#<block>".
function messageOf(markId: string): string {
  return markId.split('#')[0] ?? markId
}

// Every write to a message's marks goes through here, so the list of marked messages follows.
// The list only grows within a conversation (a new one clears it): a message whose last reaction was
// taken back stays on it with no marks, which costs nothing, and a removal can never race an addition.
async function editMarks($: EngineInterface, msg: string, fn: (m: Record<string, Mark>) => Record<string, Mark>): Promise<void> {
  await update($, memberOf(marks, { requestId: msg }), fn)
  await update($, marked, ids => (ids.includes(msg) ? ids : [...ids, msg]))
}

function emptyMark(text: string): Mark {
  return {
    kinds: [],
    last: null,
    fresh: null,
    freshAt: 0,
    frag: '',
    fragKind: null,
    fragAt: -1,
    fragLen: 0,
    excerpt: clip(text, 160),
    keys: {},
    lines: {},
    lineKind: null,
    lineState: 'none',
    folded: false,
  }
}

// A mark at rest: no animation, the line folded, a line still being written will not come.
function settled(m: Mark): Mark {
  return { ...m, fresh: null, folded: true, lineState: m.lineState === 'wait' ? 'off' : m.lineState }
}

// Icons survive a restart: a copy of the session's reactions sits in $.store under m:<session>, with no quotes from the answer.
// Writes go in a queue, and each reads the marks at the moment of writing: an old snapshot never overwrites a new one.
function saveMarks($: EngineInterface): Promise<void> {
  marksQueue = marksQueue.catch(() => undefined).then(async () => {
    if (!sessionId) return
    // A "Forget all" pressed in another session first: its reactions must not come back with this save.
    await syncReset($)
    const lasting: Record<string, Mark> = {}
    for (const msg of await read($, marked)) {
      for (const [id, m] of Object.entries(await read($, memberOf(marks, { requestId: msg })))) lasting[id] = { ...settled(m), excerpt: '', frag: '', fragKind: null }
    }
    await safely($, 'reactions were not saved', () => $.store.set(`m:${sessionId}`, { v: V, at: Date.now(), marks: lasting }))
  })
  return marksQueue
}

// Whether any reaction is placed, here or in a saved copy of another session. "Forget all" leaves the copies empty,
// not gone, so a key alone says nothing.
async function anyMarks($: EngineInterface): Promise<boolean> {
  for (const msg of await read($, marked)) {
    if (Object.values(await read($, memberOf(marks, { requestId: msg }))).some(m => m.kinds.length > 0)) return true
  }
  for (const key of await $.store.keys().catch(() => [] as string[])) {
    if (!key.startsWith('m:') || key === `m:${sessionId}`) continue
    const v = (await $.store.get(key).catch(() => undefined)) as { marks?: Record<string, Mark> } | undefined
    if (Object.values(v?.marks ?? {}).some(m => Array.isArray(m?.kinds) && m.kinds.length > 0)) return true
  }
  return false
}

// Reactions placed at or after a time; a reaction's lesson key carries the time it was placed.
function placedSince(m: Record<string, Mark>, at: number): Record<string, Mark> {
  let out = m
  for (const [id, x] of Object.entries(m)) for (const k of x.kinds) if (lessonTime(x.keys[k] ?? '') < at) out = withoutKind(out, id, k)
  return out
}

// The marks without the reactions forgotten by key.
function notForgotten(m: Record<string, Mark>, gone: ReadonlySet<string>): Record<string, Mark> {
  let out = m
  for (const [id, x] of Object.entries(m)) for (const k of x.kinds) if (gone.has(x.keys[k] ?? '')) out = withoutKind(out, id, k)
  return out
}

// "Forget all" pressed in another session leaves its time in the store, and "×" the forgotten reaction's key.
// This session catches up before it saves its reactions and before a message goes out: those reactions leave the
// screen, the saved copy and the queue for Claude, and the lessons and summary in memory go with them.
// True if anything was taken off.
async function syncReset($: EngineInterface): Promise<boolean> {
  const r = (await $.store.get(RESET).catch(() => undefined)) as { v?: number; at?: number } | undefined
  const at = r?.v === V && typeof r.at === 'number' && r.at > resetSeen ? r.at : 0
  const f = (await $.store.get(FORGOTTEN).catch(() => undefined)) as { v?: number; keys?: unknown } | undefined
  const gone = new Set(f?.v === V && Array.isArray(f.keys) ? f.keys.filter((k): k is string => typeof k === 'string') : [])
  if (!at && gone.size === 0) return false
  if (at) resetSeen = at
  let changed = false
  // Read first and write only what changes: the poll runs this every few seconds, and a write redraws the answer
  // even when the value is the same.
  for (const msg of await read($, marked)) {
    const m = await read($, memberOf(marks, { requestId: msg }))
    if (notForgotten(at ? placedSince(m, at) : m, gone) === m) continue
    changed = true
    await update($, memberOf(marks, { requestId: msg }), cur => notForgotten(at ? placedSince(cur, at) : cur, gone))
  }
  if (!at && !changed) return false
  const live = new Set<string>()
  for (const msg of await read($, marked)) for (const [id, x] of Object.entries(await read($, memberOf(marks, { requestId: msg })))) for (const k of x.kinds) live.add(`${id} ${k}`)
  await update($, outbox, o => o.filter(sig => sig.op === 'remove' || live.has(`${sig.msg} ${sig.kind}`)))
  // A lesson goes by its reaction's time, not its own: a line still being written at the reset lands after it.
  const stale = (await read($, lessons)).filter(x => lessonTime(x.key) < at || gone.has(x.key))
  if (stale.length) await forget($, stale)
  const me = await read($, profile)
  if (me && (me.at < at || me.keys.some(k => gone.has(k)))) await update($, profile, () => null)
  return changed
}

// The catch-up before a message, in the save queue: a save running at that moment cannot race it.
async function syncedBeforeMessage($: EngineInterface): Promise<void> {
  let changed = false
  marksQueue = marksQueue.catch(() => undefined).then(async () => {
    changed = await syncReset($)
  })
  await marksQueue
  if (changed) await saveMarks($)
}

async function loadMarks($: EngineInterface): Promise<void> {
  const now = Date.now()
  for (const key of await $.store.keys()) {
    if (!key.startsWith('m:') || key === `m:${sessionId}`) continue
    const v = (await $.store.get(key)) as { at?: number } | undefined
    if (!v || typeof v.at !== 'number' || now - v.at > MARKS_TTL) await $.store.delete(key)
  }
  const mine = (await $.store.get(`m:${sessionId}`)) as { v?: number; marks?: Record<string, Mark> } | undefined
  const saved = mine?.v === V ? (mine.marks ?? {}) : {}
  const byMessage = new Map<string, Record<string, Mark>>()
  for (const [id, x] of Object.entries(saved)) byMessage.set(messageOf(id), { ...byMessage.get(messageOf(id)), [id]: x })
  // After a mod reload the timers are gone: everything in state is brought to rest.
  for (const msg of new Set([...byMessage.keys(), ...(await read($, marked))])) {
    const stored = byMessage.get(msg) ?? {}
    await editMarks($, msg, m => {
      const out: Record<string, Mark> = {}
      for (const [id, x] of Object.entries({ ...stored, ...m })) out[id] = settled({ ...emptyMark(''), ...x })
      return out
    })
  }
}

async function loadHistory($: EngineInterface, replace: boolean): Promise<void> {
  const old = finalsFromHistory(await $.session.messages())
  await update($, finals, f => (replace ? old : old.reduce((acc, a) => (acc.includes(a) ? acc : [...acc, a]), [...f])).slice(-400))
}

// The conversation changed (/clear, /resume): its own session, its own answers and icons.
async function refreshSession($: EngineInterface): Promise<void> {
  sessionId = await $.session.id().catch(() => sessionId)
  for (const msg of await read($, marked)) await update($, memberOf(marks, { requestId: msg }), () => ({}))
  await update($, marked, () => [])
  await safely($, 'reactions were not loaded', () => loadMarks($))
  await safely($, 'history was not read', () => loadHistory($, true))
}

// Claude's line "got it: …" is the reply to a reaction and the lesson for later sessions. Sonnet writes it:
// on reactions to a piece of text Haiku took the piece's content for the lesson, and a lesson goes into every future conversation.
// The model call: Sonnet, and if the organization's model list does not allow it, Haiku rather than silence.
type CompleteArgs = Omit<Parameters<EngineInterface['model']['complete']>[0], 'model'>
async function complete($: EngineInterface, args: CompleteArgs) {
  const first = await $.model.complete({ ...args, model: 'sonnet' }).catch(() => null)
  if (first?.isAnswered) return first
  const second = await $.model.complete({ ...args, model: 'haiku' }).catch(() => null)
  if (second?.isAnswered) return second
  // Silence is worse than an error: the person learns why lines and lessons do not appear.
  const why = second && !second.isAnswered ? second.reason : 'no model'
  void safely($, `Claude could not write a lesson (${why})`, () => Promise.reject(new Error('the model did not answer')))
  return second
}

async function writeLine($: EngineInterface, id: string, kind: Kind, text: string, frag: string, key: string): Promise<void> {
  const { system, prompt } = linePrompt(kind, text, frag)
  const reply = await complete($, { system, prompt, maxTokens: 120, effort: 'low', timeoutMs: 15000 })
  const line = reply && reply.isAnswered ? acceptLine(reply.text, text, frag) : ''
  // The reaction may have been removed while the model wrote: then no line and no lesson.
  let alive = false
  const state: Mark['lineState'] = line ? 'ready' : 'off'
  await editMarks($, messageOf(id), m => {
    const x = m[id]
    alive = !!x && x.keys[kind] === key && x.kinds.includes(kind)
    if (!x || !alive) return m
    // The line goes to its own reaction, even if another one was placed after it.
    const lines = line ? { ...x.lines, [kind]: line } : x.lines
    return { ...m, [id]: { ...x, lines, ...(x.lineKind === kind ? { lineState: state } : {}) } }
  })
  if (!alive) return
  await update($, outbox, o => o.map(s => (s.msg === id && s.kind === kind && s.op === 'add' && !s.line ? { ...s, line } : s)))
  if (line) {
    const lesson: Lesson = { v: V, key, ref: id, kind, line, at: Date.now(), project: baseName(root), session: sessionId }
    await safely($, 'a lesson was not saved', () => $.store.set(key, lesson))
    // A read takes the new lesson into the copy of all lessons.
    await storedLessons($).catch(() => undefined)
    await update($, lessons, l => [...l, lesson].slice(-LESSONS_CAP))
    void writeJournal($, [monthOf(lesson.at)])
  }
  await saveMarks($)
  $.clock.after(FOLD_MS, () => {
    void editMarks($, messageOf(id), m => {
      const x = m[id]
      return x && x.lineKind === kind && x.keys[kind] === key ? { ...m, [id]: { ...x, folded: true } } : m
    })
  })
}

async function addReaction($: EngineInterface, id: string, text: string, kind: Kind, frag: string): Promise<void> {
  const key = `l:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
  const placedAt = Date.now()
  const spot = frag ? splitFragment(text, frag) : null
  // The settings are read from the store: the switch may have been flipped in another session.
  await loadSettings($).catch(() => undefined)
  const st = await read($, settings)
  // With model calls off there is no line to wait for: the reaction reaches Claude as a note alone.
  const writes = st.modelCalls
  await editMarks($, messageOf(id), m => {
    const cur = m[id] ?? emptyMark(text)
    const placed: Mark = {
      ...cur,
      kinds: [...cur.kinds.filter(k => k !== kind), kind],
      last: kind,
      fresh: kind,
      freshAt: placedAt,
      // A fragment belongs to the reaction placed on it.
      frag: frag || (cur.fragKind === kind ? '' : cur.frag),
      fragKind: frag ? kind : cur.fragKind === kind ? null : cur.fragKind,
      fragAt: frag ? (spot ? spot[0].length : -1) : cur.fragKind === kind ? -1 : cur.fragAt,
      fragLen: frag ? (spot ? spot[1].length : 0) : cur.fragKind === kind ? 0 : cur.fragLen,
      keys: { ...cur.keys, [kind]: key },
      lines: without(cur.lines, kind),
      lineKind: kind,
      lineState: writes ? 'wait' : 'none',
      folded: !writes,
    }
    return { ...m, [id]: placed }
  })
  const signal: Signal = { op: 'add', kind, msg: id, excerpt: clip(text, 160), frag, line: '' }
  await update($, outbox, o => [...o, signal])
  if (kind === 'slop') void slopHint($, glyphsOf(st.icons).slop).catch(() => undefined)
  $.clock.after(FRESH_MS, () => {
    void editMarks($, messageOf(id), m => {
      const x = m[id]
      return x && x.fresh === kind && x.freshAt === placedAt ? { ...m, [id]: { ...x, fresh: null } } : m
    })
  })
  await saveMarks($)
  if (!writes) return
  void writeLine($, id, kind, text, frag, key).catch(() =>
    editMarks($, messageOf(id), m => {
      const x = m[id]
      return x && x.keys[kind] === key && x.lineKind === kind ? { ...m, [id]: { ...x, lineState: 'off' as const } } : m
    }),
  )
}

// The first 💩 ever comes with one hint: it is about how an answer sounds, not whether it is right.
// In a blind test readers pressed it under a wrong answer too, and that is better told to Claude in words.
// The flag in memory comes before the first await: two quick 💩 do not both pass the store check,
// and with the store unavailable the hint still shows once a session.
async function slopHint($: EngineInterface, glyph: Glyph): Promise<void> {
  if (hinted) return
  hinted = true
  if (await $.store.get(HINTED).catch(() => undefined)) return
  await $.store.set(HINTED, { v: V, at: Date.now() }).catch(() => undefined)
  const e = GLYPH_EMOJI[glyph]
  void $.ui.toast(`${e} is for how it sounds. Wrong answer? Tell Claude, and click ${e} again to take it back.`)
}

async function removeReaction($: EngineInterface, id: string, kind: Kind): Promise<void> {
  const excerpt = (await read($, memberOf(marks, { requestId: messageOf(id) })))[id]?.excerpt ?? ''
  // Not sent to Claude yet: just forget it. Already sent: send a correction.
  await update($, outbox, o => {
    const queued = o.some(s => s.msg === id && s.kind === kind && s.op === 'add')
    if (queued) return o.filter(s => !(s.msg === id && s.kind === kind && s.op === 'add'))
    const fix: Signal = { op: 'remove', kind, msg: id, excerpt, frag: '', line: '' }
    return [...o, fix]
  })
  await editMarks($, messageOf(id), m => withoutKind(m, id, kind))
  await saveMarks($)
  await forget($, (await read($, lessons)).filter(l => l.ref === id && l.kind === kind))
}

// The marks with one reaction taken off one message or paragraph; the mark goes when its last reaction does.
function withoutKind(m: Record<string, Mark>, id: string, kind: Kind): Record<string, Mark> {
  const x = m[id]
  if (!x) return m
  const kinds = x.kinds.filter(k => k !== kind)
  if (kinds.length === 0) {
    const rest = { ...m }
    delete rest[id]
    return rest
  }
  const keys = { ...x.keys }
  delete keys[kind]
  const kept: Mark = {
    ...x,
    kinds,
    keys,
    lines: without(x.lines, kind),
    last: kinds[kinds.length - 1] ?? null,
    fresh: x.fresh === kind ? null : x.fresh,
    frag: x.fragKind === kind ? '' : x.frag,
    fragKind: x.fragKind === kind ? null : x.fragKind,
    fragAt: x.fragKind === kind ? -1 : x.fragAt,
    fragLen: x.fragKind === kind ? 0 : x.fragLen,
  }
  // The removed reaction's line, being written or shown, goes with it.
  const cleared: Mark = { ...kept, lineKind: null, lineState: 'none' }
  return { ...m, [id]: x.lineKind === kind ? cleared : kept }
}

// "×" on a lesson in the pane: the lesson goes, and so does its reaction under the answer. In this conversation
// at once; in another session in its saved copy, so the icon is gone when that session starts again.
// A reaction not yet sent to Claude is not sent; what a conversation already got stays there.
async function forgetWithReaction($: EngineInterface, l: Lesson): Promise<void> {
  // Only the reaction this lesson came from: one placed again since carries another key and stays.
  const same = (m: Record<string, Mark> | undefined) => m?.[l.ref]?.keys[l.kind] === l.key
  if (l.session === sessionId) {
    // In this conversation it is a click on the icon: a reaction Claude already got is taken back with a note.
    if (same(await read($, memberOf(marks, { requestId: messageOf(l.ref) })))) return removeReaction($, l.ref, l.kind)
  } else if (l.session) {
    await safely($, 'reactions were not saved', async () => {
      const v = (await $.store.get(`m:${l.session}`)) as { marks?: Record<string, Mark> } | undefined
      if (v?.marks && same(v.marks)) await $.store.set(`m:${l.session}`, { ...v, marks: withoutKind(v.marks, l.ref, l.kind) })
      // That session may be open: its next save would bring the reaction back, so it learns the key (syncReset).
      const f = (await $.store.get(FORGOTTEN)) as { v?: number; keys?: string[] } | undefined
      const keys = f?.v === V && Array.isArray(f.keys) ? f.keys : []
      await $.store.set(FORGOTTEN, { v: V, keys: [...keys.filter(k => k !== l.key), l.key].slice(-LESSONS_CAP) })
    })
  }
  await forget($, [l])
}

// Remove lessons: from the store, from the digest and from their months' journals.
async function forget($: EngineInterface, gone: readonly Lesson[]): Promise<void> {
  if (gone.length === 0) return
  forgetGen++
  for (const l of gone) await safely($, 'a lesson was not deleted', () => $.store.delete(l.key))
  // A read drops the forgotten lessons from the copy of all lessons.
  await storedLessons($).catch(() => undefined)
  const keys = new Set(gone.map(l => l.key))
  await update($, lessons, l => l.filter(x => !keys.has(x.key)))
  // The summary rests on lessons: if any of its basis is forgotten, so is the summary. Forget means forget.
  const me = await read($, profile)
  if (me && me.keys.some(k => keys.has(k))) await dropProfile($)
  await writeJournal($, gone.map(l => monthOf(l.at)))
}

async function dropProfile($: EngineInterface): Promise<void> {
  await update($, profile, () => null)
  await safely($, 'the summary was not deleted', () => $.store.delete('profile'))
}

// The summary is read from the store, not the atom: another session may have changed or erased it.
async function storedProfile($: EngineInterface): Promise<Profile | null> {
  const v = (await $.store.get('profile')) as Profile | undefined
  if (!(v && v.v === V && typeof v.text === 'string' && typeof v.at === 'number' && Array.isArray(v.keys))) return null
  // A summary from before the verdict has none; a broken one is dropped, the lines stay.
  if (v.verdict !== undefined && typeof v.verdict !== 'string') {
    const { verdict: _, ...rest } = v
    return rest
  }
  return v
}

async function armForget($: EngineInterface): Promise<void> {
  await update($, forgetArmed, () => true)
  $.clock.after(5000, () => void update($, forgetArmed, () => false))
}

async function forgetAll($: EngineInterface): Promise<void> {
  await update($, forgetArmed, () => false)
  await forget($, await storedLessons($))
  // The taste summary rests on lessons: without them nothing is left of it, nor of what was crossed out of it.
  await dropProfile($)
  await safely($, 'crossed-out lines were not deleted', () => $.store.delete(CROSSED))
  // The reactions under answers go too, with Claude's lines: here at once, in other sessions in their saved copies.
  // None still waiting is sent to Claude; what a conversation already got stays there. The time goes to the store
  // for sessions open elsewhere: they drop older reactions on their next save or message (syncReset).
  const at = Date.now()
  resetSeen = at
  await safely($, 'reactions were not saved', () => $.store.set(RESET, { v: V, at }))
  // Keys forgotten one by one are older than the reset: the time covers them.
  await safely($, 'reactions were not saved', () => $.store.delete(FORGOTTEN))
  // A correction already queued still goes: Claude got that reaction and should hear it was taken back.
  await update($, outbox, o => o.filter(s => s.op === 'remove'))
  for (const msg of await read($, marked)) await update($, memberOf(marks, { requestId: msg }), () => ({}))
  // This session's copy goes through the save queue, so a save already under way cannot write the old marks after.
  await saveMarks($)
  for (const key of await $.store.keys()) {
    if (!key.startsWith('m:') || key === `m:${sessionId}`) continue
    await safely($, 'reactions were not saved', async () => {
      const v = (await $.store.get(key)) as { marks?: Record<string, Mark> } | undefined
      if (v?.marks) await $.store.set(key, { ...v, marks: {} })
    })
  }
}

// "What Claude learned about you": all lessons in up to 5 lines of taste. Sonnet writes it: the summary is rare
// but opens every conversation instead of the raw lessons, so quality matters more than cost.
async function sumUp($: EngineInterface): Promise<void> {
  if (!(await read($, settings)).modelCalls) return
  // The lock comes before the first await: a second click does not start a second model call.
  let held = false
  await update($, profileBusy, b => ((held = b), true))
  if (held) return
  try {
    const all = (await storedLessons($)).filter(l => l.line)
    if (all.length < PROFILE_MIN) return
    const gen = forgetGen
    const crossed = await crossedOut($)
    const { system, prompt, lang } = profilePrompt(all, crossed)
    const reply = await complete($, { system, prompt, maxTokens: 400, effort: 'low', timeoutMs: 30000 })
    const { verdict, text } = reply && reply.isAnswered ? withoutCrossed(parseProfile(reply.text), crossed) : { verdict: '', text: '' }
    if (!text) {
      void $.ui.toast('chefkiss: could not sum up, try again')
      return
    }
    // Lessons were forgotten while the model wrote, here or in another session: what was erased is not brought back.
    const now = new Set(await $.store.keys())
    if (gen !== forgetGen || all.some(l => !now.has(l.key))) return
    const next: Profile = {
      v: V,
      ...(verdict ? { verdict } : {}),
      lang,
      text,
      at: Math.max(...all.map(l => l.at)),
      from: all.length,
      keys: all.map(l => l.key),
    }
    await update($, profile, () => next)
    await safely($, 'the summary was not saved', () => $.store.set('profile', next))
  } finally {
    await update($, profileBusy, () => false)
  }
}

async function crossedOut($: EngineInterface): Promise<Crossed[]> {
  const v = (await $.store.get(CROSSED).catch(() => undefined)) as { v?: number; items?: unknown } | undefined
  if (v?.v !== V || !Array.isArray(v.items)) return []
  return v.items.filter(
    (c): c is Crossed => !!c && typeof c === 'object' && (c.kind === 'line' || c.kind === 'verdict') && typeof c.text === 'string',
  )
}

async function crossOut($: EngineInterface, c: Crossed): Promise<void> {
  const items = [...(await crossedOut($)).filter(x => x.kind !== c.kind || x.text !== c.text), c].slice(-CROSSED_CAP)
  await safely($, 'crossed-out lines were not saved', () => $.store.set(CROSSED, { v: V, items }))
}

// A verdict the person does not like goes, and the lines stay; the next Update writes a new one, not this one again.
// By its text: another session may have summed up again since this pane was drawn, and its verdict was not seen.
async function dropVerdict($: EngineInterface, seen: string): Promise<void> {
  const me = await storedProfile($)
  if (!me?.verdict || me.verdict !== seen) return
  const { verdict: _, ...next } = me
  await update($, profile, () => next)
  await safely($, 'the summary was not saved', () => $.store.set('profile', next))
  await crossOut($, { kind: 'verdict', text: seen })
}

// A wrong summary line can be removed; the others stay, and Update does not bring it back. By its text, as above.
async function dropProfileLine($: EngineInterface, seen: string): Promise<void> {
  const me = await storedProfile($)
  if (!me) return
  const i = me.text.split('\n').indexOf(seen)
  if (i < 0) return
  await crossOut($, { kind: 'line', text: seen })
  const rest = me.text.split('\n').filter((_, j) => j !== i)
  if (rest.length === 0) return dropProfile($)
  const next = { ...me, text: rest.join('\n') }
  await update($, profile, () => next)
  await safely($, 'the summary was not saved', () => $.store.set('profile', next))
}

type Target = {
  // Where the reaction goes: the id of a message or of a paragraph "<message>#<block>".
  id: string
  // The whole answer, where the selection is looked for.
  msg: string
  text: string
  kind: Kind
  // The answer's paragraphs when it is drawn by paragraph: a reaction on the whole answer with a selection inside
  // one paragraph goes on that paragraph, so it is clear what it is for.
  blocks?: readonly string[]
}

async function toggle($: EngineInterface, t: Target): Promise<void> {
  if ((await read($, memberOf(marks, { requestId: t.msg })))[t.id]?.kinds.includes(t.kind)) return removeReaction($, t.id, t.kind)
  // The selection is read before the click clears it: the piece of the answer the reaction is for.
  const sel = await $.ui.selection().catch(() => undefined)
  let frag = pickFragment(sel, t.msg, t.text)
  let id = t.id
  let text = t.text
  // A paragraph reaction takes the fragment only if it lies in that paragraph.
  if (frag && id !== t.msg && !plain(text).includes(plain(frag).replace(/…$/, ''))) frag = ''
  if (frag && id === t.msg && t.blocks) {
    const i = t.blocks.findIndex(b => plain(b).includes(plain(frag).replace(/…$/, '')))
    if (i >= 0) {
      id = `${t.msg}#${blockKey(t.blocks, i)}`
      text = t.blocks[i]!
      if ((await read($, memberOf(marks, { requestId: t.msg })))[id]?.kinds.includes(t.kind)) return removeReaction($, id, t.kind)
    }
  }
  const seen = `${t.msg}\u0000${frag}`
  if (frag && seen === usedSelection) frag = ''
  else if (frag) usedSelection = seen
  return addReaction($, id, text, t.kind, frag)
}

type MessageInput = RenderInput<'AssistantMessage'>

// A final answer: reactions under it and, with a mouse, also at each paragraph, with the fragment highlighted.
// rich: false is the fallback: the answer's native text and a row of native buttons under it, no paragraphs or own icons.
async function drawMessage(
  $: EngineInterface,
  e: MessageInput,
  next: (e: MessageInput) => Promise<RenderElement>,
  rich: boolean,
): Promise<RenderElement> {
  if (e.props.isSummary) return next(e)
  const id = e.requestId
  const text = e.props.text
  // Only this message's member: a reaction elsewhere does not redraw it.
  const all = await read($, memberOf(marks, e))
  const mark = all[id]
  const blockIds = Object.keys(all).filter(k => k.startsWith(`${id}#`))
  // An answer with a reaction keeps its row even if it fell out of the window of remembered finals.
  if (!mark && blockIds.length === 0 && !isFinal(text, await read($, finals))) return next(e)
  const st = await read($, settings)
  const gl = glyphsOf(st.icons)
  // Hover exists only with a mouse: on the phone and in the terminal the row is always shown, with no paragraphs.
  const canHover = e.surface === 'desktop' || e.surface === 'vscode'
  const byParagraph = rich && st.paragraphs && canHover
  const own = byParagraph ? null : await next(e)
  const els = $.ui.resolve(e)
  const { Box, Text, Button, Markdown } = els
  const Svg = 'Svg' in els ? els.Svg : undefined
  const pack = packOf(st.pack)
  const now = Date.now()
  const reveal = { display: 'none' as const, hover: { display: 'flex' as const } }
  const blocks = blocksOf(text)
  const fail = (err: unknown) => $.ui.toast(`Reaction failed: ${message(err)}`)

  // Claude's line for a reaction: "…" while it is written, then the line itself.
  const lineText = (m: Mark, k: Kind) => (m.lineKind === k && m.lineState === 'wait' ? '…' : (m.lines[k] ?? ''))
  // Hover group for paragraphs (beta): the icon and its line in the flow under the paragraph.
  const scopeOf = (markId: string, k: Kind) => `rx:${shortHash(markId)}:${k}`

  // With a mouse the line sits under its icon; in the fallback (rich: false) only a fresh one, in the flow.
  const cardsOn = rich && canHover
  // What to show under an icon: the fragment the reaction is on, and Claude's line.
  const cardText = (m: Mark, k: Kind) => {
    const frag = m.fragKind === k ? m.frag : ''
    return [frag ? `“${clip(frag, 40)}”` : '', lineText(m, k)].filter(Boolean).join(' · ')
  }
  const stripMarks = [mark, ...blockIds.map(b => all[b])].filter((m): m is Mark => !!m)
  // A line under the icons is set aside as soon as at least one reaction on the answer has something to show.
  const slotted = cardsOn && stripMarks.some(m => m.kinds.some(k => lineText(m, k)))
  // While a fresh line is shown (the first seconds after a reaction), hovering other icons opens no lines:
  // hover cannot hide what is shown, and a frame on the desktop has no background, so two lines
  // in one spot would lie on top of each other as text. One line is in view at a time.
  const freshOpen = stripMarks.some(m => !m.folded && m.lineKind !== null && !!lineText(m, m.lineKind))
  // All lines share one width and one spot, at the left edge of the row.
  // The width follows the answer's longest line: a quarter more than its letters, for wide letters and emoji,
  // plus the frame's padding. The cap is the feed minus the answer column's margins
  // (at full feed width the frame overflowed the column and was cut off); without a feed size, 80 cells.
  const longest = Math.max(0, ...stripMarks.flatMap(m => m.kinds.map(k => cardText(m, k).length)))
  const room = e.viewport?.columns ? Math.max(24, e.viewport.columns - 16) : 80
  const lineWidth = Math.min(room, Math.ceil(longest * 1.25) + 6)
  // An icon takes a whole number of cells: the engine sets the line's offsets in whole cells,
  // so any icon's line lands exactly at the row's left edge. A desktop cell is 1ch of the app's font (≈ 8.15 px),
  // so 5 cells hold a 35 px icon. A text icon is a native button, its label and padding (measured on the app):
  // in the row a full button, the label and 21 px; under the answer a plain one, which needs the label and 12 px
  // not to cut its face. Each placed face takes its own width, set to the left, so faces sit close.
  const nativePx = (k: Kind) => labelPx(textOf(pack, gl[k])) + 21
  const chipCells = (k: Kind) => Math.max(3, Math.ceil((labelPx(textOf(pack, gl[k])) + 12) / 6.6))
  const spanOf = (size: 'big' | 'small', k: Kind) => (pack.kind === 'svg' && Svg ? (size === 'big' ? 5 : 4) : chipCells(k))

  // A reaction icon is a plain picture, not a frame: a frame takes the cursor for itself.
  // The appear animation knows how much time has passed.
  // With a mouse the icon is its own hover area (a Box with key, the same mechanism that opens the button row
  // on hovering an answer). Under the cursor its live copy rises over the icon, and in the line set aside
  // under the row, its line: the fragment the reaction is on and Claude's line.
  // A click on the icon removes the reaction: a transparent native button lies on top, as in the row. The icon
  // has no capsule: the button has its own frame under the cursor, and a drawn capsule would argue with its shape.
  // at is where the icon sits in the row, in cells from the left edge (spanOf): any icon's line
  // lands at the row's left edge. null for paragraphs (beta): their line is in the flow under the paragraph.
  const chip = (markId: string, m: Mark, k: Kind, size: 'big' | 'small', at: number | null) => {
    // Not h: that is the name of the JSX factory.
    // The step between icons is 5 cells (≈ 41 px), with no gap: dense, no holes between reactions. The picture is
    // 35 px and the app's button frame over it 33 px, both centred in the cell: 2 px apart, a pixel on each side, so
    // the plaque meets the frame exactly (at 36 the picture sat half a pixel off, and background showed between).
    const cw = size === 'big' ? 35 : 28
    const ch = size === 'big' ? 28 : 20
    const svg = pack.kind === 'svg' && Svg
    if (!cardsOn) {
      return svg ? (
        <Svg
          source={iconSvg(pack, gl[k], { elapsed: m.fresh === k ? now - m.freshAt : undefined, capsule: true })}
          alt={`${GLYPH_EMOJI[gl[k]]} ${NAME[gl[k]]}`}
          width={42}
          height={28}
        />
      ) : (
        <Text>{` ${textOf(pack, gl[k])} `}</Text>
      )
    }
    const takeBack = () => void removeReaction($, markId, k).catch(fail)
    const cell = { width: spanOf(size, k), flexShrink: 0, flexDirection: 'row' as const, justifyContent: svg ? ('center' as const) : ('flex-start' as const) }
    const still = svg ? (
      <Box {...cell}>
        <Svg
          source={chipSvg(pack, gl[k], { elapsed: m.fresh === k ? now - m.freshAt : undefined })}
          alt={`${GLYPH_EMOJI[gl[k]]} ${NAME[gl[k]]} — remove`}
          width={cw}
          height={ch}
        />
        <Box position="absolute" top={0} left={0} right={0} bottom={0} justifyContent="center" alignItems="center" {...reveal}>
          <Svg source={chipSvg(pack, gl[k], { alive: true, box: [cw, ch] })} alt={`${GLYPH_EMOJI[gl[k]]} ${NAME[gl[k]]}`} width={cw} height={ch} />
        </Box>
        {/* The button comes last: a layer over the live copy, so the click reaches it. */}
        <Box position="absolute" top={0} left={0} right={0} bottom={0} alignItems="center" justifyContent="center">
          {/* An em and an en space: the app's frame for this label is 33 px, 2 px inside the 35 px picture (the row's
              two em spaces make 38 px, 2 px inside its 40). */}
          <Button key={`un:${markId}:${k}`} label={'  '} plain onPress={takeBack} />
        </Box>
      </Box>
    ) : (
      // Text pack: the icon is the button, as tall as a picture icon. The app's plain button has no height of its
      // own, only a row at least, so it stretches to its box: an empty picture makes the box a picture's height,
      // and the button's own frame under the cursor is then as tall as the frame of a picture icon. The strip keeps
      // its height whichever pack is on.
      <Box {...cell} alignItems="stretch">
        {Svg ? <Svg source={GAP} alt={SILENT} width={1} height={ch} /> : null}
        <Button key={`un:${markId}:${k}`} label={textOf(pack, gl[k])} plain onPress={takeBack} />
      </Box>
    )
    const said = lineText(m, k)
    const key = `chip-${shortHash(markId)}-${k}`
    if (at === null) {
      return (
        <Box key={key} flexShrink={0} {...(said ? { hover: { scope: scopeOf(markId, k) } } : {})}>
          {still}
        </Box>
      )
    }
    const text = cardText(m, k)
    const open = !m.folded && m.lineKind === k
    // The line sits in the line set aside under the icons: the room is always there, so opening it moves
    // neither the height nor the neighbours (the row shifts once, at the click, when the line appeared).
    // The line itself is a layer: for every icon it lands at the row's left edge, one width, in a frame.
    return (
      <Box key={key} flexDirection="column" flexShrink={0}>
        {still}
        {/* 6 px of air between the icon and the line under it: an empty picture, since a Box counts in rows. Not a
            taller icon picture: the app centres its button frame in the cell, and the plaque would slip off it. */}
        {slotted && Svg ? <Svg source={GAP} alt={SILENT} width={cw} height={6} /> : null}
        {slotted ? (
          // Three rows: the frame's top and bottom edges and its line of text, so its bottom is not cut.
          <Box minHeight={3}>
            {text && (open || !freshOpen) ? (
              <Box
                position="absolute"
                top={0}
                left={-at}
                width={lineWidth}
                paddingX={1}
                borderStyle="round"
                borderDimColor
                {...(open ? {} : reveal)}
              >
                <Text dimColor wrap="truncate-end">
                  {text}
                </Text>
              </Box>
            ) : null}
          </Box>
        ) : null}
      </Box>
    )
  }

  // Own icons in the row buttons: the picture below, a transparent native button on top.
  // The order is the icon's, where the click got through live: the picture in the flow, the button in a layer after it
  // (a layer draws over what comes before it). The mod does not know the button's size, so it stands
  // at the centre of the picture. The label is two spaces: the desktop draws label, not nested text, so
  // the label can carry neither the reaction's name nor a large font; the picture's alt carries the name.
  // The app sets the frame's height. Mouse only: on the phone and in the terminal the row is native buttons.
  // What a button means shows before it is pressed: a dim caption while the cursor is on the button (a Box with key),
  // since the alt shows nowhere. A desktop frame has no background, so the caption sits where the row leaves room:
  // in the row's own line, ending at the row's left edge. Not by paragraph:
  // there the row lies over the paragraph's text.
  const iconRow = rich && canHover && pack.kind === 'svg' && !!Svg
  // With a mouse each row button stands in a box of its own, sized in cells: 5 for a 40 px picture (5ch ≈ 41 px);
  // for a native button the label's estimate and a cell, the button centred. The app keeps a button inside its box
  // and cuts the label with "…", and a placed one is set in a heavier weight, a few pixels wider than the estimate:
  // the cell is its room, and the air between buttons. Sizes in cells add up exactly, so a caption measured from
  // the boxes ends at the row's left edge for every button, whatever a cell is in pixels. Without a mouse the
  // native buttons stand on their own, a cell apart.
  const ROW_BOX = 5
  const boxed = rich && canHover
  const boxCells = (k: Kind) => (iconRow ? ROW_BOX : nativePx(k) / 6.6 + 1)
  const rowGap = boxed ? 0 : 1
  // From button i's right edge to the row's left edge, in cells.
  const reach = (i: number) => KINDS.slice(0, i + 1).reduce((n, k) => n + boxCells(k), 0) + i * rowGap
  // Room the row takes on the right, in cells: the row and a cell of air.
  const rowRoom = Math.ceil(reach(KINDS.length - 1)) + 1
  const buttons = (target: Omit<Target, 'kind'>, m: Mark | undefined, captions = true) =>
    KINDS.map((k, i) => {
      const g = gl[k]
      const on = m?.kinds.includes(k) ?? false
      const press = () => void toggle($, { ...target, kind: k }).catch(fail)
      // The picture leads the caption: the caption ends at the row's left edge, not under its own button.
      const caption = `${GLYPH_EMOJI[g]} ${NAME[g]} · ${on ? 'click to take back' : HINT[k]}`
      const captionNeed = Math.ceil(caption.length * 1.3) + 1
      const captionRoom = Math.max(10, room - rowRoom - x - 1)
      const width = Math.min(captionNeed, captionRoom)
      // The caption hangs from this button's box: at its right edge, held off by a margin as wide as the way to the
      // row's left edge and the air. Offsets take whole cells only, a margin takes fractions, so the edge is exact
      // for every button; and a margin takes no clicks, so the caption never covers the buttons to its left.
      // The air is a cell from the button: a native button's box already holds half a cell on each side.
      // Level with the button: the caption takes the box's height and centres its line in it.
      const captionAt = () =>
        captions ? (
          <Box
            position="absolute"
            top={0}
            bottom={0}
            right={0}
            marginRight={reach(i) + (iconRow ? 1 : 0.5)}
            width={width}
            flexDirection="row"
            alignItems="center"
            justifyContent="flex-end"
            {...reveal}
          >
            {/* Cut only where the room is short: a cut Text takes the box's whole width and sets its words at the left,
                so a whole one stands at the box's right edge, the same air from the row for every button. */}
            <Text dimColor {...(captionNeed > captionRoom ? { wrap: 'truncate-end' as const } : {})}>
              {caption}
            </Text>
          </Box>
        ) : null
      if (!iconRow || !Svg) {
        const button = <Button key={`${target.id}:${k}`} label={textOf(pack, g)} variant={on ? 'primary' : 'secondary'} onPress={press} />
        // With a mouse a text pack's row gets the caption too, level with the button, as in the other packs.
        if (!rich || !canHover) return button
        return (
          <Box key={`rb-${shortHash(target.id)}-${k}`} flexDirection="row" width={boxCells(k)} justifyContent="center">
            {button}
            {captionAt()}
          </Box>
        )
      }
      return (
        // The picture, its copy and the app's button all stand centred in the box: one offset, so the plaque meets
        // the app's frame to the pixel.
        <Box key={`rb-${shortHash(target.id)}-${k}`} flexDirection="row" width={ROW_BOX} justifyContent="center">
          <Svg
            source={buttonSvg(pack, g, on ? 'on' : m?.kinds.length ? 'off' : 'idle')}
            alt={on ? `${GLYPH_EMOJI[g]} ${NAME[g]} — remove` : `${GLYPH_EMOJI[g]} ${NAME[g]} — ${HINT[k]}`}
            width={40}
            height={28}
          />
          {/* Under the cursor the same picture with a plaque over the whole box: a taller frame than the app's own. */}
          <Box position="absolute" top={0} left={0} right={0} bottom={0} flexDirection="row" justifyContent="center" {...reveal}>
            <Svg
              source={buttonSvg(pack, g, on ? 'on' : m?.kinds.length ? 'off' : 'idle', [40, 28])}
              alt={on ? `${GLYPH_EMOJI[g]} ${NAME[g]} — remove` : `${GLYPH_EMOJI[g]} ${NAME[g]} — ${HINT[k]}`}
              width={40}
              height={28}
            />
          </Box>
          {captionAt()}
          <Box position="absolute" top={0} left={0} right={0} bottom={0} alignItems="center" justifyContent="center">
            <Button key={`${target.id}:${k}`} label={'  '} plain onPress={press} />
          </Box>
        </Box>
      )
    })

  // A line under the answer, in the flow: for paragraphs (beta) it opens on hovering the icon;
  // without a mouse and in the fallback only a fresh one, for the first seconds after a reaction.
  const linesOf = (markId: string, m: Mark | undefined) =>
    (m?.kinds ?? []).flatMap(k => {
      const said = m ? lineText(m, k) : ''
      if (!m || !said) return []
      const open = !m.folded && m.lineKind === k
      if (!open && !cardsOn) return []
      const hidden = open ? {} : { display: 'none' as const, hover: { scope: scopeOf(markId, k), display: 'flex' as const } }
      return [
        <Box borderStyle="round" borderDimColor paddingX={1} alignSelf="flex-start" {...hidden}>
          <Text dimColor>{said}</Text>
        </Box>,
      ]
    })

  // A paragraph with a reaction: a tint in the reaction's colour, and in a plain paragraph exactly the selected piece is highlighted.
  const block = (b: string, i: number) => {
    const markId = `${id}#${blockKey(blocks, i)}`
    const m = all[markId]
    const kinds = m?.kinds ?? []
    const tint = m?.last ? TINT[gl[m.last]] : undefined
    const parts = m?.fragKind ? splitFragment(b, m.frag, m.fragAt, m.fragLen) : null
    const body = parts ? (
      <Text>
        {parts[0]}
        <Text backgroundColor={TINT[gl[m!.fragKind!]]}>{parts[1]}</Text>
        {parts[2]}
      </Text>
    ) : (
      <Markdown text={b} />
    )
    return (
      <Box key={`b-${markId}`} flexDirection="column">
        <Box flexDirection="row" alignItems="flex-start" gap={1}>
          <Box flexGrow={1} flexShrink={1} minWidth={0} {...(tint && !parts ? { backgroundColor: tint } : {})}>
            {body}
          </Box>
          <Box flexDirection="row" alignItems="center" gap={1} minWidth={3}>
            {kinds.length ? kinds.map(k => chip(markId, m!, k, 'small', null)) : <Text dimColor>·</Text>}
            <Box position="absolute" right={0} top={0} flexDirection="row" gap={1} {...reveal}>
              {buttons({ id: markId, msg: id, text: b }, m, false)}
            </Box>
          </Box>
        </Box>
        {linesOf(markId, m)}
      </Box>
    )
  }

  const kinds = mark?.kinds ?? []
  // Each icon's place in the row, in cells from the left edge: the widths of the icons before it.
  let x = 0
  const chips = kinds.flatMap(k => {
    const at = x
    x += spanOf('big', k)
    return mark?.frag && mark.fragKind === k && !cardsOn
      ? [chip(id, mark, k, 'big', at), <Text dimColor>{`“${clip(mark.frag, 48)}”`}</Text>]
      : [chip(id, mark!, k, 'big', at)]
  })
  // Without paragraphs (off, phone, terminal) paragraph reactions do not vanish: they show as icons under the answer after "¶".
  // After the answer's icons and "¶" (one cell).
  let small = x + 1
  const paragraphChips = byParagraph
    ? []
    : blockIds.flatMap(bid => {
        const m = all[bid]
        return m
          ? m.kinds.map(k => {
              const at = small
              small += spanOf('small', k)
              return chip(bid, m, k, 'small', at)
            })
          : []
      })
  // The hover row is a layer in the strip's top line, level with the icons: it is not cut off
  // and does not shift the transcript; under it is the line set aside for Claude's lines.
  // It is never hidden, only parked past the right edge (clipped there) and moved in while the answer is hovered:
  // each button is a hover area of its own for its caption, and a hover area inside a hidden Box stays inert.
  const row = canHover ? { position: 'absolute' as const, right: -400, top: 0, hover: { right: 0 } } : {}
  const strip = {
    // By paragraph, the strip is its own hover area: hovering a paragraph does not open the whole answer's row.
    ...(byParagraph ? { key: `strip-${id}` } : {}),
    // The hover row fits the strip whole and does not lie over the answer's last line.
    ...(canHover ? { minHeight: 2 } : {}),
    // Air between the text and the placed reactions.
    ...(kinds.length || paragraphChips.length ? { marginTop: 1 } : {}),
  }

  return (
    <Box key={`rx-${id}`} flexDirection="column">
      {byParagraph ? (
        <Box flexDirection="column" gap={1}>
          {blocks.map(block)}
        </Box>
      ) : (
        own
      )}
      <Box flexDirection="row" alignItems={canHover ? 'flex-start' : 'center'} justifyContent="space-between" gap={1} {...strip}>
        {/* Room on the right for the button row (rowRoom, in cells): the icons do not reach it. */}
        <Box flexDirection="row" alignItems="flex-start" gap={canHover ? 0 : 1} flexGrow={1} flexShrink={1} minWidth={0} {...(canHover ? { marginRight: rowRoom } : {})}>
          {chips}
          {paragraphChips.length ? [<Text dimColor>¶</Text>, ...paragraphChips] : null}
        </Box>
        {/* Buttons in boxes carry their own air; native buttons on their own get a cell between them. */}
        <Box flexDirection="row" {...(rowGap ? { gap: rowGap } : {})} {...row}>
          {buttons({ id, msg: id, text, ...(byParagraph ? { blocks } : {}) }, mark)}
        </Box>
      </Box>
      {cardsOn ? null : linesOf(id, mark)}
    </Box>
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    root = await $.session.root().catch(() => e.cwd)
    interactive = e.isInteractive
    home = (await $.env.get('HOME').catch(() => undefined)) ?? (await $.env.get('USERPROFILE').catch(() => undefined)) ?? ''
    typeScale = atLeast(await engineVersion($), '2.1.308')
    sessionId = await $.session.id().catch(() => '')
    stale = false
    hinted = false
    resetSeen = 0
    try {
      await $.command.register({ name: 'chefkiss', description: 'Reactions: lessons, summary, pack, settings' })
    } catch (err) {
      void $.ui.toast(`The /chefkiss command was not registered: ${message(err)}`)
    }
    // With the store unavailable, reactions still work, just without memory between sessions.
    await safely($, 'settings were not loaded', () => loadSettings($))
    await safely($, 'lessons were not loaded', async () => {
      await pruneLessons($)
      const stored = await storedLessons($)
      await update($, lessons, () => stored.slice(-LESSONS_CAP))
    })
    await safely($, 'reactions were not loaded', () => loadMarks($))
    await safely($, 'the summary was not loaded', async () => {
      const v = await storedProfile($)
      await update($, profile, () => v)
    })
    // A reload mid-summary does not leave the button at "Summing up…" forever.
    await update($, profileBusy, () => false)
    // No history: reactions will appear under new answers.
    await loadHistory($, false).catch(() => undefined)
    unwatchStore()
    if (await someoneHere($)) watchStore($)
    return next(e)
  })

  // A surface attached after the conversation's context was computed without the digest: compute it again.
  on('session.attach', async ($, e, next) => {
    const done = await next(e)
    watchStore($)
    if (digestWaits) {
      digestWaits = false
      $.ui.invalidate('prompt.context')
    }
    return done
  })

  // The last window left: nobody looks, so nothing to keep fresh; an attach starts the poll again.
  on('session.detach', async ($, e, next) => {
    const done = await next(e)
    if (!(await someoneHere($))) unwatchStore()
    return done
  })

  // /clear and /resume: old signals must not travel into the new conversation. The process goes on under a new
  // session id with no session.start, so the settings poll goes on too; any other end stops it.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear' || e.reason === 'resume') {
      stale = true
      await update($, outbox, () => [])
    } else {
      unwatchStore()
    }
    return next(e)
  })

  // End of a turn: its last visible text is the final answer, and reactions go under it.
  // An interrupted turn is not an answer.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId === undefined && e.reason === 'answer' && e.answer) await update($, finals, f => remember(f, e.answer))
    return done
  })

  // If the tree (paragraphs, own icons in the row) fails the hook's check, the hook fails and .catch draws
  // the native text with a row of native buttons. A second next in .catch does not redraw the answer; it hands back the drawn one.
  // A prop the engine does not know (size, weight on an older engine) is not caught by .catch: the tree is refused
  // whole, so the version check (typeScale) guards against them.
  on('ui.render', { component: 'AssistantMessage' }, ($, e, next) => drawMessage($, e, next, true)).catch(($, e, next) =>
    drawMessage($, e, next, false),
  )

  // Reactions since last time go to Claude as a hidden note on the person's message.
  on('prompt.submit', async ($, e, next) => {
    if (e.command || e.isMeta || NOT_HUMAN.has(e.origin?.kind ?? '')) return next(e)
    if (stale) {
      stale = false
      await refreshSession($)
    }
    // A "Forget all" elsewhere first: its reactions are not sent and leave the saved copy.
    await syncedBeforeMessage($).catch(() => undefined)
    // The queue is taken in one step: a reaction placed at that moment is not lost.
    let taken: Signal[] = []
    await update($, outbox, o => {
      taken = [...o]
      return []
    })
    if (taken.length === 0) return next(e)
    const done = await next({ ...e, context: [...(e.context ?? []), signalText(taken)] })
    // The message did not go through: the reactions wait for the next one.
    if (done.drop !== undefined) await update($, outbox, o => [...taken, ...o])
    return done
    // A failure here never holds the person's message back: what already went down the chain stands, else it goes on as typed.
  }).catch(($, e, next) => next(e))

  // The lessons digest comes once, at the start of a conversation: the system prompt is left alone, the cache stays whole.
  on('prompt.context', async ($, e, next) => {
    const done = await next(e)
    if (!(await read($, settings)).digest) return done
    digestWaits = !(await someoneHere($))
    if (digestWaits) return done
    // Lessons and the summary come from the store: another session may have updated or erased them.
    const text = digestText(await storedLessons($), 15, await storedProfile($))
    if (!text) return done
    return { ...done, blocks: [...done.blocks.filter(b => b.name !== 'chefkiss'), { name: 'chefkiss', text }] }
  })

  // The command's answer is empty: Claude reads it, and it need not be told about reactions.
  on('command.run', { command: 'chefkiss' }, async $ => {
    // Another session may have added, forgotten or summed up lessons since this one started.
    await safely($, 'lessons were not loaded', async () => {
      const stored = await storedLessons($)
      await update($, lessons, () => stored.slice(-LESSONS_CAP))
      const me = await storedProfile($)
      await update($, profile, () => me)
    })
    await $.ui.open({ id: PANE, title: 'chefkiss' })
    return {}
  })

  // The pane: what reactions mean, lessons (what the pane is opened for), pack, settings.
  // No explanatory paragraphs: labels are short, state shows in the checkboxes and buttons.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const Svg = 'Svg' in els ? els.Svg : undefined
    const Input = 'Input' in els ? els.Input : undefined
    const Link = 'Link' in els ? els.Link : undefined
    const st = await read($, settings)
    const gl = glyphsOf(st.icons)
    const all = await read($, lessons)
    const learned = all.filter(l => l.line)
    const recent = learned.slice(-8).reverse()
    const pack = packOf(st.pack)
    const armed = await read($, forgetArmed)
    // With lessons off, reactions still pile up: "Forget all" shows for them too, and only while some are placed.
    const hasMarks = await anyMarks($)
    const trend = slopTrend(all)
    const me = await read($, profile)
    const busy = await read($, profileBusy)
    const newer = me ? learned.filter(l => l.at > me.at).length : learned.length
    // A summary is a model call: with model calls off there is nothing to press.
    const canSum = st.modelCalls && learned.length >= PROFILE_MIN
    // On an older engine, no sizes or weights: captions are just dim, headings bold.
    const caption = typeScale ? { size: 'caption' as const } : {}
    const medium = typeScale ? { weight: 'medium' as const } : {}
    const semibold = typeScale ? { weight: 'semibold' as const } : { bold: true }

    const icon = (p: Pack, k: Kind, size: number) =>
      p.kind === 'svg' && Svg ? (
        <Svg source={iconSvg(p, gl[k])} alt={`${GLYPH_EMOJI[gl[k]]} ${NAME[gl[k]]}`} width={size} height={size} />
      ) : (
        <Text>{textOf(p, gl[k])}</Text>
      )

    // A section: a short caption over a card in a thin rounded frame; a counter or an action on the right.
    const section = (title: string, aside: RenderElement | null, body: RenderElement[]) => (
      <Box flexDirection="column">
        <Box flexDirection="row" alignItems="center" justifyContent="space-between" paddingX={1} marginBottom={1}>
          <Text {...caption} {...semibold} dimColor>
            {title}
          </Text>
          {aside}
        </Box>
        <Box borderStyle="round" borderDimColor flexDirection="column" paddingX={1} paddingY={1} gap={1}>
          {body}
        </Box>
      </Box>
    )

    // A checkbox: the whole row is one button, the state shows as ☑ / ☐ (On/Off also read as an action).
    const toggleRow = (key: string, title: string, isOn: boolean, flip: () => void) => (
      <Button key={key} label={`${isOn ? '☑' : '☐'} ${title}`} plain onPress={flip} />
    )

    return (
      <Box flexDirection="column" gap={2} paddingY={1}>
        <Box flexDirection="column" paddingX={1} gap={1}>
          {KINDS.map(k => (
            <Box flexDirection="row" alignItems="center" gap={1}>
              {icon(pack, k, 22)}
              <Text {...medium}>{NAME[gl[k]]}</Text>
              <Text dimColor>{HINT[k]}</Text>
            </Box>
          ))}
        </Box>

        {/* What Claude learned: all lessons summed up in a few lines of taste, to show and to share. */}
        {section(
          'About you',
          canSum ? (
            <Button
              key="sum-up"
              label={busy ? 'Summing up…' : me ? (newer ? `Update · ${newer} new` : 'Update') : 'Sum up'}
              {...(me && !newer ? { plain: true as const, dimColor: true } : {})}
              onPress={() => void sumUp($)}
            />
          ) : null,
          me
            ? [
                // The verdict on top: for the person and the card, not for Claude, and it can go like a line.
                ...(me.verdict
                  ? [
                      <Box flexDirection="row" alignItems="flex-start" justifyContent="space-between" gap={1}>
                        <Text {...semibold}>{me.verdict}</Text>
                        <Button key="drop-verdict" label="×" plain dimColor onPress={() => void dropVerdict($, me.verdict ?? '')} />
                      </Box>,
                    ]
                  : []),
                // Every line has a cross: a conclusion about the person that could not be corrected would go into every conversation.
                ...me.text.split('\n').map((s, i) => (
                  <Box flexDirection="row" alignItems="flex-start" justifyContent="space-between" gap={1}>
                    <Text>{s}</Text>
                    <Button key={`drop-profile:${i}`} label="×" plain dimColor onPress={() => void dropProfileLine($, s)} />
                  </Box>
                )),
                // The card goes out as a post: on X in a window with the text ready, elsewhere through Copy.
                // Named by what they do; in a narrow pane they go under the count, still on the right.
                // No X link in the terminal: one without link support prints the whole encoded address after it.
                <Box flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={2} rowGap={0}>
                  <Text {...caption} dimColor>
                    {`From ${me.from} reactions · ${shortDate(me.at)}`}
                  </Text>
                  <Box flexDirection="row" alignItems="center" justifyContent="flex-end" gap={1} flexGrow={1} flexShrink={0}>
                    {Link && e.surface !== 'terminal' ? <Link key="post-x" href={xIntent(cardText(me, REPO))} label="Post on X" /> : null}
                    <Button
                      key="copy-profile"
                      label="Copy"
                      plain
                      dimColor
                      onPress={press =>
                        void $.ui
                          .copy({ text: cardText(me, REPO, Infinity), surface: press.surface })
                          .then(r => $.ui.toast(r.isCopied ? 'Copied' : 'Not copied'))
                      }
                    />
                  </Box>
                </Box>,
              ]
            : [
                <Text dimColor>
                  {!st.modelCalls
                    ? 'Lessons are off in Settings.'
                    : learned.length >= PROFILE_MIN
                    ? 'Sum up what Claude learned from your reactions.'
                    : `React to ${PROFILE_MIN - learned.length} more ${PROFILE_MIN - learned.length === 1 ? 'answer' : 'answers'} first.`}
                </Text>,
              ],
        )}

        {section(
          'Lessons',
          <Box flexDirection="row" alignItems="center" gap={1}>
            {learned.length > recent.length ? (
              <Text {...caption} dimColor>
                {`${recent.length} of ${learned.length}`}
              </Text>
            ) : null}
            {all.length > 0 || hasMarks ? (
              // Erasing everything takes two presses: the first asks, and the question drops by itself after 5 s.
              <Button
                key="forget-all"
                label={armed ? `Forget all${all.length ? ` ${all.length}` : ''}? Press again` : 'Forget all'}
                {...(armed ? { variant: 'primary' as const } : { plain: true as const, dimColor: true })}
                onPress={() => void (armed ? forgetAll($) : armForget($))}
              />
            ) : null}
          </Box>,
          recent.length === 0
            ? [<Text dimColor>None yet</Text>]
            : [...recent.map(l => (
                <Box flexDirection="row" alignItems="flex-start" justifyContent="space-between" gap={1}>
                  <Box flexDirection="row" gap={1} flexShrink={1} minWidth={0}>
                    <Text>{GLYPH_EMOJI[gl[l.kind]]}</Text>
                    <Text>{l.line}</Text>
                  </Box>
                  <Box flexDirection="row" alignItems="center" gap={1} flexShrink={0}>
                    <Text {...caption} dimColor>
                      {shortDate(l.at)}
                    </Text>
                    <Button key={`forget:${l.key}`} label="×" plain dimColor onPress={() => void forgetWithReaction($, l)} />
                  </Box>
                </Box>
              )),
              // Whether Claude got better at not sounding like slop, in plain counts, only once both windows are full.
              ...(trend
                ? [
                    <Text {...caption} dimColor>
                      {`${GLYPH_EMOJI[gl.slop]} in ${trend.now} of your last ${trend.window} lessons, ${trend.before} of the ${trend.window} before`}
                    </Text>,
                  ]
                : [])],
        )}

        {section('Pack', null, [
          ...PACKS.map(p => (
            <Box flexDirection="row" alignItems="center" justifyContent="space-between" gap={2}>
              {/* In a narrow pane the name goes under the pictures: kaomoji are wide, and the button stays inside. */}
              <Box flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={1} rowGap={0} flexShrink={1} minWidth={0}>
                <Box flexDirection="row" {...(p.kind === 'text' ? { gap: 1 } : {})}>
                  {KINDS.map(k => icon(p, k, 22))}
                </Box>
                <Text {...(p.id === st.pack ? medium : {})}>{p.name}</Text>
              </Box>
              {/* The chosen one shows a dim "In use" instead of a button that would press for nothing. */}
              <Box flexShrink={0}>
                {p.id === st.pack ? (
                  <Text {...caption} dimColor>
                    In use
                  </Text>
                ) : (
                  <Button key={`pack:${p.id}`} label="Use" onPress={() => void saveSettings($, { pack: p.id })} />
                )}
              </Box>
            </Box>
          )),
        ])}

        {/* The picture on each button, in any pack: the meaning stays with the button. Apart from the packs,
            which change the style of all three. */}
        {section('Buttons', null, [
          toggleRow('icon-heart', '❤️ instead of 🤌', st.icons.heart === 'heart', () =>
            void saveSettings($, s => ({ icons: { ...s.icons, heart: s.icons.heart === 'heart' ? 'pinch' : 'heart' } })).then(() => journalAll($)),
          ),
          toggleRow('icon-fire', '🔥 instead of 🎯', st.icons.fire === 'fire', () =>
            void saveSettings($, s => ({ icons: { ...s.icons, fire: s.icons.fire === 'fire' ? 'target' : 'fire' } })).then(() => journalAll($)),
          ),
          toggleRow('icon-slop', '🤖 instead of 💩', st.icons.slop === 'robot', () =>
            void saveSettings($, s => ({ icons: { ...s.icons, slop: s.icons.slop === 'robot' ? 'poop' : 'robot' } })).then(() => journalAll($)),
          ),
        ])}

        {section('Settings', null, [
          // Each line and each summary is a model call of its own: off for those who save tokens.
          toggleRow('model-calls', 'Claude writes lessons', st.modelCalls, () => void saveSettings($, { modelCalls: !st.modelCalls })),
          toggleRow('digest', 'Lessons in new chats', st.digest, () => void saveSettings($, { digest: !st.digest })),
          // Paragraph reactions (beta) break on code and complex markup: the checkbox shows only if already on.
          ...(st.paragraphs
            ? [toggleRow('paragraphs', 'Paragraph reactions (beta)', st.paragraphs, () => void saveSettings($, { paragraphs: !st.paragraphs }))]
            : []),
          // No input field (phone), no journal.
          ...(Input
            ? [
                <Input
                  key="journal"
                  label="Journal folder"
                  placeholder="empty = off"
                  value={st.journalDir}
                  submitLabel="Save"
                  onSubmit={value => {
                    void saveSettings($, { journalDir: absoluteDir(value) }).then(() => writeJournal($, [monthOf(Date.now())]))
                  }}
                />,
              ]
            : []),
        ])}
      </Box>
    )
  })
}
