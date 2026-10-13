// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { EditorSelection } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CodeEditor } from '../../src/client/files/CodeEditor.tsx'
import { commentForTerminal, QUOTED_LINES, type LineComment } from '../../src/client/files/line-comment.ts'
import { commentOnLine, type CommentSend } from '../../src/client/files/line-comments.ts'
import { sendCommentToTerminal } from '../../src/client/terminal/comment-target.ts'

afterEach(cleanup)

// jsdom has no layout, so CodeMirror's measuring needs these to exist; the real editor is otherwise unmocked.
Object.defineProperty(Range.prototype, 'getClientRects', { value: () => [], configurable: true })
Object.defineProperty(Range.prototype, 'getBoundingClientRect', { value: () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }), configurable: true })

const comment = (over: Partial<LineComment> = {}): LineComment => ({
  worktree: '/w/acryl/', file: 'src/main.tsx', fromLine: 2, toLine: 2, lines: ["import { CSPProvider } from '@base-ui/react/csp-provider'"], text: ' what is CSPProvider, why using? ', ...over,
})

describe('the comment an agent reads', () => {
  it('names the file relative and absolute with the line, quotes it, then the comment', () => {
    expect(commentForTerminal(comment(), true)).toBe([
      'Comment on src/main.tsx line 2 (/w/acryl/src/main.tsx:2):',
      "  2 | import { CSPProvider } from '@base-ui/react/csp-provider'",
      'what is CSPProvider, why using?',
      '',
    ].join('\n'))
  })

  it('quotes a range with aligned numbers and cuts a long one', () => {
    const lines = Array.from({ length: QUOTED_LINES + 3 }, (_, index) => `line ${String(index)}`)
    const text = commentForTerminal(comment({ fromLine: 8, toLine: 8 + lines.length - 1, lines }), true)
    expect(text.split('\n')[0]).toBe('Comment on src/main.tsx lines 8-22 (/w/acryl/src/main.tsx:8-22):')
    expect(text).toContain('   8 | line 0')
    expect(text).toContain('  19 | line 11')
    expect(text).toContain('  ... 3 more lines')
  })

  it('is one line for a terminal that would run each line of a paste', () => {
    const text = commentForTerminal(comment({ text: 'first\nsecond' }), false)
    expect(text).not.toContain('\n')
    expect(text).toBe("Comment on src/main.tsx line 2 (/w/acryl/src/main.tsx:2), at \"import { CSPProvider } from '@base-ui/react/csp-provider'\": first second ")
  })
})

describe('sending it to the terminal the user worked in last', () => {
  it('pastes it there, multi-line when the program takes that, and says which tab got it', () => {
    const paste = vi.fn()
    const result = sendCommentToTerminal({ lastActive: () => ({ id: 't1', paste, takesMultilinePaste: () => true }), nameOf: id => (id === 't1' ? 'Claude' : undefined) }, comment())
    expect(result).toEqual({ ok: true, where: 'Claude' })
    expect(paste).toHaveBeenCalledWith(commentForTerminal(comment(), true))
  })

  it('refuses, keeping the comment, when there is no running terminal', () => {
    const result = sendCommentToTerminal({ lastActive: () => undefined, nameOf: () => undefined }, comment())
    expect(result.ok).toBe(false)
  })
})

function viewOf(container: HTMLElement): EditorView {
  const dom = container.querySelector('.cm-editor')
  if (!(dom instanceof HTMLElement)) throw new Error('editor not mounted')
  const view = EditorView.findFromDOM(dom)
  if (view === null) throw new Error('no view')
  return view
}

const TEXT = 'line one\nline two\nline three\nline four\n'

describe('commenting in the editor', () => {
  it('opens a form under the line, sends the line and the text, then shows the comment as a note', async () => {
    const send = vi.fn<CommentSend>(async () => ({ ok: true, where: 'Claude' }))
    const { container } = render(<CodeEditor value={TEXT} filename="a.ts" onChange={() => {}} onSave={() => {}} onComment={send} />)
    const view = viewOf(container)
    commentOnLine(view, 2)
    const input = await waitFor(() => { const node = container.querySelector('textarea.cm-acrylCommentInput'); if (!(node instanceof HTMLTextAreaElement)) throw new Error('no form'); return node })
    const button = [...container.querySelectorAll('button')].find(candidate => candidate.textContent === 'Comment') as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(container.querySelectorAll('.cm-acrylCommentLine')).toHaveLength(1)

    fireEvent.input(input, { target: { value: 'why two?' } })
    expect(button.disabled).toBe(false)
    fireEvent.keyDown(input, { key: 'Enter', metaKey: true })
    await waitFor(() => { expect(container.querySelector('.cm-acrylCommentNote')).not.toBeNull() })
    expect(send).toHaveBeenCalledWith({ fromLine: 2, toLine: 2, lines: ['line two'], text: 'why two?' })
    expect(container.querySelector('.cm-acrylCommentForm')).toBeNull()
    expect(container.querySelector('.cm-acrylCommentNote')?.textContent).toContain('Sent to Claude')
  })

  it('comments on every selected line when the selection covers the line', async () => {
    const send = vi.fn<CommentSend>(async () => ({ ok: true, where: 'Codex' }))
    const { container } = render(<CodeEditor value={TEXT} filename="a.ts" onChange={() => {}} onSave={() => {}} onComment={send} />)
    const view = viewOf(container)
    // Lines 2 and 3, selected to the start of line 4 as a full-line selection ends.
    view.dispatch({ selection: EditorSelection.range(view.state.doc.line(2).from, view.state.doc.line(4).from) })
    commentOnLine(view, 3)
    const input = await waitFor(() => container.querySelector('textarea.cm-acrylCommentInput') as HTMLTextAreaElement)
    expect(container.querySelectorAll('.cm-acrylCommentLine')).toHaveLength(2)
    fireEvent.input(input, { target: { value: 'these two' } })
    fireEvent.click([...container.querySelectorAll('button')].find(candidate => candidate.textContent === 'Comment') as HTMLButtonElement)
    await waitFor(() => { expect(send).toHaveBeenCalledWith({ fromLine: 2, toLine: 3, lines: ['line two', 'line three'], text: 'these two' }) })
  })

  it('keeps the form and the text, with the reason, when sending fails; Escape cancels', async () => {
    const send = vi.fn<CommentSend>(async () => ({ ok: false, message: 'No terminal to send it to.' }))
    const { container } = render(<CodeEditor value={TEXT} filename="a.ts" onChange={() => {}} onSave={() => {}} onComment={send} />)
    commentOnLine(viewOf(container), 1)
    const input = await waitFor(() => container.querySelector('textarea.cm-acrylCommentInput') as HTMLTextAreaElement)
    fireEvent.input(input, { target: { value: 'hello' } })
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })
    await waitFor(() => { expect(container.querySelector('.cm-acrylCommentProblem')?.textContent).toBe('No terminal to send it to.') })
    expect(input.value).toBe('hello')
    expect(container.querySelector('.cm-acrylCommentNote')).toBeNull()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(container.querySelector('.cm-acrylCommentForm')).toBeNull()
  })

  it('keeps a note under its line when lines are added above it', async () => {
    const { container } = render(<CodeEditor value={TEXT} filename="a.ts" onChange={() => {}} onSave={() => {}} onComment={async () => ({ ok: true, where: 'Claude' })} />)
    const view = viewOf(container)
    commentOnLine(view, 3)
    const input = await waitFor(() => container.querySelector('textarea.cm-acrylCommentInput') as HTMLTextAreaElement)
    fireEvent.input(input, { target: { value: 'note' } })
    fireEvent.keyDown(input, { key: 'Enter', metaKey: true })
    await waitFor(() => { expect(container.querySelector('.cm-acrylCommentNote')).not.toBeNull() })
    view.dispatch({ changes: { from: 0, insert: 'new first\nnew second\n' } })
    const note = container.querySelector('.cm-acrylCommentNote')
    expect(note?.previousElementSibling?.textContent).toBe('line three')
  })

  it('offers no comments without a destination', () => {
    const { container } = render(<CodeEditor value={TEXT} filename="a.ts" onChange={() => {}} onSave={() => {}} />)
    expect(container.querySelector('.cm-acrylCommentGutter')).toBeNull()
  })
})
