export type Kind = 'heart' | 'fire' | 'slop'

export type PackId = 'soft' | 'googly' | 'kaomoji' | 'system'

// The picture on a button: pinched fingers or a heart on the first, a target or a flame on the second, a poop or a robot on the third.
// The meaning stays with the button.
export type Glyph = 'pinch' | 'heart' | 'target' | 'fire' | 'poop' | 'robot'

// The shape version every record in $.store carries as v: a later version of the mod tells old records from its own.
export type V = 1

// Reactions on one final Claude answer, by message id (the requestId of its ui.render).
// fresh: the reaction just placed; while it is set, the icon is drawn animated.
// keys: a lesson key per reaction, so two quick reactions do not lose each other's lessons.
// lines: Claude's "got it: …" line per reaction; hovering an icon shows its line.
// lineKind: the reaction whose line is being written or just arrived; lineState: none, wait (being written), ready, off (failed).
// folded: the fresh line folded and shows only on hovering its icon.
// excerpt and frag live only in the session: the copy of reactions in the store goes without them.
export type Mark = {
  kinds: Kind[]
  last: Kind | null
  fresh: Kind | null
  freshAt: number
  frag: string
  fragKind: Kind | null
  // The piece's place in the paragraph: by it the highlight survives a restart, though the piece's text is not kept.
  fragAt: number
  fragLen: number
  excerpt: string
  keys: Partial<Record<Kind, string>>
  lines: Partial<Record<Kind, string>>
  lineKind: Kind | null
  lineState: 'none' | 'wait' | 'ready' | 'off'
  folded: boolean
}

// A signal for Claude that will go as a hidden note on the next message.
export type Signal = {
  op: 'add' | 'remove'
  kind: Kind
  msg: string
  excerpt: string
  frag: string
  line: string
}

// A lesson from a reaction: what accumulates between sessions. No quotes from answers.
// key: the key in $.store; ref: the message id, by which the lesson is removed with its reaction.
export type Lesson = {
  v: V
  key: string
  ref: string
  kind: Kind
  line: string
  at: number
  project: string
  session: string
}

// The taste summary: what Claude learned about the person from all lessons, 3–5 lines of preferences.
// from: how many lessons it rests on; at: the time of the newest of them, so newer lessons are "new";
// keys: the keys of the lessons it rests on; forget any of them and the summary is forgotten too.
// verdict: one sentence about the person, for them and the card they share; it does not go to Claude.
// lang: the language the summary was written in, so the card's frame matches it whatever the letters say.
export type Profile = {
  v: V
  verdict?: string
  lang?: 'ru' | 'en'
  text: string
  at: number
  from: number
  keys: string[]
}

export type ReactionSettings = {
  pack: PackId
  journalDir: string
  digest: boolean
  // Claude writes a line on each reaction and sums the lessons up: model calls of their own.
  // Off, there are no lines and no lessons, and reactions still reach Claude as a note on the next message.
  modelCalls: boolean
  // Reactions at each paragraph and the piece highlight: the mod draws the final answer itself, block by block.
  paragraphs: boolean
  // The picture on each button.
  icons: { heart: 'pinch' | 'heart'; fire: 'target' | 'fire'; slop: 'poop' | 'robot' }
}

declare module 'claude-code' {
  interface PluginState {
    chefkiss: {
      // One member per assistant message, by its requestId: the marks on the whole answer and on its paragraphs,
      // keyed by mark id (the message id or "<message>#<block>"). A reaction redraws its own message alone.
      marks: StateFamily<Shaped<Record<string, Mark>>>
      // Messages whose member holds marks: what the store copy, a new conversation and "Forget all" walk.
      marked: string[]
      // Starts of final answers (normalized): reactions go only under them.
      finals: string[]
      outbox: Shaped<Signal[]>
      settings: Shaped<ReactionSettings>
      lessons: Shaped<Lesson[]>
      // "Forget all" was pressed once and awaits confirmation.
      forgetArmed: boolean
      profile: Shaped<Profile | null>
      // The summary is being written right now.
      profileBusy: boolean
    }
  }
}
