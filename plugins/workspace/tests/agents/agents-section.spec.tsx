// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CustomAgent } from '../../src/agents/definition.ts'
import type { PreferencesPatch } from '../../src/agents/preferences.ts'
import { AgentsPanel } from '../../src/client/agents/AgentsSection.tsx'
import { AgentsState } from '../../src/client/agents/agents-state.ts'
import type { WorkspaceAgentsApi } from '../../src/client/agents/agents-api.ts'
import { defaultChoices, groupAgents, menuAgents, primaryAction } from '../../src/client/agents/agents-section-model.ts'
import type { AgentSettingsView } from '../../src/agents/contract.ts'
import { entry, view } from './fixtures.ts'

afterEach(cleanup)

const mine: CustomAgent = { id: 'my-agent', label: 'My Agent', command: 'my-agent', args: ['--fast'], badge: { letter: 'M', color: '#10a37f' } }

function fakeApi(initial: AgentSettingsView) {
  let current = initial
  const changes: PreferencesPatch[] = []
  const api: WorkspaceAgentsApi = {
    list: async () => [],
    add: vi.fn(async () => []),
    remove: vi.fn(async () => []),
    settings: async () => current,
    change: async (patch) => {
      changes.push(patch)
      if (patch.permissions !== undefined) current = { ...current, permissions: patch.permissions }
      if (patch.defaultAgent !== undefined) current = { ...current, defaultAgent: patch.defaultAgent }
      return current
    },
  }
  return { api, changes }
}

async function renderSection(initial: AgentSettingsView) {
  const fake = fakeApi(initial)
  const agents = new AgentsState(fake.api)
  await agents.refresh()
  render(<AgentsPanel agents={agents} />)
  return { ...fake, agents }
}

const sample = view([
  entry('claude', { preview: 'claude', permissionArgs: ['--dangerously-skip-permissions'] }),
  entry('codex'),
  entry('aider', { installed: false, command: 'aider' }),
  entry('my-agent', { kind: 'custom', label: 'My Agent', homepageUrl: null, badge: { letter: 'M', color: '#10a37f' }, preview: 'my-agent --fast', args: ['--fast'] }),
])

describe('groups and menu rules', () => {
  it('splits installed from available, always keeping custom agents with the installed ones', () => {
    const groups = groupAgents(sample)
    expect(groups.installed.map(e => e.id)).toEqual(['claude', 'codex', 'my-agent'])
    expect(groups.available.map(e => e.id)).toEqual(['aider'])
  })

  it('offers only launchable agents as defaults, after Auto and a blank terminal', () => {
    expect(defaultChoices(sample).map(c => c.id)).toEqual(['auto', 'none', 'claude', 'codex', 'my-agent'])
    expect(defaultChoices(view([entry('claude', { enabled: false })])).map(c => c.id)).toEqual(['auto', 'none'])
  })

  it('lists every known agent while Settings has not answered, then only installed and enabled ones', () => {
    expect(menuAgents(null, [mine]).map(a => a.id)).toContain('my-agent')
    expect(menuAgents(null, []).length).toBeGreaterThan(20)
    expect(menuAgents(sample, []).map(a => a.id)).toEqual(['claude', 'codex', 'my-agent'])
  })

  it('makes + open the default only while it is launchable', () => {
    expect(primaryAction(null)).toEqual({ kind: 'last' })
    expect(primaryAction(view([entry('claude')], { defaultAgent: 'none' }))).toEqual({ kind: 'terminal' })
    expect(primaryAction(view([entry('claude')], { defaultAgent: 'claude' }))).toEqual({ kind: 'agent', id: 'claude', label: 'Claude' })
    expect(primaryAction(view([entry('claude', { installed: false })], { defaultAgent: 'claude' }))).toEqual({ kind: 'last' })
  })
})

describe('AgentsPanel', () => {
  it('shows installed agents with their command line and the ones to try with an install link', async () => {
    await renderSection(sample)
    const installed = screen.getByText(/Installed/).closest('div') as HTMLElement
    expect(installed.textContent).toContain('3 detected')
    const claude = document.querySelector('[data-agent-row="claude"]') as HTMLElement
    expect(within(claude).getByText('claude')).toBeTruthy()
    const link = within(claude).getByRole('link', { name: /Claude install and docs page/ })
    expect(link.getAttribute('href')).toBe('https://example.test/claude')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
    const available = document.querySelector('[data-available]') as HTMLElement
    expect(within(available).getByText('Aider')).toBeTruthy()
    expect(within(available).getByRole('link', { name: 'Install Aider' }).getAttribute('href')).toBe('https://example.test/aider')
    expect(screen.getByText(/Try other agents that can be installed/)).toBeTruthy()
  })

  it('switches permissions and the default agent through the Host, one change each', async () => {
    const { changes } = await renderSection(sample)
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Agent permissions' })).getByRole('radio', { name: 'Yolo' }))
    await waitFor(() => { expect(changes).toContainEqual({ permissions: 'yolo' }) })
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Default agent' })).getByRole('radio', { name: /No agent/ }))
    await waitFor(() => { expect(changes).toContainEqual({ defaultAgent: 'none' }) })
    fireEvent.click(within(document.querySelector('[data-agent-row="codex"]') as HTMLElement).getByRole('button', { name: 'Set default' }))
    await waitFor(() => { expect(changes).toContainEqual({ defaultAgent: 'codex' }) })
  })

  it('turns an agent off and on from its row', async () => {
    const { changes } = await renderSection(sample)
    const row = document.querySelector('[data-agent-row="codex"]') as HTMLElement
    fireEvent.click(within(row).getByRole('radio', { name: 'Disabled' }))
    await waitFor(() => { expect(changes).toContainEqual({ agent: { id: 'codex', enabled: false } }) })
  })

  it('edits the command and extra arguments and sends them once, shell-quoted text becoming an argument array', async () => {
    const { changes } = await renderSection(sample)
    const row = document.querySelector('[data-agent-row="claude"]') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: 'Claude launch settings' }))
    fireEvent.change(within(row).getByLabelText('Extra arguments'), { target: { value: '--model "big one" -v' } })
    fireEvent.blur(within(row).getByLabelText('Extra arguments'))
    await waitFor(() => { expect(changes).toContainEqual({ agent: { id: 'claude', command: null, args: ['--model', 'big one', '-v'] } }) })
    fireEvent.change(within(row).getByLabelText('Command'), { target: { value: '/opt/claude' } })
    fireEvent.keyDown(within(row).getByLabelText('Command'), { key: 'Enter' })
    await waitFor(() => { expect(changes.at(-1)).toEqual({ agent: { id: 'claude', command: '/opt/claude', args: ['--model', 'big one', '-v'] } }) })
  })

  it('refuses an unclosed quote in the arguments before asking the Host', async () => {
    const { changes } = await renderSection(sample)
    const row = document.querySelector('[data-agent-row="claude"]') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: 'Claude launch settings' }))
    fireEvent.change(within(row).getByLabelText('Extra arguments'), { target: { value: '--x "open' } })
    fireEvent.blur(within(row).getByLabelText('Extra arguments'))
    expect((await screen.findByRole('alert')).textContent).toContain('quote')
    expect(changes).toEqual([])
  })

  it('removes a custom agent from its row', async () => {
    const { api } = await renderSection(sample)
    const row = document.querySelector('[data-agent-row="my-agent"]') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: 'My Agent launch settings' }))
    fireEvent.click(within(row).getByRole('button', { name: 'Remove agent' }))
    await waitFor(() => { expect(api.remove).toHaveBeenCalledWith('my-agent') })
  })

  it('adds an agent from the form, showing the exact command first and refusing unsafe input', async () => {
    const { api } = await renderSection(sample)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Other' } })
    fireEvent.change(screen.getByLabelText('Command'), { target: { value: 'other && rm -rf ~' } })
    expect((screen.getByRole('button', { name: 'Add agent' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/without spaces or shell characters/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Command'), { target: { value: 'other' } })
    fireEvent.change(screen.getByLabelText('Arguments (one per line)'), { target: { value: '--model\nfast model' } })
    expect(screen.getByText('other --model "fast model"')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Add agent' }))
    await waitFor(() => { expect(api.add).toHaveBeenCalledWith(expect.objectContaining({ id: 'other', command: 'other', args: ['--model', 'fast model'] })) })
  })

  it("shows the Host's own refusal when adding fails and keeps the form", async () => {
    const { api } = await renderSection(sample)
    vi.mocked(api.add).mockRejectedValueOnce(new Error('"other" was not found on this machine'))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Other' } })
    fireEvent.change(screen.getByLabelText('Command'), { target: { value: 'other' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add agent' }))
    expect((await screen.findByRole('alert')).textContent).toContain('was not found on this machine')
    expect((screen.getByLabelText('Command') as HTMLInputElement).value).toBe('other')
  })

  it('says it is loading until the Host answers', () => {
    const agents = new AgentsState({ ...fakeApi(sample).api, settings: () => new Promise(() => {}) })
    render(<AgentsPanel agents={agents} />)
    expect(screen.getByText('Loading agents...')).toBeTruthy()
  })
})
