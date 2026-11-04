import type { Glyph, Kind, Lesson, Profile, ReactionSettings, Signal } from '../types'

export const KINDS: Kind[] = ['heart', 'fire', 'slop']

// The reaction as Claude sees it: one emoji per meaning, whatever picture the person put on the button.
export const EMOJI: Record<Kind, string> = { heart: '🤌', fire: '🎯', slop: '💩' }

// The picture as the person sees it: on native buttons, in the System pack, the pane and the journal.
export const GLYPH_EMOJI: Record<Glyph, string> = { pinch: '🤌', heart: '❤️', target: '🎯', fire: '🔥', poop: '💩', robot: '🤖' }

export const NAME: Record<Glyph, string> = { pinch: 'Chef’s kiss', heart: 'Like', target: 'Spot on', fire: 'On fire', poop: 'Slop', robot: 'Slop' }

// The picture on each button is the person's choice: 🤌 or ❤️, 🎯 or 🔥, 💩 or 🤖.
export function glyphsOf(icons: ReactionSettings['icons']): Record<Kind, Glyph> {
  return { heart: icons.heart, fire: icons.fire, slop: icons.slop }
}

// What a reaction means, for the person: the caption in the pane and at the button.
export const HINT: Record<Kind, string> = {
  heart: 'how it’s said',
  fire: 'what it says',
  slop: 'reads like AI',
}

// What a reaction means, for Claude. The meaning depends on neither the pack nor the picture.
export const MEANING: Record<Kind, string> = {
  heart: 'liked how it was said: tone, form, a nice touch',
  fire: 'strong on substance: this is the level, keep thinking like this',
  slop: 'sounds like AI slop: filler, generic words, empty structure in that spot',
}

// The start of an answer without markup or extra spaces: the answer is recognised by it both on screen and in turn.complete.
export function normalize(text: string, size = 160): string {
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/[`*_#>~|[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, size)
}

// A turn's final answer: its start is among the remembered ones. Empty or very short text is not an answer.
export function isFinal(text: string, finals: readonly string[]): boolean {
  const key = normalize(text)
  if (key.length < 2) return false
  return finals.some(f => f === key || (f.length >= 40 && key.startsWith(f)) || (key.length >= 40 && f.startsWith(key)))
}

export function remember(finals: readonly string[], answer: string, keep = 400): string[] {
  const key = normalize(answer)
  if (key.length < 2 || finals.includes(key)) return [...finals]
  return [...finals, key].slice(-keep)
}

// Final answers from an already saved conversation: assistant text without tool calls,
// followed by a person's message or the end of the conversation.
export function finalsFromHistory(
  rows: readonly { role: 'user' | 'assistant'; text: string; toolUses: readonly unknown[]; toolResults?: readonly unknown[] }[],
): string[] {
  const out: string[] = []
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.role !== 'assistant' || !row.text.trim() || row.toolUses.length > 0) continue
    const nextRow = rows[i + 1]
    const isPrompt = !nextRow || (nextRow.role === 'user' && !(nextRow.toolResults && nextRow.toolResults.length > 0))
    if (isPrompt) out.push(normalize(row.text))
  }
  return out
}

// Text without markup: on screen people select the drawn text, while the answer holds markdown.
export function plain(text: string): string {
  return text
    .replace(/[`*_~#>|]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

// The selected piece belongs to this answer: the selection lies in its row or its text is in the answer.
// A long selection is clipped, not lost.
export function pickFragment(sel: { text: string; requestId?: string } | undefined, msgId: string, msgText: string): string {
  if (!sel) return ''
  const text = plain(sel.text)
  if (!text) return ''
  const cut = text.length > 400 ? `${text.slice(0, 399).trimEnd()}…` : text
  if (sel.requestId === msgId) return cut
  if (sel.requestId === undefined && plain(msgText).includes(text)) return cut
  return ''
}

export function clip(text: string, size: number): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > size ? `${t.slice(0, size - 1).trimEnd()}…` : t
}

export function isRussian(text: string): boolean {
  // Code and paths do not count: a Russian answer with code is still Russian.
  const prose = text.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' ')
  const cyr = (prose.match(/[а-яё]/gi) ?? []).length
  const lat = (prose.match(/[a-z]/gi) ?? []).length
  // Letters Russian does not have: Ukrainian, Belarusian, Serbian, Macedonian, Kazakh and other Cyrillic languages
  // get English, not Russian. One in a hundred, so a Ukrainian word quoted in a Russian answer changes nothing.
  // Bulgarian has no letters of its own and stays Russian.
  const other = (prose.match(/[іїєґўђјљњћџѓѕќәғқңөұүһҳҷӣӯҗ]/gi) ?? []).length
  if (other * 100 >= cyr + other && other > 0) return false
  // No Cyrillic, not Russian: Japanese or Arabic would otherwise count as Russian (0 ≥ 0).
  return cyr > 0 && cyr >= lat
}


// The request to the small model: one "got it" line, which is both the reply to the reaction and the lesson for the journal.
export function linePrompt(kind: Kind, answer: string, frag: string): { system: string; prompt: string } {
  const ru = isRussian(answer)
  const start = ru ? 'понял:' : 'got it:'
  const warm = kind === 'heart' ? (ru ? ' Можно тепло начать: «рад, что откликнулось.»' : ' You may open warmly: "glad it landed."') : ''
  const system = [
    'You are Claude. The user just put a reaction under one of your answers.',
    `Write ONE short line, at most 60 characters, in ${ru ? 'Russian' : 'English'}, starting with "${start}".`,
    'Say what you take from it about approach, tone or form — what to keep, or what to avoid.',
    'Generalize: no details of the topic, no names, no quotes of private content. No thanks, no emoji.',
    warm,
  ].join(' ')
  const prompt = [
    `Reaction: ${EMOJI[kind]} — ${MEANING[kind]}.`,
    frag ? `The user selected this part: «${clip(frag, 300)}».` : 'The reaction is on the whole answer.',
    `Your answer (start): «${clip(answer, 1200)}»`,
  ].join('\n')
  return { system, prompt }
}

// The model's line: one line, no quotes. A long one is cut at the end of a phrase or a comma, not mid-word.
export function cleanLine(text: string, size = 90): string {
  const one = (text.split('\n').map(s => s.trim()).find(Boolean) ?? '').replace(/^["«»'“”]+|["«»'“”]+$/g, '').replace(/\s+/g, ' ')
  if (one.length <= size) return one
  const head = one.slice(0, size)
  const cut = Math.max(head.lastIndexOf('. '), head.lastIndexOf('; '), head.lastIndexOf(', '), head.lastIndexOf(' — '))
  return cut >= 30 ? head.slice(0, cut).trim() : clip(one, size)
}

// An answer by blocks: paragraph, list, table, code, each whole.
// Code closes only with the same fence, no shorter than the opening one: ``` inside ```` does not break the block.
// An indented line after a blank one (a list item's continuation) and a link definition [x]: url
// stick to the previous block, so lists and links do not fall apart.
export function splitBlocks(md: string): string[] {
  const out: string[] = []
  let cur: string[] = []
  let fence: { char: string; size: number } | null = null
  const flush = () => {
    if (cur.length === 0) return
    const text = cur.join('\n')
    const glue = out.length > 0 && (/^(\s{2,}|\t)\S/.test(cur[0] ?? '') || /^\[[^\]]+\]:\s/.test(cur[0] ?? ''))
    if (glue) out[out.length - 1] = `${out[out.length - 1]}\n\n${text}`
    else out.push(text)
    cur = []
  }
  for (const line of md.replace(/\r\n?/g, '\n').split('\n')) {
    const mark = /^\s*(`{3,}|~{3,})/.exec(line)
    if (mark) {
      const char = mark[1]![0]!
      const size = mark[1]!.length
      if (!fence) fence = { char, size }
      else if (fence.char === char && size >= fence.size && line.trim() === mark[1]) fence = null
      cur.push(line)
      continue
    }
    if (!fence && line.trim() === '') {
      flush()
      continue
    }
    cur.push(line)
  }
  flush()
  return out
}

// A plain paragraph without markup: it can be drawn as text with a piece highlighted exactly.
// Links, strikethrough, entities, escapes and indented code are not plain: they need Markdown whole.
export function isPlainBlock(block: string): boolean {
  if (block.includes('\n')) return false
  return !/[*_`#>|[\]<~&\\]|https?:\/\/|^\s{4}|^\s*([-+*]|\d+[.)])\s/.test(block)
}

// A piece inside a plain paragraph: before, the piece, after. Found by the piece's text, or if it is gone (the
// piece's text is not kept across a restart) by position and length. A piece found twice or not at all gives
// null, and the whole paragraph is highlighted.
export function splitFragment(block: string, frag: string, at = -1, len = 0): [string, string, string] | null {
  if (!isPlainBlock(block)) return null
  let start = at
  let size = len
  if (frag) {
    // The ellipsis is cut only from a clipped piece: a real ellipsis in the text is part of the piece.
    const clean = frag.length >= 400 && frag.endsWith('…') ? frag.slice(0, -1) : frag
    const first = block.indexOf(clean)
    if (first < 0 || first !== block.lastIndexOf(clean)) return null
    start = first
    size = clean.length
  }
  if (start < 0 || size <= 0 || start + size > block.length) return null
  return [block.slice(0, start), block.slice(start, start + size), block.slice(start + size)]
}

// A block's address follows its text, not its number: a change in splitting will not move old reactions onto other paragraphs.
// Identical blocks are told apart by an ordinal.
export function blockKey(blocks: readonly string[], i: number): string {
  const b = blocks[i] ?? ''
  const dup = blocks.slice(0, i).filter(y => y === b).length
  return dup ? `${shortHash(b)}.${dup}` : shortHash(b)
}

// A short stable string hash (djb2, base36).
export function shortHash(text: string): string {
  let x = 5381
  for (const c of text) x = ((x * 33) ^ (c.codePointAt(0) ?? 0)) >>> 0
  return x.toString(36)
}

function words(text: string): string[] {
  return plain(text).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)
}

// The line goes into the memory of every future conversation, so it is checked: it starts with «понял / got it / рад»
// and has no five words in a row from the answer or the selected piece, which would be a quote, not a lesson.
export function acceptLine(raw: string, answer: string, frag: string): string {
  const line = cleanLine(raw)
  if (!/^(понял|got it|рад|glad)/i.test(line)) return ''
  // Links, commands and paths are not a lesson about taste but a plant in the memory of every future conversation.
  if (/https?:|www\.|`|[\\/]/i.test(line)) return ''
  const own = words(line)
  const source = ` ${words(`${answer} ${frag}`).join(' ')} `
  for (let i = 0; i + 5 <= own.length; i++) {
    if (source.includes(` ${own.slice(i, i + 5).join(' ')} `)) return ''
  }
  return line
}

const RULES = [
  `Meanings: ${EMOJI.heart} ${MEANING.heart}; ${EMOJI.fire} ${MEANING.fire}; ${EMOJI.slop} ${MEANING.slop}.`,
  'Keep what worked and avoid what was marked as slop, but do not overcorrect from one reaction or change your whole style.',
  'Do not mention the reactions unless the user asks about them; do not thank for them or ask for them.',
].join('\n')

// The hidden note on the person's next message: reactions since last time.
export function signalText(signals: readonly Signal[]): string {
  if (signals.length === 0) return ''
  const lines = signals.map(s => {
    const where = !s.excerpt
      ? 'one of your earlier replies'
      : s.msg.includes('#')
        ? `a paragraph of your reply: «${clip(s.excerpt, 90)}»`
        : `your reply starting «${clip(s.excerpt, 90)}»`
    if (s.op === 'remove') return `- removed ${EMOJI[s.kind]} from ${where}`
    const frag = s.frag ? `, selected: «${clip(s.frag, 160)}»` : ''
    const line = s.line ? ` — you read it as: ${s.line}` : ''
    return `- ${EMOJI[s.kind]} on ${where}${frag}${line}`
  })
  return [
    '<reactions>',
    'The user reacted to your replies with buttons under them since their last message. These are quiet signals, not requests.',
    ...lines,
    RULES,
    '</reactions>',
  ].join('\n')
}

// The digest at the start of a new conversation: the latest lessons, with no quotes and no projects.
// With a taste summary, the summary itself and only lessons after it (up to five): shorter and stronger than 15 raw lines.
// Lessons that say the same word for word are one line with a count: a repeat is the strong signal, and it does
// not push other lessons out of the digest. The latest of them stands for the group, at its place in time.
export function collapseRepeats(lessons: readonly Lesson[]): { lesson: Lesson; times: number }[] {
  const groups = new Map<string, { lesson: Lesson; times: number }>()
  for (const l of lessons) {
    const key = `${l.kind} ${l.line.toLowerCase().replace(/\s+/g, ' ').replace(/[\s.!…]+$/u, '').trim()}`
    const seen = groups.get(key)
    if (seen) groups.delete(key)
    groups.set(key, { lesson: l, times: (seen?.times ?? 0) + 1 })
  }
  return [...groups.values()]
}

function digestLine({ lesson: l, times }: { lesson: Lesson; times: number }): string {
  return `- ${isoDay(l.at)} ${EMOJI[l.kind]} ${l.line}${times > 1 ? ` (×${times})` : ''}`
}

// How often the slop button came in the last `window` reactions and in the ones before: plain counts, and nothing
// until both windows are full, since on a handful of reactions a share says nothing.
export function slopTrend(lessons: readonly Lesson[], window = 20): { now: number; before: number; window: number } | null {
  if (lessons.length < window * 2) return null
  const ordered = [...lessons].sort((a, b) => a.at - b.at)
  const count = (xs: readonly Lesson[]) => xs.filter(l => l.kind === 'slop').length
  return { now: count(ordered.slice(-window)), before: count(ordered.slice(-window * 2, -window)), window }
}

export function digestText(lessons: readonly Lesson[], limit = 15, profile: Profile | null = null): string {
  const withLine = lessons.filter(l => l.line)
  if (profile?.text) {
    const fresh = collapseRepeats(withLine.filter(l => l.at > profile.at)).slice(-5)
    return [
      `What the user’s reactions to your answers have taught you so far — their taste, summed up from ${profile.from} reactions:`,
      ...profile.text.split('\n').map(s => `- ${s}`),
      ...(fresh.length
        ? ['Reactions since then — raw signals: one is not a rule, a repeat is a strong signal.', ...fresh.map(digestLine)]
        : []),
      RULES,
    ].join('\n')
  }
  const recent = collapseRepeats(withLine).slice(-limit)
  if (recent.length === 0) return ''
  return [
    'Reactions the user left on your answers in recent sessions — raw signals: one is not a rule, a repeat is a strong signal, no reaction means nothing.',
    ...recent.map(digestLine),
    RULES,
  ].join('\n')
}

// The request to sum lessons up: a one-sentence verdict on the person, then up to 5 lines of taste, in the lessons'
// language. The verdict is for the person and the card they share; the lines open every future conversation, so
// they keep to how the person likes answers: no topics, names or quotes. The lines stay close to the lessons' own
// words: generic advice that fits anyone ("be concise") makes every summary the same.
// As many lines as there are distinct thoughts: two thoughts said five ways are two lines.
// A lesson's language by its opening: Claude starts every line with «понял» or "got it" (or «рад» / "glad")
// in the answer's language, so English terms inside a Russian lesson do not make it English.
export function lessonIsRussian(line: string): boolean {
  if (/^(?:понял|рад)/i.test(line)) return true
  if (/^(?:got it|glad)/i.test(line)) return false
  return isRussian(line)
}

// Something the person crossed out of a summary: a line, whose thought must not come back, or a verdict, whose
// wording must not; a verdict is often crossed out for its form, and its thought may stay in a line.
export type Crossed = { kind: 'line' | 'verdict'; text: string }

// What the person crossed out of earlier summaries goes along: Update must not bring it back.
export function profilePrompt(
  lessons: readonly Lesson[],
  crossed: readonly Crossed[] = [],
): { system: string; prompt: string; lang: 'ru' | 'en' } {
  const lines = lessons.filter(l => l.line)
  // The language most lessons are in, by count; a tie goes by the letters of them all.
  const ruCount = lines.filter(l => lessonIsRussian(l.line)).length
  const ru = ruCount * 2 === lines.length ? isRussian(lines.map(l => l.line).join(' ')) : ruCount * 2 > lines.length
  const system = [
    'You are Claude. Below are short lessons you took from the user’s reactions to your answers:',
    `${EMOJI.heart} — ${MEANING.heart}; ${EMOJI.fire} — ${MEANING.fire}; ${EMOJI.slop} — ${MEANING.slop}.`,
    `Answer in ${ru ? 'Russian' : 'English'}. First line: "VERDICT: " and one sentence about the user, at most 70 characters,`,
    'the way a friend who knows how they work would put it: kind, wry and specific to these lessons, with no judgement',
    'and no flattery. Build it on what sets this user apart: nearly everyone here dislikes filler and AI-sounding text,',
    'so that alone is no verdict. No stock idioms, and no contrast: not "X, not Y", "rather than", "everything except",',
    '"long before", "instead of", «а не», «всё, кроме», «вместо»; say what they are, not what they are not.',
    'Then up to 5 lines of their taste, each at most 60 characters, one distinct preference per line.',
    'Keep the lines specific and close to the lessons’ own words: not advice that would fit anyone.',
    'Repeated lessons weigh more than one-offs; if lessons disagree, keep what repeats.',
    'No topics, project names or quotes from conversations, in the verdict or the lines: the verdict goes into a post',
    'the user may share, and the lines open every future conversation.',
    'Write as many lines as there are distinct preferences, up to 5: lines that say the same thing in other words are one line,',
    'and a short list beats a repeat: check each line against the ones above it before you write it.',
    'No intro, no numbering, no bullets, no emoji.',
  ].join(' ')
  const gone = crossed.filter(c => c.kind === 'line').map(c => `- ${c.text}`)
  const verdicts = crossed.filter(c => c.kind === 'verdict').map(c => `- ${c.text}`)
  const prompt = [
    'Lessons, oldest first:',
    ...lines.map(l => `- ${EMOJI[l.kind]} ${l.line}`),
    ...(gone.length ? ['', 'Lines the user crossed out of earlier summaries: do not write these again, nor the same in other words:', ...gone] : []),
    ...(verdicts.length ? ['', 'Verdicts the user crossed out: write a new one, in other words:', ...verdicts] : []),
  ].join('\n')
  return { system, prompt, lang: ru ? 'ru' : 'en' }
}

// The model may still write a crossed-out line or verdict word for word: it is dropped here.
export function withoutCrossed(p: { verdict: string; text: string }, crossed: readonly Crossed[]): { verdict: string; text: string } {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').replace(/[\s.!…]+$/u, '').trim()
  const lines = new Set(crossed.filter(c => c.kind === 'line').map(c => norm(c.text)))
  const verdicts = new Set(crossed.filter(c => c.kind === 'verdict').map(c => norm(c.text)))
  return {
    verdict: verdicts.has(norm(p.verdict)) ? '' : p.verdict,
    text: p.text
      .split('\n')
      .filter(s => s && !lines.has(norm(s)))
      .join('\n'),
  }
}

// The model's answer as a verdict and the lines of taste. An answer without the verdict line keeps its lines.
// The verdict line may come numbered, bulleted, quoted or in bold ("1. VERDICT:", "- **Verdict:**", "> VERDICT"):
// a verdict taken for a line would go into every new conversation.
const LEAD = /^\s*(?:[-*•–—>#]+|\d+[.)])?[\s*_]*/
const ITEM = /^\s*(?:[-*•–—]|\d+[.)])\s/
export function parseProfile(text: string): { verdict: string; text: string } {
  const all = text.split('\n')
  const head = (s: string) => s.replace(LEAD, '')
  const at = all.findIndex(s => /^(?:verdict|вердикт)(?=[\s*_:：—–-]|$)/i.test(head(s)))
  if (at < 0) return { verdict: '', text: cleanProfile(text) }
  const bare = (s: string) => s.replace(/^[\s*_:：—–-]+|[\s*_]+$/g, '')
  let said = bare(head(all[at] ?? '').replace(/^(?:verdict|вердикт)/i, ''))
  let used = at
  // "VERDICT:" alone on its line: the sentence is on the next one, unless that is already a list item of the lines.
  if (!said) {
    const next = all.findIndex((s, i) => i > at && s.trim() !== '')
    if (next >= 0 && !ITEM.test(all[next] ?? '')) {
      used = next
      said = bare(all[next] ?? '')
    }
  }
  return { verdict: said ? cleanLine(said, 90) : '', text: cleanProfile(all.filter((_, i) => i !== at && i !== used).join('\n')) }
}

// The card the person shares: a post that fits X, where a link counts as 23 characters and most letters,
// Cyrillic too, as one, the rest as two. Lines go from the end until it fits; the link always stays.
export const X_LIMIT = 280
export function xLength(text: string): number {
  let n = 0
  const rest = text.replace(/(?:https?:\/\/)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|org|io|dev|ai|net)(?:\/[^\s]*)?/gi, () => {
    n += 23
    return ''
  })
  for (const ch of rest) {
    const c = ch.codePointAt(0) ?? 0
    n += c <= 4351 || (c >= 8192 && c <= 8205) || (c >= 8208 && c <= 8223) || (c >= 8242 && c <= 8247) ? 1 : 2
  }
  return n
}

// Copy passes no limit: LinkedIn, Reddit or Slack take every line.
// The frame speaks the summary's language: a Russian summary is shared with a Russian feed.
export function cardText(me: Profile, link: string, limit = X_LIMIT): string {
  const lines = me.text.split('\n').filter(Boolean)
  const ru = me.lang ? me.lang === 'ru' : isRussian(`${me.verdict ?? ''} ${me.text}`)
  const one = me.from % 10 === 1 && me.from % 100 !== 11
  const head = ru ? 'Мне как обычно, по версии Claude' : 'My usual, according to Claude'
  const count = ru ? `по ${me.from} ${one ? 'реакции' : 'реакциям'}` : `from ${me.from} ${me.from === 1 ? 'reaction' : 'reactions'}`
  const build = (n: number) =>
    [head, '', ...(me.verdict ? [me.verdict, ''] : []), ...lines.slice(0, n), ...(n > 0 ? [''] : []), `${count} · ${link}`].join('\n')
  // The post window's link stays well under the 2048 characters a link may have, for any letters.
  const fits = (s: string) => xLength(s) <= limit && (limit === Infinity || xIntent(s).length <= 2000)
  let n = lines.length
  while (n > 0 && !fits(build(n))) n--
  return build(n)
}

// A new post on X with the card in it; the person posts it, or not, in the window that opens.
export function xIntent(text: string): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}`
}

// The model's answer as up to 5 clean lines: no bullets, numbering, quotes, intros like «Вот вкус:»
// or a «понял:» inherited from the lessons. A long line is cut at the end of a phrase, not mid-word.
export function cleanProfile(text: string): string {
  return text
    .split('\n')
    .map(s =>
      s
        .replace(/^\s*(?:[-*•–—]|\d+[.)])\s*/, '')
        .replace(/^["«»'“”]+|["«»'“”]+$/g, '')
        .replace(/^(?:понял|got it)\s*:\s*/i, '')
        .trim(),
    )
    .filter(s => s && !s.endsWith(':'))
    .slice(0, 5)
    .map(s => cleanLine(s, 70))
    .join('\n')
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

// A date without the 02.11 / 11.02 ambiguity: YYYY-MM-DD.
export function isoDay(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function monthOf(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}`
}

// A month's journal: a note header and a line per lesson. It is rebuilt from all of the month's lessons,
// so two sessions writing at once lose nothing. The header date is the month's first lesson.
// The journal is the person's: their pictures on the buttons, not Claude's emoji.
export function journalText(month: string, lessons: readonly Lesson[], now: number, glyphs: Record<Kind, Glyph>): string {
  const first = lessons.filter(l => monthOf(l.at) === month).reduce((min, l) => Math.min(min, l.at), Infinity)
  const head = [
    '---',
    `date: ${isoDay(Number.isFinite(first) ? first : now)}`,
    'author: ai',
    'tags: [claude, reactions]',
    '---',
    '',
    `# Reactions ${month}`,
    '',
    'What Claude took from the reactions under its answers. Written by the chefkiss mod: manual edits will be overwritten.',
    '',
  ]
  const rows = lessons
    .filter(l => monthOf(l.at) === month)
    .sort((a, b) => a.at - b.at)
    .map(l => {
      const where = [l.project, l.session ? `session ${l.session.slice(0, 8)}` : ''].filter(Boolean).join(' · ')
      return `- ${isoDay(l.at)} ${GLYPH_EMOJI[glyphs[l.kind]]} ${l.line || '—'}${where ? ` · ${where}` : ''}`
    })
  return [...head, ...rows, ''].join('\n')
}

export function baseName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? ''
}
