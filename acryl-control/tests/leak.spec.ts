import { Context } from '@deepseek-ai/cordis'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  AcrAgentControlService,
  type AgentProvider,
  type AttachAgentRequest,
} from '../src/agent/agent-control.ts'
import {
  AcrProfileOwnershipService,
  type AcrProfileOwnershipBootstrap,
} from '../src/ownership/lease-provider.ts'
import {
  AcrControlProtocolService,
  type AcrControlProtocolBootstrap,
} from '../src/protocol/service.ts'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, {
    force: true,
    recursive: true,
  })))
})

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'acryl-leak-'))
  temporaryDirectories.push(directory)
  return directory
}

function ownershipBootstrap(stateDirectory: string, hostId: string): AcrProfileOwnershipBootstrap {
  return {
    stateDirectory,
    request: {
      profileKey: 'desktop',
      host: {
        hostId,
        kind: 'tui',
        generationId: `generation-${hostId}`,
        pid: process.pid,
        startedAt: '2026-08-26T00:00:00.000Z',
        protocolVersion: 1,
        status: 'ready',
      },
      endpoint: { kind: 'unix', address: `/tmp/${hostId}.sock`, protocolVersion: 1 },
    },
  }
}

function provider(id: string): AgentProvider {
  return {
    id,
    fidelity: 'structured',
    capabilities: ['agent.send'],
    async attach(req: AttachAgentRequest) {
      return Object.freeze({
        workerId: req.workerId,
        runtimeId: `runtime-${id}`,
        providerId: req.providerId,
        providerSessionRef: null,
        harnessSessionId: null,
        workspace: req.workspace,
        capabilities: Object.freeze([...req.capabilities]),
        fidelity: req.fidelity,
        status: 'idle',
      })
    },
    async execute() {
      return { ok: true }
    },
  }
}

function resourceCount(type: string): number {
  return process.getActiveResourcesInfo().filter(resource => resource === type).length
}

function controlBootstrap(address: string): AcrControlProtocolBootstrap {
  return {
    endpoint: { kind: 'unix', address, protocolVersion: 1 },
    generationId: 'generation-1',
    capabilities: ['host.status'],
    handle: async () => ({ ok: true }),
  }
}

describe('ACRYL service leak behavior', () => {
  it('returns the state directory to baseline after 20 ownership acquire/release cycles', async () => {
    const stateDirectory = await temporaryDirectory()
    for (let i = 0; i < 20; i++) {
      const ctx = new Context()
      const fiber = ctx.plugin(AcrProfileOwnershipService, ownershipBootstrap(stateDirectory, `host-${i}`))
      await fiber
      expect(ctx.acrProfileOwnership.current.kind).toBe('owned')
      await fiber.dispose()
    }
    const entries = (await readdir(stateDirectory)).filter(name => name.endsWith('.lease'))
    expect(entries).toEqual([])
  })

  it('returns the provider registry to baseline after 20 mount/unmount cycles', async () => {
    const ctx = new Context()
    const fiber = ctx.plugin(AcrAgentControlService)
    await fiber
    const service = ctx.acrAgentControl

    const providers = []
    for (let i = 0; i < 20; i++) {
      const child = ctx.plugin({
        name: `provider-${i}`,
        inject: ['acrAgentControl'],
        apply(scope) {
          scope.acrAgentControl.registerProvider(scope, provider(`p${i}`))
        },
      })
      await child
      providers.push(child)
    }
    for (const child of providers) await child.dispose()

    // Every registration disappeared; no stale provider survives any cycle.
    for (let i = 0; i < 20; i++) {
      await expect(service.attach({
        workerId: `worker-${i}`,
        providerId: `p${i}`,
        workspace: null,
        capabilities: ['agent.send'],
        fidelity: 'structured',
      })).rejects.toMatchObject({ code: 'unknown-provider' })
    }
    await expect(service.snapshot()).resolves.toEqual([])
    await fiber.dispose()
  })

  it('returns listening sockets to baseline after 20 endpoint mount/unmount cycles', async () => {
    const before = resourceCount('TCPServerWrap')
    for (let i = 0; i < 20; i++) {
      const address = await temporaryDirectory().then(dir => join(dir, 'control.sock'))
      const ctx = new Context()
      const fiber = ctx.plugin(AcrControlProtocolService, controlBootstrap(address))
      await fiber
      await fiber.dispose()
    }
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(resourceCount('TCPServerWrap')).toBe(before)
  })
})
