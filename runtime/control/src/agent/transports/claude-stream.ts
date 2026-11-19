/**
 * Claude Code over its own `stream-json` protocol: one long-lived `claude -p` process per worker, one JSON object per line each way.
 * This is the structured transport behind the `claude` provider (fidelity `structured`): a user message in, assistant text and a final
 * `result` out, a control request to interrupt, stdin closed to stop. No vendor SDK and no other ACRYL dependency; the process is the
 * runtime, so the transport owns its whole life (`dispose` ends every child).
 *
 * Observed on Claude Code 2.1.288: the process stays silent until the first user message (the `system` `init` event, which carries
 * the session id, arrives with the first turn, not at spawn); hook and rate-limit events are interleaved and ignored here.
 */

import { spawn as nodeSpawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from 'node:child_process'
import { AcrAgentControlError, type AgentCommand, type AgentSnapshot, type AgentTransport, type AgentTransportRuntime, type AttachAgentRequest } from '../agent-control.ts'

export interface ClaudeStreamTransportOptions {
  /** The executable. Defaults to `claude` on the PATH. */
  readonly command?: string
  /**
   * Extra arguments for every process, after the protocol flags. Defaults to read-only work: Claude Code asks for approval before it edits or
   * runs anything, and a headless process cannot answer, so such calls are refused. Pass `--permission-mode` or `--allowedTools` to widen it.
   * A function is asked at each attach, for arguments that only exist once the host is up (an MCP config naming this host's own address).
   */
  readonly args?: readonly string[] | (() => readonly string[] | Promise<readonly string[]>)
  readonly env?: NodeJS.ProcessEnv
  /** Spawn seam for tests. */
  readonly spawn?: (command: string, args: readonly string[], options: SpawnOptionsWithoutStdio) => ChildProcessWithoutNullStreams
  /** How long a stopped process may take to exit before it is killed. Default 3000. */
  readonly stopGraceMs?: number
  /** How long an interrupted turn may take to end before the process is killed. Default 5000. */
  readonly interruptGraceMs?: number
}

export interface ClaudeTurnResult {
  /** The final answer, as Claude Code reports it. */
  readonly text: string
  readonly isError: boolean
  readonly sessionId: string | null
  readonly stopReason: string | null
  /** Every assistant text block of the turn, in order. */
  readonly assistantText: readonly string[]
}

interface Turn {
  readonly assistantText: string[]
  readonly resolve: (result: ClaudeTurnResult) => void
  readonly reject: (cause: Error) => void
}

interface Run {
  readonly child: ChildProcessWithoutNullStreams
  buffer: string
  sessionId: string | null
  turn: Turn | null
  closed: boolean
  readonly exited: Promise<void>
}

const PROTOCOL_ARGS = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export class ClaudeStreamTransport implements AgentTransport {
  private readonly runs = new Map<string, Run>()
  private requestCounter = 0

  constructor(private readonly options: ClaudeStreamTransportOptions = {}) {}

  async open(request: AttachAgentRequest): Promise<AgentTransportRuntime> {
    const args = [
      ...PROTOCOL_ARGS,
      ...(typeof this.options.args === 'function' ? await this.options.args() : this.options.args ?? []),
      ...(request.providerSessionRef === undefined ? [] : ['--resume', request.providerSessionRef]),
    ]
    const spawnProcess = this.options.spawn ?? nodeSpawn
    let child: ChildProcessWithoutNullStreams
    try {
      child = spawnProcess(this.options.command ?? 'claude', args, {
        ...(request.workspace === null ? {} : { cwd: request.workspace.cwd }),
        ...(this.options.env === undefined ? {} : { env: this.options.env }),
        stdio: 'pipe',
      })
    } catch (cause) {
      throw new AcrAgentControlError('transport-unavailable', `Could not start Claude Code: ${cause instanceof Error ? cause.message : String(cause)}`)
    }
    // A missing executable is reported on the 'error' event, not thrown by spawn.
    const started = await new Promise<Error | undefined>((resolve) => {
      child.once('error', resolve)
      child.once('spawn', () => { resolve(undefined) })
    })
    if (started !== undefined) throw new AcrAgentControlError('transport-unavailable', `Could not start Claude Code: ${started.message}`)

    const runtimeId = `claude-${String(child.pid)}`
    const run: Run = {
      child,
      buffer: '',
      sessionId: request.providerSessionRef ?? null,
      turn: null,
      closed: false,
      exited: new Promise<void>((resolve) => { child.once('close', () => { resolve() }) }),
    }
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => { this.onData(run, chunk) })
    child.stderr.resume()
    child.stdin.on('error', () => {})
    child.once('error', (cause) => { this.fail(run, cause) })
    child.once('close', (code, signal) => {
      run.closed = true
      this.runs.delete(runtimeId)
      this.fail(run, new AcrAgentControlError('transport-unavailable', `Claude Code exited (${signal ?? String(code)}) before the turn ended.`))
    })
    this.runs.set(runtimeId, run)
    return { runtimeId, ...(request.providerSessionRef === undefined ? {} : { providerSessionRef: request.providerSessionRef }) }
  }

  async execute(binding: AgentSnapshot, command: AgentCommand, signal?: AbortSignal): Promise<unknown> {
    const run = binding.runtimeId === null ? undefined : this.runs.get(binding.runtimeId)
    if (run === undefined || run.closed) throw new AcrAgentControlError('transport-unavailable', `Claude Code runtime ${String(binding.runtimeId)} is not running.`)
    switch (command.kind) {
      case 'start':
        // The process is already up (`open`); starting names what is running.
        return { runtimeId: binding.runtimeId, sessionId: run.sessionId }
      case 'send':
        return this.send(run, command.payload, signal)
      case 'cancel':
        this.interrupt(run)
        return { interrupted: run.turn !== null }
      case 'stop':
        await this.stop(run)
        return { stopped: true }
      case 'resume':
        throw new AcrAgentControlError('capability-rejected', 'Resume is done by attaching with the session id (providerSessionRef).')
    }
  }

  async dispose(): Promise<void> {
    await Promise.all([...this.runs.values()].map(run => this.stop(run)))
  }

  private send(run: Run, payload: unknown, signal?: AbortSignal): Promise<ClaudeTurnResult> {
    const text = typeof payload === 'string' ? payload : isRecord(payload) && typeof payload.text === 'string' ? payload.text : undefined
    if (text === undefined || text === '') throw new AcrAgentControlError('capability-rejected', 'A send needs a text: a string or { text }.')
    if (run.turn !== null) throw new AcrAgentControlError('worker-busy', 'Claude Code is still answering the previous message.')
    return new Promise<ClaudeTurnResult>((resolve, reject) => {
      const onAbort = (): void => { this.interrupt(run) }
      const turn: Turn = {
        assistantText: [],
        resolve: (result) => { signal?.removeEventListener('abort', onAbort); resolve(result) },
        reject: (cause) => { signal?.removeEventListener('abort', onAbort); reject(cause) },
      }
      run.turn = turn
      if (signal !== undefined) {
        if (signal.aborted) { run.turn = null; reject(new AcrAgentControlError('cancelled', 'The send was cancelled.')); return }
        signal.addEventListener('abort', onAbort, { once: true })
      }
      this.write(run, { type: 'user', message: { role: 'user', content: [{ type: 'text', text }] } })
    }).then((result) => {
      if (signal?.aborted === true) throw new AcrAgentControlError('cancelled', 'The send was cancelled.')
      return result
    })
  }

  private interrupt(run: Run): void {
    if (run.turn === null || run.closed) return
    this.write(run, { type: 'control_request', request_id: `acryl-${String(++this.requestCounter)}`, request: { subtype: 'interrupt' } })
    // A turn that does not end after an interrupt is not coming back: kill the process rather than hang the caller.
    const turn = run.turn
    setTimeout(() => {
      if (run.turn === turn && !run.closed) run.child.kill('SIGKILL')
    }, this.options.interruptGraceMs ?? 5000).unref()
  }

  private async stop(run: Run): Promise<void> {
    if (run.closed) return
    run.child.stdin.end()
    const timer = setTimeout(() => { if (!run.closed) run.child.kill('SIGTERM') }, this.options.stopGraceMs ?? 3000)
    timer.unref()
    await run.exited
    clearTimeout(timer)
  }

  private write(run: Run, message: Record<string, unknown>): void {
    run.child.stdin.write(`${JSON.stringify(message)}\n`)
  }

  private onData(run: Run, chunk: string): void {
    run.buffer += chunk
    let newline = run.buffer.indexOf('\n')
    while (newline >= 0) {
      const line = run.buffer.slice(0, newline).trim()
      run.buffer = run.buffer.slice(newline + 1)
      if (line !== '') this.onLine(run, line)
      newline = run.buffer.indexOf('\n')
    }
  }

  private onLine(run: Run, line: string): void {
    let event: unknown
    try { event = JSON.parse(line) } catch { return }   // diagnostics other than protocol lines are not events
    if (!isRecord(event)) return
    if (typeof event.session_id === 'string') run.sessionId = event.session_id
    const turn = run.turn
    if (turn === null) return
    if (event.type === 'assistant' && isRecord(event.message) && Array.isArray(event.message.content)) {
      for (const block of event.message.content) {
        if (isRecord(block) && block.type === 'text' && typeof block.text === 'string') turn.assistantText.push(block.text)
      }
    } else if (event.type === 'result') {
      run.turn = null
      turn.resolve({
        text: typeof event.result === 'string' ? event.result : turn.assistantText.join('\n'),
        isError: event.is_error === true,
        sessionId: run.sessionId,
        stopReason: typeof event.stop_reason === 'string' ? event.stop_reason : null,
        assistantText: Object.freeze([...turn.assistantText]),
      })
    }
  }

  private fail(run: Run, cause: Error): void {
    const turn = run.turn
    if (turn === null) return
    run.turn = null
    turn.reject(cause)
  }
}

/** Convenience for the common case: the transport with its options. */
export function createClaudeStreamTransport(options: ClaudeStreamTransportOptions = {}): ClaudeStreamTransport {
  return new ClaudeStreamTransport(options)
}
