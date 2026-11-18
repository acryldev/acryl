/**
 * A CodeMirror 6 editor: line numbers, folding, search (Mod-f), history, bracket matching and syntax
 * highlighting for the language of the file name, loaded on demand from `@codemirror/language-data`
 * (all the major languages). The document is owned by the editor; the parent gets each change through
 * `onChange` and remounts the component (new `key`) to load a different text.
 */

import { useEffect, useRef } from 'react'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { LanguageDescription } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { oneDark } from '@codemirror/theme-one-dark'
import { basicSetup } from 'codemirror'
import { lineComments, type EditorComments } from './line-comments.ts'

export interface CodeEditorProps {
  /** The initial text. */
  readonly value: string
  /** The file name, used to pick the syntax highlighting. */
  readonly filename: string
  readonly onChange: (text: string) => void
  readonly onSave: () => void
  readonly readOnly?: boolean
  /** Turns on line comments (the "+" beside a line), kept in this list. */
  readonly comments?: EditorComments
}

const fill = EditorView.theme({
  '&': { height: '100%', fontSize: '13px' },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' },
})

export function CodeEditor({ value, filename, onChange, onSave, readOnly = false, comments }: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null)
  // The latest callbacks, so the editor is created once and never rebuilt when a parent re-renders.
  const changeRef = useRef(onChange)
  const saveRef = useRef(onSave)
  const commentsRef = useRef(comments)
  changeRef.current = onChange
  saveRef.current = onSave
  commentsRef.current = comments
  const commenting = comments !== undefined

  useEffect(() => {
    const parent = host.current
    if (parent === null) return
    const language = new Compartment()
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          oneDark,
          fill,
          language.of([]),
          EditorState.readOnly.of(readOnly),
          keymap.of([{ key: 'Mod-s', preventDefault: true, run: () => { saveRef.current(); return true } }]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) changeRef.current(update.state.doc.toString())
          }),
          commenting ? lineComments(latestComments(commentsRef)) : [],
        ],
      }),
    })
    let disposed = false
    const description = LanguageDescription.matchFilename(languages, filename)
    if (description !== null) {
      description.load().then(
        (support) => { if (!disposed) view.dispatch({ effects: language.reconfigure(support) }) },
        () => { /* No highlighting for this language; the text is still editable. */ },
      )
    }
    return () => {
      disposed = true
      view.destroy()
    }
    // The editor is deliberately created once per mount: `value` is only the initial text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filename, readOnly, commenting])

  return <div ref={host} className="dshWorkspaceCodeEditor" />
}

const off = { ok: false, message: 'Comments are off here.' } as const

/** The list the parent passes now, so the editor is never rebuilt for a new list object. */
function latestComments(ref: { readonly current: EditorComments | undefined }): EditorComments {
  return {
    notes: () => ref.current?.notes() ?? [],
    subscribe: listener => ref.current?.subscribe(listener) ?? (() => {}),
    add: (request) => { ref.current?.add(request) },
    move: (id, fromLine, toLine) => { ref.current?.move(id, fromLine, toLine) },
    close: (id) => { ref.current?.close(id) },
    copy: id => ref.current?.copy(id) ?? Promise.resolve(off),
    copyAll: () => ref.current?.copyAll() ?? Promise.resolve(off),
  }
}
