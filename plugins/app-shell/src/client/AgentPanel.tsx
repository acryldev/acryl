import { useCallback, useEffect, useState, type ReactNode } from 'react'

/** Props of {@link AgentPanel}. */
export interface AgentPanelProps {
  /** The conversation, as `desktop.main`'s `renderConversation` renders it. */
  renderConversation?: () => ReactNode
  /** The app's own class for the panel (its border, background and width). */
  className?: string
  /** Remembers the collapsed state per app; the app's plugin name is a good key. */
  storageKey?: string
}

/** Width of the collapsed rail. The panel is the last column of the app's grid, which shrinks to it while collapsed. */
export const AGENT_PANEL_RAIL = 44

const STYLE_ID = 'acryl-agent-panel-style'
const STYLES = `
[data-acryl-agent-panel] { display: flex !important; flex-direction: column !important; min-height: 0; overflow: hidden; }
[data-acryl-agent-panel][data-collapsed] { width: ${AGENT_PANEL_RAIL}px !important; min-width: ${AGENT_PANEL_RAIL}px !important; }
*:has(> [data-acryl-agent-panel][data-collapsed]) { grid-template-columns: minmax(0, 1fr) ${AGENT_PANEL_RAIL}px !important; }
.acrylAgentPanelHead { flex: 0 0 auto !important; display: flex; align-items: center; height: 36px; padding: 0 8px; }
[data-acryl-agent-panel][data-collapsed] .acrylAgentPanelHead { justify-content: center; padding: 0; }
.acrylAgentPanelToggle { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-text-l2, currentColor); cursor: pointer; opacity: .75; }
.acrylAgentPanelToggle:hover { opacity: 1; background: var(--dsw-alias-bg-hover, rgba(127,127,127,.12)); }
.acrylAgentPanelToggle:focus-visible { outline: 2px solid var(--dsw-alias-border-focus, #3b82f6); outline-offset: 1px; }
.acrylAgentPanelBody { flex: 1 1 0 !important; min-height: 0 !important; display: flex; flex-direction: column; overflow: hidden; }
.acrylAgentPanelBody > * { flex: 1 1 0; min-height: 0; }
[data-acryl-agent-panel][data-collapsed] > .acrylAgentPanelBody { display: none !important; }
.acrylAgentPanelRailLabel { flex: 0 0 auto !important; align-self: center; margin-top: 4px; writing-mode: vertical-rl; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--dsw-alias-text-l3, currentColor); cursor: pointer; user-select: none; background: none; border: 0; padding: 4px 0; }
`

function readCollapsed(key: string | undefined): boolean {
  if (key === undefined) return false
  try { return window.localStorage.getItem(`acryl-agent-panel:${key}`) === 'collapsed' } catch { return false }
}

function writeCollapsed(key: string | undefined, collapsed: boolean): void {
  if (key === undefined) return
  try { window.localStorage.setItem(`acryl-agent-panel:${key}`, collapsed ? 'collapsed' : 'open') } catch { /* blocked storage: the state lasts for this page only */ }
}

/** A window whose right column carries an arrow: pointing right hides the panel, pointing left shows it. */
function PanelIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.75" y="2.25" width="12.5" height="11.5" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M10 2.5v11" stroke="currentColor" strokeWidth="1.3" />
      <path d={collapsed ? 'M6.5 6 4.5 8l2 2' : 'M4.5 6l2 2-2 2'} stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * The agent's side panel of a Blend app: the conversation in a column the user can collapse to a rail
 * and open again, like the left sidebar. The conversation stays mounted while collapsed, so a running
 * turn and the draft survive. The collapsed state is remembered per `storageKey`.
 */
export function AgentPanel({ renderConversation, className, storageKey }: AgentPanelProps) {
  const [collapsed, setCollapsed] = useState(() => readCollapsed(storageKey))
  useEffect(() => {
    if (document.getElementById(STYLE_ID) !== null) return
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = STYLES
    document.head.appendChild(style)
  }, [])
  const toggle = useCallback(() => {
    setCollapsed(current => {
      writeCollapsed(storageKey, !current)
      return !current
    })
  }, [storageKey])
  const label = collapsed ? 'Show agent panel' : 'Hide agent panel'
  return (
    <aside className={className} aria-label="Agent" data-acryl-agent-panel="" data-collapsed={collapsed || undefined}>
      <div className="acrylAgentPanelHead">
        <button type="button" className="acrylAgentPanelToggle" onClick={toggle} title={label} aria-label={label} aria-expanded={!collapsed}>
          <PanelIcon collapsed={collapsed} />
        </button>
      </div>
      {collapsed && <button type="button" className="acrylAgentPanelRailLabel" onClick={toggle} tabIndex={-1}>Agent</button>}
      <div className="acrylAgentPanelBody">
        {renderConversation?.()}
      </div>
    </aside>
  )
}
