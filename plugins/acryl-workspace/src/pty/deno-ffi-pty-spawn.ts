/**
 * The terminal adapter for a Deno host: a pty made from libc through Deno's FFI.
 *
 * `node-pty` loads under Deno and spawns, but delivers no output and no exit (its fd pump and exit callback are not
 * driven by Deno's event loop; specs/042 F7). This adapter does the same job with `openpty`, `posix_spawnp`
 * (new session, the slave on fds 0-2), `poll` + `read` for output and `waitpid(WNOHANG)` for the exit.
 *
 * Platform table: macOS arm64 and Linux (glibc, arm64 and x64) have been run against the Deno tests in `deno-tests/`; macOS x64,
 * musl and Windows (ConPTY) are not written or not verified, so those hosts throw and the caller keeps `node-pty`.
 */

import { accessSync, constants } from 'node:fs'
import { delimiter, isAbsolute, join } from 'node:path'
import type { WorkspacePtyProcess, WorkspacePtySpawn } from './service.ts'

type Pointer = object | null

/** The slice of Deno's API this file uses, declared here because the package is compiled with Node types only. */
interface DenoFfi {
  readonly dlopen: (path: string, symbols: Record<string, { parameters: readonly string[]; result: string }>) => { readonly symbols: Libc; close(): void }
  readonly UnsafePointer: { of(view: ArrayBufferView): Pointer; value(pointer: Pointer): number | bigint }
}

interface Libc {
  openpty(master: Uint8Array, slave: Uint8Array, name: null, termios: null, winsize: Uint8Array): number
  posix_spawn_file_actions_init(actions: Uint8Array): number
  posix_spawn_file_actions_adddup2(actions: Uint8Array, fd: number, target: number): number
  posix_spawn_file_actions_addclose(actions: Uint8Array, fd: number): number
  posix_spawn_file_actions_addchdir_np(actions: Uint8Array, path: Uint8Array): number
  posix_spawn_file_actions_destroy(actions: Uint8Array): number
  posix_spawnattr_init(attr: Uint8Array): number
  posix_spawnattr_setflags(attr: Uint8Array, flags: number): number
  posix_spawnattr_destroy(attr: Uint8Array): number
  posix_spawnp(pid: Uint8Array, file: Uint8Array, actions: Uint8Array, attr: Uint8Array, argv: Uint8Array, envp: Uint8Array): number
  waitpid(pid: number, status: Uint8Array, options: number): number
  read(fd: number, buffer: Uint8Array, count: bigint): number | bigint
  write(fd: number, buffer: Uint8Array, count: bigint): number | bigint
  close(fd: number): number
  poll(fds: Uint8Array, count: number, timeoutMs: number): number
  /** Variadic. On Apple arm64 the argument goes on the stack (see `PLATFORMS.darwin.ioctl`), elsewhere it is an ordinary third argument. */
  ioctl(...args: readonly (number | bigint | Uint8Array)[]): number
  kill(pid: number, signal: number): number
}

const ptr = ['buffer'] as const
const SYMBOLS = {
  openpty: { parameters: ['buffer', 'buffer', 'pointer', 'pointer', 'buffer'], result: 'i32' },
  posix_spawn_file_actions_init: { parameters: ptr, result: 'i32' },
  posix_spawn_file_actions_adddup2: { parameters: ['buffer', 'i32', 'i32'], result: 'i32' },
  posix_spawn_file_actions_addclose: { parameters: ['buffer', 'i32'], result: 'i32' },
  posix_spawn_file_actions_addchdir_np: { parameters: ['buffer', 'buffer'], result: 'i32' },
  posix_spawn_file_actions_destroy: { parameters: ptr, result: 'i32' },
  posix_spawnattr_init: { parameters: ptr, result: 'i32' },
  posix_spawnattr_setflags: { parameters: ['buffer', 'i16'], result: 'i32' },
  posix_spawnattr_destroy: { parameters: ptr, result: 'i32' },
  posix_spawnp: { parameters: ['buffer', 'buffer', 'buffer', 'buffer', 'buffer', 'buffer'], result: 'i32' },
  waitpid: { parameters: ['i32', 'buffer', 'i32'], result: 'i32' },
  read: { parameters: ['i32', 'buffer', 'usize'], result: 'isize' },
  write: { parameters: ['i32', 'buffer', 'usize'], result: 'isize' },
  close: { parameters: ['i32'], result: 'i32' },
  poll: { parameters: ['buffer', 'u32', 'i32'], result: 'i32' },
  kill: { parameters: ['i32', 'i32'], result: 'i32' },
} as const

interface PlatformTable {
  readonly library: readonly string[]
  readonly spawnSetsid: number
  /** Prefix that makes the child a session leader WITH the pty as its controlling terminal (Ctrl-C needs one). Empty where the OS grants it for a dup2'd slave (macOS). */
  readonly controllingTerminalWrapper: readonly string[]
  readonly tiocswinsz: bigint
  /** FFI declaration of ioctl, and how its arguments are laid out. */
  readonly ioctl: { readonly parameters: readonly string[]; readonly args: (fd: number, request: bigint, argument: Uint8Array) => readonly (number | bigint | Uint8Array)[] }
}
const PLATFORMS: Readonly<Record<string, PlatformTable>> = {
  // Apple arm64 passes variadic arguments on the stack, so six dummy register arguments push the real one there (specs/042 F7).
  darwin: {
    library: ['/usr/lib/libSystem.B.dylib'], spawnSetsid: 0x0400, controllingTerminalWrapper: [], tiocswinsz: 0x80087467n,
    ioctl: { parameters: ['i32', 'u64', 'i32', 'i32', 'i32', 'i32', 'i32', 'i32', 'buffer'], args: (fd, request, argument) => [fd, request, 0, 0, 0, 0, 0, 0, argument] },
  },
  // glibc: openpty is in libc since 2.34 (libutil before); variadic arguments are ordinary on both arm64 and x64.
  linux: {
    // glibc gives a session leader a controlling terminal only when it opens a tty, not for a dup2'd fd, so util-linux `setsid -c` (TIOCSCTTY on stdin, then exec) does it
    // and the spawn flag is not used (setsid(1) must call setsid() itself).
    library: ['libc.so.6', 'libutil.so.1'], spawnSetsid: 0, controllingTerminalWrapper: ['setsid', '-c'], tiocswinsz: 0x5414n,
    ioctl: { parameters: ['i32', 'u64', 'buffer'], args: (fd, request, argument) => [fd, request, argument] },
  },
}
const POLLIN = 0x0001
const POLLOUT = 0x0004
const POLLHUP = 0x0010
const WNOHANG = 1
const SIGNALS: Readonly<Record<string, number>> = { SIGHUP: 1, SIGINT: 2, SIGQUIT: 3, SIGKILL: 9, SIGTERM: 15 }
const SPAWN_STRUCT_BYTES = 1024
const TICK_MS = 10
/** While data is flowing, wait this long for the next pty chunk instead of ending the tick. */
const FLOW_WAIT_MS = 1
/** At most this many bytes are read per tick, so a flood from the child is throttled by the pty buffer instead of piling up in memory. */
const READ_BUDGET_BYTES = 256 * 1024
const WRITE_CHUNK_BYTES = 4096

const denoGlobal = (): DenoFfi | undefined => (globalThis as { Deno?: DenoFfi }).Deno

/** True where this adapter has been verified: a Deno host on macOS arm64 or glibc Linux (arm64, x64). */
export function denoFfiPtySupported(platform: NodeJS.Platform = process.platform, arch: string = process.arch): boolean {
  if (denoGlobal() === undefined) return false
  return (platform === 'darwin' && arch === 'arm64') || (platform === 'linux' && (arch === 'arm64' || arch === 'x64'))
}

let libc: { readonly symbols: Libc; readonly deno: DenoFfi; readonly table: PlatformTable } | undefined
function loadLibc(): { readonly symbols: Libc; readonly deno: DenoFfi; readonly table: PlatformTable } {
  if (libc !== undefined) return libc
  const deno = denoGlobal()
  const table = PLATFORMS[process.platform]
  if (deno === undefined || table === undefined || !denoFfiPtySupported()) {
    throw new Error(`the Deno FFI terminal is verified on macOS arm64 and Linux (this is ${process.platform}-${process.arch}${deno === undefined ? ', not Deno' : ''}); use node-pty`)
  }
  const symbolDefs = { ...SYMBOLS, ioctl: { parameters: table.ioctl.parameters, result: 'i32' } }
  let loaded: { readonly symbols: Libc; close(): void } | undefined
  let failure: unknown
  for (const name of table.library) {
    try { loaded = deno.dlopen(name, symbolDefs); break } catch (error) { failure = error }
  }
  if (loaded === undefined) throw new Error(`could not load libc for the terminal (${table.library.join(', ')}): ${String(failure)}`)
  libc = { symbols: loaded.symbols, deno, table }
  return libc
}

const encoder = new TextEncoder()
const cString = (value: string): Uint8Array => encoder.encode(`${value}\0`)

/** A NULL-terminated array of C strings; the returned `keepAlive` buffers must outlive the call that uses `table`. */
function cStringTable(deno: DenoFfi, values: readonly string[]): { table: BigUint64Array; keepAlive: Uint8Array[] } {
  const keepAlive = values.map(cString)
  const table = new BigUint64Array(values.length + 1)
  keepAlive.forEach((buffer, index) => { table[index] = BigInt(deno.UnsafePointer.value(deno.UnsafePointer.of(buffer))) })
  return { table, keepAlive }
}

/** The wrapper starts fine and only then fails to exec a missing command, so check up front to keep the same loud failure as macOS (posix_spawnp reports ENOENT itself). */
function assertExecutable(command: string, env: NodeJS.ProcessEnv): void {
  const candidates = command.includes('/') ? [isAbsolute(command) ? command : join(process.cwd(), command)] : (env['PATH'] ?? process.env['PATH'] ?? '').split(delimiter).filter(Boolean).map(dir => join(dir, command))
  for (const candidate of candidates) {
    try { accessSync(candidate, constants.X_OK); return } catch { /* try the next */ }
  }
  throw new Error(`could not start ${command}: not found or not executable`)
}

const asBytes = (view: BigUint64Array | Int32Array | Uint16Array): Uint8Array => new Uint8Array(view.buffer)

export const spawnDenoFfiPty: WorkspacePtySpawn = (command, args, options): WorkspacePtyProcess => {
  const { symbols: c, deno, table } = loadLibc()

  const fds = new Int32Array(2)
  const winsize = new Uint16Array([options.rows, options.cols, 0, 0])
  if (c.openpty(new Uint8Array(fds.buffer, 0, 4), new Uint8Array(fds.buffer, 4, 4), null, null, asBytes(winsize)) !== 0) throw new Error('openpty failed')
  const master = fds[0] as number
  const slave = fds[1] as number

  // posix_spawn_file_actions_t / posix_spawnattr_t are 8-byte handles on macOS but structs on glibc (about 80 and 336 bytes): size for the largest.
  const actions = new Uint8Array(SPAWN_STRUCT_BYTES)
  const attr = new Uint8Array(SPAWN_STRUCT_BYTES)
  c.posix_spawn_file_actions_init(actions)
  c.posix_spawnattr_init(attr)
  for (const fd of [0, 1, 2]) c.posix_spawn_file_actions_adddup2(actions, slave, fd)
  c.posix_spawn_file_actions_addclose(actions, slave)
  c.posix_spawn_file_actions_addclose(actions, master)
  if (options.cwd !== '') c.posix_spawn_file_actions_addchdir_np(actions, cString(options.cwd))
  c.posix_spawnattr_setflags(attr, table.spawnSetsid)

  const env = Object.entries({ ...options.env, TERM: options.name }).flatMap(([key, value]) => (value === undefined ? [] : [`${key}=${value}`]))
  if (table.controllingTerminalWrapper.length > 0) assertExecutable(command, options.env)
  const launch = [...table.controllingTerminalWrapper, command, ...args]
  const argvTable = cStringTable(deno, launch)
  const envTable = cStringTable(deno, env)
  const pidCell = new Int32Array(1)
  const status = c.posix_spawnp(asBytes(pidCell), cString(launch[0] as string), actions, attr, asBytes(argvTable.table), asBytes(envTable.table))
  void argvTable.keepAlive
  void envTable.keepAlive
  c.posix_spawn_file_actions_destroy(actions)
  c.posix_spawnattr_destroy(attr)
  c.close(slave)
  if (status !== 0) {
    c.close(master)
    throw new Error(`could not start ${command}: posix_spawnp error ${String(status)}`)
  }
  const pid = pidCell[0] as number

  const dataListeners = new Set<(data: string) => void>()
  const exitListeners = new Set<(event: { exitCode: number; signal?: number }) => void>()
  const decoder = new TextDecoder('utf-8') // streaming: a character split across two reads is held back, not mangled
  const readBuffer = new Uint8Array(16 * 1024)
  const pollfd = new Int32Array(2)
  const pollBytes = asBytes(pollfd)
  const pollView = new DataView(pollfd.buffer)
  const waitStatus = new Int32Array(1)
  const pending: Uint8Array[] = []
  let exitInfo: { exitCode: number; signal?: number } | undefined
  let closed = false

  const ready = (events: number, timeoutMs = 0): number => {
    pollView.setInt32(0, master, true)
    pollView.setInt16(4, events, true)
    pollView.setInt16(6, 0, true)
    return c.poll(pollBytes, 1, timeoutMs) > 0 ? pollView.getInt16(6, true) : 0
  }
  const emit = (text: string): void => { if (text !== '') for (const listener of [...dataListeners]) listener(text) }

  /** Reads what is available (a pty read returns about 1 KB on macOS and the producer refills it asynchronously, hence the 1 ms wait once data is flowing). Returns the bytes read. */
  const drainOutput = (): number => {
    let budget = READ_BUDGET_BYTES
    let total = 0
    while (budget > 0 && (ready(POLLIN, total > 0 ? FLOW_WAIT_MS : 0) & (POLLIN | POLLHUP)) !== 0) {
      const count = Number(c.read(master, readBuffer, BigInt(readBuffer.length)))
      if (count <= 0) break
      budget -= count
      total += count
      emit(decoder.decode(readBuffer.subarray(0, count), { stream: true }))
    }
    return total
  }
  const flushWrites = (): void => {
    while (pending.length > 0 && (ready(POLLOUT) & POLLOUT) !== 0) {
      const head = pending[0] as Uint8Array
      const chunk = head.subarray(0, WRITE_CHUNK_BYTES)
      const written = Number(c.write(master, chunk, BigInt(chunk.length)))
      if (written <= 0) break
      if (written >= head.length) pending.shift()
      else pending[0] = head.subarray(written)
    }
  }

  // Self-scheduling: back to back while output flows (so the throttle is the read budget per turn, not the idle interval), TICK_MS when quiet.
  const tick = (): void => {
    if (closed) return
    flushWrites()
    const read = drainOutput()
    if (exitInfo === undefined) {
      if (c.waitpid(pid, asBytes(waitStatus), WNOHANG) === pid) {
        const raw = waitStatus[0] as number
        exitInfo = (raw & 0x7f) === 0 ? { exitCode: (raw >> 8) & 0xff } : { exitCode: 0, signal: raw & 0x7f }
      }
    } else if (read === 0) {
      closed = true // exited, and a pass that read nothing means the child's last output is drained
      emit(decoder.decode())
      c.close(master)
      for (const listener of [...exitListeners]) listener(exitInfo)
      return
    }
    setTimeout(tick, read > 0 || pending.length > 0 ? 0 : TICK_MS)
  }
  setTimeout(tick, TICK_MS)

  const subscribe = <T>(set: Set<T>, listener: T): { dispose(): void } => {
    set.add(listener)
    return { dispose: () => { set.delete(listener) } }
  }

  return {
    onData: listener => subscribe(dataListeners, listener),
    onExit: listener => subscribe(exitListeners, listener),
    write: data => { if (!closed && data !== '') { pending.push(encoder.encode(data)); flushWrites() } },
    resize: (cols, rows) => {
      if (closed) return
      c.ioctl(...table.ioctl.args(master, table.tiocswinsz, asBytes(new Uint16Array([rows, cols, 0, 0]))))
    },
    kill: signal => { if (!closed) c.kill(pid, SIGNALS[signal ?? 'SIGHUP'] ?? SIGNALS['SIGHUP'] as number) },
  }
}
