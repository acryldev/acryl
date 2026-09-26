/** The one inline edit open in the Code tab, and the change it asks the Host for. */

import type { FileEntryChange } from '../../files/contract.ts'

/** The name being typed for a new or renamed entry, or a delete waiting for confirmation. */
export type PendingEdit =
  | { readonly type: 'create'; readonly entry: 'file' | 'dir'; readonly value: string }
  | { readonly type: 'rename'; readonly file: string; readonly value: string }
  | { readonly type: 'delete'; readonly file: string; readonly isDir: boolean }

/** @returns the change to request, or null while a name is still empty (nothing to ask yet). */
export function changeFor(edit: PendingEdit): FileEntryChange | null {
  if (edit.type === 'delete') return { op: 'delete', file: edit.file }
  const name = edit.value.trim()
  if (name === '') return null
  return edit.type === 'create'
    ? { op: 'create', kind: edit.entry, file: name }
    : { op: 'rename', file: edit.file, to: name }
}

/** @returns the file to open once a change succeeded: only a newly created file is opened. */
export function fileToOpenAfter(change: FileEntryChange, resultFile: string | null): string | null {
  return change.op === 'create' && change.kind === 'file' ? resultFile : null
}
