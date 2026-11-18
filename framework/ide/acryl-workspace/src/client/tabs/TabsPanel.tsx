/**
 * Settings > Tabs: every kind of tab the workspace can open, each turned on or off. Turned-off types leave the
 * "+" menu and the command palette. The terminal is always on. Tab types that plugins registered through the
 * `workspaceTabs` service are listed below the built-in ones and can be turned off the same way.
 */

import { useSyncExternalStore } from 'react'
import { WORKSPACE_SURFACE_ACTIONS } from '../terminal/agent-commands.ts'
import { Segmented } from '../agents/controls.tsx'
import type { WorkspaceTabRegistry } from './registry/tab-registry.ts'
import type { TabTypesState } from './tab-types-state.ts'

export interface TabsSectionInjected {
  readonly tabTypes: TabTypesState
  /** The tab types plugins registered. */
  readonly tabRegistry: WorkspaceTabRegistry
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

export function TabsPanel({ tabTypes, tabRegistry }: TabsSectionInjected) {
  useSyncExternalStore(tabTypes.subscribe, tabTypes.getSnapshot)
  const pluginTypes = useSyncExternalStore(tabRegistry.subscribe, tabRegistry.getSnapshot)
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
        <h4 className="dshAgentsSubheading">Your own tab types <span className="dshAgentsCount">{pluginTypes.length} from plugins</span></h4>
        {pluginTypes.length === 0 && (
          <p className="dshAgentsHint">
            A tab type of your own (an Excalidraw whiteboard for quick brainstorming, say) is a plugin that registers one with <code>ctx.workspaceTabs.register(...)</code>. Ask the agent in a chat to build one; the extension docs have a worked example. Registered types appear here and in the + menu and the command palette.
          </p>
        )}
        <ul className="dshAgentsList">
          {pluginTypes.map(type => (
            <li key={type.kind} className="dshAgentsRow" data-tab-type={type.kind}>
              <div className="dshAgentsRowMain">
                <span className="dshWorkspaceTabGlyph" aria-hidden="true">{type.glyph}</span>
                <div className="dshAgentsRowName">
                  <span className="dshAgentsRowLabel">{type.label}</span>
                  <span className="dshAgentsHint">{type.description}</span>
                  <code className="dshAgentsRowCommand">{type.kind}</code>
                </div>
                <Segmented
                  label={`${type.label} tabs`}
                  value={tabTypes.isCustomEnabled(type.kind) ? 'on' : 'off'}
                  options={[{ id: 'on', label: 'Enabled' }, { id: 'off', label: 'Disabled' }]}
                  onChange={(id) => { tabTypes.setCustomEnabled(type.kind, id === 'on') }}
                />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export function TabsSection(props: TabsSectionInjected) {
  return <TabsPanel {...props} />
}
