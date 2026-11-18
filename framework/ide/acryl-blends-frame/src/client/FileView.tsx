/** A file tab: the file as text, with line numbers and syntax colours. Read when the tab is shown. */

import { useEffect, useState } from 'react'
import type { FileContentView, WorkspaceFilesApi } from 'acryl-workspace/ui'
import { highlightLine, languageOf } from './highlight.ts'

type FileLoad =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly file: FileContentView }
  | { readonly status: 'error'; readonly message: string }

export interface FileViewProps {
  readonly files: WorkspaceFilesApi
  readonly root: string
  readonly path: string
}

export function FileView({ files, root, path }: FileViewProps) {
  const [load, setLoad] = useState<FileLoad>({ status: 'loading' })

  useEffect(() => {
    let live = true
    setLoad({ status: 'loading' })
    files.read(root, path).then(
      (file) => { if (live) setLoad({ status: 'ready', file }) },
      (cause: unknown) => { if (live) setLoad({ status: 'error', message: cause instanceof Error ? cause.message : 'The file could not be read.' }) },
    )
    return () => { live = false }
  }, [files, root, path])

  if (load.status === 'loading') return <div className="acrylBlendsFile" />
  if (load.status === 'error') return <div className="acrylBlendsFile"><p className="acrylBlendsNote" data-error>{load.message}</p></div>
  if (load.file.binary) return <div className="acrylBlendsFile"><p className="acrylBlendsNote">{path} is not a text file.</p></div>
  const language = languageOf(path)
  const lines = load.file.content.replace(/\n$/, '').split('\n')
  const width = `${String(String(lines.length).length + 1)}ch`
  return (
    <div className="acrylBlendsFile">
      <pre>
        {lines.map((line, index) => (
          <div key={index} className="acrylBlendsLine">
            <span className="acrylBlendsLn" style={{ width }}>{index + 1}</span>
            {highlightLine(line, language).map((token, at) => (token.kind === 'plain' ? token.text : <span key={at} className={`acrylBlendsTok-${token.kind}`}>{token.text}</span>))}
          </div>
        ))}
      </pre>
    </div>
  )
}
