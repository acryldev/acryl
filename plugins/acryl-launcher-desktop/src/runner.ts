/**
 * The one place this plugin starts processes. A `Runner` hands back a `Run` the service watches; the real one spawns the command through the
 * machine's own Node and npm (the desktop app carries no Node of its own yet, spec 050 T005) and stops a whole tree, not only its first process
 * (`npm run dev` starts a server below npm).
 */
import { spawn, spawnSync } from 'node:child_process'

export interface Run {
  /** Output so far is delivered in chunks, stdout and stderr together. */
  onOutput(listener: (text: string) => void): void
  /** The end, once: the exit code, or the reason the command could not start (`notFound` when the program is not on this machine). */
  onEnd(listener: (end: { code: number | null, notFound: boolean, error?: string }) => void): void
  stop(): void
}

export interface Command {
  readonly program: string
  readonly args: readonly string[]
  readonly cwd: string
  readonly env: Readonly<Record<string, string | undefined>>
}

export type Runner = (command: Command) => Run

/** Keys the desktop app set for itself; a started app must choose its own (a shared one would put the new app in this app's home and port). */
const OWN_KEYS = /^(ACRYL_|DSH_|ELECTRON_|npm_|PORT$)/u

/** The environment a started app gets: this process's, without the keys above, plus the places Node usually lives (a Dock launch has a short PATH). */
export function appEnvironment(base: Readonly<Record<string, string | undefined>>, platform: NodeJS.Platform = process.platform): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(base)) if (!OWN_KEYS.test(key)) env[key] = value
  if (platform !== 'win32') {
    const extra = ['/opt/homebrew/bin', '/usr/local/bin']
    const have = (env.PATH ?? '').split(':')
    env.PATH = [...have, ...extra.filter(dir => !have.includes(dir))].filter(dir => dir !== '').join(':')
  }
  return env
}

/** Stop a command and everything it started: a process group on Unix, `taskkill /t` on Windows. */
function stopTree(pid: number, platform: NodeJS.Platform): void {
  try {
    if (platform === 'win32') spawnSync('taskkill', ['/pid', String(pid), '/t', '/f'], { windowsHide: true })
    else process.kill(-pid, 'SIGTERM')
  } catch { /* already gone */ }
}

export const spawnRunner: Runner = (command) => {
  const win = process.platform === 'win32'
  // `npm` and `npx` are .cmd files on Windows, which only a shell starts.
  const child = spawn(command.program, [...command.args], { cwd: command.cwd, env: command.env as NodeJS.ProcessEnv, shell: win, detached: !win, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  const outputs: Array<(text: string) => void> = []
  const ends: Array<(end: { code: number | null, notFound: boolean, error?: string }) => void> = []
  let ended = false
  const finish = (end: { code: number | null, notFound: boolean, error?: string }): void => {
    if (ended) return
    ended = true
    for (const listener of ends) listener(end)
  }
  for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk: Buffer) => { for (const listener of outputs) listener(chunk.toString('utf8')) })
  child.on('error', (cause: NodeJS.ErrnoException) => { finish({ code: null, notFound: cause.code === 'ENOENT', error: cause.message }) })
  // 127 is "not found" from a shell (Unix), 1 with this text is cmd.exe's.
  child.on('close', (code) => { finish({ code, notFound: code === 127 }) })
  return {
    onOutput: (listener) => { outputs.push(listener) },
    onEnd: (listener) => { ends.push(listener) },
    stop: () => { if (!ended && child.pid !== undefined) stopTree(child.pid, process.platform) },
  }
}
