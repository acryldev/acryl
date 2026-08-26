import { Context } from '@deepseek-ai/cordis'
import { Loader } from '@deepseek-ai/cordis-plugin-loader'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  AcrPluginLifecycleService,
  type AcrPluginLifecycle,
  type AcrPluginLifecycleBootstrap,
} from '../src/lifecycle/provider.ts'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

interface Harness {
  ctx: Context
  service: AcrPluginLifecycle
  managedId: string
  protectedId: string
  logPath: string
  flagPath: string
  persistence: { calls: Array<{ entryId: string; enabled: boolean }> }
  loadModule(): Promise<void>
}

const DEFAULT_SOURCE = [
  "import { appendFileSync } from 'node:fs'",
  'const log = __LOG__',
  'export const name = "test-plugin"',
  "export function apply(ctx) { appendFileSync(log, 'mount\\n'); ctx.effect(() => () => { appendFileSync(log, 'unmount\\n') }) }",
  '',
].join('\n')

async function harness(pluginSource: string = DEFAULT_SOURCE): Promise<Harness> {
  const root = mkdtempSync(join(tmpdir(), 'acryl-lifecycle-'))
  roots.push(root)
  const logPath = join(root, 'lifecycle.log')
  const flagPath = join(root, 'boom.flag')
  writeFileSync(join(root, 'plugin.mjs'), pluginSource
    .replace('__LOG__', JSON.stringify(logPath))
    .replace('__FLAG__', JSON.stringify(flagPath)))

  const ctx = new Context()
  await ctx.plugin(Loader, { baseUrl: `file://${root}/` })
  const managedId = await ctx.loader.create({ name: './plugin.mjs' })
  const protectedId = await ctx.loader.create({ name: './plugin.mjs' })
  await ctx.loader.await()

  const persistence = { calls: [] as Array<{ entryId: string; enabled: boolean }> }
  const bootstrap: AcrPluginLifecycleBootstrap = {
    mutableEntries: {
      [managedId]: { entryId: managedId, moduleName: './plugin.mjs' },
    },
    persistence: {
      async setEnabled(entryId: string, enabled: boolean) {
        persistence.calls.push({ entryId, enabled })
      },
    },
  }
  const fiber = ctx.plugin(AcrPluginLifecycleService, bootstrap)
  await fiber
  return {
    ctx,
    service: ctx.acrPluginLifecycle,
    managedId,
    protectedId,
    logPath,
    flagPath,
    persistence,
    loadModule: () => ctx.loader.await(),
  }
}

function lines(path: string): string[] {
  return readFileSync(path, 'utf8').trim().split('\n')
}

describe('AcrPluginLifecycleService', () => {
  it('projects enabled state, phase, and mutation policy', async () => {
    const { service, managedId, protectedId } = await harness()
    const snapshot = service.snapshot()
    const managed = snapshot.entries.find(entry => entry.entryId === managedId)
    const protectedEntry = snapshot.entries.find(entry => entry.entryId === protectedId)

    expect(managed).toEqual(expect.objectContaining({
      moduleName: './plugin.mjs',
      enabled: true,
      hostPhase: 'active',
      mutable: true,
      protectedReason: null,
    }))
    expect(protectedEntry).toEqual(expect.objectContaining({
      mutable: false,
      protectedReason: expect.any(String),
    }))
  })

  it('disables and enables a managed entry with settled Fiber cleanup and persistence', async () => {
    const { service, managedId, logPath, persistence } = await harness()

    const disabled = await service.setEnabled(managedId, false)
    expect(disabled.action).toBe('disable')
    expect(disabled.entryIds).toEqual([managedId])
    expect(disabled.snapshot.entries.find(entry => entry.entryId === managedId))
      .toEqual(expect.objectContaining({ enabled: false, hostPhase: null }))
    expect(lines(logPath)).toEqual(['mount', 'mount', 'unmount'])
    expect(persistence.calls).toEqual([{ entryId: managedId, enabled: false }])

    const enabled = await service.setEnabled(managedId, true)
    expect(enabled.action).toBe('enable')
    expect(enabled.snapshot.entries.find(entry => entry.entryId === managedId))
      .toEqual(expect.objectContaining({ enabled: true, hostPhase: 'active' }))
    expect(lines(logPath)).toEqual(['mount', 'mount', 'unmount', 'mount'])
    expect(persistence.calls).toEqual([
      { entryId: managedId, enabled: false },
      { entryId: managedId, enabled: true },
    ])
  })

  it('reloads through Fiber restart without changing persistence', async () => {
    const { service, managedId, logPath, persistence } = await harness()

    const receipt = await service.reload(managedId)
    expect(receipt.action).toBe('reload')
    expect(receipt.entryIds).toEqual([managedId])
    expect(lines(logPath)).toEqual(['mount', 'mount', 'unmount', 'mount'])
    expect(persistence.calls).toEqual([])
  })

  it('rejects mutation of a protected entry', async () => {
    const { service, protectedId } = await harness()
    await expect(service.setEnabled(protectedId, false)).rejects.toMatchObject({
      code: 'protected-entry',
    })
  })

  it('rejects unknown entries', async () => {
    const { service } = await harness()
    await expect(service.setEnabled('does-not-exist', false)).rejects.toMatchObject({
      code: 'unknown-entry',
    })
  })

  it('rolls back persistence when re-activation fails', async () => {
    const source = [
      "import { appendFileSync, existsSync } from 'node:fs'",
      'const log = __LOG__',
      'const flag = __FLAG__',
      'export const name = "test-plugin"',
      'export function apply(ctx) {',
      '  if (existsSync(flag)) throw new Error("boom")',
      "  appendFileSync(log, 'mount\\n')",
      "  ctx.effect(() => () => { appendFileSync(log, 'unmount\\n') })",
      '}',
      '',
    ].join('\n')
    const h = await harness(source)

    await h.service.setEnabled(h.managedId, false)
    writeFileSync(h.flagPath, '')
    h.persistence.calls.length = 0

    await expect(h.service.setEnabled(h.managedId, true)).rejects.toMatchObject({
      code: 'lifecycle-failed',
    })
    // The controller attempted the enable, then restored the prior persisted state.
    expect(h.persistence.calls).toEqual([
      { entryId: h.managedId, enabled: true },
      { entryId: h.managedId, enabled: false },
    ])
  })
})
