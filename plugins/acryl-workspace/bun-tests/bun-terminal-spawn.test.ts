// Run with Bun (not part of the Node vitest suite): `bun test bun-tests` from this package folder (macOS, Linux). Mirrors deno-tests/deno-ffi-pty-spawn.test.ts (specs/042, Bun experiment).
import { expect, test } from 'bun:test'
import { spawnBunTerminal } from '../src/pty/bun-terminal-spawn.ts'

const posixTest = process.platform === 'win32' ? test.skip : test // the Windows counterpart is bun-terminal-spawn.windows.test.ts

const OPTS = { cwd: '', env: { PATH: '/usr/bin:/bin', HOME: '/tmp' }, name: 'xterm-256color', cols: 80, rows: 24 } as const
const run = (command: string, args: string[], opts: Partial<typeof OPTS> & { env?: Record<string, string> } = {}) => {
  let output = ''
  const proc = spawnBunTerminal(command, args, { ...OPTS, ...opts } as never)
  const exited = new Promise<{ exitCode: number; signal?: number }>(resolve => proc.onExit(resolve))
  proc.onData(d => { output += d })
  return { proc, exited, output: () => output }
}
const within = <T>(p: Promise<T>, ms: number, what: string) => Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`timeout: ${what}`)), ms))])
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

posixTest('output and exit code', async () => {
  const t = run('/bin/sh', ['-c', 'echo hello; exit 3'])
  expect((await within(t.exited, 4000, 'exit')).exitCode).toBe(3)
  expect(t.output()).toBe('hello\r\n')
})

posixTest('a multibyte character split across two reads arrives whole', async () => {
  const t = run('/bin/sh', ['-c', "printf '\\342\\202'; sleep 0.3; printf '\\254'; printf ' \\360\\237'; sleep 0.3; printf '\\230\\200'"])
  await within(t.exited, 5000, 'exit')
  expect(t.output()).toBe('€ \u{1F600}')
})

posixTest('cwd, env and TERM reach the child', async () => {
  const t = run('/bin/sh', ['-c', 'pwd; echo $TERM $PROBE'], { cwd: '/usr', env: { PATH: '/usr/bin:/bin', PROBE: 'yes' } })
  await within(t.exited, 4000, 'exit')
  expect(t.output()).toBe('/usr\r\nxterm-256color yes\r\n')
})

posixTest('interactive input, resize, kill and Ctrl-C', async () => {
  const echo = run('/bin/cat', [])
  await sleep(200); echo.proc.write('ping\n'); await sleep(300)
  expect(echo.output()).toContain('ping')
  echo.proc.kill('SIGTERM')
  expect((await within(echo.exited, 4000, 'kill')).signal).toBe(15)

  const size = run('/bin/sh', ['-c', 'sleep 0.3; stty size'])
  size.proc.resize(132, 43)
  await within(size.exited, 4000, 'stty')
  expect(size.output().trim()).toBe('43 132')

  const sleeper = run('/bin/sh', ['-c', 'sleep 30'])
  await sleep(300); sleeper.proc.write('\x03')
  expect((await within(sleeper.exited, 4000, 'sigint')).signal).toBe(2)
})

posixTest('a 20 MB flood arrives complete', async () => {
  const t = run('/bin/sh', ['-c', 'head -c 20000000 /dev/zero | tr "\\0" x'])
  let bytes = 0
  t.proc.onData(d => { bytes += d.length })
  await within(t.exited, 60000, 'flood')
  expect(bytes).toBe(20_000_000)
})

posixTest('writing a lot to a child that is not reading never blocks the event loop', async () => {
  const t = run('/bin/sh', ['-c', 'sleep 2; wc -c'])
  let ticks = 0
  const timer = setInterval(() => ticks++, 10)
  t.proc.write('y'.repeat(2_000_000) + '\n')
  await sleep(1000)
  clearInterval(timer)
  expect(ticks).toBeGreaterThan(50)
  t.proc.write('\x04'); t.proc.kill('SIGKILL'); await within(t.exited, 4000, 'cleanup')
})

posixTest('100 sequential spawns leak no descriptors', async () => {
  const count = () => require('node:fs').readdirSync('/dev/fd').length as number
  const before = count()
  for (let i = 0; i < 100; i++) {
    const t = run('/bin/sh', ['-c', `echo n${i}`])
    await within(t.exited, 4000, `spawn ${i}`)
    expect(t.output()).toContain(`n${i}`)
  }
  await sleep(100)
  expect(count()).toBe(before)
})

posixTest('a command that does not exist fails loudly or exits non-zero', async () => {
  let failed = false
  try {
    const t = run('/nonexistent/definitely-not-here', [])
    const result = await within(t.exited, 4000, 'exit')
    failed = result.exitCode !== 0 || result.signal !== undefined
  } catch { failed = true }
  expect(failed).toBe(true)
})
