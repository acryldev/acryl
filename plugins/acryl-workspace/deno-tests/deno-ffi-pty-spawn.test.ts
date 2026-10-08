// Run: deno test -A --no-check plugins/acryl-workspace/deno-tests/   (macOS; vitest does not pick this up and tsconfig does not include it)
import { spawnDenoFfiPty } from '../src/pty/deno-ffi-pty-spawn.ts'
import type { WorkspacePtyProcess } from '../src/pty/service.ts'

const OPTS = { cwd: '', env: { PATH: '/usr/bin:/bin', HOME: '/tmp' }, name: 'xterm-256color', cols: 80, rows: 24 } as const
const run = (command: string, args: string[], opts: Partial<typeof OPTS> & { env?: Record<string, string> } = {}) => {
  let output = ''
  const proc = spawnDenoFfiPty(command, args, { ...OPTS, ...opts } as never)
  const exited = new Promise<{ exitCode: number; signal?: number }>((resolve) => proc.onExit(resolve))
  proc.onData((d) => { output += d })
  return { proc, exited, output: () => output }
}
const within = <T>(p: Promise<T>, ms: number, what: string) => Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`timeout: ${what}`)), ms))])
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const openFds = () => [...Deno.readDirSync('/dev/fd')].length
// Direct children of this process (zombies included): /proc on Linux, pgrep on macOS.
const children = async () => {
  if (Deno.build.os === 'linux') {
    const found: string[] = []
    for (const e of Deno.readDirSync('/proc')) {
      if (!/^\d+$/.test(e.name)) continue
      try { const stat = Deno.readTextFileSync(`/proc/${e.name}/stat`); if (Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]) === Deno.pid) found.push(e.name) } catch { /* gone */ }
    }
    return found.join(' ')
  }
  return new TextDecoder().decode((await new Deno.Command('pgrep', { args: ['-P', String(Deno.pid)], stdout: 'piped', stderr: 'null' }).output()).stdout).trim()
}

Deno.test('output and exit code', async () => {
  const t = run('/bin/sh', ['-c', 'echo hello; exit 3'])
  assertEq((await within(t.exited, 4000, 'exit')).exitCode, 3)
  assertEq(t.output(), 'hello\r\n')
})

Deno.test('a multibyte character split across two reads arrives whole', async () => {
  const t = run('/bin/sh', ['-c', "printf '\\342\\202'; sleep 0.3; printf '\\254'; printf ' \\360\\237'; sleep 0.3; printf '\\230\\200'"])
  await within(t.exited, 5000, 'exit')
  assertEq(t.output(), '€ \u{1F600}') // euro sign, grinning face; a broken decoder would emit U+FFFD
})

Deno.test('cwd, env and TERM reach the child', async () => {
  const t = run('/bin/sh', ['-c', 'pwd; echo $TERM $PROBE'], { cwd: '/usr', env: { PATH: '/usr/bin:/bin', PROBE: 'yes' } })
  await within(t.exited, 4000, 'exit')
  assertEq(t.output(), '/usr\r\nxterm-256color yes\r\n')
})

Deno.test('interactive input, resize and Ctrl-C', async () => {
  const echo = run('/bin/cat', [])
  await sleep(200); echo.proc.write('ping\n'); await sleep(300)
  assertIncludes(echo.output(), 'ping')
  echo.proc.kill('SIGTERM')
  assertEq((await within(echo.exited, 4000, 'kill')).signal, 15)

  const size = run('/bin/sh', ['-c', 'sleep 0.3; stty size'])
  size.proc.resize(132, 43)
  await within(size.exited, 4000, 'stty')
  assertEq(size.output().trim(), '43 132')

  const sleeper = run('/bin/sh', ['-c', 'sleep 30'])
  await sleep(300); sleeper.proc.write('\x03')
  assertEq((await within(sleeper.exited, 4000, 'sigint')).signal, 2)
})

Deno.test('a 20 MB flood arrives complete (backpressure, bounded read per tick)', async () => {
  const t = run('/bin/sh', ['-c', 'head -c 20000000 /dev/zero | tr "\\0" x'])
  let bytes = 0
  t.proc.onData((d) => { bytes += d.length })
  await within(t.exited, 60000, 'flood')
  assertEq(bytes, 20_000_000)
})

Deno.test('writing a lot to a child that is not reading never blocks the event loop', async () => {
  const t = run('/bin/sh', ['-c', 'sleep 2; wc -c'])
  let ticks = 0
  const timer = setInterval(() => ticks++, 10)
  t.proc.write('y'.repeat(2_000_000) + '\n') // far past the pty buffer; the rest is queued, not written blocking
  await sleep(1000)
  clearInterval(timer)
  if (ticks < 50) throw new Error(`event loop stalled: only ${ticks} ticks in 1 s`)
  t.proc.write('\x04'); t.proc.kill('SIGKILL'); await within(t.exited, 4000, 'cleanup')
})

Deno.test('100 sequential spawns leak no descriptors and leave no zombies', async () => {
  const before = openFds()
  for (let i = 0; i < 100; i++) {
    const t = run('/bin/sh', ['-c', `echo n${i}`])
    await within(t.exited, 4000, `spawn ${i}`)
    assertIncludes(t.output(), `n${i}`)
  }
  await sleep(100)
  assertEq(openFds(), before)
  assertEq(await children(), '')
})

Deno.test('a command that does not exist fails loudly', () => {
  let message = ''
  try { run('/nonexistent/definitely-not-here', []) } catch (e) { message = String((e as Error).message) }
  assertIncludes(message, 'could not start')
})

function assertEq<T>(actual: T, expected: T) { if (actual !== expected) throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`) }
function assertIncludes(haystack: string, needle: string) { if (!haystack.includes(needle)) throw new Error(`expected ${JSON.stringify(haystack)} to include ${JSON.stringify(needle)}`) }
void (undefined as unknown as WorkspacePtyProcess)
