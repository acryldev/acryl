// @vitest-environment jsdom

/**
 * End-to-end scenarios against the REAL workspace components (not fixtures): the agent's driver looks at the
 * page, finds controls by their accessible names, and operates them the way the spec's user stories describe.
 * These also measure how good the workspace's accessibility names are (spec 041 T002 and T050).
 */

import { act, cleanup, render } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeDock, makeStatus } from '../../../acryl-workspace/tests/dock/dock-fixtures.ts'
import { WorkspaceTabRegistry } from '../../../acryl-workspace/src/client/tabs/registry/tab-registry.ts'
import { TabTypesState } from '../../../acryl-workspace/src/client/tabs/tab-types-state.ts'
import { TabsPanel } from '../../../acryl-workspace/src/client/tabs/TabsPanel.tsx'
import { AgentsPanel } from '../../../acryl-workspace/src/client/agents/AgentsSection.tsx'
import { AgentsState } from '../../../acryl-workspace/src/client/agents/agents-state.ts'
import { WorkspaceGroups } from '../../../acryl-workspace/src/client/canvas/groups.ts'
import { WorkspaceState } from '../../../acryl-workspace/src/client/canvas/state.ts'
import type { WorkspaceGitApi } from '../../../acryl-workspace/src/client/git/git-api.ts'
import { ProjectsSidebar, type ProjectsSidebarProps } from '../../../acryl-workspace/src/client/projects/ProjectsSidebar.tsx'
import type { ProjectAction, ProjectsControl } from '../../../acryl-workspace/src/client/projects/projects-control.ts'
import { TabStrip } from '../../../acryl-workspace/src/client/tabs/TabStrip.tsx'
import { TerminalRegistry } from '../../../acryl-workspace/src/client/terminal/terminal-session.ts'
import { WorkspaceShellState } from '../../../acryl-workspace/src/client/worktrees/shell-state.ts'
import { UiControlError, type UiActionResult, type UiSnapshot } from '../../src/contract.ts'
import { UiDriver } from '../../src/client/driver/driver.ts'

class NoopObserver { observe() {} disconnect() {} unobserve() {} }
globalThis.ResizeObserver = NoopObserver as unknown as typeof ResizeObserver

afterEach(() => { cleanup(); document.body.innerHTML = '' })

/** An agent: every call goes through the driver, inside `act` so React settles like it would in the page. */
const dock = makeDock().controller

function agent() {
  const driver = new UiDriver({ document: () => document, sleep: async () => { await Promise.resolve() } })
  return {
    driver,
    async look(): Promise<UiSnapshot> { let out!: UiSnapshot; await act(async () => { out = (await driver.handle({ op: 'snapshot' })) as UiSnapshot }); return out },
    async do(request: Parameters<UiDriver['handle']>[0]): Promise<UiActionResult> { let out!: UiActionResult; await act(async () => { out = (await driver.handle(request)) as UiActionResult }); return out },
  }
}
const find = (snapshot: UiSnapshot, role: string, name: string): string => {
  const node = snapshot.nodes.find(n => n.role === role && n.name === name)
  if (node === undefined) throw new Error(`no ${role} "${name}"; the page offers: ${snapshot.nodes.map(n => `${n.role} "${n.name}"`).join(', ')}`)
  return node.ref
}
const unnamed = (snapshot: UiSnapshot): string[] => snapshot.nodes.filter(n => n.name === '' && ['button', 'link', 'textbox', 'checkbox', 'combobox', 'tab'].includes(n.role)).map(n => n.role)

const gitApi = {
  repo: async (cwd: string) => ({ name: 'proj', root: '/p/proj', current: cwd, worktrees: [{ path: '/p/proj', branch: 'main', head: 'a', main: true }] }),
  status: async (path: string) => ({ path, branch: 'main', changes: [], added: 0, removed: 0, truncated: false }),
} as unknown as WorkspaceGitApi

const sessionsHook = ((selector: (value: object) => unknown) => selector({ ids: [], current: undefined, byId: {} })) as unknown as ProjectsSidebarProps['useSessions']

function fakeProjects(overrides: Partial<ProjectsControl>): ProjectsControl {
  return {
    chatAvailable: true,
    workspaceKey: () => '', workspacePaths: () => [], subscribeWorkspaces: () => () => {},
    chooserKind: () => 'path',
    addProject: async (): Promise<ProjectAction> => ({ ok: true }),
    addProjectByPath: async (): Promise<ProjectAction> => ({ ok: true }),
    showChat: async (): Promise<ProjectAction> => ({ ok: true }),
    newChat: async (): Promise<ProjectAction> => ({ ok: true }),
    openChat: async (): Promise<ProjectAction> => ({ ok: true }),
    newWorktree: async (): Promise<ProjectAction> => ({ ok: true }),
    removeWorkspace: async (): Promise<ProjectAction> => ({ ok: true }),
    renameChat: async (): Promise<ProjectAction> => ({ ok: true }),
    openSettings: (): ProjectAction => ({ ok: true }),
    ...overrides,
  }
}

describe('scenario: "add my repo at /p/proj as a project" (US2, T042)', () => {
  it('the agent finds the Projects list and its + control by name, types the path and adds it', async () => {
    const addProjectByPath = vi.fn(async (): Promise<ProjectAction> => ({ ok: true }))
    const shell = new WorkspaceShellState(gitApi)
    const props = {
      collapsed: false, width: 280, renderUpstream: () => <div>upstream</div>, onToggleCollapse: () => {}, useSessions: sessionsHook, shell,
      projects: fakeProjects({ addProjectByPath }), groups: new WorkspaceGroups(), status: makeStatus().state,
      agents: new AgentsState({ list: async () => [], add: async () => [], remove: async () => [], settings: async () => { throw new Error('none') }, change: async () => { throw new Error('none') } }),
    } as unknown as ProjectsSidebarProps
    render(<ProjectsSidebar {...props} />)
    const ai = agent()

    let page = await ai.look()
    await ai.do({ op: 'click', ref: find(page, 'button', 'Add git project') })
    page = await ai.look()
    expect(unnamed(page), 'every control the agent needs has a name').toEqual([])
    await ai.do({ op: 'type', ref: find(page, 'textbox', 'Project folder path'), text: '/p/proj' })
    page = await ai.look()
    expect(page.nodes.find(n => n.role === 'textbox' && n.name === 'Project folder path')?.value).toBe('/p/proj')
    await ai.do({ op: 'click', ref: find(page, 'button', 'Add') })

    expect(addProjectByPath).toHaveBeenCalledWith('/p/proj')
    shell.dispose()
  })
})

describe('scenario: settings for coding agents, through the + menu and Settings > Agents', () => {
  it('walks the + menu to Settings > Tabs, turns a tab type off and finds it gone from the menu', async () => {
    const workspace = new WorkspaceState()
    const tabTypes = new TabTypesState(undefined)
    const registry = new WorkspaceTabRegistry()
    function Harness() {
      const snapshot = useSyncExternalStore(l => workspace.subscribe(l), () => workspace.getSnapshot())
      const terminals = new TerminalRegistry({ createSocket: () => ({ send() {}, close() {}, onopen: null, onmessage: null, onclose: null, onerror: null, readyState: 0 }), urlFor: id => `ws://x/${id}` })
      return (
        <>
          <TabStrip snapshot={snapshot} workspace={workspace} branchLabel="main" branchTitle="/p" runningText={null} storage={undefined} customAgents={[]} terminals={terminals} onClose={() => {}} onOpenPty={() => {}} onOpenChat={() => {}} onRenameChat={() => {}} agentSettings={null} tabTypes={tabTypes} tabRegistry={registry} dock={dock} agentStatus={makeStatus().state} onSetAgentEnabled={async () => {}} onManageSettings={() => true} />
          <TabsPanel tabTypes={tabTypes} tabRegistry={registry} />
        </>
      )
    }
    render(<Harness />)
    const ai = agent()
    let page = await ai.look()
    expect(unnamed(page)).toEqual([])
    await ai.do({ op: 'click', ref: find(page, 'radio', 'Disabled') })
    await ai.do({ op: 'click', ref: find(await ai.look(), 'button', 'Choose what to open') })
    page = await ai.look()
    expect(page.nodes.some(n => n.name === 'New Terminal')).toBe(true)
    expect(page.nodes.filter(n => n.role === 'menuitem' && n.name.startsWith('New ')).length).toBe(5)
  })

  it('adds an agent from Settings > Agents by name and command, without knowing the page', async () => {
    const add = vi.fn(async () => [])
    const agents = new AgentsState({ list: async () => [], add, remove: async () => [], settings: async () => ({ permissions: 'manual', defaultAgent: 'auto', statusHooks: true, agents: [] }), change: async () => { throw new Error('none') } })
    await agents.refresh()
    render(<AgentsPanel agents={agents} />)
    const ai = agent()
    let page = await ai.look()
    expect(unnamed(page)).toEqual([])
    await ai.do({ op: 'type', ref: find(page, 'textbox', 'Name'), text: 'My Agent' })
    await ai.do({ op: 'type', ref: find(page, 'textbox', 'Command'), text: 'my-agent' })
    page = await ai.look()
    await ai.do({ op: 'click', ref: find(page, 'button', 'Add agent') })
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ id: 'my-agent', command: 'my-agent' }))
  })

  it('cannot be turned against the user: a sensitive-looking field the menu never lists stays out of reach', async () => {
    document.body.innerHTML = '<form><label>API key <input type="text" name="apiKey"></label><button>Save</button></form>'
    const ai = agent()
    const page = await ai.look()
    expect(page.nodes.map(n => n.name)).toEqual(['Save'])
    await expect(ai.do({ op: 'type', ref: '1.1', text: 'sk-123' })).rejects.toBeInstanceOf(UiControlError)
  })
})
