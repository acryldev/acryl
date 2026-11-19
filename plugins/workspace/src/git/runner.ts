/**
 * The confined way to run git: an argument array (never a shell), a timeout, an output cap, and a record
 * of every in-flight process so disposal can abort and reap them. Set `GIT_OPTIONAL_LOCKS=0` so a status
 * poll never takes the index lock an agent's own `git` call may need.
 */

import { execFile } from 'node:child_process'
import { realpath, stat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { WorkspaceGitError } from './errors.ts'

const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024
const DEFAULT_TIMEOUT_MS = 10_000

const GLOBAL_ARGS = ['-c', 'core.quotepath=false', '-c', 'color.ui=false', '-c', 'core.fsmonitor=false'] as const

export interface GitRunnerOptions {
  /** Executable to run. Defaults to `git`. */
  readonly gitPath?: string
  /** Output cap per command; longer output is cut and flagged. */
  readonly maxOutputBytes?: number
  readonly timeoutMs?: number
}

export interface RunResult {
  readonly stdout: string
  readonly truncated: boolean
}

interface Inflight {
  readonly abort: () => void
  readonly done: Promise<void>
}


export function emptyResult(): RunResult {
  return { stdout: '', truncated: false }
}

export class GitRunner {
  private readonly gitPath: string
  private readonly maxOutputBytes: number
  private readonly timeoutMs: number
  private readonly inflight = new Set<Inflight>()
  private disposed = false

  constructor(options: GitRunnerOptions = {}) {
    this.gitPath = options.gitPath ?? 'git'
    this.maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  /** Abort every in-flight `git` process and wait for each to exit. Later calls reject. */
  async dispose(): Promise<void> {
    this.disposed = true
    const pending = [...this.inflight]
    for (const entry of pending) entry.abort()
    await Promise.all(pending.map(entry => entry.done))
  }

  async resolveDirectory(path: string): Promise<string> {
    if (typeof path !== 'string' || path.length === 0 || path.includes('\0') || !isAbsolute(path)) {
      throw new WorkspaceGitError('path must be an absolute directory', 'invalid')
    }
    let real: string
    try {
      real = await realpath(path)
      if (!(await stat(real)).isDirectory()) throw new Error('not a directory')
    } catch {
      throw new WorkspaceGitError('path is not an existing directory', 'invalid')
    }
    return real
  }

  run(args: readonly string[], cwd: string, acceptExit?: number, timeoutMs?: number): Promise<RunResult> {
    if (this.disposed) return Promise.reject(new WorkspaceGitError('git service is disposed', 'failed'))
    const controller = new AbortController()
    let settle!: () => void
    const done = new Promise<void>((resolve) => { settle = resolve })
    const entry: Inflight = { abort: () => { controller.abort() }, done }
    this.inflight.add(entry)
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      GIT_OPTIONAL_LOCKS: '0',
      GIT_TERMINAL_PROMPT: '0',
      GIT_PAGER: 'cat',
      LC_ALL: 'C',
    }
    delete env.GIT_DIR
    delete env.GIT_WORK_TREE
    delete env.GIT_INDEX_FILE
    return new Promise<RunResult>((resolve, reject) => {
      const child = execFile(
        this.gitPath,
        [...GLOBAL_ARGS, ...args],
        {
          cwd,
          env,
          encoding: 'utf8',
          maxBuffer: this.maxOutputBytes,
          timeout: timeoutMs ?? this.timeoutMs,
          signal: controller.signal,
        },
        (failure, stdout, stderr) => {
          if (failure === null) {
            resolve({ stdout, truncated: false })
            return
          }
          const info = failure as NodeJS.ErrnoException & { stdout?: string }
          if (info.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
            resolve({ stdout: info.stdout ?? stdout, truncated: true })
            return
          }
          if (typeof info.code === 'number' && info.code === acceptExit) {
            resolve({ stdout, truncated: false })
            return
          }
          if (/not a git repository/i.test(stderr)) {
            reject(new WorkspaceGitError('not a git repository', 'not-repo'))
            return
          }
          reject(new WorkspaceGitError(`git ${args[0] ?? ''} failed`, 'failed'))
        },
      )
      // execFile's callback fires as soon as an abort is requested, before the process has exited.
      // Only the child's `close` (or a spawn `error`) proves it is gone, so that is what disposal awaits.
      const finished = (): void => {
        this.inflight.delete(entry)
        settle()
      }
      child.once('close', finished)
      child.once('error', finished)
    })
  }
}
