/**
 * One ACP agent process and the JSON-RPC 2.0 connection to it: newline-delimited messages over its stdin and stdout (the ACP stdio transport). The driver needs a handful of
 * calls, so this is the whole client: requests with their answers, notifications both ways, and the agent's own requests answered by a handler. `close()` ends the process
 * the way an ACP agent expects: stdin closed first, then SIGTERM, then a hard kill, and it resolves only once the process is gone.
 */
import { type ChildProcessWithoutNullStreams, spawn, spawnSync } from 'node:child_process'

/** How to start an ACP agent: a program and its arguments, and what to add to the app's environment. */
export interface AcpAgent {
  readonly command: string
  readonly args: readonly string[]
  readonly env?: Readonly<Record<string, string>>
}

/** An error the agent answered with, or the reason the connection ended. */
export class AcpError extends Error {
  /** The JSON-RPC error code, for an error the agent answered with. */
  readonly code: number | undefined

  constructor(message: string, code?: number) {
    super(message)
    this.name = 'AcpError'
    this.code = code
  }
}

/** Answers a request the agent sends (`session/request_permission`); throwing answers with an error. */
export type AgentRequestHandler = (method: string, params: unknown) => unknown

/** How long each step of `close()` waits before the next, harder one. */
const GRACE_MS = 2000
/** The most of the agent's stderr kept, to say why it ended. */
const STDERR_TAIL = 4000

interface Pending {
  resolve(value: unknown): void
  reject(error: Error): void
}

export class AcpConnection {
  readonly #child: ChildProcessWithoutNullStreams
  readonly #pending = new Map<number, Pending>()
  readonly #listeners = new Set<(method: string, params: unknown) => void>()
  #nextId = 1
  #buffer = ''
  #stderr = ''
  #ended: AcpError | undefined
  /** Resolves with the reason once the process is gone. */
  readonly ended: Promise<AcpError>

  constructor(agent: AcpAgent, cwd: string, handle: AgentRequestHandler) {
    this.#child = spawn(agent.command, [...agent.args], {
      cwd,
      env: { ...process.env, ...agent.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      // An npm-installed agent is a `.cmd` shim on Windows, which only a shell can start.
      shell: process.platform === 'win32',
      // Its own process group on POSIX, so closing the connection also ends what the agent started (its tools, a shell): nothing is left behind when the plugin unloads.
      detached: process.platform !== 'win32',
      windowsHide: true,
    })
    this.ended = new Promise((resolve) => {
      const end = (reason: AcpError): void => {
        if (this.#ended) return
        this.#ended = reason
        for (const pending of this.#pending.values()) pending.reject(reason)
        this.#pending.clear()
        resolve(reason)
      }
      this.#child.on('error', (error) =>
        end(new AcpError(`${agent.command} could not be started: ${error.message}`)),
      )
      this.#child.on('exit', (code, signal) => {
        const tail = this.#stderr.trim().split('\n').slice(-3).join(' ').slice(-500)
        end(
          new AcpError(
            `${agent.command} ended (${signal ?? `exit code ${String(code)}`})${tail ? `: ${tail}` : ''}`,
          ),
        )
      })
    })
    this.#child.stderr.setEncoding('utf8')
    this.#child.stderr.on('data', (chunk: string) => {
      this.#stderr = (this.#stderr + chunk).slice(-STDERR_TAIL)
    })
    this.#child.stdout.setEncoding('utf8')
    this.#child.stdout.on('data', (chunk: string) => {
      this.#buffer += chunk
      for (let end = this.#buffer.indexOf('\n'); end !== -1; end = this.#buffer.indexOf('\n')) {
        const line = this.#buffer.slice(0, end).trim()
        this.#buffer = this.#buffer.slice(end + 1)
        if (line) this.#receive(line, handle)
      }
    })
    // A write after the agent went away fails here instead of throwing out of the process.
    this.#child.stdin.on('error', () => {})
  }

  /** Sends a request and resolves with its result; rejects with the agent's error, or when the process ends first. */
  request<T>(method: string, params: unknown): Promise<T> {
    if (this.#ended) return Promise.reject(this.#ended)
    const id = this.#nextId++
    return new Promise<T>((resolve, reject) => {
      this.#pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
      this.#send({ jsonrpc: '2.0', id, method, params })
    })
  }

  notify(method: string, params: unknown): void {
    if (!this.#ended) this.#send({ jsonrpc: '2.0', method, params })
  }

  /** Hears every notification the agent sends; returns the function that stops listening. */
  onNotification(listener: (method: string, params: unknown) => void): () => void {
    this.#listeners.add(listener)
    return () => void this.#listeners.delete(listener)
  }

  /**
   * Ends the process and what it started: stdin closed, then SIGTERM, then a hard kill, each to the whole process group on POSIX (the tree, with `taskkill /T`, on Windows).
   * Resolves once they are gone. Safe to call again, and after the agent ended on its own (its leftovers are still cleared).
   */
  async close(): Promise<void> {
    if (!this.#ended) {
      const gone = (ms: number) =>
        Promise.race([
          this.ended.then(() => true),
          new Promise<boolean>((done) => setTimeout(() => done(false), ms).unref()),
        ])
      this.#child.stdin.end()
      if (!(await gone(GRACE_MS))) {
        this.#signal('SIGTERM')
        if (!(await gone(GRACE_MS))) this.#signal('SIGKILL')
        await this.ended
      }
    }
    await this.#reapGroup()
  }

  /** A signal to the agent and, on POSIX, everything in its group. */
  #signal(signal: 'SIGTERM' | 'SIGKILL'): void {
    const pid = this.#child.pid
    if (pid === undefined) return
    if (process.platform === 'win32') {
      if (signal === 'SIGKILL')
        spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true })
      else this.#child.kill(signal)
      return
    }
    try {
      process.kill(-pid, signal)
    } catch {
      this.#child.kill(signal)
    }
  }

  /** On POSIX, processes the agent left in its group are ended too: SIGTERM, then SIGKILL after the grace. */
  async #reapGroup(): Promise<void> {
    const pid = this.#child.pid
    if (process.platform === 'win32' || pid === undefined) return
    const groupAlive = (): boolean => {
      try {
        process.kill(-pid, 0)
        return true
      } catch (error) {
        return (error as NodeJS.ErrnoException).code === 'EPERM'
      }
    }
    for (const signal of ['SIGTERM', 'SIGKILL'] as const) {
      if (!groupAlive()) return
      try {
        process.kill(-pid, signal)
      } catch {
        return
      }
      for (let waited = 0; waited < GRACE_MS && groupAlive(); waited += 25)
        await new Promise((done) => setTimeout(done, 25))
    }
  }

  #send(message: unknown): void {
    this.#child.stdin.write(`${JSON.stringify(message)}\n`)
  }

  #receive(line: string, handle: AgentRequestHandler): void {
    let message: {
      id?: number | string
      method?: string
      params?: unknown
      result?: unknown
      error?: { code?: number; message?: string }
    }
    try {
      message = JSON.parse(line)
    } catch {
      return // Not a protocol frame: an agent may print a stray line; it carries nothing to act on.
    }
    if (typeof message.method === 'string') {
      if (message.id === undefined) {
        for (const listener of this.#listeners) listener(message.method, message.params)
        return
      }
      const id = message.id
      Promise.resolve()
        .then(() => handle(message.method as string, message.params))
        .then(
          (result) => this.#answer(id, result),
          (error: unknown) =>
            this.#send({
              jsonrpc: '2.0',
              id,
              error:
                error instanceof AcpError && error.code !== undefined
                  ? { code: error.code, message: error.message }
                  : {
                      code: -32603,
                      message: error instanceof Error ? error.message : String(error),
                    },
            }),
        )
      return
    }
    const pending = typeof message.id === 'number' ? this.#pending.get(message.id) : undefined
    if (!pending) return
    this.#pending.delete(message.id as number)
    if (message.error)
      pending.reject(
        new AcpError(
          message.error.message ?? 'the agent answered with an error',
          message.error.code,
        ),
      )
    else pending.resolve(message.result)
  }

  #answer(id: number | string, result: unknown): void {
    if (!this.#ended) this.#send({ jsonrpc: '2.0', id, result: result ?? null })
  }
}
