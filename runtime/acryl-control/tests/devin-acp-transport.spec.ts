import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import {
  AcrAgentControlService,
  type AgentCapability,
  type AgentSnapshot,
  type AgentTransport,
  type AgentWorkspace,
} from '../src/agent/agent-control.ts'
import { acpProvider } from '../src/agent/providers/acp.ts'
import { devinAcpTransport } from '../src/agent/transports/devin-acp.ts'
import { TransportError } from '../src/agent/transports/acp-json-rpc.ts'
import type {
  DevinAcpPermissionRequest,
  DevinAcpPermissionResponse,
  DevinAcpTransportConfig,
} from '../src/agent/transports/devin-acp-config.ts'

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

  it('treats a session/new result without a sessionId as a failed start', async () => {
    const wrapper = createWrapperScript()
    const transport = devinAcpTransport({
      binaryPath: wrapper,
      cwd: '/tmp',
      env: { STUB_ACP_SESSION_NEW_EMPTY: '1' },
    })

    await expect(
      transport.execute(snapshot('w-badsession', null), { kind: 'start', payload: null }),
    ).rejects.toThrow('no usable sessionId')

    // The half-started worker was released: a retry reaches the same
    // sessionId failure, not 'already has an active Devin ACP session'.
    await expect(
      transport.execute(snapshot('w-badsession', null), { kind: 'start', payload: null }),
    ).rejects.toThrow('no usable sessionId')

    transport.dispose()
  })

  it('sends session/cancel when a prompt is aborted mid-turn', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'devin-acp-abort-'))
    const captureFile = join(dir, 'capture.jsonl')
    const wrapper = createWrapperScript()
    const transport = devinAcpTransport({
      binaryPath: wrapper,
      cwd: '/tmp',
      env: { STUB_ACP_CAPTURE: captureFile, STUB_ACP_HANG: 'session/prompt' },
    })

    const started = await transport.execute(
      snapshot('w-send-abort', null),
      { kind: 'start', payload: null },
    ) as { runtimeId: string }

    const controller = new AbortController()
    const pending = transport.execute(
      snapshot('w-send-abort', started.runtimeId),
      { kind: 'send', payload: 'hang on this' },
      controller.signal,
    )
    // Give the prompt a moment to reach the stub, then abort mid-turn.
    await new Promise((resolve) => setTimeout(resolve, 150))
    controller.abort()
    await expect(pending).rejects.toThrow(/abort/i)

    // The stub observed the prompt followed by the best-effort cancel —
    // the local rejection alone would leave the agent's turn running.
    await new Promise((resolve) => setTimeout(resolve, 200))
    const methods = readFileSync(captureFile, 'utf8')
      .trim()
      .split('\n')
      .map((line) => (JSON.parse(line) as { method?: string }).method)
    const promptIndex = methods.indexOf('session/prompt')
    expect(promptIndex).toBeGreaterThanOrEqual(0)
    expect(methods.indexOf('session/cancel')).toBeGreaterThan(promptIndex)

    await transport.execute(snapshot('w-send-abort', started.runtimeId), { kind: 'stop', payload: null })
    transport.dispose()
  })

  it('escalates to SIGKILL when the agent ignores SIGTERM', async () => {
    const wrapper = createWrapperScript()
    const transport = devinAcpTransport({
      binaryPath: wrapper,
      cwd: '/tmp',
      env: { STUB_ACP_IGNORE_SIGTERM: '1' },
    })

    const started = await transport.execute(
      snapshot('w-stubborn', null),
      { kind: 'start', payload: null },
    ) as { runtimeId: string }
    const pid = parseInt(started.runtimeId, 10)
    expect(pid).toBeGreaterThan(0)

    // The stub swallows SIGTERM; only the SIGKILL escalation after the 2s
    // grace period can reap it.
    await transport.execute(snapshot('w-stubborn', started.runtimeId), { kind: 'stop', payload: null })
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(() => process.kill(pid, 0)).toThrow()

    transport.dispose()
  })
})

describe('session/request_permission answering', () => {
  /** The stub echoes the client's answer in a `permission:<json>` chunk. */
  function permissionAnswer(updates: unknown[]): DevinAcpPermissionResponse | undefined {
    for (const update of updates) {
      const text = (update as { update?: { content?: { text?: unknown } } })
        ?.update?.content?.text
      if (typeof text === 'string' && text.startsWith('permission:')) {
        return JSON.parse(text.slice('permission:'.length)) as DevinAcpPermissionResponse
      }
    }
    return undefined
  }

  async function permissionRoundTrip(
    workerId: string,
    config: Omit<DevinAcpTransportConfig, 'binaryPath' | 'cwd' | 'env'> & { optionKinds?: string },
  ): Promise<{ answer: DevinAcpPermissionResponse | undefined; stopReason: string }> {
    const { optionKinds, ...rest } = config
    const wrapper = createWrapperScript()
    const transport = devinAcpTransport({
      ...rest,
      binaryPath: wrapper,
      cwd: '/tmp',
      env: {
        STUB_ACP_PERMISSION_PROMPT: '1',
        ...(optionKinds !== undefined ? { STUB_ACP_PERMISSION_OPTIONS: optionKinds } : {}),
      },
    })
    try {
      const started = await transport.execute(
        snapshot(workerId, null),
        { kind: 'start', payload: null },
      ) as { runtimeId: string }

      // The stub holds the prompt turn open until the client answers its
      // session/request_permission — both sides must resolve.
      const sent = await transport.execute(
        snapshot(workerId, started.runtimeId),
        { kind: 'send', payload: 'privileged op' },
      ) as { stopReason: string; updates: unknown[] }

      await transport.execute(snapshot(workerId, started.runtimeId), { kind: 'stop', payload: null })
      return { answer: permissionAnswer(sent.updates), stopReason: sent.stopReason }
    } finally {
      transport.dispose()
    }
  }

  it('dangerous mode prefers an allow_always option', async () => {
    const { answer, stopReason } = await permissionRoundTrip('w-perm-aa', {
      permissionMode: 'dangerous',
      optionKinds: 'reject_once,allow_once,allow_always',
    })
    expect(answer).toEqual({ outcome: { outcome: 'selected', optionId: 'opt_allow_always' } })
    expect(stopReason).toBe('end_turn')
  })

  it('dangerous mode falls back to allow_once when allow_always is absent', async () => {
    const { answer } = await permissionRoundTrip('w-perm-ao', {
      permissionMode: 'dangerous',
      optionKinds: 'reject_once,allow_once',
    })
    expect(answer).toEqual({ outcome: { outcome: 'selected', optionId: 'opt_allow_once' } })
  })

  it('bypass mode answers like dangerous', async () => {
    const { answer } = await permissionRoundTrip('w-perm-bypass', {
      permissionMode: 'bypass',
      optionKinds: 'reject_once,allow_once',
    })
    expect(answer).toEqual({ outcome: { outcome: 'selected', optionId: 'opt_allow_once' } })
  })

  it('normal mode selects a reject-kind option (fail closed)', async () => {
    const { answer } = await permissionRoundTrip('w-perm-normal', {
      permissionMode: 'normal',
      optionKinds: 'allow_once,reject_once',
    })
    expect(answer).toEqual({ outcome: { outcome: 'selected', optionId: 'opt_reject_once' } })
  })

  it('normal mode cancels when no reject-kind option exists', async () => {
    const { answer } = await permissionRoundTrip('w-perm-norej', {
      permissionMode: 'normal',
      optionKinds: 'allow_once,allow_always',
    })
    expect(answer).toEqual({ outcome: { outcome: 'cancelled' } })
  })

  it('normal mode ignores an optionId named reject_once when kind allows', async () => {
    // The agent labels an allow_once option `reject_once`; selection must
    // consult the declared kind only — matching the agent-controlled
    // optionId would defeat fail-closed normal mode.
    const { answer } = await permissionRoundTrip('w-perm-spoof-normal', {
      permissionMode: 'normal',
      optionKinds: 'allow_once:reject_once',
    })
    expect(answer).toEqual({ outcome: { outcome: 'cancelled' } })
  })

  it('dangerous mode ignores an optionId named allow_always when kind rejects', async () => {
    // Mirror image: a reject_once option labelled `allow_always` is not an
    // allow-kind option, so dangerous mode has nothing to select.
    const { answer } = await permissionRoundTrip('w-perm-spoof-dangerous', {
      permissionMode: 'dangerous',
      optionKinds: 'reject_once:allow_always',
    })
    expect(answer).toEqual({ outcome: { outcome: 'cancelled' } })
  })

  it('answers cancelled when the agent offers no options', async () => {
    const { answer, stopReason } = await permissionRoundTrip('w-perm-none', {
      permissionMode: 'dangerous',
      optionKinds: 'none',
    })
    expect(answer).toEqual({ outcome: { outcome: 'cancelled' } })
    expect(stopReason).toBe('end_turn')
  })

  it('onPermissionRequest wins over permissionMode and sees parsed params', async () => {
    let seen: DevinAcpPermissionRequest | undefined
    const { answer } = await permissionRoundTrip('w-perm-cb', {
      permissionMode: 'dangerous',
      optionKinds: 'allow_once,reject_once',
      onPermissionRequest: (params) => {
        seen = params
        return Promise.resolve({ outcome: { outcome: 'selected', optionId: 'opt_reject_once' } })
      },
    })
    expect(answer).toEqual({ outcome: { outcome: 'selected', optionId: 'opt_reject_once' } })
    expect(seen?.sessionId).toMatch(/^sess_/)
    expect(seen?.toolCall.toolCallId).toBe('call_perm')
    expect(seen?.options.map((o) => o.kind)).toEqual(['allow_once', 'reject_once'])
  })

  it('a throwing onPermissionRequest still answers cancelled', async () => {
    const { answer, stopReason } = await permissionRoundTrip('w-perm-throw', {
      permissionMode: 'dangerous',
      optionKinds: 'allow_once',
      onPermissionRequest: () => Promise.reject(new Error('answerer down')),
    })
    expect(answer).toEqual({ outcome: { outcome: 'cancelled' } })
    expect(stopReason).toBe('end_turn')
  })

  it('a hung onPermissionRequest is answered cancelled after permissionTimeoutMs', async () => {
    const { answer, stopReason } = await permissionRoundTrip('w-perm-hang', {
      permissionMode: 'dangerous',
      optionKinds: 'allow_once',
      permissionTimeoutMs: 50,
      onPermissionRequest: () => new Promise<DevinAcpPermissionResponse>(() => {}),
    })
    expect(answer).toEqual({ outcome: { outcome: 'cancelled' } })
    expect(stopReason).toBe('end_turn')
  })

  it('a malformed onPermissionRequest result still answers cancelled', async () => {
    const { answer } = await permissionRoundTrip('w-perm-bad', {
      permissionMode: 'dangerous',
      optionKinds: 'allow_once',
      onPermissionRequest: () => Promise.resolve({} as DevinAcpPermissionResponse),
    })
    expect(answer).toEqual({ outcome: { outcome: 'cancelled' } })
  })
})

describe('resume honoring the attach-time providerSessionRef', () => {
  function boundSnapshot(workerId: string, providerSessionRef: string | null): AgentSnapshot {
    return Object.freeze({ ...snapshot(workerId, null), providerSessionRef })
  }

  function capturedMethods(captureFile: string): Array<{ method?: string; sessionId?: string }> {
    return readFileSync(captureFile, 'utf8')
      .trim()
      .split('\n')
      .map((line) => {
        const msg = JSON.parse(line) as { method?: string; params?: { sessionId?: string } }
        return { method: msg.method, sessionId: msg.params?.sessionId }
      })
  }

  it('runs session/load for the carried ref on the freshly spawned process', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'devin-acp-resume-'))
    const captureFile = join(dir, 'capture.jsonl')
    const wrapper = createWrapperScript()
    const transport = devinAcpTransport({
      binaryPath: wrapper,
      cwd: '/tmp',
      env: { STUB_ACP_CAPTURE: captureFile, STUB_ACP_KNOWN_SESSIONS: 'sess_persisted_9' },
    })

    const binding = boundSnapshot('w-resume', 'sess_persisted_9')
    const result = await transport.execute(
      binding,
      { kind: 'resume', payload: null },
    ) as { sessionId: string; runtimeId: string }

    // The load succeeded: the resume keeps the attach-time session identity.
    expect(result.sessionId).toBe('sess_persisted_9')
    const methods = capturedMethods(captureFile)
    const load = methods.find((m) => m.method === 'session/load')
    expect(load?.sessionId).toBe('sess_persisted_9')
    expect(methods.some((m) => m.method === 'session/new')).toBe(false)

    await transport.execute(
      Object.freeze({ ...binding, runtimeId: result.runtimeId }),
      { kind: 'stop', payload: null },
    )
    transport.dispose()
  })

  it('falls back to session/new when the provider no longer knows the ref', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'devin-acp-resume-'))
    const captureFile = join(dir, 'capture.jsonl')
    const wrapper = createWrapperScript()
    const transport = devinAcpTransport({
      binaryPath: wrapper,
      cwd: '/tmp',
      env: { STUB_ACP_CAPTURE: captureFile },
    })

    const binding = boundSnapshot('w-resume-gone', 'sess_gone')
    const result = await transport.execute(
      binding,
      { kind: 'resume', payload: null },
    ) as { sessionId: string; runtimeId: string }

    expect(result.sessionId).toMatch(/^sess_/)
    const methods = capturedMethods(captureFile)
    const loadIndex = methods.findIndex((m) => m.method === 'session/load')
    const newIndex = methods.findIndex((m) => m.method === 'session/new')
    expect(loadIndex).toBeGreaterThanOrEqual(0)
    expect(methods[loadIndex]?.sessionId).toBe('sess_gone')
    expect(newIndex).toBeGreaterThan(loadIndex)

    await transport.execute(
      Object.freeze({ ...binding, runtimeId: result.runtimeId }),
      { kind: 'stop', payload: null },
    )
    transport.dispose()
  })

  it('starts a fresh session when the binding carries no ref', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'devin-acp-resume-'))
    const captureFile = join(dir, 'capture.jsonl')
    const wrapper = createWrapperScript()
    const transport = devinAcpTransport({
      binaryPath: wrapper,
      cwd: '/tmp',
      env: { STUB_ACP_CAPTURE: captureFile },
    })

    const binding = boundSnapshot('w-resume-none', null)
    const result = await transport.execute(
      binding,
      { kind: 'resume', payload: null },
    ) as { sessionId: string; runtimeId: string }

    expect(result.sessionId).toMatch(/^sess_/)
    const methods = capturedMethods(captureFile)
    expect(methods.some((m) => m.method === 'session/load')).toBe(false)
    expect(methods.some((m) => m.method === 'session/new')).toBe(true)

    await transport.execute(
      Object.freeze({ ...binding, runtimeId: result.runtimeId }),
      { kind: 'stop', payload: null },
    )
    transport.dispose()
  })
})

describe('failed-start cleanup through the control service', () => {
  it('a stop after a merge-rejected start reaches the transport and kills the child', async () => {
    const wrapper = createWrapperScript()
    const inner = devinAcpTransport({ binaryPath: wrapper, cwd: '/tmp' })

    // The hijack reports worker-B's spawned runtime as worker-A's live
    // runtime id, so the merge rejects it with a runtime collision while a
    // real subprocess is running underneath the never-bound binding.
    let occupiedRuntimeId = ''
    let spawnedPid: string | null = null
    const transport: AgentTransport = {
      async execute(binding, command, signal) {
        const result = await inner.execute(binding, command, signal)
        if (command.kind === 'start' && binding.workerId === 'worker-b') {
          const record = result as { runtimeId: string }
          spawnedPid = record.runtimeId
          return { ...record, runtimeId: occupiedRuntimeId }
        }
        return result
      },
    }

    const ctx = new Context()
    const controlFiber = ctx.plugin(AcrAgentControlService)
    await controlFiber
    const providerFiber = ctx.plugin(acpProvider(transport))
    await providerFiber
    const service = ctx.acrAgentControl

    await service.attach({
      workerId: 'worker-a',
      providerId: 'acp',
      workspace: { identity: 'test', cwd: '/tmp' },
      capabilities: ACP_CAPABILITIES,
      fidelity: 'structured',
    })
    const started = await service.dispatch('worker-a', { kind: 'start', payload: null })
    occupiedRuntimeId = started.runtimeId ?? ''

    await service.attach({
      workerId: 'worker-b',
      providerId: 'acp',
      workspace: { identity: 'test', cwd: '/tmp' },
      capabilities: ACP_CAPABILITIES,
      fidelity: 'structured',
    })
    await expect(service.dispatch('worker-b', { kind: 'start', payload: null }))
      .rejects.toMatchObject({ code: 'runtime-collision' })
    expect(spawnedPid).not.toBeNull()
    const pid = parseInt(spawnedPid ?? '0', 10)
    expect(() => process.kill(pid, 0)).not.toThrow()

    // runtimeId is still null on the stored binding; the cleanup stop must
    // still be dispatched to the transport.
    const binding = (await service.snapshot({ workerId: 'worker-b' }))[0]
    expect(binding?.runtimeId).toBeNull()
    const stop = await service.dispatch('worker-b', { kind: 'stop', payload: null })
    expect(stop.accepted).toBe(true)
    expect(stop.runtimeId).toBeNull()

    await expectAliveDead(pid, false)

    // Release worker-A's child; acpProvider() alone does not own transport
    // disposal (the acryl-agent-devin plugin wires it via ctx.effect).
    await service.dispatch('worker-a', { kind: 'stop', payload: null })
    await inner.dispose()
    await providerFiber.dispose()
    await controlFiber.dispose()
  })
})

async function expectAliveDead(pid: number, alive: boolean): Promise<void> {
  for (let i = 0; i < 50; i++) {
    try {
      process.kill(pid, 0)
      if (!alive) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        continue
      }
      return
    } catch {
      if (!alive) return
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
  if (alive) {
    expect(() => process.kill(pid, 0)).not.toThrow()
  } else {
    expect(() => process.kill(pid, 0)).toThrow()
  }
}
