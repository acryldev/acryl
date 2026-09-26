import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { AgentCatalog, type CatalogStore } from '../../src/agents/catalog.ts'
import { AgentDefinitionError, MAX_CUSTOM_AGENTS } from '../../src/agents/definition.ts'
import { createFileCatalogStore, defaultAgentsFile } from '../../src/agents/file-store.ts'

const agent = (id: string, command = id) => ({ id, label: id.toUpperCase(), command, args: [], badge: { letter: 'A', color: '#10a37f' } })

function memoryStore(initial: string | null = null): CatalogStore & { text: string | null; writes: number } {
  const store = {
    text: initial,
    writes: 0,
    read: async () => store.text,
    write: async (text: string) => { store.text = text; store.writes += 1 },
  }
  return store
}

describe('AgentCatalog', () => {
  it('adds, lists, resolves and removes, persisting each change', async () => {
    const store = memoryStore()
    const catalog = new AgentCatalog(store, () => true)
    await catalog.add(agent('one'))
    await catalog.add({ ...agent('two'), args: ['--x'] })
    expect(catalog.list().map(a => a.id)).toEqual(['one', 'two'])
    expect(catalog.resolve('two')).toEqual({ command: 'two', args: ['--x'] })
    expect(catalog.resolve('claude')).toBeUndefined()
    expect(catalog.resolve('nope')).toBeUndefined()
    await catalog.remove('one')
    await catalog.remove('one')
    expect(JSON.parse(store.text ?? '[]')).toHaveLength(1)
    const again = new AgentCatalog(store, () => true)
    await again.load()
    expect(again.list().map(a => a.id)).toEqual(['two'])
  })

  it('refuses duplicates, a command that is not on this machine, and too many agents, saving nothing', async () => {
    const store = memoryStore()
    const catalog = new AgentCatalog(store, command => command !== 'ghost')
    await catalog.add(agent('one'))
    await expect(catalog.add(agent('one'))).rejects.toThrow('already exists')
    await expect(catalog.add(agent('two', 'ghost'))).rejects.toThrow('not found on this machine')
    await expect(catalog.add({ ...agent('three'), command: 'sh -c x' })).rejects.toBeInstanceOf(AgentDefinitionError)
    expect(store.writes).toBe(1)
    for (let i = 1; i < MAX_CUSTOM_AGENTS; i += 1) await catalog.add(agent(`agent-${String(i).padStart(2, '0')}`))
    await expect(catalog.add(agent('overflow'))).rejects.toThrow('at most')
  })

  it('ignores a damaged file and keeps the good entries of a partly damaged one', async () => {
    const broken = new AgentCatalog(memoryStore('{not json'), () => true)
    await broken.load()
    expect(broken.list()).toEqual([])
    const partly = new AgentCatalog(memoryStore(JSON.stringify([agent('good'), { id: 'claude' }, { command: 'rm -rf /' }, agent('good')])), () => true)
    await partly.load()
    expect(partly.list().map(a => a.id)).toEqual(['good'])
  })
})

describe('file catalog store', () => {
  const dir = mkdtempSync(join(tmpdir(), 'acryl-agents-'))
  afterAll(() => { rmSync(dir, { recursive: true, force: true }) })

  it('reads nothing before the first save, then writes atomically and privately', async () => {
    const path = join(dir, 'nested', 'agents.json')
    const store = createFileCatalogStore(path)
    expect(await store.read()).toBeNull()
    await store.write('[]')
    expect(readFileSync(path, 'utf8')).toBe('[]')
    expect(statSync(path).mode & 0o077).toBe(0)
    expect(await store.read()).toBe('[]')
  })

  it('surfaces a read failure that is not "missing"', async () => {
    writeFileSync(join(dir, 'x'), '')
    await expect(createFileCatalogStore(join(dir, 'x', 'sub', 'a.json')).read()).rejects.toBeDefined()
    await expect(createFileCatalogStore(dir).read()).rejects.toBeDefined()
  })

  it('keeps the file in the ACRYL home, never anywhere a repository controls', () => {
    expect(defaultAgentsFile({ ACRYL_HOME: '/data/acryl' })).toBe('/data/acryl/workspace/agents.json')
    expect(defaultAgentsFile({})).toMatch(/\.acryl\/workspace\/agents\.json$/)
  })
})
