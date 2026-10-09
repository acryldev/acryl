// Run with Bun on Windows (skipped elsewhere): `bun test bun-tests` from this package folder. The Windows counterpart of bun-terminal-spawn.test.ts (specs/042, Bun experiment).
import { expect, test } from 'bun:test'
import { spawnBunTerminal } from '../src/pty/bun-terminal-spawn.ts'

const windows = process.platform === 'win32'
const t = (name: string, fn: () => Promise<void>, ms = 30000) => (windows ? test(name, fn, ms) : test.skip(name, fn))
const OPTS = { cwd: '', env: { ...process.env } as Record<string, string>, name: 'xterm-256color', cols: 80, rows: 24 } as const
const run = (command: string, args: string[], opts: Partial<typeof OPTS> = {}) => {
  let output = ''
  const proc = spawnBunTerminal(command, args, { ...OPTS, ...opts } as never)
  const exited = new Promise<{ exitCode: number; signal?: number }>(resolve => proc.onExit(resolve))
  proc.onData(d => { output += d })
  return { proc, exited, output: () => output }
}
const within = <T>(p: Promise<T>, ms: number, what: string) => Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`timeout: ${what}`)), ms))])
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const CMD = process.env.ComSpec ?? 'cmd.exe'

t('output and exit code', async () => {
  const x = run(CMD, ['/c', 'echo hello-conpty& exit 3'])
  expect((await within(x.exited, 8000, 'exit')).exitCode).toBe(3)
  expect(x.output()).toContain('hello-conpty')
})

t('cwd and env reach the child', async () => {
  const x = run(CMD, ['/c', 'cd & echo probe=%PROBE%'], { cwd: 'C:\\Windows', env: { ...process.env, PROBE: 'yes' } as Record<string, string> })
  await within(x.exited, 8000, 'exit')
  expect(x.output()).toContain('C:\\Windows')
  expect(x.output()).toContain('probe=yes')
})

t('interactive input, then kill', async () => {
  const x = run(CMD, [])
  await sleep(800); x.proc.write('echo ping-%OS%\r'); await sleep(800)
  expect(x.output()).toContain('ping-Windows_NT')
  x.proc.kill()
  await within(x.exited, 8000, 'kill')
})

t('resize reaches the console', async () => {
  const x = run(CMD, ['/c', 'ping -n 3 127.0.0.1 >nul & mode con'])
  await sleep(500); x.proc.resize(132, 43)
  await within(x.exited, 15000, 'mode con')
  expect(x.output()).toMatch(/Columns:\s+132/)
  expect(x.output()).toMatch(/Lines:\s+43/)
})

t('Ctrl-C interrupts a running command', async () => {
  const x = run(CMD, ['/c', 'ping -t 127.0.0.1'])
  await sleep(1200); x.proc.write('\x03')
  const result = await within(x.exited, 8000, 'ctrl-c')
  expect(result.exitCode).not.toBe(0)
})

t('a 20 MB flood arrives complete', async () => {
  const x = run(process.execPath, ['-e', "process.stdout.write('x'.repeat(20000000))"])
  let xs = 0
  x.proc.onData(d => { for (let i = 0; i < d.length; i++) if (d.charCodeAt(i) === 120) xs += 1 })
  await within(x.exited, 60000, 'flood')
  await sleep(300)
  expect(xs).toBeGreaterThanOrEqual(20_000_000)
}, 90000)

t('50 sequential spawns all report their output and exit', async () => {
  for (let i = 0; i < 50; i++) {
    const x = run(CMD, ['/c', `echo n${i}`])
    await within(x.exited, 8000, `spawn ${i}`)
    expect(x.output()).toContain(`n${i}`)
  }
}, 120000)

t('a command that does not exist fails loudly or exits non-zero', async () => {
  let failed = false
  try {
    const x = run('C:\\definitely\\not\\here.exe', [])
    const result = await within(x.exited, 8000, 'exit')
    failed = result.exitCode !== 0
  } catch { failed = true }
  expect(failed).toBe(true)
})
