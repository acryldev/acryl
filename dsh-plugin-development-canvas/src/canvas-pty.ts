/** Host-owned Development Canvas PTY sessions. UI observes; this module owns lifetime. */

import { randomUUID } from 'node:crypto'
import { spawn as spawnPty } from 'node-pty'
import type { CanvasPtyCommandId, CanvasPtyStatus, CanvasPtyView } from './canvas-pty-contract.ts'
import { isCanvasPtyCommandId } from './canvas-pty-contract.ts'

const MAX_OUTPUT_CHARS = 64 * 1024
const KILL_GRACE_MS = 1_000
const DEFAULT_COLS = 120
const DEFAULT_ROWS = 40

export interface CanvasPtyProcess {
  onData(listener: (data: string) => void): { dispose(): void }
  onExit(listener: (event: { exitCode: number; signal?: number }) => void): { dispose(): void }
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(signal?: string): void
}

/** PTY spawn injected so unit tests never launch a real process. */
export type CanvasPtySpawn = (
  command: string,
  args: readonly string[],
  options: {
    readonly cwd: string
    readonly env: NodeJS.ProcessEnv
    readonly name: string
    readonly cols: number
    readonly rows: number
  },
) => CanvasPtyProcess

export interface CanvasPtySpawnPlan {
  readonly command: string
  readonly args: readonly string[]
}

export interface CanvasPtyRegistryOptions {
  readonly spawn?: CanvasPtySpawn
  readonly env?: NodeJS.ProcessEnv
  readonly cwd?: string
  readonly platform?: NodeJS.Platform
  readonly createId?: () => string
}

interface LiveSession {
  readonly id: string
  readonly process: CanvasPtyProcess
  readonly subscriptions: readonly { dispose(): void }[]
  status: CanvasPtyStatus
  output: string
  exitCode: number | null
  error: string | null
}

/**
 * Resolve argv for one allowlisted canvas command.
 * @param commandId - catalog id from the tab.
 * @param platform - Host process.platform.
 * @param env - environment used to pick SHELL / ComSpec.
 */
export function planCanvasPtyCommand(
  commandId: CanvasPtyCommandId,
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): CanvasPtySpawnPlan {
  if (commandId === 'shell') {
    if (platform === 'win32') {
      return { command: env.ComSpec ?? 'cmd.exe', args: [] }
    }
    return { command: env.SHELL ?? '/bin/sh', args: [] }
  }
  return { command: commandId, args: [] }
}

function appendOutput(current: string, chunk: string): string {
  const next = current + chunk
  if (next.length <= MAX_OUTPUT_CHARS) return next
  return next.slice(next.length - MAX_OUTPUT_CHARS)
}

/** Table of live native PTY sessions for one Development Canvas Host fiber. */
export class CanvasPtyRegistry {
  private readonly sessions = new Map<string, LiveSession>()
  private readonly spawnImpl: CanvasPtySpawn
  private readonly env: NodeJS.ProcessEnv
  private readonly cwd: string
  private readonly platform: NodeJS.Platform
  private readonly createId: () => string

  constructor(options: CanvasPtyRegistryOptions = {}) {
    this.spawnImpl = options.spawn ?? defaultSpawn
    this.env = options.env ?? process.env
    this.cwd = options.cwd ?? process.cwd()
    this.platform = options.platform ?? process.platform
    this.createId = options.createId ?? (() => `pty_${randomUUID()}`)
  }

  /**
   * Start one allowlisted command inside a real terminal.
   * @param commandId - catalog id from the Terminal/agent tab.
   */
  start(commandId: string): CanvasPtyView {
    if (!isCanvasPtyCommandId(commandId)) {
      throw new Error('dsh-plugin-development-canvas: unknown canvas PTY command')
    }
    const plan = planCanvasPtyCommand(commandId, this.platform, this.env)
    const id = this.createId()
    let process: CanvasPtyProcess
    try {
      process = this.spawnImpl(plan.command, plan.args, {
        cwd: this.cwd,
        env: { ...this.env, TERM: this.env.TERM ?? 'xterm-256color' },
        name: 'xterm-256color',
        cols: DEFAULT_COLS,
        rows: DEFAULT_ROWS,
      })
    } catch (cause) {
      throw new Error(
        `dsh-plugin-development-canvas: canvas PTY spawn failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      )
    }
    const subscriptions: { dispose(): void }[] = []
    const session: LiveSession = {
      id,
      process,
      subscriptions,
      status: 'running',
      output: '',
      exitCode: null,
      error: null,
    }
    subscriptions.push(process.onData((chunk) => {
      session.output = appendOutput(session.output, chunk)
    }))
    subscriptions.push(process.onExit(({ exitCode, signal }) => {
      session.status = 'exited'
      session.exitCode = exitCode
      if (session.error === null && signal !== undefined && signal !== 0) {
        session.error = `signal ${String(signal)}`
      }
    }))
    this.sessions.set(id, session)
    return this.view(session)
  }

  /** Write exact terminal input bytes. */
  write(id: string, data: string): void {
    const session = this.require(id)
    if (session.status !== 'running') {
      throw new Error('dsh-plugin-development-canvas: canvas PTY is not running')
    }
    session.process.write(data)
  }

  /** Resize one live terminal. */
  resize(id: string, cols: number, rows: number): void {
    const session = this.require(id)
    if (session.status !== 'running') return
    session.process.resize(cols, rows)
  }

  /** Snapshot one session for the renderer. */
  read(id: string): CanvasPtyView {
    return this.view(this.require(id))
  }

  /** Stop one session. Idempotent. */
  async close(id: string): Promise<void> {
    const session = this.sessions.get(id)
    if (session === undefined) return
    await stopPty(session)
    for (const subscription of session.subscriptions) subscription.dispose()
    this.sessions.delete(id)
  }

  /** Stop every session owned by this fiber. */
  async disposeAll(): Promise<void> {
    const ids = [...this.sessions.keys()]
    await Promise.all(ids.map(async id => this.close(id)))
  }

  private require(id: string): LiveSession {
    const session = this.sessions.get(id)
    if (session === undefined) {
      throw new Error('dsh-plugin-development-canvas: unknown canvas PTY session')
    }
    return session
  }

  private view(session: LiveSession): CanvasPtyView {
    return {
      id: session.id,
      status: session.status,
      output: session.output,
      exitCode: session.exitCode,
      error: session.error,
    }
  }
}

function defaultSpawn(
  command: string,
  args: readonly string[],
  options: {
    readonly cwd: string
    readonly env: NodeJS.ProcessEnv
    readonly name: string
    readonly cols: number
    readonly rows: number
  },
): CanvasPtyProcess {
  return spawnPty(command, [...args], {
    cwd: options.cwd,
    env: options.env as Record<string, string>,
    name: options.name,
    cols: options.cols,
    rows: options.rows,
  })
}

async function stopPty(session: LiveSession): Promise<void> {
  if (session.status !== 'running') return
  await new Promise<void>((resolve) => {
    let done = false
    const finish = (): void => {
      if (done) return
      done = true
      clearTimeout(timer)
      exitSubscription.dispose()
      resolve()
    }
    const exitSubscription = session.process.onExit(finish)
    const timer = setTimeout(() => {
      try {
        session.process.kill('SIGKILL')
      } catch {
        // The PTY may have exited between the status check and timeout.
      }
      finish()
    }, KILL_GRACE_MS)
    timer.unref?.()
    try {
      session.process.kill()
    } catch {
      finish()
    }
  })
}
