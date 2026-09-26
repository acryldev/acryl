/**
 * The "+" button and its menu: surfaces (terminal, browser, file, ...) and the agents that are installed and
 * enabled. The plain "+" opens the default agent chosen in Settings > Agents (or the last thing opened when
 * the default is Auto). Which agents exist, their flags and the default are all set in Settings; this menu
 * only lists and opens them, and "Configure tabs..." hides tab types you never use.
 */

import { useEffect, useRef, useState } from 'react'
import type { AgentSettingsView } from '../../agents/contract.ts'
import type { CustomAgent } from '../../agents/definition.ts'
import { menuAgents, primaryAction } from '../agents/agents-section-model.ts'
import { labelForCommand, WORKSPACE_SURFACE_ACTIONS, type WorkspaceSurfaceAction } from '../terminal/agent-commands.ts'
import { AgentIcon } from './AgentIcon.tsx'
import { readLastTab, writeLastTab, type LastTab } from './last-tab.ts'
import { readHiddenAgents, toggleAgent, writeHiddenAgents } from './agent-visibility.ts'

type View = 'menu' | 'configure'

/** A tab type is hidden by this key in the remembered set (agent ids never contain a colon). */
const surfaceKey = (action: WorkspaceSurfaceAction): string => `surface:${action.kind}`

export interface NewTabMenuProps {
  readonly open: boolean
  readonly customAgents: readonly CustomAgent[]
  /** What Settings > Agents says (installed, enabled, default), or null before the Host has answered. */
  readonly settings: AgentSettingsView | null
  readonly storage: Storage | undefined
  setOpen(open: boolean): void
  onSurface(action: WorkspaceSurfaceAction): void
  onOpenAgent(id: string, title: string): void
  /** Opens Settings on the Agents section; false when the Settings panel could not be found. */
  onManageAgents(): boolean
}

export function NewTabMenu({ open, customAgents, settings, storage, setOpen, onSurface, onOpenAgent, onManageAgents }: NewTabMenuProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>('menu')
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => readHiddenAgents(storage))
  const [notice, setNotice] = useState<string | null>(null)
  const [last, setLast] = useState<LastTab>(() => readLastTab(storage))

  const remember = (tab: LastTab): void => { setLast(tab); writeLastTab(storage, tab) }
  const lastLabel = last.kind === 'agent' ? last.label : WORKSPACE_SURFACE_ACTIONS.find(action => action.kind === last.surface)?.label.replace(/^New /, '') ?? 'Terminal'
  const openTerminal = (): void => {
    const action = WORKSPACE_SURFACE_ACTIONS.find(candidate => candidate.kind === 'pty')
    if (action !== undefined) onSurface(action)
  }
  const openPrimary = (): void => {
    const primary = primaryAction(settings)
    if (primary.kind === 'agent') onOpenAgent(primary.id, primary.label)
    else if (primary.kind === 'terminal') openTerminal()
    else openLast()
  }
  const openLast = (): void => {
    if (last.kind === 'agent') onOpenAgent(last.id, last.label)
    else {
      const action = WORKSPACE_SURFACE_ACTIONS.find(candidate => candidate.kind === last.surface)
      if (action !== undefined) onSurface(action)
    }
  }

  const close = (): void => { setOpen(false); setView('menu'); setNotice(null) }

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

  const primary = primaryAction(settings)
  const primaryLabel = primary.kind === 'agent' ? primary.label : primary.kind === 'terminal' ? 'Terminal' : lastLabel

  return (
    <div className="dshWorkspacePlusWrap" ref={wrapRef}>
      <button type="button" className="dshWorkspacePlus" aria-label={`New tab: ${primaryLabel}`} title={`New ${primaryLabel} tab`} onClick={() => { close(); openPrimary() }}>+</button>
      <button
        type="button"
        className="dshWorkspaceChevron"
        aria-label="Choose what to open"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => { if (open) close(); else setOpen(true) }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M2 3.5l3 3 3-3" /></svg>
      </button>
      {open && view === 'menu' && (
        <div className="dshWorkspaceMenu" role="menu">
          {WORKSPACE_SURFACE_ACTIONS.filter(action => !hidden.has(surfaceKey(action))).map(action => (
            <button key={action.label} type="button" role="menuitem" className="dshWorkspaceMenuItem" onClick={() => { onSurface(action); remember({ kind: 'surface', surface: action.kind }); close() }}>
              {action.kind === 'pty' && <AgentIcon commandId="shell" />}
              {action.label}
            </button>
          ))}
          <div className="dshWorkspaceMenuRule" />
          {menuAgents(settings, customAgents).map(agent => (
            <button key={agent.id} type="button" role="menuitem" className="dshWorkspaceMenuItem" onClick={() => { onOpenAgent(agent.id, agent.label); remember({ kind: 'agent', id: agent.id, label: agent.label }); close() }}>
              <AgentIcon commandId={agent.id} custom={agent.custom} />
              <span className="dshWorkspaceMenuGrow">{agent.label}</span>
              {agent.isDefault && <span className="dshWorkspaceMenuTag">default</span>}
            </button>
          ))}
          <div className="dshWorkspaceMenuRule" />
          <button type="button" role="menuitem" className="dshWorkspaceMenuItem" onClick={() => { if (onManageAgents()) close(); else setNotice('Open Settings, then Agents, to manage agents.') }}>Manage agents...</button>
          <button type="button" role="menuitem" className="dshWorkspaceMenuItem" data-muted onClick={() => { setView('configure') }}>Configure tabs...</button>
          {notice !== null && <div className="dshWorkspaceMenuHint" role="status">{notice}</div>}
        </div>
      )}
      {open && view === 'configure' && (
        <div className="dshWorkspaceMenu" role="menu" aria-label="Configure tabs">
          <div className="dshWorkspaceMenuHint">Choose which tab types the + menu lists. Agents are managed in Settings.</div>
          {WORKSPACE_SURFACE_ACTIONS.filter(action => action.kind !== 'pty').map(action => (
            <button key={action.label} type="button" role="menuitemcheckbox" aria-checked={!hidden.has(surfaceKey(action))} className="dshWorkspaceMenuItem" onClick={() => { flip(surfaceKey(action)) }}>
              <span className="dshWorkspaceMenuGrow">{action.label.replace(/^New /, '')} tabs</span>
              <span className="dshWorkspaceMenuCheck" aria-hidden="true">{hidden.has(surfaceKey(action)) ? '' : '✓'}</span>
            </button>
          ))}
          <div className="dshWorkspaceMenuRule" />
          <button type="button" role="menuitem" className="dshWorkspaceMenuItem" onClick={() => { setView('menu') }}>Done</button>
        </div>
      )}
    </div>
  )
}

export { labelForCommand }
