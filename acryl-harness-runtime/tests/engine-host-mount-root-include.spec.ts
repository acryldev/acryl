/**
 * Spike (spec 028 Phase 2 reconciliation, 2026-09-11): proves `mountRootInclude`
 * can compose a full profile-shaped Include tree *inside* one engine row of
 * `createAcrylEngineHost`, instead of the second Cordis root
 * `bootAcrylHarnessProfile`/`boot()` would create. This is the primitive the
 * real `dsh` engine plugin extraction depends on - verified here with a real
 * Loader activation before it is trusted in the extraction itself.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { mountRootInclude } from '@deepseek-ai/dsh-app-boot'
import { afterEach, describe, expect, it } from 'vitest'
import { createAcrylEngineHost, type AcrylEngineDefinition } from '../src/engine-host.ts'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

/** A minimal profile: one noop plugin, mounted through a real `cordis.yml`. */
function profileFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'acryl-engine-mount-root-include-'))
  roots.push(dir)
  writeFileSync(join(dir, 'noop.mjs'), [
    "import { appendFileSync } from 'node:fs'",
    'export const name = "noop"',
    `export function apply(ctx) { appendFileSync(${JSON.stringify(join(dir, 'log.txt'))}, 'mount\\n'); ctx.effect(() => () => { appendFileSync(${JSON.stringify(join(dir, 'log.txt'))}, 'unmount\\n') }) }`,
    '',
  ].join('\n'))
  writeFileSync(join(dir, 'cordis.yml'), '- id: noop\n  name: ./noop.mjs\n')
  return dir
}

function lines(dir: string): string[] {
  try {
    return readFileSync(join(dir, 'log.txt'), 'utf8').trim().split('\n')
  } catch {
    return []
  }
}

function mountedEngine(configPath: string): AcrylEngineDefinition {
  return {
    id: 'dsh',
    plugin: async (ctx: Context) => {
      ctx.baseUrl = pathToFileURL(dirname(configPath)).href + '/'
      const entry = await mountRootInclude(ctx, configPath)
      // mountRootInclude creates its Include row at the Loader's own top
      // level (it has no `parent` parameter) - it is not automatically
      // scoped to this plugin's own fiber the way ctx.effect() resources
      // are, so this engine plugin must own and remove it explicitly.
      if (entry !== undefined) {
        ctx.effect(() => () => { void ctx.loader.remove(entry.options.id) })
      }
    },
  }
}

describe('mountRootInclude nested inside one acryl-engine row', () => {
  it('composes a profile-shaped Include tree as a child of the engine row, not a second root', async () => {
    const dir = profileFixture()
    const host = await createAcrylEngineHost({
      engines: [mountedEngine(join(dir, 'cordis.yml'))],
      initialEngine: 'dsh',
    })
    try {
      const entries = [...host.ctx.loader.entries()]
      const noop = entries.find(entry => entry.options.name === './noop.mjs')
      expect(noop?.fiber).toBeDefined()
      expect(lines(dir)).toEqual(['mount'])
    } finally {
      await host.dispose()
    }
    expect(lines(dir)).toEqual(['mount', 'unmount'])
  })

  it('tears down the nested Include tree when the engine row is swapped away', async () => {
    const dir = profileFixture()
    const host = await createAcrylEngineHost({
      engines: [
        mountedEngine(join(dir, 'cordis.yml')),
        { id: 'other', plugin: () => {} },
      ],
      initialEngine: 'dsh',
    })
    try {
      expect(lines(dir)).toEqual(['mount'])
      await host.select('other')
      expect(lines(dir)).toEqual(['mount', 'unmount'])
    } finally {
      await host.dispose()
    }
  })

  it('re-mounts cleanly after swapping away and back - no builtins.include collision', async () => {
    const dir = profileFixture()
    const host = await createAcrylEngineHost({
      engines: [
        mountedEngine(join(dir, 'cordis.yml')),
        { id: 'other', plugin: () => {} },
      ],
      initialEngine: 'dsh',
    })
    try {
      await host.select('other')
      await host.select('dsh')
      const entries = [...host.ctx.loader.entries()]
      const noop = entries.find(entry => entry.options.name === './noop.mjs')
      expect(noop?.fiber).toBeDefined()
      expect(lines(dir)).toEqual(['mount', 'unmount', 'mount'])
    } finally {
      await host.dispose()
    }
  })
})
