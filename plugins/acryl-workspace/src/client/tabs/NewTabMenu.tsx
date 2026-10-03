/**
 * The "+" button and its menu: surfaces (terminal, browser, file, ...) and the agents that are installed and
 * enabled. The plain "+" opens the default agent chosen in Settings > Agents (or the last thing opened when
 * the default is Auto). "Manage agents..." turns the list into checkboxes so an agent can be enabled or disabled
 * right here; "Add more agents..." opens Settings > Agents (flags, default, install links), and "Add your own tab
 * type..." opens Settings > Tabs.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { AgentSettingsView } from '../../agents/contract.ts'
import type { CustomAgent } from '../../agents/definition.ts'
import { menuAgents, primaryAction } from '../agents/agents-section-model.ts'
import { ChatIcon } from '../agents/controls.tsx'
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
  /** Starts a brand new AcrylDSH Chat session - its own tab, distinct from any already open. */
  onOpenChat(): void
  /** The DSH chat is available. Off, the menu has no chat entry and never offers one as the last-used tab. Defaults to on. */
  chatAvailable?: boolean
  /** Turns one agent on or off in the + menu (a Host setting, shared with Settings > Agents). */
  onSetAgentEnabled(id: string, enabled: boolean): Promise<void>
  /**
   * Opens Settings on a section; false when the Settings panel could not be found. `onSettled(false)` fires
   * later if the panel opened but its section never appeared (e.g. still starting up), so a menu that closed
   * on a `true` return can still tell the person it landed on the wrong tab instead of staying silent.
   */
  onManageSettings(section: 'agents' | 'tabs', onSettled?: (found: boolean) => void): boolean
}

export function NewTabMenu({ open, customAgents, settings, storage, tabTypes, tabRegistry, onCustomTab, setOpen, onSurface, onOpenAgent, onOpenChat, chatAvailable = true, onSetAgentEnabled, onManageSettings }: NewTabMenuProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const hidden = useSyncExternalStore(tabTypes.subscribe, tabTypes.getSnapshot)
  const pluginTabs = useSyncExternalStore(tabRegistry.subscribe, tabRegistry.getSnapshot)
  const [notice, setNotice] = useState<string | null>(null)
  const [managing, setManaging] = useState(false)
  const [remembered, setLast] = useState<LastTab>(() => readLastTab(storage))
  // A chat remembered from an earlier run is not offered when there is no chat: fall back to a terminal.
  const last: LastTab = !chatAvailable && remembered.kind === 'chat' ? { kind: 'surface', surface: 'pty' } : remembered

  const remember = (tab: LastTab): void => { setLast(tab); writeLastTab(storage, tab) }
  const lastLabel = last.kind === 'agent'
    ? last.label
    : last.kind === 'chat'
      ? 'AcrylDSH Chat'
      : WORKSPACE_SURFACE_ACTIONS.find(action => action.kind === last.surface)?.label.replace(/^New /, '') ?? 'Terminal'
  const openTerminal = (): void => {
    const action = WORKSPACE_SURFACE_ACTIONS.find(candidate => candidate.kind === 'pty')
    if (action !== undefined) onSurface(action)
  }
  const openLast = (): void => {
    if (last.kind === 'agent') onOpenAgent(last.id, last.label)
    else if (last.kind === 'chat') onOpenChat()
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

  const close = (): void => { setOpen(false); setNotice(null); setManaging(false) }

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

  // The menu stays open until the section itself is confirmed, not just the Settings trigger: closing right
  // away on a bare "trigger found" would hide a fallback notice for the one failure this can still have (the
  // dialog opened, but on whatever section the shell defaulted to, not the one asked for) behind `open &&`.
  const manage = (section: 'agents' | 'tabs', fallback: string): void => {
    if (!onManageSettings(section, found => { if (found) close(); else setNotice(fallback) })) setNotice(fallback)
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
          {chatAvailable && (
            <>
              <div className="dshWorkspaceMenuRule" />
              <button type="button" role="menuitem" className="dshWorkspaceMenuItem" onClick={() => { onOpenChat(); remember({ kind: 'chat' }); close() }}>
                <ChatIcon />
                <span className="dshWorkspaceMenuGrow">AcrylDSH Chat</span>
              </button>
            </>
          )}
          {managing && settings !== null
            ? settings.agents.filter(entry => entry.installed || entry.kind === 'custom').map(entry => (
                <button
                  key={entry.id}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={entry.enabled}
                  className="dshWorkspaceMenuItem"
                  onClick={() => { onSetAgentEnabled(entry.id, !entry.enabled).catch((cause: unknown) => { setNotice(cause instanceof Error ? cause.message : 'could not save') }) }}
                >
                  <AgentIcon commandId={entry.id} custom={entry.badge ?? undefined} />
                  <span className="dshWorkspaceMenuGrow">{entry.label}</span>
                  <span className="dshWorkspaceMenuCheck" aria-hidden="true">{entry.enabled ? '✓' : ''}</span>
                </button>
              ))
            : menuAgents(settings, customAgents).map(agent => (
                <button key={agent.id} type="button" role="menuitem" className="dshWorkspaceMenuItem" onClick={() => { onOpenAgent(agent.id, agent.label); remember({ kind: 'agent', id: agent.id, label: agent.label }); close() }}>
                  <AgentIcon commandId={agent.id} custom={agent.custom} />
                  <span className="dshWorkspaceMenuGrow">{agent.label}</span>
                  {agent.isDefault && <span className="dshWorkspaceMenuTag">default</span>}
                </button>
              ))}
          <div className="dshWorkspaceMenuRule" />
          {managing
            ? <button type="button" role="menuitem" className="dshWorkspaceMenuItem" onClick={() => { setManaging(false); setNotice(null) }}>Done</button>
            : settings !== null && <button type="button" role="menuitem" className="dshWorkspaceMenuItem" onClick={() => { setManaging(true) }}>Manage agents...</button>}
          <button type="button" role="menuitem" className="dshWorkspaceMenuItem" onClick={() => { manage('agents', 'Open Settings, then Agents, to add more agents.') }}>Add more agents...</button>
          <button type="button" role="menuitem" className="dshWorkspaceMenuItem" onClick={() => { manage('tabs', 'Open Settings, then Tabs, to manage tab types.') }}>Add your own tab type...</button>
          {notice !== null && <div className="dshWorkspaceMenuHint" role="status">{notice}</div>}
        </div>
      )}
    </div>
  )
}

export { labelForCommand }
