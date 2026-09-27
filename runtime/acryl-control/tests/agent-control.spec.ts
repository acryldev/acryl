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

  it('folds a lazy start result into the stored binding and releases it on stop', async () => {
    const { ctx, service, dispose } = await booted()
    const capabilities = ['agent.start', 'agent.send', 'agent.cancel', 'agent.stop', 'agent.resume'] as const
    const lazy = provider({
      capabilities: [...capabilities],
      async attach(req) {
        const base = await provider().attach(req)
        return Object.freeze({ ...base, runtimeId: null })
      },
      async execute(_binding, command) {
        if (command.kind === 'start' || command.kind === 'resume') {
          return { sessionId: 'session-1', runtimeId: 'runtime-lazy', status: 'idle' }
        }
        if (command.kind === 'stop') {
          return { stopped: true }
        }
        return { kind: command.kind, payload: command.payload, ok: true }
      },
    })
    service.registerProvider(ctx, lazy)
    const attached = await service.attach(request({ capabilities: [...capabilities] }))
    expect(attached.runtimeId).toBeNull()

    // Non-start commands still require a live runtime.
    await expect(service.dispatch('worker-1', { kind: 'send', payload: 'x' }))
      .rejects.toMatchObject({ code: 'unknown-worker' })

    const started = await service.dispatch('worker-1', { kind: 'start', payload: null })
    expect(started.runtimeId).toBe('runtime-lazy')

    const running = (await service.snapshot({ workerId: 'worker-1' }))[0]
    expect(running?.runtimeId).toBe('runtime-lazy')
    expect(running?.providerSessionRef).toBe('session-1')
    expect(running?.status).toBe('idle')

    const sent = await service.dispatch('worker-1', { kind: 'send', payload: 'hi' })
    expect(sent.runtimeId).toBe('runtime-lazy')

    const stopped = await service.dispatch('worker-1', { kind: 'stop', payload: null })
    expect(stopped.runtimeId).toBe('runtime-lazy')

    const after = (await service.snapshot({ workerId: 'worker-1' }))[0]
    expect(after?.runtimeId).toBeNull()
    expect(after?.status).toBe('stopped')

    // The released runtime lets the worker start again.
    const restarted = await service.dispatch('worker-1', { kind: 'resume', payload: null })
    expect(restarted.runtimeId).toBe('runtime-lazy')
    const resumed = (await service.snapshot({ workerId: 'worker-1' }))[0]
    expect(resumed?.runtimeId).toBe('runtime-lazy')
    await dispose()
  })

  it('rejects attach over a live binding and allows it after stop', async () => {
    const { ctx, service, dispose } = await booted()
    service.registerProvider(ctx, provider({
      capabilities: ['agent.start', 'agent.send', 'agent.cancel', 'agent.stop'],
    }))
    await service.attach(request({ capabilities: ['agent.start', 'agent.send', 'agent.cancel', 'agent.stop'] }))

    // A second attach for the same worker would orphan the live runtime.
    await expect(service.attach(request({ capabilities: ['agent.start', 'agent.send', 'agent.cancel', 'agent.stop'] })))
      .rejects.toMatchObject({ code: 'runtime-collision' })

    // After stop the binding is unbound, so re-attaching is fine.
    await service.dispatch('worker-1', { kind: 'stop', payload: null })
    const reattached = await service.attach(request({ capabilities: ['agent.start', 'agent.send', 'agent.cancel', 'agent.stop'] }))
    expect(reattached.workerId).toBe('worker-1')
    await dispose()
  })

  it('marks a provider\'s bindings stopped when the provider unregisters', async () => {
    const { ctx, service, dispose } = await booted()
    const fiber = ctx.plugin({
      name: 'ephemeral-provider',
      inject: ['acrAgentControl'],
      apply(child) {
        child.acrAgentControl.registerProvider(child, provider({ id: 'ephemeral' }))
      },
    })
    await fiber
    const attached = await service.attach(request({ providerId: 'ephemeral' }))
    expect(attached.runtimeId).toBe('runtime-worker-1')

    await fiber.dispose()

    const after = (await service.snapshot({ workerId: 'worker-1' }))[0]
    expect(after?.runtimeId).toBeNull()
    expect(after?.status).toBe('stopped')
    await dispose()
  })

  it('rejects a start result whose runtimeId is bound to another worker', async () => {
    const { ctx, service, dispose } = await booted()
    service.registerProvider(ctx, provider())
    await service.attach(request())

    const greedy = provider({
      id: 'greedy',
      capabilities: ['agent.start'],
      async attach(req) {
        const base = await provider().attach(req)
        return Object.freeze({ ...base, runtimeId: null })
      },
      async execute() {
        return { sessionId: 's-1', runtimeId: 'runtime-worker-1', status: 'idle' }
      },
    })
    service.registerProvider(ctx, greedy)
    await service.attach(request({
      providerId: 'greedy',
      workerId: 'worker-2',
      capabilities: ['agent.start'],
    }))

    await expect(service.dispatch('worker-2', { kind: 'start', payload: null }))
      .rejects.toMatchObject({ code: 'runtime-collision' })

    // The failed merge left worker-2's binding untouched.
    const binding = (await service.snapshot({ workerId: 'worker-2' }))[0]
    expect(binding?.runtimeId).toBeNull()
    await dispose()
  })

  it('permits stop on a never-bound worker so failed-start cleanup reaches the transport', async () => {
    const { ctx, service, dispose } = await booted()
    const commands: string[] = []
    const lazy = provider({
      capabilities: ['agent.start', 'agent.send', 'agent.stop'],
      async attach(req) {
        const base = await provider().attach(req)
        return Object.freeze({ ...base, runtimeId: null })
      },
      async execute(_binding, command) {
        commands.push(command.kind)
        if (command.kind === 'stop') return { stopped: true }
        return { kind: command.kind, payload: command.payload, ok: true }
      },
    })
    service.registerProvider(ctx, lazy)
    await service.attach(request({ capabilities: ['agent.start', 'agent.send', 'agent.stop'] }))

    // Commands that need a live runtime are still refused.
    await expect(service.dispatch('worker-1', { kind: 'send', payload: 'x' }))
      .rejects.toMatchObject({ code: 'unknown-worker' })
    await expect(service.dispatch('worker-1', { kind: 'cancel', payload: null }))
      .rejects.toMatchObject({ code: 'capability-rejected' })

    // Stop is dispatched anyway: it is the cleanup path after a start whose
    // result failed the merge, and must reach the transport.
    const receipt = await service.dispatch('worker-1', { kind: 'stop', payload: null })
    expect(receipt.accepted).toBe(true)
    expect(receipt.runtimeId).toBeNull()
    expect(commands).toEqual(['stop'])

    const after = (await service.snapshot({ workerId: 'worker-1' }))[0]
    expect(after?.runtimeId).toBeNull()
    expect(after?.status).toBe('stopped')
    await dispose()
  })

  it('rejects a contradictory stop result that reports a live status', async () => {
    const { ctx, service, dispose } = await booted()
    const liar = provider({
      capabilities: ['agent.start', 'agent.stop'],
      async execute(_binding, command) {
        if (command.kind === 'stop') {
          return { stopped: true, status: 'running' }
        }
        return { ok: true }
      },
    })
    service.registerProvider(ctx, liar)
    await service.attach(request({ capabilities: ['agent.start', 'agent.stop'] }))

    await expect(service.dispatch('worker-1', { kind: 'stop', payload: null }))
      .rejects.toMatchObject({ code: 'invalid-result' })

    // The binding still reports the live runtime honestly.
    const binding = (await service.snapshot({ workerId: 'worker-1' }))[0]
    expect(binding?.runtimeId).toBe('runtime-worker-1')
    await dispose()
  })

  it('rejects a start result that clears the runtime id', async () => {
    const { ctx, service, dispose } = await booted()
    const confused = provider({
      id: 'confused',
      capabilities: ['agent.start'],
      async attach(req) {
        const base = await provider().attach(req)
        return Object.freeze({ ...base, runtimeId: null })
      },
      async execute() {
        return { sessionId: 's-1', runtimeId: null, status: 'idle' }
      },
    })
    service.registerProvider(ctx, confused)
    await service.attach(request({ providerId: 'confused', capabilities: ['agent.start'] }))

    await expect(service.dispatch('worker-1', { kind: 'start', payload: null }))
      .rejects.toMatchObject({ code: 'invalid-result' })
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
