/**
 * Devin ACP transport — wires `devin acp` (JSON-RPC over stdio) as a concrete
 * `AgentTransport` behind the existing `acpProvider`.
 *
 * This is the Phase-8 transport seam declared at
 * `acryl-control/src/agent/agent-control.ts:77-80`.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import type {
  AgentCommand,
  AgentSnapshot,
  AgentTransport,
} from '../agent-control.ts'
import { JsonRpcClient } from './acp-json-rpc.ts'
import {
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

    const binaryPath = resolveDevinBinary(config)
    const env = devinEnv(config)
    const childProcess = spawn(binaryPath, ['acp'], {
      cwd: config.cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const rpc = new JsonRpcClient(childProcess, {
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

    const state: WorkerState = { process: childProcess, rpc, sessionId: null, updates }
    workers.set(binding.workerId, state)

    // Abort handler
    if (signal !== undefined) {
      signal.addEventListener('abort', () => {
        if (state.sessionId !== null) {
          rpc.notify('session/cancel', { sessionId: state.sessionId })
        }
      }, { once: true })
    }

    // 1. Initialize
    const initResult = await rpc.call<{
      protocolVersion: number
      agentCapabilities: { loadSession?: boolean }
      authMethods: unknown[]
    }>('initialize', {
      protocolVersion: 1,
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
        terminal: true,
      },
      clientInfo: { name: 'acryl-desktop', title: 'ACRYL Desktop', version: '0.1.0' },
    })

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

    // 3. Session new
    const sessionResult = await rpc.call<{ sessionId: string }>('session/new', {
      cwd: config.cwd,
      mcpServers: [],
    })

    state.sessionId = sessionResult.sessionId

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

    if (signal?.aborted) {
      state.rpc.notify('session/cancel', { sessionId: state.sessionId })
    }

    const result = await state.rpc.call<{ stopReason: string }>('session/prompt', {
      sessionId: state.sessionId,
      prompt,
    })

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
          cwd: config.cwd,
          mcpServers: [],
        })
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

    return new Promise<void>((resolve) => {
      let resolved = false
      const finish = () => {
        if (resolved) return
        resolved = true
        state.rpc.dispose()
        workers.delete(workerId)
        resolve()
      }

      state.process.once('exit', finish)

      // SIGTERM first, SIGKILL after 2s
      state.process.kill('SIGTERM')
      setTimeout(() => {
        if (!state.process.killed) {
          try {
            state.process.kill('SIGKILL')
          } catch {
            // Process may have already exited
          }
        }
      }, 2000)

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
