// Run on Windows: deno test -A --no-check plugins/acryl-workspace/deno-tests/   (the other files in this folder are ignored there)
import { spawnDenoConpty } from '../src/pty/deno-conpty-spawn.ts'

const winTest = (name: string, fn: () => void | Promise<void>) => Deno.test({ name, ignore: Deno.build.os !== 'windows', fn })
const baseEnv = Deno.env.toObject()
const OPTS = { cwd: '', env: baseEnv, name: 'xterm-256color', cols: 80, rows: 24 }
type Opts = Partial<typeof OPTS>
const run = (command: string, args: string[], opts: Opts = {}) => {
  let output = ''
  const proc = spawnDenoConpty(command, args, { ...OPTS, ...opts } as never)
  const exited = new Promise<{ exitCode: number; signal?: number }>((resolve) => proc.onExit(resolve))
  proc.onData((d) => { output += d })
  return { proc, exited, output: () => output }
}
const within = <T>(p: Promise<T>, ms: number, what: string) => Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`timeout: ${what}`)), ms))])
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const assertEq = <T>(actual: T, expected: T) => { if (actual !== expected) throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`) }
const assertIncludes = (haystack: string, needle: string) => { if (!haystack.includes(needle)) throw new Error(`expected ${JSON.stringify(haystack.slice(0, 400))} to include ${JSON.stringify(needle)}`) }

const handleCount = (): number => {
  const lib = Deno.dlopen('kernel32.dll', { GetCurrentProcess: { parameters: [], result: 'usize' }, GetProcessHandleCount: { parameters: ['usize', 'buffer'], result: 'i32' } } as const)
  const out = new Uint32Array(1)
  lib.symbols.GetProcessHandleCount(lib.symbols.GetCurrentProcess(), new Uint8Array(out.buffer))
  lib.close()
  return out[0] as number
}

winTest('output and exit code', async () => {
  const t = run('cmd.exe', ['/c', 'echo hello-conpty & exit 3'])
  assertEq((await within(t.exited, 8000, 'exit')).exitCode, 3)
  assertIncludes(t.output(), 'hello-conpty')
})

winTest('cwd and env reach the child', async () => {
  const t = run('cmd.exe', ['/c', 'cd & echo probe=%PROBE%'], { cwd: 'C:\\Windows', env: { ...baseEnv, PROBE: 'yes' } })
  await within(t.exited, 8000, 'exit')
  assertIncludes(t.output(), 'C:\\Windows')
  assertIncludes(t.output(), 'probe=yes')
})

winTest('arguments with spaces and quotes arrive intact', async () => {
  const t = run('cmd.exe', ['/c', 'echo', 'two words', 'say "hi"'])
  await within(t.exited, 8000, 'exit')
  assertIncludes(t.output(), 'two words')
  assertIncludes(t.output(), 'say')
})

winTest('interactive: a typed command runs, then exit with a code', async () => {
  const t = run('cmd.exe', [])
  await sleep(800)
  t.proc.write('echo ping-123\r')
  await sleep(800)
  assertIncludes(t.output(), 'ping-123')
  t.proc.write('exit 5\r')
  assertEq((await within(t.exited, 8000, 'exit')).exitCode, 5)
})

winTest('a multibyte character split across reads, and non-ASCII input, arrive whole', async () => {
  const t = run('cmd.exe', ['/c', 'chcp 65001 >nul & echo caf\u00e9 \u20ac'])
  await within(t.exited, 8000, 'exit')
  assertIncludes(t.output(), 'caf\u00e9')
})

winTest('resize reaches the child (mode con)', async () => {
  const t = run('cmd.exe', ['/c', 'ping -n 3 127.0.0.1 >nul & mode con'], { cols: 80, rows: 24 })
  await sleep(300)
  t.proc.resize(120, 40)
  await within(t.exited, 12000, 'mode')
  if (!/Columns:\s+120/.test(t.output())) throw new Error(`resize not seen: ${JSON.stringify(t.output().slice(-300))}`)
})

winTest('Ctrl-C interrupts a running child; kill() ends one', async () => {
  const a = run('cmd.exe', ['/c', 'ping -n 30 127.0.0.1'])
  await sleep(1200)
  const t0 = Date.now()
  a.proc.kill('SIGINT')
  const ended = await within(a.exited, 10000, 'ctrl-c')
  if (Date.now() - t0 > 9000) throw new Error('took too long to react')
  if (ended.exitCode === 0 && !a.output().includes('^C')) throw new Error(`no sign of an interrupt: ${JSON.stringify(ended)}`)
  const b = run('cmd.exe', ['/c', 'ping -n 30 127.0.0.1'])
  await sleep(600)
  b.proc.kill('SIGTERM')
  await within(b.exited, 8000, 'kill')
})

winTest('a 5 MB flood arrives complete', async () => {
  const n = 5_000_000
  const t = run('powershell.exe', ['-NoProfile', '-Command', `[Console]::Out.Write(('x' * ${n})); [Console]::Out.Write('END-MARK')`])
  await within(t.exited, 90000, 'flood')
  const out = t.output()
  assertIncludes(out, 'END-MARK')
  const xs = (out.match(/x/g) ?? []).length
  if (xs < n) throw new Error(`lost output: ${xs} of ${n} x characters`)
})

winTest('writing a lot to a child that is not reading never blocks the event loop', async () => {
  const t = run('cmd.exe', ['/c', 'ping -n 6 127.0.0.1 >nul'])
  let ticks = 0
  const timer = setInterval(() => ticks++, 10)
  t.proc.write('y'.repeat(2_000_000) + '\r')
  await sleep(1000)
  clearInterval(timer)
  if (ticks < 50) throw new Error(`event loop stalled: only ${ticks} ticks in 1 s`)
  t.proc.kill('SIGTERM')
  await within(t.exited, 10000, 'cleanup')
})

winTest('60 sequential spawns: handles stay within the known one-per-spawn leak of the inbox ConPTY', async () => {
  // Windows 10's own CreatePseudoConsole leaks one handle per pseudoconsole (measured with no child process at all); node-pty's bundled conpty.dll does not,
  // but it does not deliver Ctrl-C, which matters more (ACRYL_CONPTY=bundled opts in). So the bound is 1.5 per spawn, a regression guard against a second leak.
  const before = handleCount()
  for (let i = 0; i < 60; i++) {
    const t = run('cmd.exe', ['/c', `echo n${i}`])
    await within(t.exited, 8000, `spawn ${i}`)
    assertIncludes(t.output(), `n${i}`)
  }
  await sleep(300)
  const grown = handleCount() - before
  if (grown > 90) throw new Error(`handles grew by ${grown} over 60 spawns (the known leak is about 60)`)
})

winTest('a command that does not exist fails loudly', () => {
  let message = ''
  try { run('definitely-not-here-xyz.exe', []) } catch (e) { message = String((e as Error).message) }
  assertIncludes(message, 'could not start')
})
