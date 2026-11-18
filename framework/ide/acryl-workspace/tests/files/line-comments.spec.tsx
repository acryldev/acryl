// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { EditorSelection } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CodeEditor } from '../../src/client/files/CodeEditor.tsx'
import { commentForTerminal, commentsForTerminal, QUOTED_LINES, type LineComment } from '../../src/client/files/line-comment.ts'
import { commentOnLine } from '../../src/client/files/line-comments.ts'
import { CommentStore } from '../../src/client/comments/comment-store.ts'
import { editorComments } from '../../src/client/comments/editor-comments.ts'

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

describe('several comments as one text', () => {
  it('puts a blank line between them, or runs them on one line for a terminal that would run each line', () => {
    const two = [comment(), comment({ file: 'b.ts', fromLine: 5, toLine: 5, lines: ['x'], text: 'and this' })]
    expect(commentsForTerminal(two, true)).toBe(`${commentForTerminal(two[0]!, true)}\n${commentForTerminal(two[1]!, true)}`)
    expect(commentsForTerminal(two, false)).not.toContain('\n')
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

/** The editor with the workspace's real comment list for one file, and a clipboard that records what it got. */
function setup(text = TEXT, refuse = false) {
  const store = new CommentStore([], () => 1)
  const copied: string[] = []
  const writeText = vi.fn(async (value: string) => { if (refuse) throw new Error('denied'); copied.push(value) })
  const list = editorComments(store, '/w', 'a.ts', writeText)
  const rendered = render(<CodeEditor value={text} filename="a.ts" onChange={() => {}} onSave={() => {}} comments={list} />)
  return { ...rendered, store, copied, view: viewOf(rendered.container) }
}

async function write(container: HTMLElement, value: string, how: 'keys' | 'click' = 'keys'): Promise<void> {
  const input = await waitFor(() => { const node = container.querySelector('textarea.cm-acrylCommentInput'); if (!(node instanceof HTMLTextAreaElement)) throw new Error('no form'); return node })
  fireEvent.input(input, { target: { value } })
  if (how === 'keys') fireEvent.keyDown(input, { key: 'Enter', metaKey: true })
  else fireEvent.click(button(container, 'Comment'))
}

const button = (container: HTMLElement, text: string): HTMLButtonElement => {
  const found = [...container.querySelectorAll('button')].find(candidate => candidate.textContent === text)
  if (!(found instanceof HTMLButtonElement)) throw new Error(`no ${text} button`)
  return found
}

describe('commenting in the editor', () => {
  it('keeps the comment in the list and shows it as a note under the line; nothing is sent anywhere', async () => {
    const { container, store, copied, view } = setup()
    commentOnLine(view, 2)
    await waitFor(() => { expect(container.querySelector('textarea.cm-acrylCommentInput')).not.toBeNull() })
    expect(button(container, 'Comment').disabled).toBe(true)
    expect(container.querySelectorAll('.cm-acrylCommentLine')).toHaveLength(1)
    await write(container, 'why two?')
    await waitFor(() => { expect(container.querySelector('.cm-acrylCommentNote')).not.toBeNull() })
    expect(store.all()).toMatchObject([{ worktree: '/w', file: 'a.ts', fromLine: 2, toLine: 2, lines: ['line two'], text: 'why two?' }])
    expect(container.querySelector('.cm-acrylCommentForm')).toBeNull()
    expect(container.querySelector('.cm-acrylCommentNote')?.textContent).toContain('why two?')
    expect(copied).toEqual([])
  })

  it('comments on every selected line when the selection covers the line', async () => {
    const { container, store, view } = setup()
    // Lines 2 and 3, selected to the start of line 4 as a full-line selection ends.
    view.dispatch({ selection: EditorSelection.range(view.state.doc.line(2).from, view.state.doc.line(4).from) })
    commentOnLine(view, 3)
    await waitFor(() => { expect(container.querySelectorAll('.cm-acrylCommentLine')).toHaveLength(2) })
    await write(container, 'these two', 'click')
    await waitFor(() => { expect(store.all()).toMatchObject([{ fromLine: 2, toLine: 3, lines: ['line two', 'line three'], text: 'these two' }]) })
  })

  it('Comment to clipboard copies that comment and closes its note', async () => {
    const { container, store, copied, view } = setup()
    commentOnLine(view, 1)
    await write(container, 'first')
    commentOnLine(view, 3)
    await write(container, 'third')
    await waitFor(() => { expect(container.querySelectorAll('.cm-acrylCommentNote')).toHaveLength(2) })
    const [, second] = store.all()
    fireEvent.click([...container.querySelectorAll('.cm-acrylCommentNote')].find(note => note.textContent?.includes('third'))!.querySelector('button.cm-acrylCommentAction')!)
    await waitFor(() => { expect(container.querySelectorAll('.cm-acrylCommentNote')).toHaveLength(1) })
    expect(copied).toEqual([commentForTerminal(second!, true)])
    expect(store.all().map(c => c.text)).toEqual(['first'])
  })

  it('All comments to clipboard copies every comment of the worktree, other files too, and closes them all', async () => {
    const { container, store, copied, view } = setup()
    const other = store.add({ worktree: '/w', file: 'b.ts', fromLine: 1, toLine: 1, lines: ['b'], text: 'in b' })
    commentOnLine(view, 2)
    await write(container, 'in a')
    await waitFor(() => { expect(container.querySelector('.cm-acrylCommentNote')).not.toBeNull() })
    fireEvent.click(button(container, 'All comments to clipboard'))
    await waitFor(() => { expect(store.all()).toEqual([]) })
    expect(container.querySelector('.cm-acrylCommentNote')).toBeNull()
    expect(copied).toHaveLength(1)
    expect(copied[0]).toContain('in a')
    expect(copied[0]).toContain(commentForTerminal(other, true))
  })

  it('keeps the comment and says why when the clipboard refuses', async () => {
    const { container, store, view } = setup(TEXT, true)
    commentOnLine(view, 1)
    await write(container, 'keep me')
    await waitFor(() => { expect(container.querySelector('.cm-acrylCommentNote')).not.toBeNull() })
    fireEvent.click(button(container, 'Comment to clipboard'))
    await waitFor(() => { expect(container.querySelector('.cm-acrylCommentProblem')?.textContent).toMatch(/clipboard refused/u) })
    expect(store.all()).toHaveLength(1)
  })

  it('× closes the comment without using it, and Escape cancels a form', async () => {
    const { container, store, copied, view } = setup()
    commentOnLine(view, 1)
    await write(container, 'never mind')
    await waitFor(() => { expect(container.querySelector('.cm-acrylCommentNote')).not.toBeNull() })
    fireEvent.click(container.querySelector('button.cm-acrylCommentDismiss')!)
    await waitFor(() => { expect(container.querySelector('.cm-acrylCommentNote')).toBeNull() })
    expect(store.all()).toEqual([])
    expect(copied).toEqual([])
    commentOnLine(view, 2)
    const input = await waitFor(() => container.querySelector('textarea.cm-acrylCommentInput') as HTMLTextAreaElement)
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(container.querySelector('.cm-acrylCommentForm')).toBeNull()
  })

  it('shows the comments the list already has when the file opens, and closes one used elsewhere', async () => {
    const store = new CommentStore([], () => 1)
    const kept = store.add({ worktree: '/w', file: 'a.ts', fromLine: 3, toLine: 3, lines: ['line three'], text: 'from before' })
    store.add({ worktree: '/w', file: 'other.ts', fromLine: 1, toLine: 1, lines: ['x'], text: 'not this file' })
    const { container } = render(<CodeEditor value={TEXT} filename="a.ts" onChange={() => {}} onSave={() => {}} comments={editorComments(store, '/w', 'a.ts', undefined)} />)
    await waitFor(() => { expect(container.querySelectorAll('.cm-acrylCommentNote')).toHaveLength(1) })
    expect(container.querySelector('.cm-acrylCommentNote')?.previousElementSibling?.textContent).toBe('line three')
    store.remove([kept.id])
    await waitFor(() => { expect(container.querySelector('.cm-acrylCommentNote')).toBeNull() })
  })

  it('keeps a note under its line when lines are added above it, and tells the list where it moved', async () => {
    const { container, store, view } = setup()
    commentOnLine(view, 3)
    await write(container, 'note')
    await waitFor(() => { expect(container.querySelector('.cm-acrylCommentNote')).not.toBeNull() })
    view.dispatch({ changes: { from: 0, insert: 'new first\nnew second\n' } })
    const note = container.querySelector('.cm-acrylCommentNote')
    expect(note?.previousElementSibling?.textContent).toBe('line three')
    await waitFor(() => { expect(store.all()[0]).toMatchObject({ fromLine: 5, toLine: 5 }) })
  })

  it('offers no comments without a list', () => {
    const { container } = render(<CodeEditor value={TEXT} filename="a.ts" onChange={() => {}} onSave={() => {}} />)
    expect(container.querySelector('.cm-acrylCommentGutter')).toBeNull()
  })
})
