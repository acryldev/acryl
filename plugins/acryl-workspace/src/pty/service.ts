/** Host-owned ACRYL Workspace PTY sessions. UI observes; this module owns lifetime. */

import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { statSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { spawn as spawnPty } from 'node-pty'
import type { AgentId, WorkspacePtyCommandId, WorkspacePtyStatus, WorkspacePtyView } from './contract.ts'
import { MAX_PTY_COLS, MAX_PTY_ROWS, isWorkspacePtyCommandId } from './contract.ts'
import { Scrollback, type Replay } from './scrollback.ts'
import { ScreenModel } from './screen-model.ts'

const KILL_GRACE_MS = 1_000
const DEFAULT_COLS = 120
const DEFAULT_ROWS = 40

/**
 * A Finder-launched macOS app gets a minimal PATH (`/usr/bin:/bin:…`), so a
 * bare agent name such as `claude` fails to spawn even when it is installed.
 * Resolve bare commands to an absolute executable by merging `env.PATH` with
 * the user's login-shell PATH (cached per registry).
 */
export function workspacePtySpawnDirs(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string[] {
  const dirs: string[] = []
  const add = (raw: string | undefined): void => {
    if (raw === undefined) return
    for (const dir of raw.split(platform === 'win32' ? ';' : ':')) {
      if (dir.length > 0 && !dirs.includes(dir)) dirs.push(dir)
    }
  }
  add(env.PATH)
  const shell = env.SHELL ?? (platform === 'win32' ? env.ComSpec ?? 'cmd.exe' : '/bin/sh')
  const probes = platform === 'win32'
    ? [['/d', '/s', '/c', 'echo %PATH%']]
    : [['-lic', 'echo $PATH'], ['-lc', 'echo $PATH']]
  for (const args of probes) {
    try {
      const out = execFileSync(shell, args, {
        encoding: 'utf8',
        env,
        timeout: 3_000,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      add(out.trimEnd())
      if (dirs.length > 0) break
    } catch {
      // Log-in shell not available; keep the env PATH we already have.
    }
  }
  return dirs
}

/**
 * Return an absolute executable path for `command`, or `undefined` when none of
 * `dirs` contains an executable `command`. Absolute/relative paths pass through.
 */
export function resolveWorkspacePtyCommand(
  command: string,
  dirs: readonly string[],
  platform: NodeJS.Platform,
): string | undefined {
  if (isAbsolute(command) || command.includes('/') || command.includes('\\')) return command
  const names = platform === 'win32'
    ? [command, `${command}.exe`, `${command}.cmd`, `${command}.bat`]
    : [command]
  for (const dir of dirs) {
    for (const name of names) {
      try {
        const candidate = join(dir, name)
        const stat = statSync(candidate)
        if (stat.isFile() && (platform === 'win32' || (stat.mode & 0o111) !== 0)) return candidate
      } catch {
        // Not present here; keep searching.
      }
    }
  }
  return undefined
}

/** The spawn cwd: process.cwd() when it exists, else the user's home directory. */
function defaultSpawnCwd(): string {
  try {
    if (statSync(process.cwd()).isDirectory()) return process.cwd()
  } catch {
    // Fall through to the home directory.
  }
  return homedir()
}

export interface WorkspacePtyProcess {
  onData(listener: (data: string) => void): { dispose(): void }
  onExit(listener: (event: { exitCode: number; signal?: number }) => void): { dispose(): void }
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(signal?: string): void
}

/** PTY spawn injected so unit tests never launch a real process. */
export type WorkspacePtySpawn = (
  command: string,
  args: readonly string[],
  options: {
    readonly cwd: string
    readonly env: NodeJS.ProcessEnv
    readonly name: string
    readonly cols: number
    readonly rows: number
  },
) => WorkspacePtyProcess

export interface WorkspacePtySpawnPlan {
  readonly command: string
  readonly args: readonly string[]
}

/** Resolves an agent id that is not built in (the user's catalog). */
export interface CustomAgentResolver {
  resolve(id: string): { readonly command: string; readonly args: readonly string[] } | undefined
}

export interface WorkspacePtyRegistryOptions {
  readonly agents?: CustomAgentResolver
  readonly spawn?: WorkspacePtySpawn
  readonly env?: NodeJS.ProcessEnv
  readonly cwd?: string
  readonly platform?: NodeJS.Platform
  readonly createId?: () => string
}

interface LiveSession {
  readonly id: string
  readonly process: WorkspacePtyProcess
  readonly subscriptions: readonly { dispose(): void }[]
  status: WorkspacePtyStatus
  readonly scrollback: Scrollback
  readonly screen: ScreenModel
  readonly listeners: Set<(event: WorkspacePtyEvent) => void>
  exitCode: number | null
  error: string | null
}

/** What a live subscriber to one session is told. */
export type WorkspacePtyEvent =
  | { readonly kind: 'data'; readonly data: string; readonly cursor: number }
  | { readonly kind: 'exit'; readonly exitCode: number | null; readonly error: string | null }

/**
 * Resolve argv for one allowlisted workspace command.
 * @param commandId - catalog id from the tab.
 * @param platform - Host process.platform.
 * @param env - environment used to pick SHELL / ComSpec.
 */
export function planWorkspacePtyCommand(
  commandId: WorkspacePtyCommandId,
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): WorkspacePtySpawnPlan {
  if (commandId === 'shell') {
    if (platform === 'win32') {
      return { command: env.ComSpec ?? 'cmd.exe', args: [] }
    }
    return { command: env.SHELL ?? '/bin/sh', args: [] }
  }
  return { command: commandId, args: [] }
}

/**
 * The environment a terminal process starts with: a real terminal type, true color, and a UTF-8 locale
 * (an app launched from Finder has none, which makes shells and TUIs draw wrong glyphs).
 */
export function terminalEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const locale = env.LC_ALL ?? env.LC_CTYPE ?? env.LANG
  return {
    ...env,
    TERM: env.TERM ?? 'xterm-256color',
    COLORTERM: env.COLORTERM ?? 'truecolor',
    TERM_PROGRAM: 'ACRYL',
    ...(locale === undefined || !/utf-?8/i.test(locale) ? { LANG: 'en_US.UTF-8' } : {}),
  }
}

function isExistingAbsoluteDirectory(path: string): boolean {
  if (path.length === 0 || path.includes('\0') || !isAbsolute(path)) return false
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/** Table of live native PTY sessions for one ACRYL Workspace Host fiber. */
export class WorkspacePtyRegistry {
  private readonly sessions = new Map<string, LiveSession>()
  private readonly spawnImpl: WorkspacePtySpawn
  private readonly env: NodeJS.ProcessEnv
  private readonly cwd: string
  private readonly platform: NodeJS.Platform
  private readonly createId: () => string
  private readonly spawnDirs: string[]
  private readonly agents: CustomAgentResolver | undefined

  constructor(options: WorkspacePtyRegistryOptions = {}) {
    this.spawnImpl = options.spawn ?? defaultSpawn
    this.env = options.env ?? process.env
    this.cwd = options.cwd ?? defaultSpawnCwd()
    this.platform = options.platform ?? process.platform
    this.createId = options.createId ?? (() => `pty_${randomUUID()}`)
    this.spawnDirs = workspacePtySpawnDirs(this.env, this.platform)
    this.agents = options.agents
  }

  /**
   * Start one allowlisted command inside a real terminal.
   * @param commandId - catalog id from the Terminal/agent tab.
   * @param cwd - optional working directory (a worktree); must be an existing absolute directory.
   */
  start(commandId: AgentId, cwd?: string, size?: { readonly cols: number; readonly rows: number }): WorkspacePtyView {
    const custom = isWorkspacePtyCommandId(commandId) ? undefined : this.agents?.resolve(commandId)
    if (!isWorkspacePtyCommandId(commandId) && custom === undefined) {
      throw new Error('acryl-workspace: unknown workspace PTY command')
    }
    if (cwd !== undefined && !isExistingAbsoluteDirectory(cwd)) {
      throw new Error('acryl-workspace: workspace PTY cwd must be an existing absolute directory')
    }
    const cols = size?.cols ?? DEFAULT_COLS
    const rows = size?.rows ?? DEFAULT_ROWS
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 2 || cols > MAX_PTY_COLS || rows < 1 || rows > MAX_PTY_ROWS) {
      throw new Error('acryl-workspace: workspace PTY size is out of range')
    }
    const plan: WorkspacePtySpawnPlan = custom ?? planWorkspacePtyCommand(commandId as WorkspacePtyCommandId, this.platform, this.env)
    const id = this.createId()
    let process: WorkspacePtyProcess
    try {
      const resolved = resolveWorkspacePtyCommand(plan.command, this.spawnDirs, this.platform)
      if (resolved === undefined && !plan.command.includes('/') && !plan.command.includes('\\')) {
        throw new Error(`workspace PTY command not found in PATH: ${plan.command}`)
      }
      process = this.spawnImpl(resolved ?? plan.command, plan.args, {
        cwd: cwd ?? this.cwd,
        env: terminalEnvironment(this.env),
        name: 'xterm-256color',
        cols,
        rows,
      })
    } catch (cause) {
      throw new Error(
        `acryl-workspace: workspace PTY spawn failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      )
    }
    const subscriptions: { dispose(): void }[] = []
    const session: LiveSession = {
      id,
      process,
      subscriptions,
      status: 'running',
      scrollback: new Scrollback(),
      screen: new ScreenModel(cols, rows),
      listeners: new Set(),
      exitCode: null,
      error: null,
    }
    subscriptions.push(process.onData((chunk) => {
      session.scrollback.append(chunk)
      session.screen.write(chunk, session.scrollback.cursor)
      const event: WorkspacePtyEvent = { kind: 'data', data: chunk, cursor: session.scrollback.cursor }
      for (const listener of [...session.listeners]) listener(event)
    }))
    subscriptions.push(process.onExit(({ exitCode, signal }) => {
      session.status = 'exited'
      session.exitCode = exitCode
      if (session.error === null && signal !== undefined && signal !== 0) {
        session.error = `signal ${String(signal)}`
      }
      const event: WorkspacePtyEvent = { kind: 'exit', exitCode: session.exitCode, error: session.error }
      for (const listener of [...session.listeners]) listener(event)
    }))
    this.sessions.set(id, session)
    return this.view(session)
  }

  /** True when `command` is an absolute executable file or a program on the search path. */
  canRun(command: string): boolean {
    if (isAbsolute(command)) {
      try {
        const info = statSync(command)
        return info.isFile() && (this.platform === 'win32' || (info.mode & 0o111) !== 0)
      } catch {
        return false
      }
    }
    return resolveWorkspacePtyCommand(command, this.spawnDirs, this.platform) !== undefined
  }

  /** Write exact terminal input bytes. */
  write(id: string, data: string): void {
    const session = this.require(id)
    if (session.status !== 'running') {
      throw new Error('acryl-workspace: workspace PTY is not running')
    }
    session.process.write(data)
  }

  /** Resize one live terminal. */
  resize(id: string, cols: number, rows: number): void {
    const session = this.require(id)
    if (session.status !== 'running') return
    session.process.resize(cols, rows)
    session.screen.resize(cols, rows)
  }

  /**
   * Follow one session live. `replay` is what the subscriber has not seen yet (from `since`, or the kept
   * tail when it missed more than is kept); everything after it arrives through `listener`, in order,
   * with nothing lost or repeated in between.
   * @param since - the cursor the subscriber already reached, 0 for a first attach.
   */
  subscribe(id: string, since: number, listener: (event: WorkspacePtyEvent) => void): {
    readonly replay: Replay
    readonly status: WorkspacePtyStatus
    readonly exitCode: number | null
    readonly error: string | null
    dispose(): void
  } {
    const session = this.require(id)
    session.listeners.add(listener)
    return {
      replay: this.replayFor(session, since),
      status: session.status,
      exitCode: session.exitCode,
      error: session.error,
      dispose: () => { session.listeners.delete(listener) },
    }
  }

  /**
   * A subscriber that can resume from its cursor gets just what it missed. Any other (first attach,
   * reload, a gap larger than the kept tail) gets the screen as it is now, then what was written since.
   */
  private replayFor(session: LiveSession, since: number): Replay {
    if (since > 0) {
      const direct = session.scrollback.replay(since)
      if (!direct.replace) return direct
    }
    const { screen, cursor } = session.screen.snapshot()
    const tail = session.scrollback.replay(cursor)
    return tail.replace
      ? tail
      : { data: screen + tail.data, cursor: tail.cursor, replace: true }
  }

  /** Snapshot one session for the renderer. */
  read(id: string): WorkspacePtyView {
    return this.view(this.require(id))
  }

  /** Stop one session. Idempotent. */
  async close(id: string): Promise<void> {
    const session = this.sessions.get(id)
    if (session === undefined) return
    await stopPty(session)
    for (const subscription of session.subscriptions) subscription.dispose()
    session.screen.dispose()
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
      throw new Error('acryl-workspace: unknown workspace PTY session')
    }
    return session
  }

  private view(session: LiveSession): WorkspacePtyView {
    return {
      id: session.id,
      status: session.status,
      output: session.scrollback.replay(0).data,
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
): WorkspacePtyProcess {
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
