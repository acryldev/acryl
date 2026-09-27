/**
 * The "+" button and its menu: surfaces (terminal, browser, file, ...) and the agents that are installed and
 * enabled. The plain "+" opens the default agent chosen in Settings > Agents (or the last thing opened when
 * the default is Auto). Which agents exist, their flags and the default are set in Settings > Agents, and which
 * tab types exist in Settings > Tabs; this menu only lists and opens them, and links to both.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { AgentSettingsView } from '../../agents/contract.ts'
import type { CustomAgent } from '../../agents/definition.ts'
import { menuAgents, primaryAction } from '../agents/agents-section-model.ts'
import { labelForCommand, WORKSPACE_SURFACE_ACTIONS, type WorkspaceSurfaceAction } from '../terminal/agent-commands.ts'
import { AgentIcon } from './AgentIcon.tsx'
import { readLastTab, writeLastTab, type LastTab } from './last-tab.ts'
import { customTabTypeKey, tabTypeKey, type TabTypesState } from './tab-types-state.ts'
import type { WorkspaceTabRegistry } from './registry/tab-registry.ts'

export interface NewTabMenuProps {
  readonly open: boolean
  readonly customAgents: readonly CustomAgent[]
  /** What Settings > Agents says (installed, enabled, default), or null before the Host has answered. */
  readonly settings: AgentSettingsView | null
  readonly storage: Storage | undefined
  /** Which tab types are turned on (Settings > Tabs). */
  readonly tabTypes: TabTypesState
  /** The tab types plugins registered; the enabled ones follow the built-in ones. */
  readonly tabRegistry: WorkspaceTabRegistry
  /** Opens a tab of a plugin's type. */
  onCustomTab(kind: string, label: string): void
  setOpen(open: boolean): void
  onSurface(action: WorkspaceSurfaceAction): void
  onOpenAgent(id: string, title: string): void
  /** Opens Settings on a section; false when the Settings panel could not be found. */
  onManageSettings(section: 'agents' | 'tabs'): boolean
}

export function NewTabMenu({ open, customAgents, settings, storage, tabTypes, tabRegistry, onCustomTab, setOpen, onSurface, onOpenAgent, onManageSettings }: NewTabMenuProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const hidden = useSyncExternalStore(tabTypes.subscribe, tabTypes.getSnapshot)
  const pluginTabs = useSyncExternalStore(tabRegistry.subscribe, tabRegistry.getSnapshot)
  const [notice, setNotice] = useState<string | null>(null)
  const [last, setLast] = useState<LastTab>(() => readLastTab(storage))

  const remember = (tab: LastTab): void => { setLast(tab); writeLastTab(storage, tab) }
  const lastLabel = last.kind === 'agent' ? last.label : WORKSPACE_SURFACE_ACTIONS.find(action => action.kind === last.surface)?.label.replace(/^New /, '') ?? 'Terminal'
  const openTerminal = (): void => {
    const action = WORKSPACE_SURFACE_ACTIONS.find(candidate => candidate.kind === 'pty')
    if (action !== undefined) onSurface(action)
  }
  const openLast = (): void => {
    if (last.kind === 'agent') onOpenAgent(last.id, last.label)
    else {
      const action = WORKSPACE_SURFACE_ACTIONS.find(candidate => candidate.kind === last.surface)
      if (action !== undefined) onSurface(action)
    }
  }
  const primary = primaryAction(settings)
  const openPrimary = (): void => {
    if (primary.kind === 'agent') onOpenAgent(primary.id, primary.label)
    else if (primary.kind === 'terminal') openTerminal()
    else openLast()
  }
  const primaryLabel = primary.kind === 'agent' ? primary.label : primary.kind === 'terminal' ? 'Terminal' : lastLabel

  const close = (): void => { setOpen(false); setNotice(null) }

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

  const manage = (section: 'agents' | 'tabs', fallback: string): void => {
    if (onManageSettings(section)) close()
    else setNotice(fallback)
  }

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
      {open && (
        <div className="dshWorkspaceMenu" role="menu">
          {WORKSPACE_SURFACE_ACTIONS.filter(action => action.kind === 'pty' || !hidden.has(tabTypeKey(action.kind))).map(action => (
            <button key={action.label} type="button" role="menuitem" className="dshWorkspaceMenuItem" onClick={() => { onSurface(action); remember({ kind: 'surface', surface: action.kind }); close() }}>
              {action.kind === 'pty' && <AgentIcon commandId="shell" />}
              {action.label}
            </button>
          ))}
          {pluginTabs.filter(type => !hidden.has(customTabTypeKey(type.kind))).map(type => (
            <button key={type.kind} type="button" role="menuitem" className="dshWorkspaceMenuItem" onClick={() => { onCustomTab(type.kind, type.label); close() }}>
              <span className="dshWorkspaceTabGlyph" aria-hidden="true">{type.glyph}</span>
              {type.label}
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
          <button type="button" role="menuitem" className="dshWorkspaceMenuItem" onClick={() => { manage('agents', 'Open Settings, then Agents, to manage agents.') }}>Manage agents...</button>
          <button type="button" role="menuitem" className="dshWorkspaceMenuItem" onClick={() => { manage('tabs', 'Open Settings, then Tabs, to manage tab types.') }}>Add your own tab type...</button>
          {notice !== null && <div className="dshWorkspaceMenuHint" role="status">{notice}</div>}
        </div>
      )}
    </div>
  )
}

export { labelForCommand }
