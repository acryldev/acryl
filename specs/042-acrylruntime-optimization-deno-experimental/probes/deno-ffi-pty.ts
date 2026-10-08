// D3 spike: a pseudo-terminal on Deno with no node-pty, through libc FFI (macOS arm64/x64 symbols; Linux differs in libutil + flag values).
// openpty -> posix_spawn (new session, slave dup'd to 0/1/2) -> poll the non-blocking master for data -> waitpid(WNOHANG) for the exit.
// Run: deno run -A specs/042-acrylruntime-optimization-deno-experimental/probes/deno-ffi-pty.ts
// Starts no servers and touches no ACRYL home; every child it starts is waited for or killed before exit.

const lib = Deno.dlopen('/usr/lib/libSystem.B.dylib', {
  openpty: { parameters: ['buffer', 'buffer', 'pointer', 'pointer', 'buffer'], result: 'i32' },
  posix_spawn_file_actions_init: { parameters: ['buffer'], result: 'i32' },
  posix_spawn_file_actions_adddup2: { parameters: ['buffer', 'i32', 'i32'], result: 'i32' },
  posix_spawn_file_actions_addclose: { parameters: ['buffer', 'i32'], result: 'i32' },
  posix_spawn_file_actions_destroy: { parameters: ['buffer'], result: 'i32' },
  posix_spawnattr_init: { parameters: ['buffer'], result: 'i32' },
  posix_spawnattr_setflags: { parameters: ['buffer', 'i16'], result: 'i32' },
  posix_spawnattr_destroy: { parameters: ['buffer'], result: 'i32' },
  posix_spawnp: { parameters: ['buffer', 'buffer', 'buffer', 'buffer', 'buffer', 'buffer'], result: 'i32' },
  waitpid: { parameters: ['i32', 'buffer', 'i32'], result: 'i32' },
  read: { parameters: ['i32', 'buffer', 'usize'], result: 'isize' },
  write: { parameters: ['i32', 'buffer', 'usize'], result: 'isize' },
  close: { parameters: ['i32'], result: 'i32' },
  poll: { parameters: ['buffer', 'u32', 'i32'], result: 'i32' },
  // ioctl is variadic: on Apple arm64 variadic args are passed on the stack, so six dummy register args push the real one there.
  ioctl: { parameters: ['i32', 'u64', 'i32', 'i32', 'i32', 'i32', 'i32', 'i32', 'buffer'], result: 'i32' },
  kill: { parameters: ['i32', 'i32'], result: 'i32' },
} as const)

const enc = new TextEncoder()
const dec = new TextDecoder()
const cstr = (s: string) => enc.encode(s + '\0')
const ptrOf = (buf: Uint8Array | BigUint64Array) => Deno.UnsafePointer.of(buf)

const POSIX_SPAWN_SETSID = 0x0400 // macOS
const POLLIN = 0x0001, POLLHUP = 0x0010 // macOS
const TIOCSWINSZ = 0x80087467n // macOS

export interface FfiPty {
  pid: number
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(signal?: number): void
  /** Resolves with the exit status once the child has exited and its output is drained. */
  exited: Promise<{ code: number; signal: number }>
}

export function spawnPty(file: string, args: string[], opts: { cols?: number; rows?: number; env?: Record<string, string>; onData: (s: string) => void }): FfiPty {
  const cols = opts.cols ?? 80, rows = opts.rows ?? 24
  const fds = new Int32Array(2)
  const winsize = new Uint16Array([rows, cols, 0, 0])
  if (lib.symbols.openpty(new Uint8Array(fds.buffer, 0, 4), new Uint8Array(fds.buffer, 4, 4), null, null, new Uint8Array(winsize.buffer)) !== 0) throw new Error('openpty failed')
  const [master, slave] = fds

  const actionsCell = new BigUint64Array(1), attrCell = new BigUint64Array(1)
  lib.symbols.posix_spawn_file_actions_init(new Uint8Array(actionsCell.buffer))
  lib.symbols.posix_spawnattr_init(new Uint8Array(attrCell.buffer))
  const actions = new Uint8Array(actionsCell.buffer), attr = new Uint8Array(attrCell.buffer)
  for (const fd of [0, 1, 2]) lib.symbols.posix_spawn_file_actions_adddup2(actions, slave, fd)
  lib.symbols.posix_spawn_file_actions_addclose(actions, slave)
  lib.symbols.posix_spawn_file_actions_addclose(actions, master)
  lib.symbols.posix_spawnattr_setflags(attr, POSIX_SPAWN_SETSID)

  const pointerTable = (strings: string[]) => {
    const bufs = strings.map(cstr)
    const table = new BigUint64Array(strings.length + 1)
    bufs.forEach((b, i) => { table[i] = BigInt(Deno.UnsafePointer.value(ptrOf(b))) })
    return { bufs, table } // bufs kept alive by the caller until the spawn returns
  }
  const argvT = pointerTable([file, ...args])
  const envT = pointerTable(Object.entries({ TERM: 'xterm-256color', ...(opts.env ?? Deno.env.toObject()) }).map(([k, v]) => `${k}=${v}`))
  const pidCell = new Int32Array(1)
  const rc = lib.symbols.posix_spawnp(new Uint8Array(pidCell.buffer), cstr(file), actions, attr, new Uint8Array(argvT.table.buffer), new Uint8Array(envT.table.buffer))
  lib.symbols.posix_spawn_file_actions_destroy(actions)
  lib.symbols.posix_spawnattr_destroy(attr)
  lib.symbols.close(slave)
  if (rc !== 0) { lib.symbols.close(master); throw new Error(`posix_spawnp failed: ${rc}`) }
  const pid = pidCell[0]

  const pollfd = new Int32Array(2) // struct pollfd { int fd; short events; short revents } packed into 8 bytes
  const pollfdBytes = new Uint8Array(pollfd.buffer)
  const pollView = new DataView(pollfd.buffer)

  let resolveExit!: (v: { code: number; signal: number }) => void
  const exited = new Promise<{ code: number; signal: number }>((r) => { resolveExit = r })
  const buf = new Uint8Array(4096)
  const status = new Int32Array(1)
  let childDone: { code: number; signal: number } | undefined
  const timer = setInterval(() => {
    // Drain everything currently readable; poll() with a zero timeout so read() never blocks the event loop.
    for (;;) {
      pollView.setInt32(0, master, true); pollView.setInt16(4, POLLIN, true); pollView.setInt16(6, 0, true)
      if (lib.symbols.poll(pollfdBytes, 1, 0) <= 0) break
      const revents = pollView.getInt16(6, true)
      if ((revents & (POLLIN | POLLHUP)) === 0) break
      const n = Number(lib.symbols.read(master, buf, BigInt(buf.length)))
      if (n > 0) { opts.onData(dec.decode(buf.subarray(0, n))); continue }
      break // 0 or -1: slave side closed
    }
    if (childDone === undefined) {
      const w = lib.symbols.waitpid(pid, new Uint8Array(status.buffer), 1 /* WNOHANG */)
      if (w === pid) {
        const s = status[0]
        childDone = (s & 0x7f) === 0 ? { code: (s >> 8) & 0xff, signal: 0 } : { code: 0, signal: s & 0x7f }
      }
      return
    }
    // Child is gone: the pass above drained what was left.
    clearInterval(timer)
    lib.symbols.close(master)
    resolveExit(childDone)
  }, 10)

  return {
    pid,
    write: (data) => { const b = enc.encode(data); lib.symbols.write(master, b, BigInt(b.length)) },
    resize: (c, r) => { lib.symbols.ioctl(master, TIOCSWINSZ, 0, 0, 0, 0, 0, 0, new Uint8Array(new Uint16Array([r, c, 0, 0]).buffer)) },
    kill: (sig = 15) => { lib.symbols.kill(pid, sig) },
    exited,
  }
}

if (import.meta.main) {
  const results: string[] = []
  const check = (name: string, ok: boolean, detail = '') => { results.push(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ' ' + detail : ''}`) }

  // F1: output + exit code
  let out = ''
  const a = spawnPty('/bin/sh', ['-c', 'echo hello-from-ffi-pty; exit 3'], { onData: (s) => { out += s } })
  const ax = await Promise.race([a.exited, new Promise<null>((r) => setTimeout(() => r(null), 4000))])
  check('F1 data + exit code', out.includes('hello-from-ffi-pty') && ax?.code === 3, JSON.stringify({ out, ax }))

  // F2: it really is a tty (isatty on stdin), and TERM is set
  out = ''
  const b = spawnPty('/bin/sh', ['-c', '[ -t 0 ] && [ -t 1 ] && echo is-a-tty; echo TERM=$TERM'], { onData: (s) => { out += s } })
  await Promise.race([b.exited, new Promise((r) => setTimeout(r, 4000))])
  check('F2 child sees a tty', out.includes('is-a-tty') && out.includes('TERM=xterm-256color'), JSON.stringify(out))

  // F3: interactive - write input, child echoes it back through the tty (cat)
  out = ''
  const c = spawnPty('/bin/cat', [], { onData: (s) => { out += s } })
  await new Promise((r) => setTimeout(r, 200))
  c.write('ping-123\n')
  await new Promise((r) => setTimeout(r, 400))
  check('F3 interactive write -> echo', out.includes('ping-123'), JSON.stringify(out))
  c.kill()
  const cx = await Promise.race([c.exited, new Promise<null>((r) => setTimeout(() => r(null), 4000))])
  check('F3b kill() ends the child', cx !== null, JSON.stringify(cx))

  // F4: resize reaches the child (stty size reports rows cols)
  out = ''
  const d = spawnPty('/bin/sh', ['-c', 'sleep 0.3; stty size'], { cols: 80, rows: 24, onData: (s) => { out += s } })
  d.resize(120, 40)
  await Promise.race([d.exited, new Promise((r) => setTimeout(r, 4000))])
  check('F4 resize -> stty size', out.trim() === '40 120', JSON.stringify(out))

  // F5: many sequential spawns do not leak fds or hang
  let ok = 0
  for (let i = 0; i < 50; i++) {
    let o = ''
    const p = spawnPty('/bin/sh', ['-c', `echo n${i}`], { onData: (s) => { o += s } })
    const x = await Promise.race([p.exited, new Promise<null>((r) => setTimeout(() => r(null), 3000))])
    if (x?.code === 0 && o.includes(`n${i}`)) ok++
  }
  check('F5 50 sequential spawns', ok === 50, `${ok}/50`)

  console.log(results.join('\n'))
  lib.close()
  Deno.exit(results.every((r) => r.startsWith('OK')) ? 0 : 1)
}
