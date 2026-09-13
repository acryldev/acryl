/**
 * The host-neutral plugin lifecycle controller (spec 034, T005).
 *
 * Every assertion here is about lifecycle mechanics - resolution, cascade
 * order, persistence, rollback, Fiber settlement - against a real Cordis Loader
 * and real plugin modules. Host policy (which entries are mutable, how a bundle
 * is activated) is supplied by the test, because that is exactly the seam each
 * surface fills in.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { Loader } from '@deepseek-ai/cordis-plugin-loader'
import { afterEach, describe, expect, it } from 'vitest'
import { AcrPluginLifecycleController, PluginLifecycleError } from '../src/plugin/controller.ts'
import type { PluginLifecycleHost } from '../src/plugin/host.ts'
import { AcrPluginLifecycleService, type AcrPluginLifecycle } from '../src/plugin/provider.ts'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'acryl-plugin-lifecycle-'))
  roots.push(root)
  return root
}

/** A plugin module that appends mount/unmount lines, and can be made to fail. */
function pluginModule(logPath: string, flagPath: string, name: string): string {
  return [
    "import { appendFileSync, existsSync } from 'node:fs'",
    `const log = ${JSON.stringify(logPath)}`,
    `const flag = ${JSON.stringify(flagPath)}`,
    `export const name = ${JSON.stringify(name)}`,
    'export function apply(ctx) {',
    '  if (existsSync(flag)) throw new Error("boom")',
    "  appendFileSync(log, 'mount\\n')",
    "  ctx.effect(() => () => { appendFileSync(log, 'unmount\\n') })",
    '}',
    '',
  ].join('\n')
}

/** A plugin module that records one labelled line on mount and on unmount. */
function labelledModule(
  name: string,
  logPath: string,
  capability: { provides?: string, injects?: string } = {},
): string {
  const line = (text: string) =>
    `  appendFileSync(${JSON.stringify(logPath)}, ${JSON.stringify(`${text}\n`)})`
  return [
    "import { appendFileSync } from 'node:fs'",
    `export const name = ${JSON.stringify(name)}`,
    ...(capability.injects === undefined
      ? []
      : [`export const inject = [${JSON.stringify(capability.injects)}]`]),
    'export function apply(ctx) {',
    line(`${name}-mount`),
    '  ctx.effect(() => () => {',
    line(`${name}-unmount`),
    '  })',
    ...(capability.provides === undefined
      ? []
      : [`  ctx.provide(${JSON.stringify(capability.provides)}, { ok: true })`]),
    '}',
    '',
  ].join('\n')
}

function logLines(path: string): string[] {
  let source = ''
  try {
    source = readFileSync(path, 'utf8')
  } catch {
    return []
  }
  return source.trim().split('\n').filter(line => line.length > 0)
}

interface Harness {
  ctx: Context
  service: AcrPluginLifecycle
  controller: AcrPluginLifecycleController
  host: PluginLifecycleHost
  managedId: string
  otherId: string
  protectedId: string
  logPath: string
  flagPath: string
  persistence: { calls: Array<{ entryId: string, enabled: boolean }> }
}

async function harness(overrides: Partial<PluginLifecycleHost> = {}): Promise<Harness> {
  const root = temporaryRoot()
  const logPath = join(root, 'lifecycle.log')
  const flagPath = join(root, 'boom.flag')
  writeFileSync(join(root, 'plugin.mjs'), pluginModule(logPath, flagPath, 'test-plugin'))

  const ctx = new Context()
  await ctx.plugin(Loader, { baseUrl: `file://${root}/` })
  const managedId = await ctx.loader.create({ name: './plugin.mjs' })
  const otherId = await ctx.loader.create({ name: './plugin.mjs' })
  const protectedId = await ctx.loader.create({ name: './plugin.mjs' })
  await ctx.loader.await()

  const persistence = { calls: [] as Array<{ entryId: string, enabled: boolean }> }
  const mutable = new Set([managedId, otherId])
  const host: PluginLifecycleHost = {
    isMutable: entry => mutable.has(entry.entryId),
    async setEnabled(entryId, enabled) {
      persistence.calls.push({ entryId, enabled })
    },
    ...overrides,
  }
  const service = new AcrPluginLifecycleService(ctx, new AcrPluginLifecycleController(ctx, host))
  return {
    ctx,
    service,
    controller: service.controller,
    host,
    managedId,
    otherId,
    protectedId,
    logPath,
    flagPath,
    persistence,
  }
}

describe('AcrPluginLifecycleService', () => {
  it('projects enabled state, Fiber phase, and the host policy', async () => {
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
      dependents: [],
    }))
    expect(protectedEntry).toEqual(expect.objectContaining({
      mutable: false,
      protectedReason: expect.any(String),
    }))
  })

  it('disables and enables a managed entry with settled Fiber cleanup and persistence', async () => {
    const { service, managedId, logPath, persistence } = await harness()
    expect(logLines(logPath)).toHaveLength(3)

    const disabled = await service.setEnabled(managedId, false)
    expect(disabled.action).toBe('disable')
    expect(disabled.entryIds).toEqual([managedId])
    expect(disabled.snapshot.entries.find(entry => entry.entryId === managedId))
      .toEqual(expect.objectContaining({ enabled: false, hostPhase: null }))
    // Exactly one plugin unmounted: the target's Fiber settled before the
    // receipt returned.
    expect(logLines(logPath)).toEqual(['mount', 'mount', 'mount', 'unmount'])
    expect(persistence.calls).toEqual([{ entryId: managedId, enabled: false }])

    const enabled = await service.setEnabled(managedId, true)
    expect(enabled.action).toBe('enable')
    expect(enabled.snapshot.entries.find(entry => entry.entryId === managedId))
      .toEqual(expect.objectContaining({ enabled: true, hostPhase: 'active' }))
    expect(logLines(logPath)).toEqual(['mount', 'mount', 'mount', 'unmount', 'mount'])
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
    expect(logLines(logPath)).toEqual(['mount', 'mount', 'mount', 'unmount', 'mount'])
    expect(persistence.calls).toEqual([])
  })

  it('restarts every enabled mutable entry for reload-all by default', async () => {
    const h = await harness()
    await h.service.setEnabled(h.managedId, false)

    const receipt = await h.service.reload()
    expect(receipt.action).toBe('reload')
    // Only the still-enabled mutable entry restarts - not the protected one,
    // and not the disabled one.
    expect(receipt.entryIds).toEqual([h.otherId])
  })

  it('honours a host whose reload-all is deliberately narrower', async () => {
    const h = await harness()
    h.host.reloadAllEntryIds = () => new Set([h.managedId])

    const receipt = await h.service.reload()
    expect(receipt.entryIds).toEqual([h.managedId])
  })

  it('rejects mutation of a protected entry and of an unknown id', async () => {
    const { service, protectedId } = await harness()
    await expect(service.setEnabled(protectedId, false)).rejects.toMatchObject({
      code: 'protected-entry',
    })
    await expect(service.setEnabled('does-not-exist', false)).rejects.toMatchObject({
      code: 'unknown-entry',
    })
  })

  it('rejects a repeated enable or disable before touching persistence', async () => {
    const h = await harness()
    await expect(h.service.setEnabled(h.managedId, true)).rejects.toMatchObject({
      code: 'already-enabled',
    })
    await h.service.setEnabled(h.managedId, false)
    h.persistence.calls.length = 0
    await expect(h.service.setEnabled(h.managedId, false)).rejects.toMatchObject({
      code: 'already-disabled',
    })
    expect(h.persistence.calls).toEqual([])
  })

  it('rolls back persistence when re-activation fails', async () => {
    const h = await harness()
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

describe('AcrPluginLifecycleController and mutable dependents', () => {
  interface Dependents {
    ctx: Context
    controller: AcrPluginLifecycleController
    providerId: string
    consumerId: string
    logPath: string
  }

  async function dependentHarness(): Promise<Dependents> {
    const root = temporaryRoot()
    const logPath = join(root, 'dependents.log')
    writeFileSync(join(root, 'provider.mjs'), labelledModule('provider', logPath, { provides: 'dep-service' }))
    writeFileSync(join(root, 'consumer.mjs'), labelledModule('consumer', logPath, { injects: 'dep-service' }))
    writeFileSync(join(root, 'unrelated.mjs'), labelledModule('unrelated', logPath))

    const ctx = new Context()
    await ctx.plugin(Loader, { baseUrl: `file://${root}/` })
    const providerId = await ctx.loader.create({ name: './provider.mjs' })
    const consumerId = await ctx.loader.create({ name: './consumer.mjs' })
    await ctx.loader.create({ name: './unrelated.mjs' })
    await ctx.loader.await()

    const host: PluginLifecycleHost = { isMutable: () => true, async setEnabled() {} }
    return { ctx, controller: new AcrPluginLifecycleController(ctx, host), providerId, consumerId, logPath }
  }

  it('projects a provider\'s transitive mutable dependents', async () => {
    const h = await dependentHarness()
    const view = h.controller.snapshot().entries.find(entry => entry.entryId === h.providerId)
    expect(view?.dependents).toEqual([h.consumerId])
  })

  it('disables a provider\'s dependents with it, consumer before provider', async () => {
    const h = await dependentHarness()
    const receipt = await h.controller.setEnabled(h.providerId, false)

    expect(receipt.entryIds).toEqual([h.consumerId, h.providerId])
    const lines = logLines(h.logPath)
    // The consumer unmounted before its provider, so no plugin is ever left
    // mounted against a service that went away.
    expect(lines.indexOf('consumer-unmount')).toBeGreaterThan(-1)
    expect(lines.indexOf('consumer-unmount')).toBeLessThan(lines.indexOf('provider-unmount'))
    // An unrelated plugin keeps running.
    expect(lines).not.toContain('unrelated-unmount')
    expect(h.controller.snapshot().entries.find(entry => entry.entryId === h.consumerId))
      .toEqual(expect.objectContaining({ enabled: false }))
  })
})

describe('AcrPluginLifecycleController bundle activation', () => {
  async function activationHarness(
    overrides: Partial<PluginLifecycleHost> = {},
    withBundleRow = true,
  ) {
    const root = temporaryRoot()
    const logPath = join(root, 'activation.log')
    writeFileSync(join(root, 'editor.mjs'), labelledModule('editor', logPath))

    const ctx = new Context()
    await ctx.plugin(Loader, { baseUrl: `file://${root}/` })
    await ctx.loader.await()

    const host: PluginLifecycleHost = {
      isMutable: () => true,
      async setEnabled() {},
      ...(withBundleRow
        ? {
            bundleRow: (packageName: string) => {
              if (packageName !== 'acryl-dsh-editor-plugin') {
                throw new PluginLifecycleError('protected-entry', `not a bundle: ${packageName}`)
              }
              return { id: 'dsh-editor', name: './editor.mjs' }
            },
          }
        : {}),
      ...overrides,
    }
    return { ctx, controller: new AcrPluginLifecycleController(ctx, host), logPath }
  }

  it('mounts a just-installed bundle row into the running tree, then unmounts it', async () => {
    const h = await activationHarness()
    expect(h.controller.snapshot().entries.some(entry => entry.entryId === 'dsh-editor')).toBe(false)

    const activated = await h.controller.activate('acryl-dsh-editor-plugin')
    expect(activated.action).toBe('enable')
    expect(activated.entryIds).toEqual(['dsh-editor'])
    expect(h.controller.snapshot().entries.find(entry => entry.entryId === 'dsh-editor'))
      .toEqual(expect.objectContaining({ enabled: true, hostPhase: 'active', mutable: true }))

    // Idempotent: a package already mounted reports its current state.
    await expect(h.controller.activate('acryl-dsh-editor-plugin')).resolves.toEqual(
      expect.objectContaining({ action: 'enable', entryIds: ['dsh-editor'] }),
    )

    await h.controller.deactivate('acryl-dsh-editor-plugin')
    expect(h.controller.snapshot().entries.some(entry => entry.entryId === 'dsh-editor')).toBe(false)
    // Mounted once: the second activate was idempotent, not a second row.
    expect(logLines(h.logPath)).toEqual(['editor-mount', 'editor-unmount'])
    // A second uninstall is a no-op, not an error.
    await expect(h.controller.deactivate('acryl-dsh-editor-plugin')).resolves.toEqual(
      expect.objectContaining({ action: 'disable', entryIds: [] }),
    )
  })

  it('refuses to activate a package the host does not call a profile bundle', async () => {
    const h = await activationHarness()
    await expect(h.controller.activate('some-unrelated-package'))
      .rejects.toMatchObject({ code: 'protected-entry' })
  })

  it('refuses to activate when the host has no bundle concept at all', async () => {
    const h = await activationHarness({}, false)
    await expect(h.controller.activate('acryl-dsh-editor-plugin'))
      .rejects.toMatchObject({ code: 'protected-entry' })
  })

  it('runs host cleanup on uninstall and never fails the uninstall when it throws', async () => {
    const cleaned: string[] = []
    const warnings: string[] = []
    const h = await activationHarness({
      async afterDeactivate(packageName) {
        cleaned.push(packageName)
        throw new Error('bookkeeping exploded')
      },
      warn: message => warnings.push(message),
    })
    await h.controller.activate('acryl-dsh-editor-plugin')

    await expect(h.controller.deactivate('acryl-dsh-editor-plugin')).resolves.toEqual(
      expect.objectContaining({ action: 'disable', entryIds: ['dsh-editor'] }),
    )
    // Cleanup runs for a package that was never mounted too: a package that has
    // left the profile has nothing left to be disabled.
    await h.controller.deactivate('acryl-dsh-editor-plugin')
    expect(cleaned).toEqual(['acryl-dsh-editor-plugin', 'acryl-dsh-editor-plugin'])
    expect(warnings).toHaveLength(2)
    expect(warnings[0]).toContain('bookkeeping exploded')
  })
})

describe('AcrPluginLifecycleController package-name operations', () => {
  it('toggles and reports a mounted entry by package name, idempotently', async () => {
    const h = await harness()
    expect(h.controller.statusOfPackage('./plugin.mjs')).toBe('active')
    expect(h.controller.statusOfPackage('not-a-mounted-package')).toBeUndefined()

    await expect(h.controller.setEnabledByPackageName('./plugin.mjs', false)).resolves.toBe(true)
    expect(h.controller.statusOfPackage('./plugin.mjs')).toBe('disabled')
    // Idempotent against a state that already matches: the caller's own view of
    // "current status" may be the exact stale read this bridge corrects.
    await expect(h.controller.setEnabledByPackageName('./plugin.mjs', false)).resolves.toBe(true)
    await expect(h.controller.setEnabledByPackageName('./plugin.mjs', true)).resolves.toBe(true)

    // No live entry for this package: the caller falls back to its own state.
    await expect(h.controller.setEnabledByPackageName('not-a-mounted-package', false)).resolves.toBe(false)
  })

  it('is a no-op when reloading by the name of a package that is not mounted', async () => {
    const h = await harness()
    await expect(h.controller.reloadByPackage('not-a-mounted-package')).resolves.toEqual(
      expect.objectContaining({ action: 'reload', entryIds: [] }),
    )
  })
})
