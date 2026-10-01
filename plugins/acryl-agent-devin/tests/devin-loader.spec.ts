/**
 * Real-Loader lifecycle verification for the `acryl-agent-devin` row —
 * devin-acp-integration story 14.
 *
 * Every case composes through `ctx.loader` (the Entry/EntryTree path a
 * profile's `cordis.patch.yml` insert drives), never bare `ctx.plugin`:
 * rows are created, updated, and removed by id exactly as the Loader applies
 * them. Module specifiers resolve through a `loader.internal.import` map —
 * the same seam `llm-retry`'s loader-composition spec uses — so the row's
 * `name` is the real package name while the module object is this source
 * tree's plugin namespace.
 *
 * The spawned `devin` binary is a shell wrapper that execs the stub ACP
 * server, so no real `devin` install, credentials, or network are needed.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { Loader } from '@deepseek-ai/cordis-plugin-loader'
import { type AgentCapability, type AttachAgentRequest } from 'acryl-control'
import * as acrylControlModule from 'acryl-control'
import { afterEach, describe, expect, it } from 'vitest'
import * as plugin from '../src/index.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const STUB_SERVER = join(__dirname, '../../../runtime/acryl-control/tests/stub-acp-server.mjs')

const STATES = ['PENDING', 'LOADING', 'ACTIVE', 'FAILED', 'UNLOADING', 'DISPOSED']
const stateOf = (fiber: { state: number | string } | undefined): string | undefined =>
  fiber === undefined
    ? undefined
    : (typeof fiber.state === 'number' ? STATES[fiber.state] : fiber.state) ?? String(fiber.state)

const ACP_WORKER_CAPABILITIES: readonly AgentCapability[] = Object.freeze([
  'agent.start', 'agent.send', 'agent.cancel', 'agent.stop', 'agent.resume',
])

const attachRequest = (workerId: string): AttachAgentRequest => ({
  workerId,
  providerId: 'acp',
  workspace: { identity: 'loader-test', cwd: '/tmp' },
  capabilities: ACP_WORKER_CAPABILITIES,
  fidelity: 'structured',
})

const temporaryDirs: string[] = []
const contexts: Context[] = []

afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const dir of temporaryDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** Shell wrapper that execs the stub ACP server for `devin acp <args>`. */
function createWrapperScript(env: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'devin-loader-test-'))
  temporaryDirs.push(dir)
  const wrapperPath = join(dir, 'devin-acp-wrapper')
  const exports = Object.entries(env)
    .map(([key, value]) => `export ${key}=${JSON.stringify(value)}`)
    .join('\n')
  writeFileSync(
    wrapperPath,
    `#!/bin/sh\n${exports}${exports === '' ? '' : '\n'}exec "${process.execPath}" "${STUB_SERVER}"\n`,
    { mode: 0o755 },
  )
  return wrapperPath
}

/** A second module that claims provider id `acp` — the duplicate-registration probe. */
const duplicateAcpModule = {
  name: 'acp-duplicate',
  inject: ['acrAgentControl'],
  apply(ctx: Context) {
    ctx.acrAgentControl.registerProvider(ctx, {
      id: 'acp',
      fidelity: 'structured',
      capabilities: Object.freeze([]),
      attach: () => Promise.reject(new Error('duplicate provider must never attach')),
      execute: () => Promise.reject(new Error('duplicate provider must never execute')),
    })
  },
}

/**
 * Boot a bare Cordis root with the real Loader. `internal.import` resolves
 * the three specifiers the rows use to in-process module objects, matching
 * the `llm-retry` loader-composition precedent.
 */
async function bootLoader(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(Loader)
  const modules = new Map<string, unknown>([
    ['acryl-control', acrylControlModule],
    ['acryl-agent-devin', plugin],
    ['acp-duplicate', duplicateAcpModule],
  ])
  ctx.loader.internal = {
    version: 'v2',
    import(specifier: string) {
      const mod = modules.get(specifier)
      if (mod === undefined) return Promise.reject(new Error(`unexpected Loader import: ${specifier}`))
      return Promise.resolve(mod)
    },
  } as unknown as NonNullable<Context['loader']['internal']>
  contexts.push(ctx)
  return ctx
}

const CONTROL_ROW = { id: 'acryl-control', name: 'acryl-control' }
const DEVIN_ROW = 'acryl-agent-devin'

function devinRow(config?: Record<string, unknown>) {
  return { id: DEVIN_ROW, name: 'acryl-agent-devin', ...(config === undefined ? {} : { config }) }
}

/** Poll until `process.kill(pid, 0)` settles the expected way. */
async function expectPidAlive(pid: number, alive: boolean): Promise<void> {
  for (let i = 0; i < 50; i++) {
    let running = true
    try {
      process.kill(pid, 0)
    } catch {
      running = false
    }
    if (running === alive) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  if (alive) expect(() => process.kill(pid, 0)).not.toThrow()
  else expect(() => process.kill(pid, 0)).toThrow()
}

describe('acryl-agent-devin row through the real Loader', () => {
  it('mounts the row and registers the acp provider', async () => {
    const ctx = await bootLoader()
    await ctx.loader.create(CONTROL_ROW)
    await ctx.loader.create(devinRow({ binaryPath: createWrapperScript(), cwd: '/tmp' }))
    await ctx.loader.await()

    expect(stateOf(ctx.loader.resolve(DEVIN_ROW).fiber)).toBe('ACTIVE')

    const binding = await ctx.acrAgentControl.attach(attachRequest('w-loader-1'))
    expect(binding.providerId).toBe('acp')
    expect(binding.runtimeId).toBeNull()
    expect(binding.fidelity).toBe('structured')
  })

  it('stays PENDING without the acryl-control row and activates when it mounts', async () => {
    const ctx = await bootLoader()
    await ctx.loader.create(devinRow({ binaryPath: createWrapperScript(), cwd: '/tmp' }))
    await ctx.loader.await()
    expect(stateOf(ctx.loader.resolve(DEVIN_ROW).fiber)).toBe('PENDING')

    await ctx.loader.create(CONTROL_ROW)
    await ctx.loader.await()
    expect(stateOf(ctx.loader.resolve(DEVIN_ROW).fiber)).toBe('ACTIVE')

    const binding = await ctx.acrAgentControl.attach(attachRequest('w-loader-2'))
    expect(binding.providerId).toBe('acp')
  })

  it('fails the row on invalid config before apply registers anything', async () => {
    const ctx = await bootLoader()
    await ctx.loader.create(CONTROL_ROW)
    await ctx.loader.await()

    const failedTransitions: number[] = []
    const off = ctx.on('internal/status', (fiber, _oldValue) => {
      failedTransitions.push(typeof fiber.state === 'number' ? fiber.state : -1)
    })
    try {
      await expect(
        ctx.loader.create(devinRow({ authMode: 'oauth-token' })),
      ).rejects.toThrow('failed to apply loader entry')
    } finally {
      off()
    }

    // The fiber reached FAILED on config validation, then the Loader disposed
    // and removed the entry — nothing was registered and nothing spawned.
    expect(failedTransitions).toContain(3)
    await expect(ctx.acrAgentControl.attach(attachRequest('w-badcfg')))
      .rejects.toMatchObject({ code: 'unknown-provider' })
  })

  it('removes the provider and kills the spawned process when the row unloads', async () => {
    const ctx = await bootLoader()
    await ctx.loader.create(CONTROL_ROW)
    await ctx.loader.create(devinRow({ binaryPath: createWrapperScript(), cwd: '/tmp' }))
    await ctx.loader.await()

    await ctx.acrAgentControl.attach(attachRequest('w-unload'))
    const started = await ctx.acrAgentControl.dispatch('w-unload', { kind: 'start', payload: null })
    const pid = parseInt(started.runtimeId ?? '0', 10)
    expect(pid).toBeGreaterThan(0)
    await expectPidAlive(pid, true)

    await ctx.loader.remove(DEVIN_ROW)

    // The row's disposer ran transport.dispose(): no orphan `devin acp`.
    await expectPidAlive(pid, false)
    await expect(ctx.acrAgentControl.attach(attachRequest('w-after-unload')))
      .rejects.toMatchObject({ code: 'unknown-provider' })
    // The orphaned binding is marked stopped and can no longer dispatch.
    const binding = (await ctx.acrAgentControl.snapshot({ workerId: 'w-unload' }))[0]
    expect(binding?.runtimeId).toBeNull()
    expect(binding?.status).toBe('stopped')
    await expect(ctx.acrAgentControl.dispatch('w-unload', { kind: 'send', payload: 'x' }))
      .rejects.toMatchObject({ code: 'unknown-provider' })
  })

  it('re-registers a fresh provider on remount with no stale references', async () => {
    const ctx = await bootLoader()
    await ctx.loader.create(CONTROL_ROW)
    await ctx.loader.create(devinRow({ binaryPath: createWrapperScript(), cwd: '/tmp' }))
    await ctx.loader.await()

    await ctx.acrAgentControl.attach(attachRequest('w-remount'))
    const started = await ctx.acrAgentControl.dispatch('w-remount', { kind: 'start', payload: null })
    const firstPid = parseInt(started.runtimeId ?? '0', 10)

    await ctx.loader.remove(DEVIN_ROW)
    await expectPidAlive(firstPid, false)

    // Remount: a fresh transport/provider instance registers under the same id.
    await ctx.loader.create(devinRow({ binaryPath: createWrapperScript(), cwd: '/tmp' }))
    await ctx.loader.await()
    expect(stateOf(ctx.loader.resolve(DEVIN_ROW).fiber)).toBe('ACTIVE')

    const binding = await ctx.acrAgentControl.attach(attachRequest('w-remount-2'))
    expect(binding.providerId).toBe('acp')
    const restarted = await ctx.acrAgentControl.dispatch('w-remount-2', { kind: 'start', payload: null })
    const secondPid = parseInt(restarted.runtimeId ?? '0', 10)
    expect(secondPid).toBeGreaterThan(0)
    expect(secondPid).not.toBe(firstPid)

    await ctx.acrAgentControl.dispatch('w-remount-2', { kind: 'stop', payload: null })
    await expectPidAlive(secondPid, false)
  })

  it('surfaces a duplicate acp provider registration as an entry failure', async () => {
    const ctx = await bootLoader()
    await ctx.loader.create(CONTROL_ROW)
    await ctx.loader.create(devinRow({ binaryPath: createWrapperScript(), cwd: '/tmp' }))
    await ctx.loader.await()

    const duplicateRow = { id: 'acp-duplicate', name: 'acp-duplicate' }
    await expect(
      ctx.loader.create(duplicateRow),
    ).rejects.toThrow('duplicate agent provider id')

    // The genuine provider is untouched.
    const binding = await ctx.acrAgentControl.attach(attachRequest('w-dup'))
    expect(binding.providerId).toBe('acp')
  })

  it('restarts cleanly on a config update with no duplicate provider or orphan process', async () => {
    const ctx = await bootLoader()
    await ctx.loader.create(CONTROL_ROW)
    await ctx.loader.create(devinRow({ binaryPath: createWrapperScript(), cwd: '/tmp', requestTimeoutMs: 5000 }))
    await ctx.loader.await()

    await ctx.acrAgentControl.attach(attachRequest('w-reload'))
    const started = await ctx.acrAgentControl.dispatch('w-reload', { kind: 'start', payload: null })
    const firstPid = parseInt(started.runtimeId ?? '0', 10)
    await expectPidAlive(firstPid, true)

    // A Loader config update is a dispose+restart of the plugin fiber — the
    // same teardown path HMR drives.
    await ctx.loader.resolve(DEVIN_ROW).update({ config: { binaryPath: createWrapperScript(), cwd: '/tmp', requestTimeoutMs: 9000 } })
    await ctx.loader.await()
    expect(stateOf(ctx.loader.resolve(DEVIN_ROW).fiber)).toBe('ACTIVE')

    // The restart disposed the old transport's child, and re-registration did
    // not collide (a duplicate id would have failed the new fiber).
    await expectPidAlive(firstPid, false)
    const restarted = await ctx.acrAgentControl.dispatch('w-reload', { kind: 'start', payload: null })
    const secondPid = parseInt(restarted.runtimeId ?? '0', 10)
    expect(secondPid).not.toBe(firstPid)
    await ctx.acrAgentControl.dispatch('w-reload', { kind: 'stop', payload: null })
    await expectPidAlive(secondPid, false)
  })

  it('rejects an attach that requests a capability the acp provider lacks', async () => {
    const ctx = await bootLoader()
    await ctx.loader.create(CONTROL_ROW)
    await ctx.loader.create(devinRow({ binaryPath: createWrapperScript(), cwd: '/tmp' }))
    await ctx.loader.await()

    await expect(ctx.acrAgentControl.attach({
      ...attachRequest('w-cap'),
      capabilities: [...ACP_WORKER_CAPABILITIES, 'approval.respond'],
    })).rejects.toMatchObject({ code: 'capability-rejected' })
  })

  it('binds distinct runtime identities to two workers', async () => {
    const ctx = await bootLoader()
    await ctx.loader.create(CONTROL_ROW)
    await ctx.loader.create(devinRow({ binaryPath: createWrapperScript(), cwd: '/tmp' }))
    await ctx.loader.await()

    await ctx.acrAgentControl.attach(attachRequest('w-id-a'))
    await ctx.acrAgentControl.attach(attachRequest('w-id-b'))
    const a = await ctx.acrAgentControl.dispatch('w-id-a', { kind: 'start', payload: null })
    const b = await ctx.acrAgentControl.dispatch('w-id-b', { kind: 'start', payload: null })
    expect(a.runtimeId).not.toBe(b.runtimeId)
    expect(a.runtimeId).toBeTruthy()
    expect(b.runtimeId).toBeTruthy()

    await ctx.acrAgentControl.dispatch('w-id-a', { kind: 'stop', payload: null })
    await ctx.acrAgentControl.dispatch('w-id-b', { kind: 'stop', payload: null })
  })
})
