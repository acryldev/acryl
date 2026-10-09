/**
 * The terminal adapter for a Bun host: `Bun.spawn({ terminal })`.
 *
 * `node-pty` loads under Bun and returns a pid but delivers no output and no exit (specs/042, Bun experiment, 2026-10-01 P1). Bun's own pseudo-terminal spawn delivers output,
 * takes input and resizes, and reports the exit, so this adapter only maps it onto `WorkspacePtyProcess`. Bun documents `terminal` for Linux and macOS only, but 1.3.14 also runs it on Windows (ConPTY; measured on Windows 10 22H2 x64, specs/042 B6).
 */

import { createRequire } from 'node:module'
import { constants } from 'node:os'
import type { WorkspacePtyProcess, WorkspacePtySpawn } from './service.ts'

/** The slice of Bun's API this file uses, declared here because the package is compiled with Node types only. */
interface BunTerminal {
  write(data: string | Uint8Array): number
  resize(cols: number, rows: number): void
  close(): void
}
interface BunSubprocess {
  readonly pid: number
  readonly exitCode: number | null
  readonly signalCode: string | null
  readonly terminal?: BunTerminal
  readonly exited: Promise<number>
  kill(signal?: string | number): void
}
interface BunSpawnOptions {
  readonly cwd?: string
  readonly env: Record<string, string>
  readonly terminal: { readonly cols: number; readonly rows: number; data(terminal: BunTerminal, data: Uint8Array): void }
}
interface BunRuntime { spawn(command: readonly string[], options: BunSpawnOptions): BunSubprocess }

function bunRuntime(): BunRuntime | undefined {
  return (globalThis as { Bun?: BunRuntime }).Bun
}

/** Whether this host is Bun on a platform whose `Bun.spawn` supports a terminal (macOS and Linux; Windows x64 measured). */
export function bunTerminalSupported(): boolean {
  const bun = bunRuntime()
  return bun !== undefined && typeof bun.spawn === 'function' && (process.platform === 'darwin' || process.platform === 'linux' || (process.platform === 'win32' && process.arch === 'x64'))
}

let consoleCtrlCRestored = false
/**
 * Windows: a process started from a service or a remote shell can carry the "ignore Ctrl-C" console flag, and every child inherits it, so a Ctrl-C written to the terminal would
 * do nothing (measured on Windows 10 over ssh: `ping -t` kept running; cleared, it stops). `SetConsoleCtrlHandler(NULL, FALSE)` restores normal handling; node-pty and the Deno
 * adapter do the same before they create a child.
 */
function restoreCtrlC(): void {
  if (consoleCtrlCRestored || process.platform !== 'win32') return
  consoleCtrlCRestored = true
  try {
    const ffi = createRequire(import.meta.url)('bun:ffi') as { dlopen(path: string, symbols: Record<string, { args: string[]; returns: string }>): { symbols: { SetConsoleCtrlHandler(handler: null, add: number): number } } }
    ffi.dlopen('kernel32.dll', { SetConsoleCtrlHandler: { args: ['ptr', 'i32'], returns: 'i32' } }).symbols.SetConsoleCtrlHandler(null, 0)
  } catch { /* a terminal without Ctrl-C is better than none */ }
}

export const spawnBunTerminal: WorkspacePtySpawn = (command, args, options): WorkspacePtyProcess => {
  const bun = bunRuntime()
  if (bun === undefined || !bunTerminalSupported()) throw new Error(`the Bun terminal is for Bun on macOS, Linux and Windows x64 (this is ${process.platform}${bun === undefined ? ', not Bun' : ''}); use node-pty`)
  restoreCtrlC()

  const dataListeners = new Set<(data: string) => void>()
  const exitListeners = new Set<(event: { exitCode: number; signal?: number }) => void>()
  const decoder = new TextDecoder('utf-8') // streaming: a character split across two chunks is held back, not mangled
  const env = Object.fromEntries(Object.entries({ ...options.env, TERM: options.name }).flatMap(([key, value]) => (value === undefined ? [] : [[key, value]])))

  const proc = bun.spawn([command, ...args], {
    ...(options.cwd === '' ? {} : { cwd: options.cwd }),
    env,
    terminal: {
      cols: options.cols,
      rows: options.rows,
      data(_terminal, chunk) {
        const text = decoder.decode(chunk, { stream: true })
        if (text !== '') for (const listener of [...dataListeners]) listener(text)
      },
    },
  })
  const terminal = proc.terminal
  if (terminal === undefined) throw new Error('Bun.spawn returned no terminal')

  void proc.exited.then(async () => {
    // Output the child wrote last can still be in flight when the exit is reported: give the data callback one turn before the exit event.
    await new Promise<void>(resolve => setTimeout(resolve, 20))
    const rest = decoder.decode()
    if (rest !== '') for (const listener of [...dataListeners]) listener(rest)
    const signalName = proc.signalCode
    const signal = signalName === null ? undefined : (constants.signals as Record<string, number>)[signalName]
    const event = signal === undefined ? { exitCode: proc.exitCode ?? 0 } : { exitCode: 0, signal }
    try { terminal.close() } catch { /* already closed with the process */ }
    for (const listener of [...exitListeners]) listener(event)
  })

  const subscribe = <T>(set: Set<T>, listener: T): { dispose(): void } => {
    set.add(listener)
    return { dispose: () => { set.delete(listener) } }
  }

  return {
    onData: listener => subscribe(dataListeners, listener),
    onExit: listener => subscribe(exitListeners, listener),
    write: data => { terminal.write(data) },
    resize: (cols, rows) => { terminal.resize(cols, rows) },
    // Windows has no signals: kill() ends the process whatever the name (SIGHUP, the default here, is not implemented there).
    kill: signal => { if (process.platform === 'win32') proc.kill(); else proc.kill(signal ?? 'SIGHUP') },
  }
}
