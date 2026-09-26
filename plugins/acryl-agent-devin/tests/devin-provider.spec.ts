import { Context } from '@deepseek-ai/cordis'
import { AcrAgentControlService } from 'acryl-control'
import { describe, expect, it } from 'vitest'
import * as plugin from '../src/index.ts'

const STATES = ['PENDING', 'LOADING', 'ACTIVE', 'FAILED', 'UNLOADING', 'DISPOSED']
const stateOf = (fiber: { state: number | string }): string =>
  (typeof fiber.state === 'number' ? STATES[fiber.state] : fiber.state) ?? String(fiber.state)
const settle = () => new Promise(resolve => setTimeout(resolve, 50))

const attachRequest = {
  workerId: 'worker-devin',
  providerId: 'acp',
  workspace: { identity: 'project', cwd: '/tmp/project' },
  capabilities: ['agent.start', 'agent.send', 'agent.stop'] as const,
  fidelity: 'structured' as const,
}

describe('acryl-agent-devin', () => {
  it('rejects an invalid authMode in Config', () => {
    expect(() => plugin.Config({ authMode: 'oauth-token' } as never)).toThrow()
  })

  it('rejects an invalid permissionMode in Config', () => {
    expect(() => plugin.Config({ permissionMode: 'yolo' } as never)).toThrow()
  })

  it('applies documented defaults for a valid empty config', () => {
    expect(plugin.Config({})).toMatchObject({ authMode: 'devin-auth', permissionMode: 'normal' })
  })

  it('registers provider acp through ctx.plugin once acrAgentControl mounts', async () => {
    const ctx = new Context()
    const serviceFiber = ctx.plugin(AcrAgentControlService)
    await serviceFiber

    const fiber = ctx.plugin(plugin)
    await fiber
    expect(stateOf(fiber)).toBe('ACTIVE')

    const snapshot = await ctx.acrAgentControl.attach(attachRequest)
    expect(snapshot.providerId).toBe('acp')
    expect(snapshot.runtimeId).toBeNull()
    expect(snapshot.fidelity).toBe('structured')
    await serviceFiber.dispose()
  })

  it('stays PENDING without acrAgentControl and ACTIVATES when it mounts', async () => {
    const ctx = new Context()
    const fiber = ctx.plugin(plugin) as { state: number }
    await settle()
    expect(stateOf(fiber)).toBe('PENDING')

    const serviceFiber = ctx.plugin(AcrAgentControlService)
    await serviceFiber
    await settle()
    expect(stateOf(fiber)).toBe('ACTIVE')

    const snapshot = await ctx.acrAgentControl.attach(attachRequest)
    expect(snapshot.providerId).toBe('acp')
    await serviceFiber.dispose()
  })

  it('removes the provider when the plugin fiber is disposed', async () => {
    const ctx = new Context()
    const serviceFiber = ctx.plugin(AcrAgentControlService)
    await serviceFiber

    const fiber = ctx.plugin(plugin)
    await fiber
    await ctx.acrAgentControl.attach(attachRequest)

    await fiber.dispose()
    await expect(ctx.acrAgentControl.attach({ ...attachRequest, workerId: 'worker-2' }))
      .rejects.toMatchObject({ code: 'unknown-provider' })
    await serviceFiber.dispose()
  })
})
