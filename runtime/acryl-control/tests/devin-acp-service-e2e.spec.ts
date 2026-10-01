/**
 * End-to-end round-trip through `AcrAgentControlService` with the Devin ACP
 * transport speaking to the stub ACP server (devin-acp-integration story 14):
 * attach → start → send (with a mid-turn `session/request_permission`
 * answered by the `permissionMode` policy) → cancel → stop, asserting both
 * receipt content and the stub-observed method sequence.
 *
 * The `devin` binary is a shell wrapper that execs the stub server, so this
 * suite is headless and needs no real `devin` install or credentials.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import {
  AcrAgentControlService,
  type AgentCapability,
  type AttachAgentRequest,
} from '../src/agent/agent-control.ts'
import { acpProvider } from '../src/agent/providers/acp.ts'
import { devinAcpTransport } from '../src/agent/transports/devin-acp.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const STUB_SERVER = join(__dirname, 'stub-acp-server.mjs')

const ACP_CAPABILITIES: readonly AgentCapability[] = Object.freeze([
  'agent.start', 'agent.send', 'agent.cancel', 'agent.stop', 'agent.resume', 'agent.snapshot',
  'output.structured', 'tool.calls',
])

const attachRequest = (workerId: string): AttachAgentRequest => ({
  workerId,
  providerId: 'acp',
  workspace: { identity: 'e2e', cwd: '/tmp' },
  capabilities: ACP_CAPABILITIES,
  fidelity: 'structured',
})

const contexts: Context[] = []
const temporaryDirs: string[] = []

afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const dir of temporaryDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function temporaryDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'devin-acp-e2e-'))
  temporaryDirs.push(dir)
  return dir
}

/** Shell wrapper that execs the stub ACP server for `devin acp <args>`. */
function createWrapperScript(): string {
  const dir = temporaryDir()
  const wrapperPath = join(dir, 'devin-acp-wrapper')
  writeFileSync(
    wrapperPath,
    `#!/bin/sh\nexec "${process.execPath}" "${STUB_SERVER}"\n`,
    { mode: 0o755 },
  )
  return wrapperPath
}

interface CapturedMessage {
  readonly method: string | undefined
  readonly sessionId: string | undefined
  readonly result: unknown
}

function capturedMessages(captureFile: string): CapturedMessage[] {
  return readFileSync(captureFile, 'utf8')
    .trim()
    .split('\n')
    .map((line) => {
      const msg = JSON.parse(line) as {
        method?: string
        params?: { sessionId?: string }
        result?: unknown
      }
      return { method: msg.method, sessionId: msg.params?.sessionId, result: msg.result }
    })
}

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

describe('AcrAgentControlService × devin-acp round-trip', () => {
  it('attach → start → send (policy-answered permission) → cancel → stop', async () => {
    const dir = temporaryDir()
    const captureFile = join(dir, 'capture.jsonl')
    const transport = devinAcpTransport({
      binaryPath: createWrapperScript(),
      cwd: '/tmp',
      env: { STUB_ACP_CAPTURE: captureFile, STUB_ACP_PERMISSION_PROMPT: '1' },
    })

    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(AcrAgentControlService)
    await ctx.plugin(acpProvider(transport))
    const service = ctx.acrAgentControl

    // attach: the binding exists with no runtime yet.
    const bound = await service.attach(attachRequest('w-e2e'))
    expect(bound.providerId).toBe('acp')
    expect(bound.runtimeId).toBeNull()

    // start: initialize + session/new; the pid becomes the runtimeId.
    const started = await service.dispatch('w-e2e', { kind: 'start', payload: null })
    expect(started.accepted).toBe(true)
    const pid = parseInt(started.runtimeId ?? '0', 10)
    expect(pid).toBeGreaterThan(0)
    const sessionId = (started.result as { sessionId: string }).sessionId
    expect(sessionId).toMatch(/^sess_/)
    const afterStart = (await service.snapshot({ workerId: 'w-e2e' }))[0]
    expect(afterStart?.providerSessionRef).toBe(sessionId)
    expect(afterStart?.status).toBe('idle')

    // send: the stub asks session/request_permission mid-turn; the default
    // 'normal' policy fails closed on the reject-kind option, echoed back in
    // the `permission:` chunk the stub appends before finishing the turn.
    const sent = await service.dispatch('w-e2e', { kind: 'send', payload: 'do the thing' })
    const sendResult = sent.result as { stopReason: string; updates: unknown[] }
    expect(sendResult.stopReason).toBe('end_turn')
    const permissionChunk = sendResult.updates
      .map((update) => (update as { update?: { content?: { text?: unknown } } }).update?.content?.text)
      .find((text): text is string => typeof text === 'string' && text.startsWith('permission:'))
    expect(permissionChunk).toBeDefined()
    expect(JSON.parse(permissionChunk!.slice('permission:'.length))).toEqual({
      outcome: { outcome: 'selected', optionId: 'opt_reject_once' },
    })

    // cancel is a fire-and-forget notification the stub records; wait for the
    // captured line so stop's SIGTERM cannot win the race against the read.
    const cancelled = await service.dispatch('w-e2e', { kind: 'cancel', payload: null })
    expect(cancelled.result).toEqual({ cancelled: true })
    await expectPoll(() => {
      expect(capturedMessages(captureFile).some((m) => m.method === 'session/cancel')).toBe(true)
    })

    // stop: the stored binding releases its runtime and the child dies.
    const stopped = await service.dispatch('w-e2e', { kind: 'stop', payload: null })
    expect(stopped.accepted).toBe(true)
    const afterStop = (await service.snapshot({ workerId: 'w-e2e' }))[0]
    expect(afterStop?.runtimeId).toBeNull()
    expect(afterStop?.status).toBe('stopped')
    await expectPidAlive(pid, false)

    // The stub observed the full protocol sequence on the wire; the
    // method-less entry between session/prompt and session/cancel is our
    // response to its session/request_permission call.
    const captured = capturedMessages(captureFile)
    expect(captured.map((entry) => entry.method)).toEqual([
      'initialize',
      'session/new',
      'session/prompt',
      undefined,
      'session/cancel',
    ])
    expect(captured[3]?.result).toEqual({
      outcome: { outcome: 'selected', optionId: 'opt_reject_once' },
    })
    expect(captured.some((m) => m.method === 'session/load')).toBe(false)
    transport.dispose()
  }, 30_000)
})

async function expectPoll(assertion: () => void): Promise<void> {
  for (let i = 0; i < 50; i++) {
    try {
      assertion()
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
  assertion()
}
