import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { electronArgs, RESTRICT_USERNS, SANDBOX_NOTICE, sandboxBlocked } from '../launch.ts'

test('the sandbox is blocked only on Linux with the user-namespace restriction on', () => {
  const sysctl = (value: string) => (path: string) => {
    assert.equal(path, RESTRICT_USERNS)
    return value
  }
  assert.equal(sandboxBlocked('linux', sysctl('1\n')), true)
  assert.equal(sandboxBlocked('linux', sysctl('0\n')), false)
  assert.equal(
    sandboxBlocked('linux', () => {
      throw new Error('ENOENT')
    }),
    false,
    'a kernel without the sysctl',
  )
  assert.equal(sandboxBlocked('darwin', sysctl('1')), false)
  assert.equal(sandboxBlocked('win32', sysctl('1')), false)
})

test('--no-sandbox is added only when the sandbox is blocked, and the notice says why and how to restore it', () => {
  assert.deepEqual(electronArgs('main.ts', false), ['main.ts'])
  assert.deepEqual(electronArgs('main.ts', true), ['--no-sandbox', 'main.ts'])
  assert.match(SANDBOX_NOTICE, /apparmor_restrict_unprivileged_userns/)
  assert.match(SANDBOX_NOTICE, /AppArmor profile/)
})

test('switches given to npm run desktop go to Electron before the entry; anything else is dropped', () => {
  assert.deepEqual(electronArgs('main.ts', false, ['--remote-debugging-port=9333']), [
    '--remote-debugging-port=9333',
    'main.ts',
  ])
  assert.deepEqual(
    electronArgs('main.ts', true, ['--remote-debugging-port=9333', 'other.js', '-x']),
    ['--no-sandbox', '--remote-debugging-port=9333', 'main.ts'],
  )
})

test("a Ctrl-C to the launcher's process group, passed on again by npm, reaches Electron once, so Electron's graceful quit runs", {
  skip: process.platform === 'win32' ? 'no process groups or POSIX signals on Windows' : false,
}, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'desktop-launch-'))
  try {
    const record = join(dir, 'signals.txt')
    // Stands in for Electron: records every signal it gets, and ends a moment after the first (Electron's quit).
    const electron = join(dir, 'electron.cjs')
    writeFileSync(
      electron,
      `const { appendFileSync } = require('node:fs')
for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(s, () => { appendFileSync(${JSON.stringify(record)}, s + '\\n'); setTimeout(() => process.exit(0), 300) })
appendFileSync(${JSON.stringify(record)}, 'ready\\n')
setInterval(() => {}, 1000)
`,
    )
    const launcher = join(dir, 'launcher.mjs')
    writeFileSync(
      launcher,
      `import { runElectron } from ${JSON.stringify(new URL('../launch.ts', import.meta.url).href)}
runElectron(process.execPath, [${JSON.stringify(electron)}])
`,
    )
    // The launcher leads a group of its own here, as npm does in a terminal: Ctrl-C goes to that whole group.
    const launched = spawn(process.execPath, [launcher], { detached: true, stdio: 'ignore' })
    const exited = new Promise<number | null>((done) => launched.once('exit', done))
    const read = () => {
      try {
        return readFileSync(record, 'utf8')
      } catch {
        return ''
      }
    }
    const end = Date.now() + 10_000
    while (!read().includes('ready') && Date.now() < end)
      await new Promise((r) => setTimeout(r, 50))
    assert.match(read(), /ready/u)
    // The terminal's Ctrl-C to the group, then npm passing the same Ctrl-C on to its child (this launcher) once more.
    // A moment apart, as npm does it: two signals sent at once to one process arrive as one.
    process.kill(-(launched.pid as number), 'SIGINT')
    await new Promise((r) => setTimeout(r, 100))
    process.kill(launched.pid as number, 'SIGINT')
    assert.equal(await exited, 0)
    assert.deepEqual(read().trim().split('\n'), ['ready', 'SIGINT'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
