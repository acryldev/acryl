/**
 * The "+" button and its menu: surfaces (terminal, browser, file, ...), the agents the user chose to list,
 * "Configure agents..." (show or hide each one, remove a custom one) and "Add an agent..." (a form that
 * shows the exact command line before anything is saved).
 */

import { useEffect, useRef, useState } from 'react'
import { BADGE_COLORS, type CustomAgent } from '../../agents/definition.ts'
import type { AgentDraft } from '../agents/agent-draft.ts'
import { draftToAgent, EMPTY_DRAFT, previewCommand } from '../agents/agent-draft.ts'
import { labelForCommand, WORKSPACE_AGENT_COMMANDS, WORKSPACE_SURFACE_ACTIONS, type WorkspaceSurfaceAction } from '../terminal/agent-commands.ts'
import { AgentIcon } from './AgentIcon.tsx'
import { readHiddenAgents, toggleAgent, visibleAgents, writeHiddenAgents } from './agent-visibility.ts'

type View = 'menu' | 'configure' | 'add'

export interface NewTabMenuProps {
  readonly open: boolean
  readonly customAgents: readonly CustomAgent[]
  readonly storage: Storage | undefined
  setOpen(open: boolean): void
  onSurface(action: WorkspaceSurfaceAction): void
  onOpenAgent(id: string, title: string): void
  onAddAgent(agent: CustomAgent): Promise<void>
  onRemoveAgent(id: string): Promise<void>
}

export function NewTabMenu({ open, customAgents, storage, setOpen, onSurface, onOpenAgent, onAddAgent, onRemoveAgent }: NewTabMenuProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>('menu')
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => readHiddenAgents(storage))
  const [draft, setDraft] = useState<AgentDraft>(EMPTY_DRAFT)
  const [error, setError] = useState<string | null>(null)

  const close = (): void => { setOpen(false); setView('menu'); setError(null) }

  // The menu closes on a click elsewhere or Escape.
  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent): void => {
      if (wrapRef.current?.contains(event.target as Node) !== true) close()
    }
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') close() }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  })

  const flip = (id: string): void => {
    const next = toggleAgent(hidden, id)
    setHidden(next)
    writeHiddenAgents(storage, next)
  }

  const built = draftToAgent(draft)

  return (
    <div className="dshWorkspacePlusWrap" ref={wrapRef}>
      <button
        type="button"
        className="dshWorkspacePlus"
        aria-label="New tab"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => { if (open) close(); else setOpen(true) }}
      >
        +
      </button>
      {open && view === 'menu' && (
        <div className="dshWorkspaceMenu" role="menu">
          {WORKSPACE_SURFACE_ACTIONS.map(action => (
            <button key={action.label} type="button" role="menuitem" className="dshWorkspaceMenuItem" onClick={() => { onSurface(action); close() }}>
              {action.kind === 'pty' && <AgentIcon commandId="shell" />}
              {action.label}
            </button>
          ))}
          <div className="dshWorkspaceMenuRule" />
          {visibleAgents(WORKSPACE_AGENT_COMMANDS, hidden).map(command => (
            <button key={command.id} type="button" role="menuitem" className="dshWorkspaceMenuItem" onClick={() => { onOpenAgent(command.id, command.label); close() }}>
              <AgentIcon commandId={command.id} />
              {command.label}
            </button>
          ))}
          {customAgents.filter(agent => !hidden.has(agent.id)).map(agent => (
            <button key={agent.id} type="button" role="menuitem" className="dshWorkspaceMenuItem" onClick={() => { onOpenAgent(agent.id, agent.label); close() }}>
              <AgentIcon commandId={agent.id} custom={agent.badge} />
              {agent.label}
            </button>
          ))}
          <div className="dshWorkspaceMenuRule" />
          <button type="button" role="menuitem" className="dshWorkspaceMenuItem" data-muted onClick={() => { setView('configure') }}>Configure agents...</button>
        </div>
      )}
      {open && view === 'configure' && (
        <div className="dshWorkspaceMenu" role="menu" aria-label="Configure agents">
          <div className="dshWorkspaceMenuHint">Choose the agents the + menu lists.</div>
          {WORKSPACE_AGENT_COMMANDS.map(command => (
            <button key={command.id} type="button" role="menuitemcheckbox" aria-checked={!hidden.has(command.id)} className="dshWorkspaceMenuItem" onClick={() => { flip(command.id) }}>
              <AgentIcon commandId={command.id} />
              <span className="dshWorkspaceMenuGrow">{command.label}</span>
              <span className="dshWorkspaceMenuCheck" aria-hidden="true">{hidden.has(command.id) ? '' : '✓'}</span>
            </button>
          ))}
          {customAgents.map(agent => (
            <div key={agent.id} className="dshWorkspaceMenuRow">
              <button type="button" role="menuitemcheckbox" aria-checked={!hidden.has(agent.id)} className="dshWorkspaceMenuItem dshWorkspaceMenuGrow" onClick={() => { flip(agent.id) }}>
                <AgentIcon commandId={agent.id} custom={agent.badge} />
                <span className="dshWorkspaceMenuGrow">{agent.label}</span>
                <span className="dshWorkspaceMenuCheck" aria-hidden="true">{hidden.has(agent.id) ? '' : '✓'}</span>
              </button>
              <button type="button" className="dshWorkspaceMenuRemove" aria-label={`Remove ${agent.label}`} title="Remove this agent" onClick={() => { void onRemoveAgent(agent.id).catch((cause: unknown) => { setError(cause instanceof Error ? cause.message : 'could not remove') }) }}>×</button>
            </div>
          ))}
          {error !== null && <div className="dshWorkspaceMenuError" role="alert">{error}</div>}
          <div className="dshWorkspaceMenuRule" />
          <button type="button" role="menuitem" className="dshWorkspaceMenuItem" onClick={() => { setError(null); setView('add') }}>Add an agent...</button>
          <button type="button" role="menuitem" className="dshWorkspaceMenuItem" onClick={() => { setView('menu') }}>Done</button>
        </div>
      )}
      {open && view === 'add' && (
        <form
          className="dshWorkspaceMenu dshWorkspaceAgentForm"
          aria-label="Add an agent"
          onSubmit={(event) => {
            event.preventDefault()
            if (!built.ok) { setError(built.message); return }
            onAddAgent(built.agent).then(
              () => { setDraft(EMPTY_DRAFT); setError(null); setView('configure') },
              (cause: unknown) => { setError(cause instanceof Error ? cause.message : 'could not save') },
            )
          }}
        >
          <div className="dshWorkspaceMenuHint">Add a coding agent that runs in a terminal tab. It runs only what you enter here, only from this menu.</div>
          <label>Name<input value={draft.name} onChange={(event) => { setDraft({ ...draft, name: event.target.value }) }} placeholder="My Agent" autoFocus /></label>
          <label>Command<input value={draft.command} onChange={(event) => { setDraft({ ...draft, command: event.target.value }) }} placeholder="my-agent or /path/to/my-agent" spellCheck={false} /></label>
          <label>Arguments (one per line)<textarea rows={3} value={draft.args} onChange={(event) => { setDraft({ ...draft, args: event.target.value }) }} spellCheck={false} /></label>
          <div className="dshWorkspaceAgentBadgeRow">
            <label>Badge<input className="dshWorkspaceAgentLetter" maxLength={2} value={draft.letter} onChange={(event) => { setDraft({ ...draft, letter: [...event.target.value].slice(0, 1).join('') }) }} placeholder={([...draft.name.trim()][0] ?? 'A').toUpperCase()} /></label>
            <div className="dshWorkspaceAgentColors" role="radiogroup" aria-label="Badge colour">
              {BADGE_COLORS.map(color => (
                <button key={color} type="button" role="radio" aria-checked={draft.color === color} aria-label={color} className="dshWorkspaceAgentColor" style={{ background: color }} onClick={() => { setDraft({ ...draft, color }) }} />
              ))}
            </div>
          </div>
          <div className="dshWorkspaceAgentPreview" aria-live="polite">
            {built.ok ? <>Runs: <code>{previewCommand(built.agent)}</code></> : <span data-muted>{draft.name === '' && draft.command === '' ? 'Fill in a name and a command.' : built.message}</span>}
          </div>
          {error !== null && <div className="dshWorkspaceMenuError" role="alert">{error}</div>}
          <div className="dshWorkspaceAgentFormActions">
            <button type="button" onClick={() => { setError(null); setView('configure') }}>Cancel</button>
            <button type="submit" disabled={!built.ok}>Add agent</button>
          </div>
        </form>
      )}
    </div>
  )
}

export { labelForCommand }
