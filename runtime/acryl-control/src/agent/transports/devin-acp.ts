/**
 * Devin ACP transport — wires `devin acp` (JSON-RPC over stdio) as a concrete
 * `AgentTransport` behind the existing `acpProvider`.
 *
 * This is the Phase-8 transport seam declared at
 * `acryl-control/src/agent/agent-control.ts:77-80`.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import {
  AcrAgentControlError,
  type AgentCommand,
  type AgentSnapshot,
  type AgentTransport,
} from '../agent-control.ts'
import { JsonRpcClient } from './acp-json-rpc.ts'
import {
  type DevinAcpPermissionOption,
  type DevinAcpPermissionOptionKind,
  type DevinAcpPermissionRequest,
  type DevinAcpPermissionResponse,
  type DevinAcpPermissionToolCall,
  type DevinAcpTransportConfig,
  devinEnv,
  resolveDevinBinary,
} from './devin-acp-config.ts'

/** Per-worker state: the spawned process, JSON-RPC client, and session id. */
interface WorkerState {
  readonly process: ChildProcess
  readonly rpc: JsonRpcClient
  sessionId: string | null
  updates: unknown[]
  /** Set once the process exits/closes/errors so cleanup never waits on it. */
  dead: boolean
}

/** The `devin acp` subprocess runs in the bound worker's workspace when the
 * attach carried one; config cwd and the host cwd are only fallbacks — in a
 * packaged Electron host `process.cwd()` is `/`. */
function resolveWorkerCwd(binding: AgentSnapshot, config: DevinAcpTransportConfig): string {
  return binding.workspace?.cwd ?? config.cwd ?? process.cwd()
}

/** Result of a start command. */
interface StartResult {
  readonly sessionId: string
  readonly runtimeId: string
  readonly status: 'idle'
}

/** Result of a send command. */
interface SendResult {
  readonly stopReason: string
  readonly updates: unknown[]
}

/** Result of a cancel command. */
interface CancelResult {
  readonly cancelled: true
}

/** Result of a stop command. */
interface StopResult {
  readonly stopped: true
}

/** Result of a resume command. */
interface ResumeResult {
  readonly sessionId: string
  readonly runtimeId: string
  readonly status: 'idle'
}

/* ------------------------------------------------------------------ */
/* session/request_permission answering                                */
/* ------------------------------------------------------------------ */

const PERMISSION_OPTION_KINDS: readonly DevinAcpPermissionOptionKind[] = [
  'allow_once',
  'allow_always',
  'reject_once',
  'reject_always',
]

/**
 * Option-kind preference order per `permissionMode`. `kind` is the only
 * semantic field — it comes from the spec vocabulary, while `optionId` is
 * agent-controlled and must never steer selection.
 */
const ALLOW_PREFERENCE = ['allow_always', 'allow_once'] as const
const REJECT_PREFERENCE = ['reject_once', 'reject_always'] as const

/** Default bound on an `onPermissionRequest` callback resolving. */
const DEFAULT_PERMISSION_TIMEOUT_MS = 60_000

/** Sentinel distinguishing a timed-out callback from a settled answer. */
const PERMISSION_ANSWER_TIMEOUT = Symbol('permission-answer-timeout')

const CANCELLED_PERMISSION_RESPONSE: DevinAcpPermissionResponse = {
  outcome: { outcome: 'cancelled' },
}

function isPermissionOptionKind(kind: unknown): kind is DevinAcpPermissionOptionKind {
  return typeof kind === 'string' && (PERMISSION_OPTION_KINDS as readonly string[]).includes(kind)
}

/**
 * Project wire params onto {@link DevinAcpPermissionRequest}. This is a wire
 * boundary, so the projection is defensive: non-object params yield an
 * empty request, options without a usable `optionId` are dropped, and
 * option kinds outside the spec vocabulary are dropped (fail closed — an
 * unrecognized option can never be selected by policy).
 */
function parsePermissionRequest(params: unknown): DevinAcpPermissionRequest {
  const p = (typeof params === 'object' && params !== null ? params : {}) as {
    sessionId?: unknown
    toolCall?: unknown
    options?: unknown
  }
  const options: DevinAcpPermissionOption[] = []
  if (Array.isArray(p.options)) {
    for (const raw of p.options as unknown[]) {
      if (typeof raw !== 'object' || raw === null) continue
      const option = raw as { optionId?: unknown; name?: unknown; kind?: unknown }
      if (typeof option.optionId !== 'string' || option.optionId === '') continue
      if (!isPermissionOptionKind(option.kind)) continue
      options.push({
        optionId: option.optionId,
        name: typeof option.name === 'string' ? option.name : option.optionId,
        kind: option.kind,
      })
    }
  }
  const rawToolCall = (typeof p.toolCall === 'object' && p.toolCall !== null ? p.toolCall : {}) as {
    toolCallId?: unknown
  }
  const toolCall: DevinAcpPermissionToolCall = {
    ...(rawToolCall as DevinAcpPermissionToolCall),
    toolCallId: typeof rawToolCall.toolCallId === 'string' ? rawToolCall.toolCallId : '',
  }
  return {
    sessionId: typeof p.sessionId === 'string' ? p.sessionId : '',
    toolCall,
    options,
  }
}

/** Structural check on a callback-supplied response before it hits the wire. */
function isPermissionResponse(value: unknown): value is DevinAcpPermissionResponse {
  if (typeof value !== 'object' || value === null) return false
  const outcome = (value as { outcome?: unknown }).outcome
  if (typeof outcome !== 'object' || outcome === null) return false
  const tag = (outcome as { outcome?: unknown }).outcome
  if (tag === 'cancelled') return true
  return tag === 'selected' && typeof (outcome as { optionId?: unknown }).optionId === 'string'
}

/**
 * Bound a callback answer so a hung answerer can never wedge the agent.
 * The losing branch is released with its timer; a rejected answer settles
 * as the timeout sentinel so the caller answers cancelled.
 */
function racePermissionAnswer(
  config: DevinAcpTransportConfig,
  answer: Promise<DevinAcpPermissionResponse>,
): Promise<DevinAcpPermissionResponse | typeof PERMISSION_ANSWER_TIMEOUT> {
  const timeoutMs = config.permissionTimeoutMs ?? DEFAULT_PERMISSION_TIMEOUT_MS
  if (timeoutMs <= 0) return answer
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(PERMISSION_ANSWER_TIMEOUT), timeoutMs)
    // A pending answerer must never hold the host process open.
    timer.unref?.()
    answer.then(
      (response) => {
        clearTimeout(timer)
        resolve(response)
      },
      () => {
        clearTimeout(timer)
        resolve(PERMISSION_ANSWER_TIMEOUT)
      },
    )
  })
}

/**
 * Pick the first option matching the mode's preference order. Selection
 * consults the declared `kind` only: matching `optionId` would let an agent
 * label an `allow_*` option `reject_once` and defeat fail-closed `normal`
 * mode (the id is echoed back, so the label survives either way).
 */
function selectPermissionOption(
  options: readonly DevinAcpPermissionOption[],
  preference: readonly string[],
): DevinAcpPermissionResponse {
  for (const token of preference) {
    const found = options.find((o) => o.kind === token)
    if (found !== undefined) {
      return { outcome: { outcome: 'selected', optionId: found.optionId } }
    }
  }
  return CANCELLED_PERMISSION_RESPONSE
}

/**
 * Answer one inbound `session/request_permission`. Resolution order:
 *
 * 1. `config.onPermissionRequest` — the extension seam for a future
 *    worker-scoped approval adapter. The DSH `ApprovalService` cannot fill
 *    this role: it requires a DSH `Agent` and an open session turn, which
 *    an `AgentSnapshot` binding cannot supply (mini-design §5).
 * 2. `config.permissionMode` — `dangerous`/`bypass` prefer `allow_always`
 *    then `allow_once`; `normal` fails closed on reject-kind options.
 * 3. No suitable option → the cancelled outcome.
 *
 * The handler never throws and never returns `undefined`: a thrown,
 * timed-out, or malformed callback answer collapses to cancelled, so the
 * agent always receives a real `RequestPermissionResponse` result rather
 * than an error frame or silence.
 */
async function answerPermissionRequest(
  config: DevinAcpTransportConfig,
  params: unknown,
): Promise<DevinAcpPermissionResponse> {
  const request = parsePermissionRequest(params)
  const answerer = config.onPermissionRequest
  if (answerer !== undefined) {
    try {
      const response = await racePermissionAnswer(config, answerer(request))
      if (response !== PERMISSION_ANSWER_TIMEOUT && isPermissionResponse(response)) {
        return response
      }
    } catch {
      // The callback threw synchronously — fall through to the safe answer.
    }
    return CANCELLED_PERMISSION_RESPONSE
  }
  const mode = config.permissionMode ?? 'normal'
  return mode === 'dangerous' || mode === 'bypass'
    ? selectPermissionOption(request.options, ALLOW_PREFERENCE)
    : selectPermissionOption(request.options, REJECT_PREFERENCE)
}

/**
 * Create a Devin ACP transport that spawns `devin acp` and speaks ACP v1
 * JSON-RPC over stdio.
 *
 * The transport is a plain object implementing `AgentTransport`. It is
 * passed to `acpProvider(devinAcpTransport(config))` at composition time.
 * The owning Cordis fiber's `effect()` disposer should call `dispose()` to
 * kill any spawned process.
 */
export function devinAcpTransport(config: DevinAcpTransportConfig): AgentTransport & { dispose(): void } {
  const workers = new Map<string, WorkerState>()
  let disposed = false

  async function execute(
    binding: AgentSnapshot,
    command: AgentCommand,
    signal?: AbortSignal,
  ): Promise<unknown> {
    if (disposed) {
      throw new Error('devinAcpTransport is disposed')
    }

    switch (command.kind) {
      case 'start':
        return handleStart(binding, command, signal)
      case 'send':
        return handleSend(binding, command, signal)
      case 'cancel':
        return handleCancel(binding, command, signal)
      case 'stop':
        return handleStop(binding, command, signal)
      case 'resume':
        return handleResume(binding, command, signal)
    }
  }

  async function handleStart(
    binding: AgentSnapshot,
    _command: AgentCommand,
    signal?: AbortSignal,
  ): Promise<StartResult> {
    if (workers.has(binding.workerId)) {
      throw new Error(`Worker ${binding.workerId} already has an active Devin ACP session`)
    }
    if (signal?.aborted) {
      throw new AcrAgentControlError('cancelled', 'Command start was cancelled.')
    }

    const binaryPath = resolveDevinBinary(config)
    const env = devinEnv(config)
    const cwd = resolveWorkerCwd(binding, config)
    const args = ['acp']
    if (config.model !== undefined) args.push('--model', config.model)
    const childProcess = spawn(binaryPath, args, {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const rpc = new JsonRpcClient(childProcess, {
      requestTimeoutMs: config.requestTimeoutMs,
      onStderr: (line) => {
        // Surface stderr via console for debugging; a production integration
        // would route this to a Desktop log surface.
        console.error(`[devin-acp stderr] ${line}`)
      },
    })

    // Collect session/update notifications
    const updates: unknown[] = []
    rpc.onNotification('session/update', (params) => {
      updates.push(params)
    })

    // Answer agent permission requests per config: onPermissionRequest
    // first, then the permissionMode policy. The handler always produces a
    // response — an unanswered agent stalls the prompt turn.
    rpc.onRequest('session/request_permission', (params) =>
      answerPermissionRequest(config, params),
    )

    const state: WorkerState = { process: childProcess, rpc, sessionId: null, updates, dead: false }
    workers.set(binding.workerId, state)

    // A workers entry must never outlive its process: a natural exit or a
    // failed spawn releases the worker so a later start can retry.
    const markDead = () => {
      if (state.dead) return
      state.dead = true
      state.rpc.dispose()
      if (workers.get(binding.workerId) === state) workers.delete(binding.workerId)
    }
    childProcess.once('exit', markDead)
    childProcess.once('close', markDead)
    childProcess.once('error', markDead)

    // 1. Initialize → 2. auth check → 3. session/new. Any failure (RPC error,
    // auth rejection, timeout, abort, or the process dying mid-handshake)
    // must tear the half-started worker down: without this the dead entry
    // wedges every retry behind 'already has an active Devin ACP session'.
    let sessionResult: { sessionId: string }
    try {
      const initResult = await rpc.call<{
        protocolVersion: number
        agentCapabilities: { loadSession?: boolean }
        authMethods: unknown[]
      }>('initialize', {
        protocolVersion: 1,
        // Advertise only what this client actually handles; claiming fs or
        // terminal support without handlers would fail mid-session with
        // -32601. `session/request_permission` is already answered above.
        clientCapabilities: {
          fs: { readTextFile: false, writeTextFile: false },
          terminal: false,
        },
        clientInfo: { name: 'acryl-desktop', title: 'ACRYL Desktop', version: '0.1.0' },
      }, { signal })

      // 2. Authenticate if needed
      if (initResult.authMethods.length > 0) {
        if (config.authMode === 'interactive') {
          throw new Error(
            'Devin ACP requires authentication and authMode is "interactive", which is not yet supported. Use "devin auth login" first or set WINDSURF_API_KEY.',
          )
        }
        // For devin-auth and windsurf-key modes, the credentials are picked up
        // from the environment / stored credentials by the devin binary itself.
        // The ACP authenticate method is called by the agent if it needs
        // explicit credentials — in practice, devin acp reads them from disk.
      }

      // 3. Session new. A malformed agent can answer `result: {}`; an
      // absent sessionId must fail the start here rather than leak into
      // session/prompt as `undefined`.
      const newSession = await rpc.call<{ sessionId?: unknown }>('session/new', {
        cwd,
        mcpServers: [],
      }, { signal })
      if (typeof newSession.sessionId !== 'string' || newSession.sessionId === '') {
        throw new Error('Devin ACP session/new returned no usable sessionId')
      }
      sessionResult = { sessionId: newSession.sessionId }

      state.sessionId = sessionResult.sessionId
    } catch (error) {
      await killWorker(binding.workerId)
      throw error
    }

    // Once a session exists, an abort also cancels the in-flight turn.
    if (signal !== undefined) {
      signal.addEventListener('abort', () => {
        if (state.sessionId !== null) {
          rpc.notify('session/cancel', { sessionId: state.sessionId })
        }
      }, { once: true })
    }

    return {
      sessionId: sessionResult.sessionId,
      runtimeId: String(childProcess.pid ?? 'unknown'),
      status: 'idle',
    }
  }

  async function handleSend(
    binding: AgentSnapshot,
    command: AgentCommand,
    signal?: AbortSignal,
  ): Promise<SendResult> {
    const state = workers.get(binding.workerId)
    if (state === undefined) {
      throw new Error(`Worker ${binding.workerId} has no active Devin ACP session`)
    }
    if (state.sessionId === null) {
      throw new Error(`Worker ${binding.workerId} session not started`)
    }

    state.updates.length = 0 // clear previous turn's updates
    const prompt = typeof command.payload === 'string'
      ? [{ type: 'text', text: command.payload }]
      : Array.isArray(command.payload)
        ? command.payload
        : [{ type: 'text', text: String(command.payload) }]

    let result: { stopReason: string }
    try {
      result = await state.rpc.call<{ stopReason: string }>('session/prompt', {
        sessionId: state.sessionId,
        prompt,
      }, { signal })
    } catch (error) {
      // An abort (or a pre-aborted signal) rejects the local call but leaves
      // the agent's turn running server-side — cancel best-effort so the
      // turn actually stops.
      if (signal?.aborted) {
        state.rpc.notify('session/cancel', { sessionId: state.sessionId })
      }
      throw error
    }

    return {
      stopReason: result.stopReason,
      updates: [...state.updates],
    }
  }

  async function handleCancel(
    binding: AgentSnapshot,
    _command: AgentCommand,
    _signal?: AbortSignal,
  ): Promise<CancelResult> {
    const state = workers.get(binding.workerId)
    if (state === undefined || state.sessionId === null) {
      return { cancelled: true }
    }
    state.rpc.notify('session/cancel', { sessionId: state.sessionId })
    return { cancelled: true }
  }

  async function handleStop(
    binding: AgentSnapshot,
    _command: AgentCommand,
    _signal?: AbortSignal,
  ): Promise<StopResult> {
    await killWorker(binding.workerId)
    return { stopped: true }
  }

  async function handleResume(
    binding: AgentSnapshot,
    _command: AgentCommand,
    signal?: AbortSignal,
  ): Promise<ResumeResult> {
    const state = workers.get(binding.workerId)
    if (state !== undefined && state.sessionId !== null) {
      // Already has a session — try session/load if supported
      try {
        await state.rpc.call('session/load', {
          sessionId: state.sessionId,
          cwd: resolveWorkerCwd(binding, config),
          mcpServers: [],
        }, { signal })
        return {
          sessionId: state.sessionId,
          runtimeId: String(state.process.pid ?? 'unknown'),
          status: 'idle',
        }
      } catch {
        // Fall through to start a new session
      }
    }

    // No existing session or load failed — start fresh
    const result = await handleStart(binding, { kind: 'start', payload: null }, signal)
    return result
  }

  function killWorker(workerId: string): Promise<void> {
    const state = workers.get(workerId)
    if (state === undefined) return Promise.resolve()
    // Release the worker immediately so a retry is never blocked by a kill
    // still in flight.
    workers.delete(workerId)

    // A failed spawn or an already-exited child has nothing left to kill —
    // 'exit' may never arrive, so waiting on it would hang the caller.
    if (state.dead) {
      state.rpc.dispose()
      return Promise.resolve()
    }

    return new Promise<void>((resolve) => {
      let resolved = false
      const finish = () => {
        if (resolved) return
        resolved = true
        state.rpc.dispose()
        resolve()
      }

      state.process.once('exit', finish)
      state.process.once('error', finish)

      // SIGTERM first, SIGKILL after 2s. `process.killed` only reports that
      // a signal was *sent* (our own SIGTERM already sets it), so the
      // escalation must consult `state.dead` — the flag the 'exit'/'close'/
      // 'error' listeners set — or a SIGTERM-ignoring agent leaks.
      try {
        state.process.kill('SIGTERM')
      } catch {
        // The process died between the dead check and now; 'exit'/'error'
        // listeners or the fallback timer still settle the promise.
      }
      const graceTimer = setTimeout(() => {
        if (!state.dead) {
          try {
            state.process.kill('SIGKILL')
          } catch {
            // Process may have already exited
          }
        }
      }, 2000)
      // The grace-period timer is a fallback, not work the host must wait on.
      graceTimer.unref?.()

      // Don't wait more than 3s total
      setTimeout(finish, 3000)
    })
  }

  function dispose(): void {
    if (disposed) return
    disposed = true
    for (const workerId of [...workers.keys()]) {
      void killWorker(workerId)
    }
  }

  return { execute, dispose }
}
