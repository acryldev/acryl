/**
 * The New workspace dialog (spec 043): how the workspace is organized (Individual Projects, Shared Context, Remote Machine), and its name.
 * A Remote Machine workspace saves its SSH target now; connecting comes later and the dialog says so.
 */

import { useState, type FormEvent, type ReactElement } from 'react'
import type { WorkspaceKind } from '../../projects/contract.ts'

export interface NewWorkspaceInput {
  readonly name: string
  readonly kind: WorkspaceKind
  readonly remote?: { readonly host: string, readonly user?: string, readonly path?: string }
}

export interface NewWorkspaceDialogProps {
  /** Resolves with a refusal to show, or null when the workspace was created (the dialog then closes). */
  onCreate(input: NewWorkspaceInput): Promise<string | null>
  onCancel(): void
}

const KINDS: ReadonlyArray<{ readonly kind: WorkspaceKind, readonly title: string, readonly text: string, readonly best: string }> = [
  { kind: 'individual', title: 'Individual Projects', text: 'Work in separate repositories with independent worktrees.', best: 'Best for single-repo changes, maintenance work, and unrelated tasks.' },
  { kind: 'shared', title: 'Shared Context', text: 'Share context across several projects in one workspace.', best: 'Best for cross-repo coordination and shared interface changes.' },
  { kind: 'remote', title: 'Remote Machine', text: 'Create an empty workspace for an SSH host.', best: 'Saves the target now; connection setup comes later.' },
]

export function NewWorkspaceDialog({ onCreate, onCancel }: NewWorkspaceDialogProps): ReactElement {
  const [kind, setKind] = useState<WorkspaceKind>('individual')
  const [name, setName] = useState('')
  const [host, setHost] = useState('')
  const [user, setUser] = useState('')
  const [path, setPath] = useState('')
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setRefusal(null)
    const remote = kind === 'remote' ? { host, ...(user.trim() === '' ? {} : { user }), ...(path.trim() === '' ? {} : { path }) } : undefined
    const result = await onCreate({ name, kind, ...(remote === undefined ? {} : { remote }) })
    setBusy(false)
    if (result !== null) setRefusal(result)
  }

  return (
    <div className="dshWorkspaceDialogBackdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }}>
      <form
        className="dshWorkspaceDialog"
        role="dialog"
        aria-modal="true"
        aria-label="New Workspace"
        onSubmit={(event) => { void submit(event) }}
        onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); onCancel() } }}
      >
        <h2 className="dshWorkspaceDialogTitle">New Workspace</h2>
        <p className="dshWorkspaceDialogText">Choose how this workspace should be organized.</p>
        <div className="dshWorkspaceDialogKinds" role="radiogroup" aria-label="Workspace kind">
          {KINDS.map(option => (
            <button
              key={option.kind}
              type="button"
              role="radio"
              aria-checked={kind === option.kind}
              className="dshWorkspaceDialogKind"
              onClick={() => { setKind(option.kind) }}
            >
              <span className="dshWorkspaceDialogKindTitle">{option.title}</span>
              <span className="dshWorkspaceDialogKindText">{option.text}</span>
              <span className="dshWorkspaceDialogKindBest">{option.best}</span>
            </button>
          ))}
        </div>
        <label className="dshWorkspaceDialogField">
          <span>Name</span>
          <input aria-label="Workspace name" autoFocus value={name} placeholder="Payments" onChange={(event) => { setName(event.target.value) }} />
        </label>
        {kind === 'remote' && (
          <div className="dshWorkspaceDialogRemote">
            <label className="dshWorkspaceDialogField"><span>SSH host</span><input aria-label="SSH host" value={host} placeholder="z370n" onChange={(event) => { setHost(event.target.value) }} /></label>
            <label className="dshWorkspaceDialogField"><span>User</span><input aria-label="SSH user" value={user} placeholder="optional" onChange={(event) => { setUser(event.target.value) }} /></label>
            <label className="dshWorkspaceDialogField"><span>Folder</span><input aria-label="Remote folder" value={path} placeholder="optional" onChange={(event) => { setPath(event.target.value) }} /></label>
          </div>
        )}
        {refusal !== null && <p className="dshWorkspaceSideNotice" role="alert">{refusal}</p>}
        <div className="dshWorkspaceDialogActions">
          <button type="button" className="dshWorkspaceDialogCancel" onClick={onCancel}>Cancel</button>
          <button type="submit" className="dshWorkspaceDialogCreate" disabled={busy || name.trim() === '' || (kind === 'remote' && host.trim() === '')}>{busy ? 'Creating...' : 'Create'}</button>
        </div>
      </form>
    </div>
  )
}
