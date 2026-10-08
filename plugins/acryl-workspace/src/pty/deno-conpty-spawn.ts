/**
 * The terminal adapter for a Deno host on Windows: ConPTY through kernel32 FFI.
 *
 * `node-pty` loads under Deno on Windows but cannot open its ConPTY pipes (`EINVAL: open '\\.\pipe\conpty-...'`: Deno's `fs.open` does not open named pipes
 * the way Node's does; specs/042 F13). This does the same job directly: CreatePipe x2, CreatePseudoConsole, a STARTUPINFOEXW carrying the pseudoconsole
 * attribute, CreateProcessW, then PeekNamedPipe + ReadFile for output (anonymous-pipe reads block, so they are only issued for bytes already there),
 * a non-blocking WriteFile for input, WaitForSingleObject for the exit.
 *
 * Needs Windows 10 1809 or later (ConPTY) and a 64-bit Deno. Verified on Windows 10 22H2 x64 only; arm64 and 32-bit are not supported and throw.
 */

import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import type { WorkspacePtyProcess, WorkspacePtySpawn } from './service.ts'

type Pointer = object | null

interface DenoFfi {
  readonly dlopen: (path: string, symbols: Record<string, { parameters: readonly string[]; result: string }>) => { readonly symbols: Kernel32; close(): void }
  readonly UnsafePointer: { of(view: ArrayBufferView): Pointer; value(pointer: Pointer): number | bigint }
}

interface Kernel32 {
  CreatePipe(readEnd: Uint8Array, writeEnd: Uint8Array, attributes: null, size: number): number
  CreatePseudoConsole(size: number, input: bigint, output: bigint, flags: number, console: Uint8Array): number
  ResizePseudoConsole(console: bigint, size: number): number
  ClosePseudoConsole(console: bigint): void
  InitializeProcThreadAttributeList(list: Pointer, count: number, flags: number, size: Uint8Array): number
  UpdateProcThreadAttribute(list: Pointer, flags: number, attribute: bigint, value: bigint, size: bigint, previous: null, returned: null): number
  DeleteProcThreadAttributeList(list: Pointer): void
  CreateProcessW(application: null, commandLine: Pointer, processAttributes: null, threadAttributes: null, inherit: number, flags: number, environment: Pointer, directory: Pointer, startup: Uint8Array, info: Uint8Array): number
  CloseHandle(handle: bigint): number
  PeekNamedPipe(handle: bigint, buffer: null, size: number, read: null, available: Uint8Array, left: null): number
  ReadFile(handle: bigint, buffer: Uint8Array, size: number, read: Uint8Array, overlapped: null): number
  WriteFile(handle: bigint, buffer: Uint8Array, size: number, written: Uint8Array, overlapped: null): number
  SetNamedPipeHandleState(handle: bigint, mode: Uint8Array, collect: null, timeout: null): number
  WaitForSingleObject(handle: bigint, milliseconds: number): number
  GetExitCodeProcess(handle: bigint, code: Uint8Array): number
  TerminateProcess(handle: bigint, code: number): number
  SetConsoleCtrlHandler(handler: null, add: number): number
  GetLastError(): number
}

const SYMBOLS = {
  CreatePipe: { parameters: ['buffer', 'buffer', 'pointer', 'u32'], result: 'i32' },
  CreatePseudoConsole: { parameters: ['u32', 'usize', 'usize', 'u32', 'buffer'], result: 'i32' },
  ResizePseudoConsole: { parameters: ['usize', 'u32'], result: 'i32' },
  ClosePseudoConsole: { parameters: ['usize'], result: 'void' },
  InitializeProcThreadAttributeList: { parameters: ['pointer', 'u32', 'u32', 'buffer'], result: 'i32' },
  UpdateProcThreadAttribute: { parameters: ['pointer', 'u32', 'usize', 'usize', 'usize', 'pointer', 'pointer'], result: 'i32' },
  DeleteProcThreadAttributeList: { parameters: ['pointer'], result: 'void' },
  CreateProcessW: { parameters: ['pointer', 'pointer', 'pointer', 'pointer', 'i32', 'u32', 'pointer', 'pointer', 'buffer', 'buffer'], result: 'i32' },
  CloseHandle: { parameters: ['usize'], result: 'i32' },
  PeekNamedPipe: { parameters: ['usize', 'pointer', 'u32', 'pointer', 'buffer', 'pointer'], result: 'i32' },
  ReadFile: { parameters: ['usize', 'buffer', 'u32', 'buffer', 'pointer'], result: 'i32' },
  WriteFile: { parameters: ['usize', 'buffer', 'u32', 'buffer', 'pointer'], result: 'i32' },
  SetNamedPipeHandleState: { parameters: ['usize', 'buffer', 'pointer', 'pointer'], result: 'i32' },
  WaitForSingleObject: { parameters: ['usize', 'u32'], result: 'u32' },
  GetExitCodeProcess: { parameters: ['usize', 'buffer'], result: 'i32' },
  TerminateProcess: { parameters: ['usize', 'u32'], result: 'i32' },
  SetConsoleCtrlHandler: { parameters: ['pointer', 'i32'], result: 'i32' },
  GetLastError: { parameters: [], result: 'u32' },
} as const

const PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE = 0x00020016n
const EXTENDED_STARTUPINFO_PRESENT = 0x00080000
const CREATE_UNICODE_ENVIRONMENT = 0x00000400
const PIPE_NOWAIT = 1
const WAIT_OBJECT_0 = 0
const STARTUPINFOEXW_BYTES = 112 // STARTUPINFOW (104 on x64) + the attribute-list pointer
const ATTRIBUTE_LIST_OFFSET = 104
const DWFLAGS_OFFSET = 60
const STARTF_USESTDHANDLES = 0x00000100
const PIPE_BUFFER_BYTES = 4 * 1024 * 1024 // a stalled child can take this much unread input before a write is held back
const TICK_MS = 10
const FLOW_WAIT_MS = 1
const READ_BUDGET_BYTES = 256 * 1024
const WRITE_CHUNK_BYTES = 16 * 1024
const CTRL_C = '\x03'

const denoGlobal = (): DenoFfi | undefined => (globalThis as { Deno?: DenoFfi }).Deno

/** True where this adapter has been verified: a Deno host on 64-bit Windows. */
export function denoConptySupported(platform: NodeJS.Platform = process.platform, arch: string = process.arch): boolean {
  return denoGlobal() !== undefined && platform === 'win32' && arch === 'x64'
}

const PSEUDOCONSOLE_SYMBOLS = {
  CreatePseudoConsole: SYMBOLS.CreatePseudoConsole,
  ResizePseudoConsole: SYMBOLS.ResizePseudoConsole,
  ClosePseudoConsole: SYMBOLS.ClosePseudoConsole,
} as const

/**
 * Which ConPTY: the one inside Windows (kernel32) by default. node-pty also ships a newer one (conpty.dll + OpenConsole.exe, built from Windows Terminal) and
 * ACRYL_CONPTY=bundled uses it. Measured on Windows 10 22H2 (specs/042 F13): the inbox one leaks one kernel handle per pseudoconsole created (harmless at the
 * scale of a terminal tab; Windows allows millions), the bundled one leaks none but did not turn a written Ctrl-C into an interrupt (node-pty shows the same with
 * it), and Ctrl-C matters more in a terminal than a handle per tab. Switch the default when the bundled one is fixed, not before.
 */
function bundledConptyPath(): string | undefined {
  if (process.env['ACRYL_CONPTY'] !== 'bundled') return undefined
  try {
    const root = dirname(dirname(createRequire(import.meta.url).resolve('node-pty')))
    const dll = join(root, 'prebuilds', 'win32-x64', 'conpty', 'conpty.dll')
    return existsSync(dll) && existsSync(join(dirname(dll), 'OpenConsole.exe')) ? dll : undefined
  } catch {
    return undefined
  }
}

let kernel32: { readonly symbols: Kernel32; readonly deno: DenoFfi; readonly conpty: string } | undefined
function loadKernel32(): { readonly symbols: Kernel32; readonly deno: DenoFfi; readonly conpty: string } {
  if (kernel32 !== undefined) return kernel32
  const deno = denoGlobal()
  if (deno === undefined || !denoConptySupported()) throw new Error(`the Deno ConPTY terminal is verified on Windows x64 (this is ${process.platform}-${process.arch}${deno === undefined ? ', not Deno' : ''}); use node-pty`)
  const base = deno.dlopen('kernel32.dll', SYMBOLS).symbols
  const bundled = bundledConptyPath()
  const symbols = bundled === undefined ? base : { ...base, ...(deno.dlopen(bundled, PSEUDOCONSOLE_SYMBOLS).symbols as Pick<Kernel32, 'CreatePseudoConsole' | 'ResizePseudoConsole' | 'ClosePseudoConsole'>) }
  kernel32 = { symbols, deno, conpty: bundled ?? 'kernel32 (inbox)' }
  return kernel32
}

/** Which ConPTY the adapter is using ("kernel32 (inbox)" or the path of the bundled conpty.dll); for diagnostics and tests. */
export function conptyBackend(): string { return loadKernel32().conpty }

const wide = (value: string): Uint16Array => {
  const out = new Uint16Array(value.length + 1)
  for (let index = 0; index < value.length; index++) out[index] = value.charCodeAt(index)
  return out
}

/** One argument quoted the way CommandLineToArgvW (and the C runtime) reads it back. */
function quoteArgument(argument: string): string {
  if (argument !== '' && !/[\s"]/u.test(argument)) return argument
  let quoted = '"'
  let backslashes = 0
  for (const char of argument) {
    if (char === '\\') { backslashes++; continue }
    if (char === '"') quoted += '\\'.repeat(backslashes * 2 + 1) + '"'
    else quoted += '\\'.repeat(backslashes) + char
    backslashes = 0
  }
  return quoted + '\\'.repeat(backslashes * 2) + '"'
}

/** NAME=value entries, each ended by a NUL, the block ended by a second NUL (UTF-16). */
function environmentBlock(env: NodeJS.ProcessEnv): Uint16Array {
  const parts = Object.entries(env).flatMap(([name, value]) => (value === undefined ? [] : [`${name}=${value}`]))
  const units = parts.reduce((sum, part) => sum + part.length + 1, 0) + 1
  const block = new Uint16Array(units + 1)
  let at = 0
  for (const part of parts) {
    for (let index = 0; index < part.length; index++) block[at++] = part.charCodeAt(index)
    block[at++] = 0
  }
  return block
}

const handleOf = (cell: BigUint64Array): bigint => cell[0] as bigint
const asBytes = (view: BigUint64Array | Uint32Array | Uint16Array): Uint8Array => new Uint8Array(view.buffer)
const coord = (cols: number, rows: number): number => ((rows & 0xffff) << 16 | (cols & 0xffff)) >>> 0

export const spawnDenoConpty: WorkspacePtySpawn = (command, args, options): WorkspacePtyProcess => {
  const { symbols: k, deno } = loadKernel32()

  const inRead = new BigUint64Array(1), inWrite = new BigUint64Array(1), outRead = new BigUint64Array(1), outWrite = new BigUint64Array(1)
  if (k.CreatePipe(asBytes(inRead), asBytes(inWrite), null, PIPE_BUFFER_BYTES) === 0 || k.CreatePipe(asBytes(outRead), asBytes(outWrite), null, PIPE_BUFFER_BYTES) === 0) {
    throw new Error(`CreatePipe failed (${String(k.GetLastError())})`)
  }
  const hPCcell = new BigUint64Array(1)
  const hresult = k.CreatePseudoConsole(coord(options.cols, options.rows), handleOf(inRead), handleOf(outWrite), 0, asBytes(hPCcell))
  if (hresult !== 0) {
    for (const handle of [inRead, inWrite, outRead, outWrite]) k.CloseHandle(handleOf(handle))
    throw new Error(`CreatePseudoConsole failed (HRESULT 0x${(hresult >>> 0).toString(16)}); ConPTY needs Windows 10 1809 or later`)
  }
  const hPC = handleOf(hPCcell)
  // CreatePseudoConsole switches Ctrl-C handling OFF in the calling process, and every child inherits that: a written ^C would then never interrupt anything
  // (found by measurement, and node-pty does the same restore at this exact point). Do it after the call and before the child is created.
  k.SetConsoleCtrlHandler(null, 0)

  const sizeCell = new BigUint64Array(1)
  k.InitializeProcThreadAttributeList(null, 1, 0, asBytes(sizeCell)) // fails by design and reports the size needed
  const attributes = new Uint8Array(Number(sizeCell[0]))
  const attributePointer = deno.UnsafePointer.of(attributes)
  if (k.InitializeProcThreadAttributeList(attributePointer, 1, 0, asBytes(sizeCell)) === 0 || k.UpdateProcThreadAttribute(attributePointer, 0, PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE, hPC, 8n, null, null) === 0) {
    const error = k.GetLastError()
    k.ClosePseudoConsole(hPC)
    for (const handle of [inRead, inWrite, outRead, outWrite]) k.CloseHandle(handleOf(handle))
    throw new Error(`could not attach the pseudoconsole to the process (${String(error)})`)
  }

  const startup = new Uint8Array(STARTUPINFOEXW_BYTES)
  const startupView = new DataView(startup.buffer)
  startupView.setUint32(0, STARTUPINFOEXW_BYTES, true)
  // Without this the child inherits THIS process's standard handles when they are redirected (a service, ssh, a CI job): its text goes to our own stdout and the
  // pseudoconsole stays silent. USESTDHANDLES with the three handles left NULL tells it to use the console instead (what node-pty does).
  startupView.setUint32(DWFLAGS_OFFSET, STARTF_USESTDHANDLES, true)
  startupView.setBigUint64(ATTRIBUTE_LIST_OFFSET, BigInt(deno.UnsafePointer.value(attributePointer)), true)

  const commandLine = wide([command, ...args].map(quoteArgument).join(' '))
  const environment = environmentBlock(options.env)
  const directory = options.cwd === '' ? null : wide(options.cwd)
  const info = new Uint8Array(24)
  const created = k.CreateProcessW(
    null, deno.UnsafePointer.of(commandLine), null, null, 0, EXTENDED_STARTUPINFO_PRESENT | CREATE_UNICODE_ENVIRONMENT,
    deno.UnsafePointer.of(environment), directory === null ? null : deno.UnsafePointer.of(directory), startup, info,
  )
  const createError = created === 0 ? k.GetLastError() : 0
  void commandLine; void environment; void directory // kept alive across the call
  k.DeleteProcThreadAttributeList(attributePointer)
  if (created === 0) {
    k.ClosePseudoConsole(hPC)
    for (const handle of [inRead, inWrite, outRead, outWrite]) k.CloseHandle(handleOf(handle))
    throw new Error(`could not start ${command}: CreateProcessW error ${String(createError)}`)
  }
  const infoView = new DataView(info.buffer)
  const hProcess = infoView.getBigUint64(0, true)
  k.CloseHandle(infoView.getBigUint64(8, true)) // the main thread handle is not needed
  k.CloseHandle(handleOf(inRead)) // the pseudoconsole holds its own copies of its two ends
  k.CloseHandle(handleOf(outWrite))
  k.SetNamedPipeHandleState(handleOf(inWrite), asBytes(new Uint32Array([PIPE_NOWAIT])), null, null) // a full pipe then returns at once instead of blocking the event loop

  const dataListeners = new Set<(data: string) => void>()
  const exitListeners = new Set<(event: { exitCode: number; signal?: number }) => void>()
  const decoder = new TextDecoder('utf-8') // streaming: a character split across two reads is held back, not mangled
  const readBuffer = new Uint8Array(16 * 1024)
  const available = new Uint32Array(1)
  const transferred = new Uint32Array(1)
  const exitCode = new Uint32Array(1)
  const pending: Uint8Array[] = []
  const encoder = new TextEncoder()
  let exitInfo: { exitCode: number } | undefined
  let closed = false

  const emit = (text: string): void => { if (text !== '') for (const listener of [...dataListeners]) listener(text) }

  /** Reads what is in the pipe now (reads on an anonymous pipe block, so only bytes that are already there are asked for). Returns the bytes read. */
  const drainOutput = (): number => {
    let budget = READ_BUDGET_BYTES
    let total = 0
    for (;;) {
      if (budget <= 0 || k.PeekNamedPipe(handleOf(outRead), null, 0, null, asBytes(available), null) === 0) break
      const waiting = available[0] as number
      if (waiting === 0) {
        if (total === 0) break
        // data was flowing: give the producer a moment to refill, as the POSIX adapter does (waiting on the process handle is a cheap bounded sleep)
        k.WaitForSingleObject(hProcess, FLOW_WAIT_MS)
        if (k.PeekNamedPipe(handleOf(outRead), null, 0, null, asBytes(available), null) === 0 || (available[0] as number) === 0) break
      }
      const want = Math.min(available[0] as number, readBuffer.length)
      if (k.ReadFile(handleOf(outRead), readBuffer, want, asBytes(transferred), null) === 0 || (transferred[0] as number) === 0) break
      const count = transferred[0] as number
      budget -= count
      total += count
      emit(decoder.decode(readBuffer.subarray(0, count), { stream: true }))
    }
    return total
  }
  const flushWrites = (): void => {
    while (pending.length > 0) {
      const head = pending[0] as Uint8Array
      const chunk = head.subarray(0, WRITE_CHUNK_BYTES)
      if (k.WriteFile(handleOf(inWrite), chunk, chunk.length, asBytes(transferred), null) === 0) break
      const written = transferred[0] as number
      if (written === 0) break // the pipe is full; try again next tick
      if (written >= head.length) pending.shift()
      else pending[0] = head.subarray(written)
    }
  }

  const finish = (): void => {
    closed = true
    k.ClosePseudoConsole(hPC) // flushes the console's last frame into the pipe
    // The close breaks the pipe once the console has written its last frame; ReadFile then returns what is left and fails when it is empty (PeekNamedPipe
    // reports failure on a broken pipe even while it still holds data, so it is not used here).
    for (;;) {
      if (k.ReadFile(handleOf(outRead), readBuffer, readBuffer.length, asBytes(transferred), null) === 0 || (transferred[0] as number) === 0) break
      emit(decoder.decode(readBuffer.subarray(0, transferred[0] as number), { stream: true }))
    }
    emit(decoder.decode())
    for (const handle of [handleOf(inWrite), handleOf(outRead), hProcess]) k.CloseHandle(handle)
    for (const listener of [...exitListeners]) listener(exitInfo as { exitCode: number })
  }

  // Self-scheduling: back to back while output flows, TICK_MS when quiet (see the POSIX adapter for why a fixed tick is far too slow).
  const tick = (): void => {
    if (closed) return
    flushWrites()
    const read = drainOutput()
    if (exitInfo === undefined) {
      if (k.WaitForSingleObject(hProcess, 0) === WAIT_OBJECT_0) {
        k.GetExitCodeProcess(hProcess, asBytes(exitCode))
        exitInfo = { exitCode: exitCode[0] as number }
      }
    } else if (read === 0) {
      finish() // exited, and a pass that read nothing means the child's last output is drained
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
    resize: (cols, rows) => { if (!closed) k.ResizePseudoConsole(hPC, coord(cols, rows)) },
    // Windows has no signals: Ctrl-C is the console's own key, anything else ends the process.
    kill: signal => {
      if (closed || exitInfo !== undefined) return
      if (signal === 'SIGINT') pending.push(encoder.encode(CTRL_C))
      else k.TerminateProcess(hProcess, 1)
    },
  }
}
