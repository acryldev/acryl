/**
 * Gated smoke against the real `devin acp` binary (devin-acp-integration
 * story 14). Skipped unless `DEVIN_ACP_SMOKE=1` — the suite needs a real
 * Devin CLI install on PATH (or `DEVIN_ACP_BINARY` pointing at it) and valid
 * credentials (`devin auth login`, or `WINDSURF_API_KEY` for windsurf-key
 * auth). Everything else in this package runs against the stub server.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import {
  AcrAgentControlService,
  type AgentCapability,
  type AttachAgentRequest,
} from '../src/agent/agent-control.ts'
import { acpProvider } from '../src/agent/providers/acp.ts'
import { devinAcpTransport } from '../src/agent/transports/devin-acp.ts'

const SMOKE = process.env.DEVIN_ACP_SMOKE === '1'

const ACP_CAPABILITIES: readonly AgentCapability[] = Object.freeze([
  'agent.start', 'agent.send', 'agent.cancel', 'agent.stop', 'agent.resume', 'agent.snapshot',
  'output.structured', 'tool.calls',
])

describe.skipIf(!SMOKE)('real devin acp smoke (DEVIN_ACP_SMOKE=1, needs devin auth)', () => {
  it('initialize → session/new → session/prompt → session/cancel → stop on the real binary', async () => {
    const transport = devinAcpTransport({
      binaryPath: process.env.DEVIN_ACP_BINARY ?? 'devin',
      cwd: process.cwd(),
      requestTimeoutMs: 120_000,
    })

    const ctx = new Context()
    try {
      await ctx.plugin(AcrAgentControlService)
      await ctx.plugin(acpProvider(transport))
      const service = ctx.acrAgentControl

      const request: AttachAgentRequest = {
        workerId: 'w-smoke',
        providerId: 'acp',
        workspace: { identity: 'devin-acp-smoke', cwd: process.cwd() },
        capabilities: ACP_CAPABILITIES,
        fidelity: 'structured',
      }
      const bound = await service.attach(request)
      expect(bound.providerId).toBe('acp')

      // start → real initialize + session/new on the spawned `devin acp`.
      const started = await service.dispatch('w-smoke', { kind: 'start', payload: null })
      expect(started.accepted).toBe(true)
      const sessionId = (started.result as { sessionId: string }).sessionId
      expect(sessionId).toBeTruthy()
      const pid = parseInt(started.runtimeId ?? '0', 10)
      expect(pid).toBeGreaterThan(0)

      // send → a real prompt turn; any terminal stopReason is a valid reply.
      const sent = await service.dispatch('w-smoke', { kind: 'send', payload: 'Reply with the word ok.' })
      const sendResult = sent.result as { stopReason: string; updates: unknown[] }
      expect(typeof sendResult.stopReason).toBe('string')

      const cancelled = await service.dispatch('w-smoke', { kind: 'cancel', payload: null })
      expect(cancelled.result).toEqual({ cancelled: true })

      const stopped = await service.dispatch('w-smoke', { kind: 'stop', payload: null })
      expect(stopped.accepted).toBe(true)
      await expectPoll(() => {
        expect(() => process.kill(pid, 0)).toThrow()
      })
    } finally {
      transport.dispose()
      await ctx.fiber.dispose()
    }
  }, 300_000)
})

async function expectPoll(assertion: () => void): Promise<void> {
  for (let i = 0; i < 50; i++) {
    try {
      assertion()
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
  }
  assertion()
}
