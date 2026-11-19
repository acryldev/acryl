/**
 * The Workspace brief tab (spec 043 T011): what a Shared Context workspace is for, its conventions and decisions, in plain markdown. Every
 * agent in the workspace is told it. The tab edits the brief of the workspace it was opened in (kept in its state), and saves on request.
 */

import { useEffect, useState, type ReactElement } from 'react'
import type { WorkspaceSummary } from '../../projects/contract.ts'
import type { WorkspaceTabProps, WorkspaceTabType } from '../tabs/registry/tab-registry.ts'
import type { BriefApi } from './brief-api.ts'

export const BRIEF_TAB_KIND = 'acryl.workspace-brief'

export interface BriefTabDeps {
  readonly api: BriefApi
  /** The shown workspace (a new tab edits its brief) and the workspaces by id. */
  readonly current: () => string
  readonly workspaces: () => readonly WorkspaceSummary[]
}

type Phase =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready', readonly saved: string }
  | { readonly kind: 'failed', readonly message: string }

function workspaceOf(state: string | undefined): string | undefined {
  try {
    const parsed = JSON.parse(state ?? '') as { workspace?: unknown }
    return typeof parsed.workspace === 'string' ? parsed.workspace : undefined
  } catch {
    return undefined
  }
}

export function BriefTab({ deps, tab }: { readonly deps: BriefTabDeps, readonly tab: WorkspaceTabProps }): ReactElement {
  const id = workspaceOf(tab.state) ?? deps.current()
  const workspace = deps.workspaces().find(candidate => candidate.id === id)
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (workspaceOf(tab.state) === undefined) tab.setState(JSON.stringify({ workspace: id }))
    if (workspace !== undefined) tab.setTitle(`Brief: ${workspace.name}`)
    let current = true
    deps.api.read(id).then(
      (loaded) => { if (current) { setText(loaded); setPhase({ kind: 'ready', saved: loaded }) } },
      (cause: unknown) => { if (current) setPhase({ kind: 'failed', message: cause instanceof Error ? cause.message : String(cause) }) },
    )
    return () => { current = false }
    // The tab is bound to one workspace for its life: it loads again only for another one.
  }, [id])

  const save = (): void => {
    setSaving(true)
    deps.api.save(id, text).then(
      () => { setSaving(false); setPhase({ kind: 'ready', saved: text }) },
      (cause: unknown) => { setSaving(false); setPhase({ kind: 'failed', message: cause instanceof Error ? cause.message : String(cause) }) },
    )
  }

  const dirty = phase.kind === 'ready' && phase.saved !== text
  return (
    <div className="dshWorkspaceBrief">
      <div className="dshWorkspaceBriefBar">
        <span className="dshWorkspaceBriefNote">
          {workspace === undefined
            ? 'This workspace no longer exists.'
            : workspace.kind === 'shared'
              ? `Every agent in "${workspace.name}" is told this brief.`
              : `"${workspace.name}" does not share context; agents are told this brief only in a Shared Context workspace.`}
        </span>
        {phase.kind === 'failed' && <span className="dshWorkspaceBriefError" role="alert">{phase.message}</span>}
        <button type="button" className="dshWorkspaceBriefSave" disabled={!dirty || saving || workspace === undefined} onClick={save}>
          {saving ? 'Saving...' : dirty ? 'Save' : 'Saved'}
        </button>
      </div>
      <textarea
        className="dshWorkspaceBriefEditor"
        aria-label="Workspace brief"
        value={text}
        disabled={phase.kind === 'loading' || workspace === undefined}
        placeholder="What this workspace is for, conventions across its projects, decisions, links."
        onChange={(event) => { setText(event.target.value) }}
        onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 's') { event.preventDefault(); if (dirty) save() } }}
      />
    </div>
  )
}

/** The tab type the workspace registers for itself. */
export function briefTabType(deps: BriefTabDeps): WorkspaceTabType {
  return {
    kind: BRIEF_TAB_KIND,
    label: 'Workspace brief',
    description: 'Edit the brief every agent in a Shared Context workspace is told.',
    glyph: 'B',
    component: tab => <BriefTab deps={deps} tab={tab} />,
  }
}
