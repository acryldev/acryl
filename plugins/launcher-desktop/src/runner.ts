/**
 * The one place this plugin starts processes. A `Runner` hands back a `Run` the service watches; the real one spawns the command through the
 * machine's own Node and npm (the desktop app carries no Node of its own yet, spec 050 T005) and stops a whole tree, not only its first process
 * (`npm run dev` starts a server below npm).
 */
import { spawn, spawnSync } from 'node:child_process'
import { closeSync, existsSync, openSync, readSync } from 'node:fs'
import { StringDecoder } from 'node:string_decoder'

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
  /** A file for the command's output instead of a pipe into this process: a command that may outlive this process (a Desktop app's window) needs it,
   * since a write into a pipe whose reader has gone kills the writer (EPIPE). Its output still reaches `onOutput`, read from the file as it grows. */
  readonly log?: string
}

export type Runner = (command: Command) => Run

/** Keys the desktop app set for itself; a started app must choose its own (a shared one would put the new app in this app's home and port). */
const OWN_KEYS = /^(ACRYL_|ACRYLBLENDS_|DSH_|ELECTRON_|npm_|PORT$|WATCH_REPORT_DEPENDENCIES$)/u

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

/**
 * What a child of the Electron main process inherits. On Linux Chromium opens its DevTools port (`--remote-debugging-port`), its sockets and its files without
 * close-on-exec and Node's spawn passes every one on, so an app started from here kept the port bound after this app quit. macOS closes all but the standard streams
 * when it starts a process, and Windows does not inherit a socket, so only Linux needs it. bash's `exec 12>&-` closes a descriptor of any number (dash takes one
 * digit); the command then replaces bash, so the process id and group stay the child's. The same text is in plugins/desktop-shell/inherited.ts; keep them equal.
 */
// biome-ignore lint/suspicious/noTemplateCurlyInString: shell parameter expansion, not a JavaScript template
const CLOSE_AND_RUN = 'for f in /proc/self/fd/*; do n=${f##*/}; if [ "$n" -gt 2 ]; then eval "exec $n>&-"; fi; done; exec "$@"'
const BASH = '/bin/bash'

/** The program and arguments to spawn so the child holds no descriptor above 2: the command itself where that is already so, or where bash is not there. */
export function withoutInheritedDescriptors(program: string, args: readonly string[], platform: NodeJS.Platform = process.platform, hasBash: boolean = existsSync(BASH)): { readonly program: string, readonly args: readonly string[] } {
  if (platform !== 'linux' || !hasBash) return { program, args }
  return { program: BASH, args: ['-c', CLOSE_AND_RUN, 'acryl-spawn', program, ...args] }
}

/** Stop a command and everything it started: a process group on Unix, `taskkill /t` on Windows. */
function stopTree(pid: number, platform: NodeJS.Platform): void {
  try {
    if (platform === 'win32') spawnSync('taskkill', ['/pid', String(pid), '/t', '/f'], { windowsHide: true })
    else process.kill(-pid, 'SIGTERM')
  } catch { /* already gone */ }
}

/** Read a file as it grows, until the returned function is called (it reads what is left first). */
function follow(file: string, emit: (text: string) => void): () => void {
  const fd = openSync(file, 'r')
  const decoder = new StringDecoder('utf8')
  const buffer = Buffer.alloc(64 * 1024)
  let at = 0
  const read = (): void => {
    for (let n = readSync(fd, buffer, 0, buffer.length, at); n > 0; n = readSync(fd, buffer, 0, buffer.length, at)) {
      at += n
      emit(decoder.write(buffer.subarray(0, n)))
    }
  }
  const timer = setInterval(read, 250)
  timer.unref()
  return () => { clearInterval(timer); read(); closeSync(fd) }
}

export const spawnRunner: Runner = (command) => {
  const win = process.platform === 'win32'
  // `npm` and `npx` are .cmd files on Windows, which only a shell starts.
  const start = win ? { program: command.program, args: command.args } : withoutInheritedDescriptors(command.program, command.args)
  const log = command.log === undefined ? undefined : openSync(command.log, 'w')
  const output = log ?? 'pipe'
  const child = spawn(start.program, [...start.args], { cwd: command.cwd, env: command.env as NodeJS.ProcessEnv, shell: win, detached: !win, windowsHide: true, stdio: ['ignore', output, output] })
  if (log !== undefined) closeSync(log)
  const outputs: Array<(text: string) => void> = []
  const emit = (text: string): void => { for (const listener of outputs) listener(text) }
  const unfollow = command.log === undefined ? () => {} : follow(command.log, emit)
  const ends: Array<(end: { code: number | null, notFound: boolean, error?: string }) => void> = []
  let ended = false
  const finish = (end: { code: number | null, notFound: boolean, error?: string }): void => {
    if (ended) return
    ended = true
    unfollow()
    for (const listener of ends) listener(end)
  }
  for (const stream of [child.stdout, child.stderr]) stream?.on('data', (chunk: Buffer) => { emit(chunk.toString('utf8')) })
  child.on('error', (cause: NodeJS.ErrnoException) => { finish({ code: null, notFound: cause.code === 'ENOENT', error: cause.message }) })
  // 127 is "not found" from a shell (Unix), 1 with this text is cmd.exe's.
  child.on('close', (code) => { finish({ code, notFound: code === 127 }) })
  return {
    onOutput: (listener) => { outputs.push(listener) },
    onEnd: (listener) => { ends.push(listener) },
    stop: () => { if (!ended && child.pid !== undefined) stopTree(child.pid, process.platform) },
  }
}
