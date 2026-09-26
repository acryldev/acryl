import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { AgentCapability, AgentSnapshot, AgentWorkspace } from '../src/agent/agent-control.ts'
import { devinAcpTransport } from '../src/agent/transports/devin-acp.ts'
import { TransportError } from '../src/agent/transports/acp-json-rpc.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const STUB_SERVER = join(__dirname, 'stub-acp-server.mjs')

const ACP_CAPABILITIES: readonly AgentCapability[] = Object.freeze([
  'agent.start', 'agent.send', 'agent.cancel', 'agent.stop', 'agent.resume', 'agent.snapshot',
  'output.structured', 'tool.calls',
])

/** A snapshot for testing. */
function snapshot(
  workerId: string,
  runtimeId: string | null = null,
  workspace: AgentWorkspace | null = { identity: 'test', cwd: '/tmp' },
): AgentSnapshot {
  return Object.freeze({
    workerId,
    runtimeId,
    providerId: 'acp',
    providerSessionRef: null,
    harnessSessionId: null,
    workspace,
    capabilities: ACP_CAPABILITIES,
    fidelity: 'structured',
    status: 'idle' as const,
  })
}

// Since the transport hardcodes ['acp'] as the arg, we need a wrapper.
// We'll create a small shell wrapper that execs node with the stub script.
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'

interface WrapperOptions {
  /** When set, the wrapper writes its argv (one per line) to this file. */
  argsFile?: string
  /** When set, the wrapper writes its spawn cwd to this file. */
  cwdFile?: string
}

function createWrapperScript(options: WrapperOptions = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'devin-acp-test-'))
  const wrapperPath = join(dir, 'devin-acp-wrapper')
  const capture = [
    options.argsFile !== undefined ? `printf '%s\\n' "$@" > '${options.argsFile}'` : '',
    options.cwdFile !== undefined ? `pwd > '${options.cwdFile}'` : '',
  ].filter(Boolean).join('\n')
  // Shell script that ignores the 'acp' arg and runs the stub server
  writeFileSync(
    wrapperPath,
    `#!/bin/sh\n${capture}${capture === '' ? '' : '\n'}exec "${process.execPath}" "${STUB_SERVER}"\n`,
    { mode: 0o755 },
  )
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

  it('cleans up a failed start so the worker can start again', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'devin-acp-fail-'))
    const marker = join(dir, 'init-failed-once')
    const wrapper = createWrapperScript()
    const transport = devinAcpTransport({
      binaryPath: wrapper,
      cwd: '/tmp',
      env: { STUB_ACP_FAIL_ONCE_FILE: marker },
    })

    await expect(
      transport.execute(snapshot('w-retry', null), { kind: 'start', payload: null }),
    ).rejects.toMatchObject({ code: -32603 })

    // The wedged map entry is gone: the retry spawns a fresh process whose
    // initialize now succeeds (the marker file exists, so the stub no longer
    // fails).
    const result = await transport.execute(
      snapshot('w-retry', null),
      { kind: 'start', payload: null },
    ) as { sessionId: string, runtimeId: string }
    expect(result.sessionId).toMatch(/^sess_/)

    await transport.execute(snapshot('w-retry', result.runtimeId), { kind: 'stop', payload: null })
    transport.dispose()
  })

  it('rejects with TransportError on an unspawnable binaryPath instead of crashing', async () => {
    const transport = devinAcpTransport({
      binaryPath: join(tmpdir(), 'devin-acp-no-such-binary'),
      cwd: '/tmp',
    })

    await expect(
      transport.execute(snapshot('w-badbin', null), { kind: 'start', payload: null }),
    ).rejects.toBeInstanceOf(TransportError)

    // The failed spawn left no wedged entry: a retry reaches spawn again and
    // fails the same way rather than with 'already has an active session'.
    await expect(
      transport.execute(snapshot('w-badbin', null), { kind: 'start', payload: null }),
    ).rejects.toBeInstanceOf(TransportError)

    transport.dispose()
  })

  it('passes --model to the spawned binary when config.model is set', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'devin-acp-args-'))
    const argsFile = join(dir, 'argv.txt')
    const wrapper = createWrapperScript({ argsFile })
    const transport = devinAcpTransport({
      binaryPath: wrapper,
      cwd: '/tmp',
      model: 'devin-model-x',
    })

    const result = await transport.execute(
      snapshot('w-model', null),
      { kind: 'start', payload: null },
    ) as { runtimeId: string }

    const argv = readFileSync(argsFile, 'utf8').trim().split('\n')
    expect(argv).toEqual(['acp', '--model', 'devin-model-x'])

    await transport.execute(snapshot('w-model', result.runtimeId), { kind: 'stop', payload: null })
    transport.dispose()
  })

  it('spawns with only the acp arg when no model is configured', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'devin-acp-args-'))
    const argsFile = join(dir, 'argv.txt')
    const wrapper = createWrapperScript({ argsFile })
    const transport = devinAcpTransport({ binaryPath: wrapper, cwd: '/tmp' })

    const result = await transport.execute(
      snapshot('w-nomodel', null),
      { kind: 'start', payload: null },
    ) as { runtimeId: string }

    const argv = readFileSync(argsFile, 'utf8').trim().split('\n')
    expect(argv).toEqual(['acp'])

    await transport.execute(snapshot('w-nomodel', result.runtimeId), { kind: 'stop', payload: null })
    transport.dispose()
  })

  it('rejects a hanging call after requestTimeoutMs and unblocks a retry', async () => {
    const wrapper = createWrapperScript()
    const transport = devinAcpTransport({
      binaryPath: wrapper,
      cwd: '/tmp',
      requestTimeoutMs: 120,
      env: { STUB_ACP_HANG: 'initialize' },
    })

    await expect(
      transport.execute(snapshot('w-hang', null), { kind: 'start', payload: null }),
    ).rejects.toThrow('timed out')

    // The timed-out worker was released: a retry hits the timeout again, not
    // 'already has an active session'.
    await expect(
      transport.execute(snapshot('w-hang', null), { kind: 'start', payload: null }),
    ).rejects.toThrow('timed out')

    transport.dispose()
  })

  it('rejects a pending start when the signal aborts', async () => {
    const wrapper = createWrapperScript()
    const transport = devinAcpTransport({
      binaryPath: wrapper,
      cwd: '/tmp',
      requestTimeoutMs: 30_000,
      env: { STUB_ACP_HANG: 'initialize' },
    })

    const controller = new AbortController()
    const pending = transport.execute(
      snapshot('w-abort', null),
      { kind: 'start', payload: null },
      controller.signal,
    )
    controller.abort()

    await expect(pending).rejects.toThrow(/abort/i)
    transport.dispose()
  })

  it('rejects a start immediately when the signal is already aborted', async () => {
    const wrapper = createWrapperScript()
    const transport = devinAcpTransport({ binaryPath: wrapper, cwd: '/tmp' })
    const controller = new AbortController()
    controller.abort()

    await expect(
      transport.execute(snapshot('w-preaborted', null), { kind: 'start', payload: null }, controller.signal),
    ).rejects.toMatchObject({ code: 'cancelled' })
    transport.dispose()
  })

  it('spawns in the binding workspace cwd when one is attached', async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), 'devin-acp-ws-'))
    const captureDir = mkdtempSync(join(tmpdir(), 'devin-acp-cwdcap-'))
    const cwdFile = join(captureDir, 'cwd.txt')
    const wrapper = createWrapperScript({ cwdFile })
    const transport = devinAcpTransport({ binaryPath: wrapper, cwd: '/tmp' })

    const result = await transport.execute(
      snapshot('w-cwd', null, { identity: 'ws', cwd: workspaceDir }),
      { kind: 'start', payload: null },
    ) as { runtimeId: string }

    // pwd resolves symlinks (macOS /var → /private/var); compare realpaths.
    const spawnedCwd = readFileSync(cwdFile, 'utf8').trim()
    expect(realpathSync(spawnedCwd)).toBe(realpathSync(workspaceDir))

    await transport.execute(snapshot('w-cwd', result.runtimeId), { kind: 'stop', payload: null })
    transport.dispose()
  })

  it('falls back to config.cwd when the binding carries no workspace', async () => {
    const configDir = mkdtempSync(join(tmpdir(), 'devin-acp-configcwd-'))
    const captureDir = mkdtempSync(join(tmpdir(), 'devin-acp-cwdcap-'))
    const cwdFile = join(captureDir, 'cwd.txt')
    const wrapper = createWrapperScript({ cwdFile })
    const transport = devinAcpTransport({ binaryPath: wrapper, cwd: configDir })

    const result = await transport.execute(
      snapshot('w-cwd-fallback', null, null),
      { kind: 'start', payload: null },
    ) as { runtimeId: string }

    const spawnedCwd = readFileSync(cwdFile, 'utf8').trim()
    expect(realpathSync(spawnedCwd)).toBe(realpathSync(configDir))

    await transport.execute(snapshot('w-cwd-fallback', result.runtimeId), { kind: 'stop', payload: null })
    transport.dispose()
  })

  it('advertises no unimplemented client capabilities on initialize', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'devin-acp-cap-'))
    const captureFile = join(dir, 'capture.jsonl')
    const wrapper = createWrapperScript()
    const transport = devinAcpTransport({
      binaryPath: wrapper,
      cwd: '/tmp',
      env: { STUB_ACP_CAPTURE: captureFile },
    })

    const result = await transport.execute(
      snapshot('w-cap', null),
      { kind: 'start', payload: null },
    ) as { runtimeId: string }

    const init = readFileSync(captureFile, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { method?: string, params?: { clientCapabilities?: unknown } })
      .find((msg) => msg.method === 'initialize')

    expect(init?.params?.clientCapabilities).toEqual({
      fs: { readTextFile: false, writeTextFile: false },
      terminal: false,
    })

    await transport.execute(snapshot('w-cap', result.runtimeId), { kind: 'stop', payload: null })
    transport.dispose()
  })
})
