/**
 * Real-engine proof of the Blank Blueprint (spec 036): a Web app and a CLI app booted with ACRYL_BLUEPRINT=acryl.blank carry
 * the stem-cell rows and none of the full product's, wear the configured brand, and can still grow themselves.
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { afterEach, describe, expect, it } from 'vitest'
import { createDshEngineDefinition, createWebEngineDefinition } from '../src/engine-dsh.ts'
import { createAcrylEngineHost } from '../src/engine-host.ts'

const STATES = ['PENDING', 'LOADING', 'ACTIVE', 'FAILED', 'UNLOADING', 'DISPOSED']
const homes: string[] = []
const saved = { home: process.env.DSH_HOME, blueprint: process.env.ACRYL_BLUEPRINT, name: process.env.ACRYL_BRAND_NAME, accent: process.env.ACRYL_BRAND_ACCENT }

function restore(key: keyof typeof saved, variable: string): void {
  if (saved[key] === undefined) delete process.env[variable]
  else process.env[variable] = saved[key]
}

afterEach(async () => {
  restore('home', 'DSH_HOME'); restore('blueprint', 'ACRYL_BLUEPRINT'); restore('name', 'ACRYL_BRAND_NAME'); restore('accent', 'ACRYL_BRAND_ACCENT')
  await Promise.all(homes.splice(0).map(home => rm(home, { force: true, recursive: true })))
})

async function freshHome(label: string): Promise<void> {
  const home = await mkdtemp(join(tmpdir(), `acryl-blank-${label}-`))
  homes.push(home)
  process.env.DSH_HOME = home
}

function rowIds(host: { ctx: { loader: { entries(): Iterable<{ options: { id?: string } }> } } }): string[] {
  return [...host.ctx.loader.entries()].map(entry => entry.options.id ?? '')
}

describe('blank blueprint on the Web engine', () => {
  it('composes the stem cell, wears the brand, and keeps the growth path open', async () => {
    await freshHome('web')
    process.env.ACRYL_BLUEPRINT = 'acryl.blank'
    process.env.ACRYL_BRAND_NAME = 'Orbit'
    process.env.ACRYL_BRAND_ACCENT = '#e8590c'
    const host = await createAcrylEngineHost({
      engines: [createWebEngineDefinition(new URL('../package.json', import.meta.url).href)],
      initialEngine: 'dsh',
      prepare: hostCtx => { provideCmdline(hostCtx, { args: ['--no-open', '--port', '0'], exit: () => {} }) },
    })
    try {
      const ids = rowIds(host)
      // The stem cell.
      expect(ids).toEqual(expect.arrayContaining(['brand', 'extension-context', 'acryl-system-prompt', '@acryl/ui', 'authorization']))
      // Nothing of the full product.
      for (const absent of ['acryl-workspace', 'acryl-plugin-admin', 'community-market', 'acryl-shortcuts', 'acryl-mount-anchors', 'ui-acryl']) {
        expect(ids, absent).not.toContain(absent)
      }
      // The stock brand is swapped out, not deleted (reversible): the row still exists and is disabled.
      const official = [...host.ctx.loader.entries()].find(entry => entry.options.id === 'ui-brand-official')
      expect(official?.options.disabled).toBe(true)

      const brand = host.ctx.get('acrylBrand' as never) as { identity: { name: string, accent: string } } | undefined
      expect(brand?.identity).toMatchObject({ name: 'Orbit', accent: '#e8590c' })

      const assembly = await host.ctx.get('systemPrompt')!.assemble()
      expect(JSON.stringify(assembly.sections)).toContain('inside Orbit')
      expect(assembly.tools.map(tool => tool.name)).toContain('acryl_install_plugin')

      // The failed-row check: every row the blueprint composed reached ACTIVE.
      const failed = [...host.ctx.loader.entries()].filter(entry => entry.fiber && STATES[entry.fiber.state as number] === 'FAILED').map(entry => entry.options.id)
      expect(failed).toEqual([])
    } finally {
      await host.dispose()
    }
  }, 90_000)

  it('a profile without a selected blueprint still composes the full product', async () => {
    await freshHome('web-full')
    delete process.env.ACRYL_BLUEPRINT
    delete process.env.ACRYL_BRAND_NAME
    delete process.env.ACRYL_BRAND_ACCENT
    const host = await createAcrylEngineHost({
      engines: [createWebEngineDefinition(new URL('../package.json', import.meta.url).href)],
      initialEngine: 'dsh',
      prepare: hostCtx => { provideCmdline(hostCtx, { args: ['--no-open', '--port', '0'], exit: () => {} }) },
    })
    try {
      expect(rowIds(host)).toEqual(expect.arrayContaining(['ui-acryl', 'community-market', 'acryl-workspace', 'acryl-plugin-admin', 'acryl-shortcuts', 'acryl-mount-anchors']))
    } finally {
      await host.dispose()
    }
  }, 90_000)
})

describe('blank blueprint on the CLI engine', () => {
  it('keeps the agent and the extension pack and nothing else of ACRYL\'s own rows', async () => {
    await freshHome('tui')
    process.env.ACRYL_BLUEPRINT = 'acryl.blank'
    const host = await createAcrylEngineHost({ engines: [createDshEngineDefinition('acryl-blank-test')], initialEngine: 'dsh' })
    try {
      const ids = rowIds(host)
      expect(ids).toEqual(expect.arrayContaining(['extension-context', 'acryl-system-prompt', 'authorization', 'agent-preset-registry']))
      expect(ids).not.toContain('brand')
      const assembly = await host.ctx.get('systemPrompt')!.assemble()
      expect(JSON.stringify(assembly.sections)).toContain('inside Blank')
      expect(assembly.tools.map(tool => tool.name)).toContain('acryl_install_plugin')
    } finally {
      await host.dispose()
    }
  }, 90_000)
})
