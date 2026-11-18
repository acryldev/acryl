// @vitest-environment jsdom

import { cleanup, render, waitFor } from '@testing-library/react'
import { EditorView } from '@codemirror/view'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CodeEditor } from '../../src/client/files/CodeEditor.tsx'

afterEach(cleanup)

// jsdom has no layout, so CodeMirror's measuring needs these to exist; the real editor is otherwise unmocked.
Object.defineProperty(Range.prototype, 'getClientRects', { value: () => [], configurable: true })
Object.defineProperty(Range.prototype, 'getBoundingClientRect', { value: () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }), configurable: true })

function viewOf(container: HTMLElement): EditorView {
  const dom = container.querySelector('.cm-editor')
  if (!(dom instanceof HTMLElement)) throw new Error('editor not mounted')
  const view = EditorView.findFromDOM(dom)
  if (view === null) throw new Error('no view')
  return view
}

describe('CodeEditor (real CodeMirror)', () => {
  it('shows the initial text, reports edits, and saves on Mod-s', () => {
    const onChange = vi.fn()
    const onSave = vi.fn()
    const { container } = render(<CodeEditor value={'const a = 1\n'} filename="a.ts" onChange={onChange} onSave={onSave} />)
    const view = viewOf(container)
    expect(view.state.doc.toString()).toBe('const a = 1\n')
    view.dispatch({ changes: { from: 0, insert: '// ' } })
    expect(onChange).toHaveBeenLastCalledWith('// const a = 1\n')
    expect(onSave).not.toHaveBeenCalled()
    view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }))
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('loads syntax highlighting for the file name on demand and copes with unknown extensions', async () => {
    const { container, rerender } = render(<CodeEditor value={'def f():\n  return 1\n'} filename="x.py" onChange={() => {}} onSave={() => {}} />)
    // The Python pack loads asynchronously and, once in, styles tokens with highlight classes.
    await waitFor(() => { expect(container.querySelector('.cm-line span')).not.toBeNull() }, { timeout: 5000 })
    rerender(<CodeEditor value={'plain'} filename="notes.unknownext" onChange={() => {}} onSave={() => {}} />)
    expect(viewOf(container).state.doc.toString()).toBe('plain')
  })

  it('is read-only when asked', () => {
    const { container } = render(<CodeEditor value="x" filename="a.txt" readOnly onChange={() => {}} onSave={() => {}} />)
    expect(viewOf(container).state.readOnly).toBe(true)
  })
})
