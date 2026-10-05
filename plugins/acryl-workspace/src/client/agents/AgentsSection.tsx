/**
 * Settings > Agents: pick the default agent, choose Yolo or Manual permissions, set each agent's launch command
 * and arguments, see which agents are installed here, and follow a link to install the rest. It only shows
 * what the Host reports and sends one change at a time; the Host validates and stores everything.
 */

import { useEffect, useState, useSyncExternalStore } from 'react'
import type { InjectFace, PropsRuntime } from '@acryl/ui/frame'
import type { AgentsState } from './agents-state.ts'
import { defaultChoices, groupAgents } from './agents-section-model.ts'
import { AddAgentForm } from './AddAgentForm.tsx'
import { AgentRow } from './AgentRow.tsx'
import { ExternalLinkIcon, Segmented } from './controls.tsx'
import { AgentIcon } from '../tabs/AgentIcon.tsx'

export interface AgentsSectionInjected {
  readonly agents: AgentsState
}

export type AgentsSectionProps = PropsRuntime<'settings.section'> & InjectFace<AgentsSectionInjected>

/** The slot adapter: `settings.section` hands over its runtime props, the panel needs only the shared state. */
export function AgentsSection({ agents }: AgentsSectionProps) {
  return <AgentsPanel agents={agents} />
}

export function AgentsPanel({ agents }: AgentsSectionInjected) {
  const view = useSyncExternalStore(agents.subscribe, agents.getSettings)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Opening the section checks again which agents are installed.
  useEffect(() => { void agents.refresh() }, [agents])

  if (view === null) return <section className="dshAgentsSection" aria-label="Agents"><p className="dshAgentsHint">Loading agents...</p></section>

  const groups = groupAgents(view)
  const change = (patch: Parameters<AgentsState['change']>[0]): Promise<void> => agents.change(patch)
  const refresh = (): void => {
    setBusy(true)
    agents.refresh().finally(() => { setBusy(false) })
  }

  return (
    <section className="dshAgentsSection" aria-label="Agents">
      <h3 className="dshAgentsHeading">Agents</h3>
      <p className="dshAgentsText">Manage coding agents, set a default, and customize how each one launches.</p>

      <div className="dshAgentsBlock">
        <h4 className="dshAgentsSubheading">Default agent</h4>
        <p className="dshAgentsHint">What the + button opens. Auto opens whatever you opened last. Choices are only agents installed here and enabled below.</p>
        <div className="dshAgentsChips" role="radiogroup" aria-label="Default agent">
          {defaultChoices(view).map(choice => (
            <button key={choice.id} type="button" role="radio" aria-checked={view.defaultAgent === choice.id} className="dshAgentsChip" onClick={() => { change({ defaultAgent: choice.id }).catch((cause: unknown) => { setError(cause instanceof Error ? cause.message : 'could not save') }) }}>
              {choice.id !== 'auto' && choice.id !== 'none' && <AgentIcon commandId={choice.id} custom={view.agents.find(entry => entry.id === choice.id)?.badge ?? undefined} />}
              {choice.label}
            </button>
          ))}
        </div>
      </div>

      <div className="dshAgentsBlock dshAgentsInline">
        <div>
          <h4 className="dshAgentsSubheading">Agent permissions</h4>
          <p className="dshAgentsHint">Yolo starts agents with their own skip-approvals flag (each is shown on its row). Manual leaves every approval to you. New agents start in Manual.</p>
        </div>
        <Segmented
          label="Agent permissions"
          value={view.permissions}
          options={[{ id: 'yolo', label: 'Yolo' }, { id: 'manual', label: 'Manual' }]}
          onChange={(id) => { change({ permissions: id === 'yolo' ? 'yolo' : 'manual' }).catch((cause: unknown) => { setError(cause instanceof Error ? cause.message : 'could not save') }) }}
        />
      </div>
      <div className="dshAgentsBlock dshAgentsInline">
        <div>
          <h4 className="dshAgentsSubheading">Agent status hooks</h4>
          <p className="dshAgentsHint">Agents that support hooks (Claude Code) tell ACRYL when they are working, need you, or are done, so the Projects list can show which branch needs you. ACRYL adds the hooks to that agent's launch only; your own settings files are not touched.</p>
        </div>
        <Segmented
          label="Agent status hooks"
          value={view.statusHooks ? 'on' : 'off'}
          options={[{ id: 'on', label: 'On' }, { id: 'off', label: 'Off' }]}
          onChange={(id) => { change({ statusHooks: id === 'on' }).catch((cause: unknown) => { setError(cause instanceof Error ? cause.message : 'could not save') }) }}
        />
      </div>
      {error !== null && <div className="dshAgentsError" role="alert">{error}</div>}

      <div className="dshAgentsBlock">
        <div className="dshAgentsListHead">
          <h4 className="dshAgentsSubheading">Installed <span className="dshAgentsCount">{groups.installed.length} detected</span></h4>
          <button type="button" className="dshAgentsButton" disabled={busy} onClick={refresh}>{busy ? 'Checking...' : 'Refresh'}</button>
        </div>
        {groups.installed.length === 0 && <p className="dshAgentsHint">No agent was found on this machine. Pick one below to install it, or add your own.</p>}
        <ul className="dshAgentsList">
          {groups.installed.map(entry => (
            <AgentRow key={entry.id} entry={entry} isDefault={view.defaultAgent === entry.id} onChange={change} onRemove={id => agents.remove(id)} />
          ))}
        </ul>
      </div>

      <div className="dshAgentsBlock">
        <h4 className="dshAgentsSubheading">Try other agents that can be installed <span className="dshAgentsCount">{groups.available.length} agents</span></h4>
        <p className="dshAgentsHint">Not found on this machine. The link opens each agent's install page; press Refresh after installing.</p>
        <ul className="dshAgentsList" data-available>
          {groups.available.map(entry => (
            <li key={entry.id} className="dshAgentsRow" data-agent-row={entry.id}>
              <div className="dshAgentsRowMain">
                <AgentIcon commandId={entry.id} />
                <div className="dshAgentsRowName">
                  <span className="dshAgentsRowLabel">{entry.label}</span>
                  <code className="dshAgentsRowCommand">{entry.defaultCommand}</code>
                </div>
                {entry.homepageUrl !== null && (
                  <a className="dshAgentsIconLink" href={entry.homepageUrl} target="_blank" rel="noopener noreferrer" aria-label={`Install ${entry.label}`} title="Open the install page"><ExternalLinkIcon /></a>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <details className="dshAgentsBlock dshAgentsAdd">
        <summary className="dshAgentsSubheading">Add your own agent</summary>
        <p className="dshAgentsHint">Any program that runs in a terminal. It runs only what you enter here, only when you open it.</p>
        <AddAgentForm onAdd={agent => agents.add(agent)} />
      </details>
    </section>
  )
}
