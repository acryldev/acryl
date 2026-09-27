import { describe, expect, it } from 'vitest'
import { AgentCatalog, type CatalogStore } from '../../src/agents/catalog.ts'
import { parseAgentSettingsView } from '../../src/agents/contract.ts'
import { AgentDefinitionError } from '../../src/agents/definition.ts'
import { KNOWN_AGENTS, knownAgent } from '../../src/agents/known-agents.ts'
import { joinArguments, splitArguments } from '../../src/agents/argument-text.ts'
import { parsePreferencesPatch, parseStoredPreferences } from '../../src/agents/preferences.ts'
import { AgentSettings } from '../../src/agents/settings.ts'

function memoryStore(initial: string | null = null): CatalogStore & { text: string | null } {
  const store = { text: initial, read: async () => store.text, write: async (text: string) => { store.text = text } }
  return store
}

const installed = new Set(['claude', 'goose', 'cursor-agent', 'my-agent'])
const make = (store = memoryStore()) => {
  const catalog = new AgentCatalog(memoryStore(), command => installed.has(command))
  return { settings: new AgentSettings(store, catalog, command => installed.has(command)), catalog, store }
}

describe('known agents', () => {
  it('has unique ids and a command line and install page for every entry', () => {
    expect(new Set(KNOWN_AGENTS.map(agent => agent.id)).size).toBe(KNOWN_AGENTS.length)
    for (const agent of KNOWN_AGENTS) {
      expect(agent.command).toMatch(/^[A-Za-z0-9._-]+$/)
      expect(agent.homepageUrl).toMatch(/^https:\/\//)
    }
    expect(knownAgent('cursor')?.command).toBe('cursor-agent')
  })
})

describe('AgentSettings', () => {
  it('starts manual: no permission flags, every agent enabled, default automatic', async () => {
    const { settings } = make()
    await settings.load()
    const view = settings.view()
    expect(view.permissions).toBe('manual')
    expect(view.defaultAgent).toBe('auto')
    expect(settings.resolve('claude')).toEqual({ command: 'claude', args: [], statusHooks: 'claude' })
    const claude = view.agents.find(entry => entry.id === 'claude')
    expect(claude).toMatchObject({ enabled: true, installed: true, preview: 'claude', permissionArgs: [] })
    expect(view.agents.find(entry => entry.id === 'codex')?.installed).toBe(false)
  })

  it('yolo adds each agent\'s own flags, and goose gets its environment', async () => {
    const { settings } = make()
    await settings.apply({ permissions: 'yolo' })
    expect(settings.resolve('claude')).toEqual({ command: 'claude', args: ['--dangerously-skip-permissions'], statusHooks: 'claude' })
    expect(settings.resolve('goose')).toEqual({ command: 'goose', args: [], env: { GOOSE_MODE: 'auto' } })
    const view = settings.view()
    expect(view.agents.find(entry => entry.id === 'goose')?.preview).toBe('GOOSE_MODE=auto goose')
    expect(view.agents.find(entry => entry.id === 'claude')?.preview).toBe('claude --dangerously-skip-permissions')
  })

  it('a command override and extra arguments are added after the permission flags and can be cleared', async () => {
    const { settings } = make()
    await settings.apply({ permissions: 'yolo' })
    await settings.apply({ agent: { id: 'cursor', command: '/opt/bin/cursor-agent', args: ['--model', 'fast'] } })
    expect(settings.resolve('cursor')).toEqual({ command: '/opt/bin/cursor-agent', args: ['--yolo', '--model', 'fast'] })
    await settings.apply({ agent: { id: 'cursor', command: null, args: [] } })
    expect(settings.resolve('cursor')).toEqual({ command: 'cursor-agent', args: ['--yolo'] })
  })

  it('persists, reloads, and shows a disabled agent as disabled', async () => {
    const first = make()
    await first.settings.apply({ defaultAgent: 'claude', agent: { id: 'codex', enabled: false } })
    const second = make(first.store)
    await second.settings.load()
    const view = second.settings.view()
    expect(view.defaultAgent).toBe('claude')
    expect(view.agents.find(entry => entry.id === 'codex')?.enabled).toBe(false)
  })

  it('refuses unknown agents, bad commands and a default that is not an agent', async () => {
    const { settings } = make()
    await expect(settings.apply({ agent: { id: 'nope', enabled: false } })).rejects.toBeInstanceOf(AgentDefinitionError)
    await expect(settings.apply({ defaultAgent: 'nope' })).rejects.toBeInstanceOf(AgentDefinitionError)
    expect(() => parsePreferencesPatch({ agent: { id: 'claude', command: 'rm -rf /' } })).toThrow(AgentDefinitionError)
    expect(() => parsePreferencesPatch({ agent: { id: 'claude', args: 'x' } })).toThrow(AgentDefinitionError)
    expect(() => parsePreferencesPatch({ permissions: 'sudo' })).toThrow(AgentDefinitionError)
    expect(() => parsePreferencesPatch({ surprise: 1 })).toThrow(AgentDefinitionError)
  })

  it('lists custom agents after the known ones, lets one be the default, and forgets a removed default', async () => {
    const { settings, catalog } = make()
    await catalog.add({ id: 'my-agent', label: 'Mine', command: 'my-agent', args: ['--fast'], badge: { letter: 'M', color: '#10a37f' } })
    await settings.apply({ defaultAgent: 'my-agent' })
    expect(settings.resolve('my-agent')).toEqual({ command: 'my-agent', args: ['--fast'] })
    const view = settings.view()
    expect(view.agents.at(-1)).toMatchObject({ id: 'my-agent', kind: 'custom', installed: true, homepageUrl: null })
    expect(view.defaultAgent).toBe('my-agent')
    await catalog.remove('my-agent')
    expect(settings.view().defaultAgent).toBe('auto')
  })

  it('reads a damaged file as the defaults and drops one bad override', () => {
    expect(parseStoredPreferences('nonsense').permissions).toBe('manual')
    const parsed = parseStoredPreferences({ permissions: 'yolo', overrides: { claude: { enabled: false, args: [] }, codex: { command: 'a b', args: [] } } })
    expect(parsed.permissions).toBe('yolo')
    expect(Object.keys(parsed.overrides)).toEqual(['claude'])
  })

  it('produces a view the page accepts', async () => {
    const { settings } = make()
    await settings.load()
    const round: unknown = JSON.parse(JSON.stringify(settings.view()))
    expect(parseAgentSettingsView(round).agents.length).toBe(KNOWN_AGENTS.length)
    expect(() => parseAgentSettingsView({ permissions: 'x' })).toThrow()
  })
})

describe('argument text', () => {
  it('splits on spaces, honours quotes and round-trips', () => {
    expect(splitArguments('--model "big one" -v')).toEqual(['--model', 'big one', '-v'])
    expect(splitArguments("--x 'a b' ''")).toEqual(['--x', 'a b', ''])
    expect(splitArguments('   ')).toEqual([])
    expect(() => splitArguments('--x "open')).toThrow()
    const args = ['--model', 'big one', 'say "hi"', '']
    expect(splitArguments(joinArguments(args))).toEqual(args)
  })
})
