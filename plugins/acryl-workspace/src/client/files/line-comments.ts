/**
 * Line comments in the code editor: a "+" beside the line under the pointer opens a comment form under that line (or under the selected
 * lines, when the selection covers it); Comment hands the lines and the text to `send`, and a sent comment stays under its lines as a note
 * for as long as the editor is open. Positions follow edits to the document. Where a comment goes is the caller's (`send`).
 */

import { Facet, StateEffect, StateField, type EditorState, type Extension, type Range, type Text } from '@codemirror/state'
import { Decoration, EditorView, GutterMarker, ViewPlugin, WidgetType, gutter, type DecorationSet } from '@codemirror/view'

export interface CommentRequest {
  readonly fromLine: number
  readonly toLine: number
  readonly lines: readonly string[]
  readonly text: string
}

export type CommentResult = { readonly ok: true, readonly where: string } | { readonly ok: false, readonly message: string }

/** @returns where the comment went (shown under the lines), or why it could not be sent (shown in the form, which keeps the text). */
export type CommentSend = (request: CommentRequest) => Promise<CommentResult>

/** The lines a comment is about: the start of the first and of the last line, kept current through edits. */
interface Lines {
  readonly from: number
  readonly to: number
}

interface Sent extends Lines {
  readonly id: number
  readonly text: string
  readonly where: string
}

interface CommentsState {
  /** The start of the line under the pointer. */
  readonly hover: number | null
  readonly draft: (Lines & { readonly id: number }) | null
  readonly sent: readonly Sent[]
  readonly decorations: DecorationSet
}

const setHover = StateEffect.define<number | null>()
const openDraft = StateEffect.define<Lines>()
const closeDraft = StateEffect.define<null>()
const addSent = StateEffect.define<Omit<Sent, 'id'>>()
const removeSent = StateEffect.define<number>()

const sendFacet = Facet.define<CommentSend, CommentSend | undefined>({ combine: values => values[0] })

let nextId = 1

function decorationsFor(doc: Text, draft: CommentsState['draft'], sent: readonly Sent[]): DecorationSet {
  const ranges: Range<Decoration>[] = []
  for (const note of sent) ranges.push(Decoration.widget({ widget: new SentWidget(note), block: true, side: 1 }).range(doc.lineAt(note.to).to))
  if (draft !== null) {
    const first = doc.lineAt(draft.from).number
    const last = doc.lineAt(draft.to)
    for (let number = first; number <= last.number; number += 1) ranges.push(Decoration.line({ class: 'cm-acrylCommentLine' }).range(doc.line(number).from))
    ranges.push(Decoration.widget({ widget: new DraftWidget(draft.id), block: true, side: 1 }).range(last.to))
  }
  return Decoration.set(ranges, true)
}

const commentsField = StateField.define<CommentsState>({
  create: () => ({ hover: null, draft: null, sent: [], decorations: Decoration.none }),
  update(value, tr) {
    let { hover, draft, sent } = value
    if (tr.docChanged) {
      const map = (lines: Lines): Lines => ({ from: tr.changes.mapPos(lines.from, -1), to: tr.changes.mapPos(lines.to, -1) })
      hover = hover === null ? null : tr.changes.mapPos(hover, -1)
      draft = draft === null ? null : { ...draft, ...map(draft) }
      sent = sent.map(note => ({ ...note, ...map(note) }))
    }
    for (const effect of tr.effects) {
      if (effect.is(setHover)) hover = effect.value
      else if (effect.is(openDraft)) draft = { ...effect.value, id: nextId++ }
      else if (effect.is(closeDraft)) draft = null
      else if (effect.is(addSent)) sent = [...sent, { ...effect.value, id: nextId++ }]
      else if (effect.is(removeSent)) sent = sent.filter(note => note.id !== effect.value)
    }
    if (hover === value.hover && draft === value.draft && sent === value.sent && !tr.docChanged) return value
    const decorations = draft === value.draft && sent === value.sent ? value.decorations.map(tr.changes) : decorationsFor(tr.newDoc, draft, sent)
    return { hover, draft, sent, decorations }
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
    input.placeholder = 'Comment for the agent'
    input.rows = 3
    input.setAttribute('aria-label', 'Comment')
    const foot = element('div', 'cm-acrylCommentFoot')
    const hint = element('span', 'cm-acrylCommentHint', /mac/iu.test(navigator.platform) ? '⌘↩ to send' : 'Ctrl+Enter to send')
    const cancel = element('button', 'cm-acrylCommentButton', 'Cancel')
    cancel.type = 'button'
    const send = element('button', 'cm-acrylCommentButton', 'Comment')
    send.type = 'button'
    send.dataset.primary = ''
    send.disabled = true
    const problem = element('div', 'cm-acrylCommentProblem')
    problem.setAttribute('role', 'alert')
    foot.append(hint, cancel, send)
    box.append(input, foot, problem)

    const close = (): void => {
      view.dispatch({ effects: closeDraft.of(null) })
      view.focus()
    }
    let sending = false
    const submit = async (): Promise<void> => {
      const text = input.value.trim()
      const handler = view.state.facet(sendFacet)
      const draft = view.state.field(commentsField).draft
      if (text === '' || sending || handler === undefined || draft === null || draft.id !== this.id) return
      sending = true
      send.disabled = true
      problem.textContent = ''
      const { fromLine, toLine, text: lines } = linesOf(view.state, draft)
      const result = await handler({ fromLine, toLine, lines, text }).catch((cause: unknown): CommentResult => ({ ok: false, message: cause instanceof Error ? cause.message : 'Could not send the comment.' }))
      sending = false
      if (!result.ok) {
        problem.textContent = result.message
        send.disabled = false
        return
      }
      const current = view.state.field(commentsField).draft
      view.dispatch({ effects: [closeDraft.of(null), addSent.of({ from: current?.from ?? draft.from, to: current?.to ?? draft.to, text, where: result.where })] })
      view.focus()
    }
    input.addEventListener('input', () => { send.disabled = input.value.trim() === '' || sending })
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() }
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); event.stopPropagation(); void submit() }
    })
    cancel.addEventListener('click', close)
    send.addEventListener('click', () => { void submit() })
    requestAnimationFrame(() => { input.focus({ preventScroll: true }) })
    return box
  }

  /** Every event inside the form is the form's; the editor does not move its cursor or take the keys. */
  override ignoreEvent(): boolean { return true }
}

/** A sent comment, under its lines. */
class SentWidget extends WidgetType {
  constructor(private readonly note: Sent) { super() }

  override eq(other: SentWidget): boolean { return other.note.id === this.note.id }

  override toDOM(view: EditorView): HTMLElement {
    const box = element('div', 'cm-acrylCommentNote')
    const text = element('div', 'cm-acrylCommentText', this.note.text)
    const meta = element('span', 'cm-acrylCommentWhere', `Sent to ${this.note.where}`)
    const dismiss = element('button', 'cm-acrylCommentDismiss', '×')
    dismiss.type = 'button'
    dismiss.title = 'Hide this note'
    dismiss.setAttribute('aria-label', 'Hide this note')
    dismiss.addEventListener('click', () => { view.dispatch({ effects: removeSent.of(this.note.id) }) })
    const body = element('div', 'cm-acrylCommentBody')
    body.append(text, meta)
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

/** The editor extension; `send` decides where a comment goes. */
export function lineComments(send: CommentSend): Extension {
  return [sendFacet.of(send), commentsField, hoverTracker, visibleWidth, commentGutter]
}

/** Test seam: open the comment form on a line, as the "+" does. @param line - 1-based. */
export function commentOnLine(view: EditorView, line: number): void {
  startComment(view, view.state.doc.line(line).from)
}
