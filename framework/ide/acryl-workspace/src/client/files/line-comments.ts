/**
 * Line comments in the code editor: a "+" beside the line under the pointer opens a comment form under that line (or under the selected
 * lines, when the selection covers it). Comment keeps it: it goes to the caller's list (`EditorComments`) and shows as a note under its
 * lines, and nothing is sent anywhere. The note copies itself, or every comment, to the clipboard, or closes; each of these ends the
 * comment. The notes are the list's, so a comment used from the Comments page closes here too. Positions follow edits to the document,
 * and the list is told where its comments moved.
 */

import { Facet, StateEffect, StateField, type EditorState, type Extension, type Range, type Text } from '@codemirror/state'
import { Decoration, EditorView, GutterMarker, ViewPlugin, WidgetType, gutter, type DecorationSet } from '@codemirror/view'

export interface CommentRequest {
  readonly fromLine: number
  readonly toLine: number
  readonly lines: readonly string[]
  readonly text: string
}

/** One kept comment of this file, as the list has it. */
export interface CommentNote {
  readonly id: string
  readonly fromLine: number
  readonly toLine: number
  readonly text: string
}

export type CopyResult = { readonly ok: true } | { readonly ok: false, readonly message: string }

/** The list the editor's comments live in (the workspace's comments, narrowed to this file). */
export interface EditorComments {
  /** This file's comments. */
  readonly notes: () => readonly CommentNote[]
  /** @returns disposer. */
  readonly subscribe: (listener: () => void) => () => void
  readonly add: (request: CommentRequest) => void
  /** The commented lines moved while the file was edited. */
  readonly move: (id: string, fromLine: number, toLine: number) => void
  /** Close it without using it. */
  readonly close: (id: string) => void
  /** Copy this comment to the clipboard, which ends it. */
  readonly copy: (id: string) => Promise<CopyResult>
  /** Copy every comment of the worktree to the clipboard, which ends them all. */
  readonly copyAll: () => Promise<CopyResult>
}

/** The lines a comment is about: the start of the first and of the last line, kept current through edits. */
interface Lines {
  readonly from: number
  readonly to: number
}

interface Note extends Lines {
  readonly id: string
  readonly text: string
}

interface CommentsState {
  /** The start of the line under the pointer. */
  readonly hover: number | null
  readonly draft: (Lines & { readonly id: number }) | null
  readonly notes: readonly Note[]
  readonly decorations: DecorationSet
}

const setHover = StateEffect.define<number | null>()
const openDraft = StateEffect.define<Lines>()
const closeDraft = StateEffect.define<null>()
/** The list changed: show its comments, keeping where the ones already shown have moved to. */
const syncNotes = StateEffect.define<readonly CommentNote[]>()

const listFacet = Facet.define<EditorComments, EditorComments | undefined>({ combine: values => values[0] })

let nextDraftId = 1

/** The list's comments placed in `doc`, a comment already placed keeping its place (it follows edits the list learns of later). */
function placeNotes(doc: Text, listed: readonly CommentNote[], shown: readonly Note[]): Note[] {
  const at = (line: number): number => doc.line(Math.min(Math.max(line, 1), doc.lines)).from
  return listed.map((note) => {
    const known = shown.find(candidate => candidate.id === note.id)
    return known === undefined ? { id: note.id, text: note.text, from: at(note.fromLine), to: at(note.toLine) } : { ...known, text: note.text }
  })
}

function sameNotes(a: readonly Note[], b: readonly Note[]): boolean {
  return a.length === b.length && a.every((note, index) => {
    const other = b[index]
    return other !== undefined && other.id === note.id && other.text === note.text && other.from === note.from && other.to === note.to
  })
}

function decorationsFor(doc: Text, draft: CommentsState['draft'], notes: readonly Note[]): DecorationSet {
  const ranges: Range<Decoration>[] = []
  for (const note of notes) ranges.push(Decoration.widget({ widget: new NoteWidget(note), block: true, side: 1 }).range(doc.lineAt(note.to).to))
  if (draft !== null) {
    const first = doc.lineAt(draft.from).number
    const last = doc.lineAt(draft.to)
    for (let number = first; number <= last.number; number += 1) ranges.push(Decoration.line({ class: 'cm-acrylCommentLine' }).range(doc.line(number).from))
    ranges.push(Decoration.widget({ widget: new DraftWidget(draft.id), block: true, side: 1 }).range(last.to))
  }
  return Decoration.set(ranges, true)
}

const commentsField = StateField.define<CommentsState>({
  create: (state) => {
    const notes = placeNotes(state.doc, state.facet(listFacet)?.notes() ?? [], [])
    return { hover: null, draft: null, notes, decorations: decorationsFor(state.doc, null, notes) }
  },
  update(value, tr) {
    let { hover, draft, notes } = value
    if (tr.docChanged) {
      const map = (lines: Lines): Lines => ({ from: tr.changes.mapPos(lines.from, -1), to: tr.changes.mapPos(lines.to, -1) })
      hover = hover === null ? null : tr.changes.mapPos(hover, -1)
      draft = draft === null ? null : { ...draft, ...map(draft) }
      notes = notes.map(note => ({ ...note, ...map(note) }))
    }
    for (const effect of tr.effects) {
      if (effect.is(setHover)) hover = effect.value
      else if (effect.is(openDraft)) draft = { ...effect.value, id: nextDraftId++ }
      else if (effect.is(closeDraft)) draft = null
      else if (effect.is(syncNotes)) {
        const placed = placeNotes(tr.newDoc, effect.value, notes)
        if (!sameNotes(placed, notes)) notes = placed
      }
    }
    if (hover === value.hover && draft === value.draft && notes === value.notes && !tr.docChanged) return value
    const decorations = draft === value.draft && notes === value.notes ? value.decorations.map(tr.changes) : decorationsFor(tr.newDoc, draft, notes)
    return { hover, draft, notes, decorations }
  },
  provide: field => EditorView.decorations.from(field, value => value.decorations),
})

/** The commented lines' numbers and text. */
function linesOf(state: EditorState, lines: Lines): { readonly fromLine: number, readonly toLine: number, readonly text: string[] } {
  const fromLine = state.doc.lineAt(lines.from).number
  const toLine = state.doc.lineAt(lines.to).number
  const text: string[] = []
  for (let number = fromLine; number <= toLine; number += 1) text.push(state.doc.line(number).text)
  return { fromLine, toLine, text }
}

/** Open the form for the line starting at `lineStart`: the whole selection when it covers that line, else the line alone. */
function startComment(view: EditorView, lineStart: number): void {
  const { state } = view
  const selection = state.selection.main
  const line = state.doc.lineAt(lineStart)
  const covers = !selection.empty && selection.from <= line.to && selection.to >= line.from
  const lines = covers
    ? { from: state.doc.lineAt(selection.from).from, to: state.doc.lineAt(selection.to === state.doc.lineAt(selection.to).from && selection.to > selection.from ? selection.to - 1 : selection.to).from }
    : { from: line.from, to: line.from }
  view.dispatch({ effects: openDraft.of(lines) })
}

const ICON = 'M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z'

function icon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('width', '14')
  svg.setAttribute('height', '14')
  svg.setAttribute('aria-hidden', 'true')
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', ICON)
  path.setAttribute('fill', 'none')
  path.setAttribute('stroke', 'currentColor')
  path.setAttribute('stroke-width', '1.2')
  path.setAttribute('stroke-linejoin', 'round')
  svg.appendChild(path)
  return svg
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

/** The form under the commented lines. Its DOM lives as long as the draft, so typing is never lost to a redraw. */
class DraftWidget extends WidgetType {
  constructor(private readonly id: number) { super() }

  override eq(other: DraftWidget): boolean { return other.id === this.id }

  override toDOM(view: EditorView): HTMLElement {
    const box = element('div', 'cm-acrylCommentForm')
    box.setAttribute('role', 'group')
    box.setAttribute('aria-label', 'Comment on these lines')
    const input = element('textarea', 'cm-acrylCommentInput')
    input.placeholder = 'Comment on these lines'
    input.rows = 3
    input.setAttribute('aria-label', 'Comment')
    const foot = element('div', 'cm-acrylCommentFoot')
    const hint = element('span', 'cm-acrylCommentHint', /mac/iu.test(navigator.platform) ? '⌘↩ to comment' : 'Ctrl+Enter to comment')
    const cancel = element('button', 'cm-acrylCommentButton', 'Cancel')
    cancel.type = 'button'
    const send = element('button', 'cm-acrylCommentButton', 'Comment')
    send.type = 'button'
    send.dataset.primary = ''
    send.disabled = true
    foot.append(hint, cancel, send)
    box.append(input, foot)

    const close = (): void => {
      view.dispatch({ effects: closeDraft.of(null) })
      view.focus()
    }
    const submit = (): void => {
      const text = input.value.trim()
      const list = view.state.facet(listFacet)
      const draft = view.state.field(commentsField).draft
      if (text === '' || list === undefined || draft === null || draft.id !== this.id) return
      const { fromLine, toLine, text: lines } = linesOf(view.state, draft)
      view.dispatch({ effects: closeDraft.of(null) })
      list.add({ fromLine, toLine, lines, text })
      view.focus()
    }
    input.addEventListener('input', () => { send.disabled = input.value.trim() === '' })
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() }
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); event.stopPropagation(); submit() }
    })
    cancel.addEventListener('click', close)
    send.addEventListener('click', submit)
    requestAnimationFrame(() => { input.focus({ preventScroll: true }) })
    return box
  }

  /** Every event inside the form is the form's; the editor does not move its cursor or take the keys. */
  override ignoreEvent(): boolean { return true }
}

/** A kept comment, under its lines: copy it, copy every comment, or close it. */
class NoteWidget extends WidgetType {
  constructor(private readonly note: Note) { super() }

  override eq(other: NoteWidget): boolean { return other.note.id === this.note.id && other.note.text === this.note.text }

  override toDOM(view: EditorView): HTMLElement {
    const box = element('div', 'cm-acrylCommentNote')
    const text = element('div', 'cm-acrylCommentText', this.note.text)
    const actions = element('div', 'cm-acrylCommentActions')
    const copyOne = element('button', 'cm-acrylCommentAction', 'Comment to clipboard')
    copyOne.type = 'button'
    const copyAll = element('button', 'cm-acrylCommentAction', 'All comments to clipboard')
    copyAll.type = 'button'
    const problem = element('span', 'cm-acrylCommentProblem')
    problem.setAttribute('role', 'alert')
    actions.append(copyOne, copyAll, problem)
    const dismiss = element('button', 'cm-acrylCommentDismiss', '×')
    dismiss.type = 'button'
    dismiss.title = 'Close this comment'
    dismiss.setAttribute('aria-label', 'Close this comment')
    const list = (): EditorComments | undefined => view.state.facet(listFacet)
    // A failed copy says why and keeps the comment; a copied one closes through the list.
    const run = async (copy: (() => Promise<CopyResult>) | undefined): Promise<void> => {
      if (copy === undefined) return
      problem.textContent = ''
      const result = await copy().catch((): CopyResult => ({ ok: false, message: 'Could not copy.' }))
      if (!result.ok) problem.textContent = result.message
    }
    copyOne.addEventListener('click', () => { const l = list(); void run(l === undefined ? undefined : () => l.copy(this.note.id)) })
    copyAll.addEventListener('click', () => { const l = list(); void run(l === undefined ? undefined : () => l.copyAll()) })
    dismiss.addEventListener('click', () => { list()?.close(this.note.id) })
    const body = element('div', 'cm-acrylCommentBody')
    body.append(text, actions)
    box.append(icon(), body, dismiss)
    return box
  }

  override ignoreEvent(): boolean { return true }
}

class PlusMarker extends GutterMarker {
  override toDOM(): Node {
    const node = element('span', 'cm-acrylCommentPlus', '+')
    node.title = 'Comment on this line (or the selected lines)'
    return node
  }
}
const plus = new PlusMarker()

/** Which line the pointer is over, anywhere on the line or its gutter. */
const hoverTracker = ViewPlugin.fromClass(class {
  constructor(private readonly view: EditorView) {
    view.dom.addEventListener('mousemove', this.move)
    view.dom.addEventListener('mouseleave', this.leave)
  }

  private readonly move = (event: MouseEvent): void => {
    const target = event.target instanceof Element ? event.target : null
    // Over a form or a note there is no line to comment on.
    const line = target?.closest('.cm-acrylCommentForm, .cm-acrylCommentNote') ? null : this.view.lineBlockAtHeight(event.clientY - this.view.documentTop).from
    if (line !== this.view.state.field(commentsField).hover) this.view.dispatch({ effects: setHover.of(line) })
  }

  private readonly leave = (): void => {
    if (this.view.state.field(commentsField).hover !== null) this.view.dispatch({ effects: setHover.of(null) })
  }

  destroy(): void {
    this.view.dom.removeEventListener('mousemove', this.move)
    this.view.dom.removeEventListener('mouseleave', this.leave)
  }
})

/**
 * Forms and notes sit inside the code, which is as wide as its longest line; they are kept to the visible width and do not scroll
 * sideways with the code, so their buttons are always on screen.
 */
const visibleWidth = ViewPlugin.fromClass(class {
  constructor(private readonly view: EditorView) { this.measure() }

  update(update: { readonly geometryChanged: boolean }): void {
    if (update.geometryChanged) this.measure()
  }

  private measure(): void {
    this.view.requestMeasure({
      read: view => ({ left: view.contentDOM.getBoundingClientRect().left - view.scrollDOM.getBoundingClientRect().left + view.scrollDOM.scrollLeft, width: view.scrollDOM.clientWidth }),
      write: ({ left, width }, view) => {
        view.dom.style.setProperty('--acryl-comment-left', `${String(Math.round(left))}px`)
        view.dom.style.setProperty('--acryl-comment-width', `${String(Math.max(120, Math.round(width - left - 24)))}px`)
      },
    })
  }
})

const commentGutter = gutter({
  class: 'cm-acrylCommentGutter',
  lineMarker: (view, line) => (view.state.field(commentsField).hover === line.from ? plus : null),
  lineMarkerChange: update => update.startState.field(commentsField).hover !== update.state.field(commentsField).hover,
  initialSpacer: () => plus,
  domEventHandlers: {
    mousedown: (view, line, event) => {
      if (!(event.target instanceof Element) || event.target.closest('.cm-acrylCommentPlus') === null) return false
      event.preventDefault()
      startComment(view, line.from)
      return true
    },
  },
})

/**
 * Keeps the notes and the list together: the list's changes are shown, and where edits moved a comment's lines is told back to the list
 * (after the update, since the list's change comes back as another update).
 */
const listSync = ViewPlugin.fromClass(class {
  private readonly stop: () => void
  private pending = false

  constructor(private readonly view: EditorView) {
    const list = view.state.facet(listFacet)
    this.stop = list?.subscribe(() => { this.view.dispatch({ effects: syncNotes.of(list.notes()) }) }) ?? (() => {})
  }

  update(update: { readonly docChanged: boolean }): void {
    if (!update.docChanged || this.pending) return
    this.pending = true
    queueMicrotask(() => {
      this.pending = false
      const list = this.view.state.facet(listFacet)
      if (list === undefined) return
      const { doc } = this.view.state
      for (const note of this.view.state.field(commentsField).notes) list.move(note.id, doc.lineAt(note.from).number, doc.lineAt(note.to).number)
    })
  }

  destroy(): void { this.stop() }
})

/** The editor extension; `list` keeps the comments. */
export function lineComments(list: EditorComments): Extension {
  return [listFacet.of(list), commentsField, hoverTracker, visibleWidth, commentGutter, listSync]
}

/** Test seam: open the comment form on a line, as the "+" does. @param line - 1-based. */
export function commentOnLine(view: EditorView, line: number): void {
  startComment(view, view.state.doc.line(line).from)
}
