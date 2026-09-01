import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { AgentCapability, AgentSnapshot } from '../src/agent/agent-control.ts'
import { devinAcpTransport } from '../src/agent/transports/devin-acp.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const STUB_SERVER = join(__dirname, 'stub-acp-server.mjs')

const ACP_CAPABILITIES: readonly AgentCapability[] = Object.freeze([
  'agent.start', 'agent.send', 'agent.cancel', 'agent.stop', 'agent.resume', 'agent.snapshot',
  'output.structured', 'tool.calls',
])

/** A snapshot for testing. */
function snapshot(workerId: string, runtimeId: string | null = null): AgentSnapshot {
  return Object.freeze({
    workerId,
    runtimeId,
    providerId: 'acp',
    providerSessionRef: null,
    harnessSessionId: null,
    workspace: { identity: 'test', cwd: '/tmp' },
    capabilities: ACP_CAPABILITIES,
    fidelity: 'structured',
    status: 'idle' as const,
  })
}

// Since the transport hardcodes ['acp'] as the arg, we need a wrapper.
// We'll create a small shell wrapper that execs node with the stub script.
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'

function createWrapperScript(): string {
  const dir = mkdtempSync(join(tmpdir(), 'devin-acp-test-'))
  const wrapperPath = join(dir, 'devin-acp-wrapper')
  // Shell script that ignores the 'acp' arg and runs the stub server
  writeFileSync(wrapperPath, `#!/bin/sh\nexec "${process.execPath}" "${STUB_SERVER}"\n`, { mode: 0o755 })
  return wrapperPath
}

describe('devinAcpTransport', () => {
  it('spawns the process, completes initialize + session/new on start', async () => {
    const wrapper = createWrapperScript()
    const transport = devinAcpTransport({
      binaryPath: wrapper,
      cwd: '/tmp',
    })

    const result = await transport.execute(
      snapshot('w1', null),
      { kind: 'start', payload: null },
    ) as { sessionId: string, runtimeId: string, status: string }

    expect(result.sessionId).toMatch(/^sess_/)
    expect(result.runtimeId).toBeTruthy()
    expect(result.status).toBe('idle')

    // Clean up
    await transport.execute(snapshot('w1', result.runtimeId), { kind: 'stop', payload: null })
    transport.dispose()
  })

  it('completes a prompt round-trip with updates and stop reason', async () => {
    const wrapper = createWrapperScript()
    const transport = devinAcpTransport({ binaryPath: wrapper, cwd: '/tmp' })

    const startResult = await transport.execute(
      snapshot('w2', null),
      { kind: 'start', payload: null },
    ) as { sessionId: string, runtimeId: string }

    const sendResult = await transport.execute(
      snapshot('w2', startResult.runtimeId),
      { kind: 'send', payload: 'hello world' },
    ) as { stopReason: string, updates: unknown[] }

    expect(sendResult.stopReason).toBe('end_turn')
    expect(sendResult.updates.length).toBeGreaterThanOrEqual(3) // plan + message + tool call + tool update + final message

    await transport.execute(snapshot('w2', startResult.runtimeId), { kind: 'stop', payload: null })
    transport.dispose()
  })

  it('sends cancel notification without error', async () => {
    const wrapper = createWrapperScript()
    const transport = devinAcpTransport({ binaryPath: wrapper, cwd: '/tmp' })

    const startResult = await transport.execute(
      snapshot('w3', null),
      { kind: 'start', payload: null },
    ) as { runtimeId: string }

    const cancelResult = await transport.execute(
      snapshot('w3', startResult.runtimeId),
      { kind: 'cancel', payload: null },
    ) as { cancelled: boolean }

    expect(cancelResult.cancelled).toBe(true)

    await transport.execute(snapshot('w3', startResult.runtimeId), { kind: 'stop', payload: null })
    transport.dispose()
  })

  it('kills the subprocess on stop', async () => {
    const wrapper = createWrapperScript()
    const transport = devinAcpTransport({ binaryPath: wrapper, cwd: '/tmp' })

    const startResult = await transport.execute(
      snapshot('w4', null),
      { kind: 'start', payload: null },
    ) as { runtimeId: string }

    const pid = parseInt(startResult.runtimeId, 10)
    expect(pid).toBeGreaterThan(0)

    // Verify process is alive
    expect(() => process.kill(pid, 0)).not.toThrow()

    await transport.execute(snapshot('w4', startResult.runtimeId), { kind: 'stop', payload: null })

    // Give it a moment to exit
    await new Promise((resolve) => setTimeout(resolve, 500))

    // Process should no longer be alive
    expect(() => process.kill(pid, 0)).toThrow()
  })

  it('kills all subprocesses on dispose', async () => {
    const wrapper = createWrapperScript()
    const transport = devinAcpTransport({ binaryPath: wrapper, cwd: '/tmp' })

    const startResult = await transport.execute(
      snapshot('w5', null),
      { kind: 'start', payload: null },
    ) as { runtimeId: string }

    const pid = parseInt(startResult.runtimeId, 10)
    transport.dispose()

    // Give it a moment to exit
    await new Promise((resolve) => setTimeout(resolve, 500))

    expect(() => process.kill(pid, 0)).toThrow()
  })

  it('rejects send when no session is started', async () => {
    const wrapper = createWrapperScript()
    const transport = devinAcpTransport({ binaryPath: wrapper, cwd: '/tmp' })

    await expect(
      transport.execute(snapshot('w6', 'fake-runtime'), { kind: 'send', payload: 'hi' }),
    ).rejects.toThrow('no active Devin ACP session')

    transport.dispose()
  })

  it('rejects start when worker already has a session', async () => {
    const wrapper = createWrapperScript()
    const transport = devinAcpTransport({ binaryPath: wrapper, cwd: '/tmp' })

    await transport.execute(snapshot('w7', null), { kind: 'start', payload: null })

    await expect(
      transport.execute(snapshot('w7', null), { kind: 'start', payload: null }),
    ).rejects.toThrow('already has an active Devin ACP session')

    await transport.execute(snapshot('w7', 'x'), { kind: 'stop', payload: null })
    transport.dispose()
  })

  it('spawns a new process with a different runtimeId on reactivation', async () => {
    const wrapper = createWrapperScript()

    // First activation
    const transport1 = devinAcpTransport({ binaryPath: wrapper, cwd: '/tmp' })
    const result1 = await transport1.execute(
      snapshot('w8', null),
      { kind: 'start', payload: null },
    ) as { runtimeId: string }
    await transport1.execute(snapshot('w8', result1.runtimeId), { kind: 'stop', payload: null })
    transport1.dispose()

    // Second activation
    const transport2 = devinAcpTransport({ binaryPath: wrapper, cwd: '/tmp' })
    const result2 = await transport2.execute(
      snapshot('w8', null),
      { kind: 'start', payload: null },
    ) as { runtimeId: string }
    await transport2.execute(snapshot('w8', result2.runtimeId), { kind: 'stop', payload: null })
    transport2.dispose()

    expect(result1.runtimeId).not.toBe(result2.runtimeId)
  })
})
