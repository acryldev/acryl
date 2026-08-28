import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createConnection } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PROFILE_BUNDLES, initProfile, resolveProfileDir } from '@deepseek-ai/dsh-app-boot'
const runtimeModule = 'acryl-harness-runtime'

interface HarnessRuntimeModule {
  bootAcrylHarnessProfile: (options: { profile: string }) => Promise<{ ctx: unknown; dispose(): Promise<void> }>
  createAcrylSessionBridge: (ctx: never, options: {
    profile: string
    generationId: string
    attachment: 'owner'
    cwd: string
  }) => { open(): Promise<string>; dispose(): Promise<void> }
  mountAcrylSessionControlEndpoint: (ctx: never, bridge: never, options: {
    address: string
    generationId: string
  }) => Promise<{
    endpoint: import('../src/contracts/control-protocol.ts').ControlEndpoint
    issueToken(attachment: 'owner' | 'attached'): string
    dispose(): Promise<void>
  }>
}

async function harnessRuntime(): Promise<HarnessRuntimeModule> {
  return await import(runtimeModule) as HarnessRuntimeModule
}
import { createAcrylEndpointSessionClient } from '../src/protocol/endpoint-client.ts'

const homes: string[] = []
const initialHome = process.env.DSH_HOME

async function boot() {
  process.env.DSH_HOME = await mkdtemp(join(tmpdir(), 'acryl-session-control-'))
  homes.push(process.env.DSH_HOME)
  const profile = 'acryl-test'
  const profileDirectory = resolveProfileDir(profile)
  initProfile(profileDirectory, DEFAULT_PROFILE_BUNDLES)
  await writeFile(join(profileDirectory, 'cordis.patch.yml'), '- id: hmr\n  disabled: true\n')
  const harness = await harnessRuntime()
  const runtime = await harness.bootAcrylHarnessProfile({ profile })
  const bridge = harness.createAcrylSessionBridge(runtime.ctx as never, {
    profile,
    generationId: 'generation-test',
    attachment: 'owner',
    cwd: process.cwd(),
  })
  const sessionId = await bridge.open()
  const endpoint = await harness.mountAcrylSessionControlEndpoint(runtime.ctx as never, bridge as never, {
    address: join(process.env.DSH_HOME, 'session-control.sock'),
    generationId: 'generation-test',
  })
  return {
    runtime,
    bridge,
    endpoint,
    sessionId,
    ownerToken: endpoint.issueToken('owner'),
    attachedToken: endpoint.issueToken('attached'),
  }
}

async function rawRequest(
  endpoint: import('../src/contracts/control-protocol.ts').ControlEndpoint,
  request: unknown,
): Promise<{ readonly ok: boolean; readonly error?: { readonly message?: string } }> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(endpoint.address)
    let buffer = ''
    socket.once('error', reject)
    socket.on('connect', () => socket.write(`${JSON.stringify(request)}\n`))
    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8')
      const newline = buffer.indexOf('\n')
      if (newline < 0) return
      socket.destroy()
      resolve(JSON.parse(buffer.slice(0, newline)))
    })
  })
}

afterEach(async () => {
  process.env.DSH_HOME = initialHome
  await Promise.all(homes.splice(0).map(home => rm(home, { force: true, recursive: true })))
})

describe('native session control endpoint', () => {
  it('serves durable snapshots over a fresh endpoint connection', async () => {
    const owned = await boot()
    try {
      const owner = createAcrylEndpointSessionClient(owned.endpoint.endpoint, 'generation-test', owned.ownerToken)
      await owner.submitPrompt({ sessionId: owned.sessionId, text: 'Persist over endpoint', clientCommandId: 'one' })
      const reconnected = createAcrylEndpointSessionClient(owned.endpoint.endpoint, 'generation-test', owned.ownerToken)
      await expect(reconnected.snapshot(owned.sessionId)).resolves.toMatchObject({
        profile: 'acryl-test',
        generationId: 'generation-test',
        attachment: 'owner',
        sessionId: owned.sessionId,
        transcript: [{ author: 'user', text: 'Persist over endpoint' }],
      })
    } finally {
      await owned.endpoint.dispose()
      await owned.bridge.dispose()
      await owned.runtime.dispose()
    }
  })

  it('polls snapshots for a subscription and releases it on disposal', async () => {
    const owned = await boot()
    try {
      const client = createAcrylEndpointSessionClient(owned.endpoint.endpoint, 'generation-test', owned.ownerToken)
      const updates: string[][] = []
      const subscription = await client.subscribe(owned.sessionId, snapshot => {
        updates.push(snapshot.transcript.map(item => item.text))
      })
      await client.submitPrompt({ sessionId: owned.sessionId, text: 'Subscription prompt', clientCommandId: 'sub' })
      await new Promise(resolve => setTimeout(resolve, 35))
      expect(updates.at(-1)).toEqual(['Subscription prompt'])

      await subscription.dispose()
      await owned.endpoint.dispose()
      await expect(client.snapshot(owned.sessionId)).rejects.toThrow()
    } finally {
      await owned.bridge.dispose()
      await owned.runtime.dispose()
    }
  })

  it('denies a forged owner attachment field presented with a read token', async () => {
    const owned = await boot()
    try {
      const response = await rawRequest(owned.endpoint.endpoint, {
        generationId: 'generation-test',
        operation: 'session.prompt.submit',
        payload: {
          token: owned.attachedToken,
          attachment: 'owner',
          sessionId: owned.sessionId,
          text: 'forged owner',
          clientCommandId: 'forged',
        },
      })

      expect(response.ok).toBe(false)
      expect(response.error?.message).toMatch(/read-only|credential/i)
    } finally {
      await owned.endpoint.dispose()
      await owned.bridge.dispose()
      await owned.runtime.dispose()
    }
  })

  it('reports one terminal polling error and suppresses callbacks after disposal', async () => {
    const owned = await boot()
    try {
      const client = createAcrylEndpointSessionClient(owned.endpoint.endpoint, 'generation-test', owned.ownerToken)
      const onSnapshot = vi.fn()
      const onError = vi.fn()
      const subscription = await client.subscribe(owned.sessionId, onSnapshot, onError)
      await owned.endpoint.dispose()

      await expect(subscription.whenError()).resolves.toBeInstanceOf(Error)
      expect(onError).toHaveBeenCalledTimes(1)
      const snapshotCalls = onSnapshot.mock.calls.length
      await new Promise(resolve => setTimeout(resolve, 60))
      expect(onError).toHaveBeenCalledTimes(1)
      expect(onSnapshot).toHaveBeenCalledTimes(snapshotCalls)

      await subscription.dispose()
    } finally {
      await owned.bridge.dispose()
      await owned.runtime.dispose()
    }
  })

  it('rejects an initially unreachable subscription', async () => {
    const owned = await boot()
    try {
      const client = createAcrylEndpointSessionClient(owned.endpoint.endpoint, 'generation-test', owned.ownerToken)
      await owned.endpoint.dispose()
      await expect(client.subscribe(owned.sessionId, () => undefined)).rejects.toThrow()
    } finally {
      await owned.bridge.dispose()
      await owned.runtime.dispose()
    }
  })

  it('rejects malformed commands and attached mutation', async () => {
    const owned = await boot()
    try {
      const attached = createAcrylEndpointSessionClient(owned.endpoint.endpoint, 'generation-test', owned.attachedToken)
      await expect(attached.submitPrompt({ sessionId: owned.sessionId, text: 'no', clientCommandId: 'two' }))
        .rejects.toThrow('read-only')
      await expect(attached.cancel({ sessionId: owned.sessionId })).rejects.toThrow('read-only')
      await expect(createAcrylEndpointSessionClient(owned.endpoint.endpoint, 'generation-test', owned.ownerToken)
        .submitPrompt({ sessionId: owned.sessionId, text: ' ', clientCommandId: 'three' }))
        .rejects.toThrow('must not be empty')
    } finally {
      await owned.endpoint.dispose()
      await owned.bridge.dispose()
      await owned.runtime.dispose()
    }
  })
})
