/**
 * Settings > Tabs: every kind of tab the workspace can open, each turned on or off. Turned-off types leave the
 * "+" menu and the command palette. The terminal is always on. Adding tab types of your own needs a plugin
 * (a registry for them is a separate piece of work, spec 040 T125), so this pane says so instead of pretending.
 */

import { useSyncExternalStore } from 'react'
import { WORKSPACE_SURFACE_ACTIONS } from '../terminal/agent-commands.ts'
import { Segmented } from '../agents/controls.tsx'
import type { TabTypesState } from './tab-types-state.ts'

export interface TabsSectionInjected {
  readonly tabTypes: TabTypesState
}

const DESCRIPTIONS: Readonly<Record<string, string>> = {
  pty: 'A shell in the selected worktree. Always available.',
  browser: 'A web page beside your work, for docs or a running app.',
  file: 'An empty scratch file tab (files from the Code tab open as editor tabs).',
  diff: 'A text diff to compare two pieces of text; changed files open their real diff from the Changes tab.',
  kanban: 'Chats by what their agent is doing, plus notes you drag between To do, Doing and Done.',
  doc: 'A document to read or write notes in.',
}

const titleOf = (label: string): string => label.replace(/^New /, '').replace(/ Tab$/, '')

export function TabsPanel({ tabTypes }: TabsSectionInjected) {
  useSyncExternalStore(tabTypes.subscribe, tabTypes.getSnapshot)
  return (
    <section className="dshAgentsSection" aria-label="Tabs">
      <h3 className="dshAgentsHeading">Tabs</h3>
      <p className="dshAgentsText">Choose which kinds of tab the + menu and the command palette offer.</p>
      <ul className="dshAgentsList">
        {WORKSPACE_SURFACE_ACTIONS.map(action => (
          <li key={action.kind} className="dshAgentsRow" data-tab-type={action.kind}>
            <div className="dshAgentsRowMain">
              <div className="dshAgentsRowName">
                <span className="dshAgentsRowLabel">{titleOf(action.label)}</span>
                <span className="dshAgentsHint">{DESCRIPTIONS[action.kind] ?? ''}</span>
              </div>
              {action.kind === 'pty'
                ? <span className="dshAgentsDefault" aria-label="The terminal is always on">Always on</span>
                : (
                    <Segmented
                      label={`${titleOf(action.label)} tabs`}
                      value={tabTypes.isEnabled(action.kind) ? 'on' : 'off'}
                      options={[{ id: 'on', label: 'Enabled' }, { id: 'off', label: 'Disabled' }]}
                      onChange={(id) => { tabTypes.setEnabled(action.kind, id === 'on') }}
                    />
                  )}
            </div>
          </li>
        ))}
      </ul>
      <div className="dshAgentsBlock">
        <h4 className="dshAgentsSubheading">Your own tab types</h4>
        <p className="dshAgentsHint">
          A tab type of your own (an Excalidraw whiteboard for quick brainstorming, say) is a plugin that adds a new kind of tab. Ask the agent in a chat to build one with the plugin skill, and it appears here and in the + menu once a registry for plugin tabs exists. That registry is not built yet.
        </p>
      </div>
    </section>
  )
}

export function TabsSection({ tabTypes }: TabsSectionInjected) {
  return <TabsPanel tabTypes={tabTypes} />
}
