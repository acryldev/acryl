import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import {
  AcrAgentControlService,
  type AgentProvider,
  type AttachAgentRequest,
} from '../src/agent/agent-control.ts'
import { codexProvider } from '../src/agent/providers/codex.ts'
import { PROVIDER_CAPABILITIES } from '../src/agent/providers/capabilities.ts'

async function booted() {
  const ctx = new Context()
  const fiber = ctx.plugin(AcrAgentControlService)
  await fiber
  return { ctx, service: ctx.acrAgentControl, dispose: () => fiber.dispose() }
}

function request(overrides: Partial<AttachAgentRequest> = {}): AttachAgentRequest {
  return {
    workerId: 'worker-1',
    providerId: 'test',
    workspace: { identity: 'project', cwd: '/tmp/project' },
    capabilities: ['agent.start', 'agent.send', 'agent.cancel'],
    fidelity: 'structured',
    ...overrides,
  }
}

function provider(overrides: Partial<AgentProvider> = {}): AgentProvider {
  return {
    id: 'test',
    fidelity: 'structured',
    capabilities: ['agent.start', 'agent.send', 'agent.cancel'],
    async attach(req) {
      return Object.freeze({
        workerId: req.workerId,
        runtimeId: `runtime-${req.workerId}`,
        providerId: req.providerId,
        providerSessionRef: req.providerSessionRef ?? null,
        harnessSessionId: req.harnessSessionId ?? null,
        workspace: req.workspace,
        capabilities: Object.freeze([...req.capabilities]),
        fidelity: req.fidelity,
        status: 'idle',
      })
    },
    async execute(_binding, command) {
      return { kind: command.kind, payload: command.payload, ok: true }
    },
    ...overrides,
  }
}

describe('AcrAgentControl', () => {
  it('rejects commands the bound worker does not declare', async () => {
    const { ctx, service, dispose } = await booted()
    service.registerProvider(ctx, provider())
    await service.attach(request())

    await expect(service.dispatch('worker-1', { kind: 'stop', payload: null }))
      .rejects.toMatchObject({ code: 'capability-rejected' })
    await dispose()
  })

  it('separates worker, runtime, and provider-session identities', async () => {
    const { ctx, service, dispose } = await booted()
    service.registerProvider(ctx, provider())
    const first = await service.attach(request({ workerId: 'worker-1' }))
    const second = await service.attach(request({ workerId: 'worker-2' }))

    expect(first.runtimeId).not.toBe(second.runtimeId)
    expect(first.workerId).toBe('worker-1')
    expect(second.workerId).toBe('worker-2')

    // A duplicate runtime id claimed by another worker is rejected.
    const collision = provider({
      id: 'collision',
      async attach(req) {
        const base = await provider().attach(req)
        return { ...base, runtimeId: first.runtimeId }
      },
    })
    service.registerProvider(ctx, collision)
    await expect(service.attach(request({ providerId: 'collision', workerId: 'worker-3' })))
      .rejects.toMatchObject({ code: 'runtime-collision' })
    await dispose()
  })

  it('rejects a provider-session reference claimed by another provider', async () => {
    const { ctx, service, dispose } = await booted()
    service.registerProvider(ctx, provider())
    service.registerProvider(ctx, provider({ id: 'other', capabilities: ['agent.send'] }))
    await service.attach(request({ providerId: 'test', providerSessionRef: 'session-a' }))

    await expect(service.attach(request({
      providerId: 'other',
      workerId: 'worker-2',
      providerSessionRef: 'session-a',
      capabilities: ['agent.send'],
    }))).rejects.toMatchObject({ code: 'session-collision' })
    await dispose()
  })

  it('honours an aborted signal before dispatch', async () => {
    const { ctx, service, dispose } = await booted()
    service.registerProvider(ctx, provider())
    await service.attach(request())

    const controller = new AbortController()
    controller.abort()
    await expect(service.dispatch('worker-1', { kind: 'send', payload: 'x' }, controller.signal))
      .rejects.toMatchObject({ code: 'cancelled' })
    await dispose()
  })

  it('returns a structured result for a dispatched command', async () => {
    const { ctx, service, dispose } = await booted()
    service.registerProvider(ctx, provider())
    await service.attach(request())

    const receipt = await service.dispatch('worker-1', { kind: 'send', payload: { text: 'hi' } })
    expect(receipt.accepted).toBe(true)
    expect(receipt.kind).toBe('send')
    expect(receipt.runtimeId).toBe('runtime-worker-1')
    expect(receipt.result).toEqual({ kind: 'send', payload: { text: 'hi' }, ok: true })
    await dispose()
  })

  it('removes a provider when its owning fiber unloads', async () => {
    const { ctx, service, dispose } = await booted()
    const fiber = ctx.plugin({
      name: 'codex-provider',
      inject: ['acrAgentControl'],
      apply(child) {
        child.acrAgentControl.registerProvider(child, provider({ id: 'codex-extra' }))
      },
    })
    await fiber

    await service.attach(request({ providerId: 'codex-extra', workerId: 'worker-codex' }))
    await fiber.dispose()
    await expect(service.attach(request({ providerId: 'codex-extra', workerId: 'worker-x' })))
      .rejects.toMatchObject({ code: 'unknown-provider' })
    await dispose()
  })

  it('declares truthful capability profiles for the four provider kinds', () => {
    expect(PROVIDER_CAPABILITIES['dsh-native'].fidelity).toBe('native')
    expect(PROVIDER_CAPABILITIES['dsh-native'].capabilities).toContain('tool.calls')
    for (const kind of ['codex', 'claude', 'acp'] as const) {
      expect(PROVIDER_CAPABILITIES[kind].fidelity).toBe('structured')
      expect(PROVIDER_CAPABILITIES[kind].capabilities).toContain('agent.send')
    }
  })

  it('loads a real provider plugin and registers it with the service', async () => {
    const { ctx, service, dispose } = await booted()
    const fiber = ctx.plugin(codexProvider())
    await fiber

    const snapshot = await service.attach(request({
      providerId: 'codex',
      capabilities: ['agent.send'],
      fidelity: 'structured',
    }))
    expect(snapshot.providerId).toBe('codex')
    expect(snapshot.capabilities).toEqual(['agent.send'])

    // No transport wired: the worker has no live runtime, so dispatch is refused.
    await expect(service.dispatch('worker-1', { kind: 'send', payload: 'x' }))
      .rejects.toMatchObject({ code: 'unknown-worker' })
    await fiber.dispose()
    await dispose()
  })
})
