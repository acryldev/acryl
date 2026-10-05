import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { acquireBuildLock, withBuildLock } from './lib/build-lock.mjs'

const withBuildLockScript = fileURLToPath(new URL('./with-build-lock.mjs', import.meta.url))
const temp = () => mkdtempSync(join(tmpdir(), 'acryl-build-lock-'))
const quiet = { log: () => {} }

test('a second build waits for the first and starts only after it releases', async () => {
  const root = temp()
  try {
    const order = []
    const release = await acquireBuildLock(root, 'first', quiet)
    const second = acquireBuildLock(root, 'second', quiet).then(release2 => { order.push('second acquired'); release2() })
    await new Promise(resolve => setTimeout(resolve, 1500))
    assert.deepEqual(order, [], 'the second build must still be waiting while the first holds the lock')
    order.push('first released')
    release()
    await second
    assert.deepEqual(order, ['first released', 'second acquired'])
    assert.equal(existsSync(join(root, '.build-lock')), false)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('a lock whose owner is gone is taken over', async () => {
  const root = temp()
  try {
    const dead = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' })
    mkdirSync(join(root, '.build-lock'))
    writeFileSync(join(root, '.build-lock', 'owner.json'), `${JSON.stringify({ pid: Number(dead.stdout), label: 'crashed build' })}\n`)
    const release = await acquireBuildLock(root, 'next', quiet)
    release()
    assert.equal(existsSync(join(root, '.build-lock')), false)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('withBuildLock releases the lock when the work throws', async () => {
  const root = temp()
  try {
    await assert.rejects(withBuildLock(root, 'failing', () => { throw new Error('boom') }), /boom/)
    assert.equal(existsSync(join(root, '.build-lock')), false)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('with-build-lock runs the command, passes its exit code through, and leaves no lock behind', async () => {
  for (const [code, expected] of [['0', 0], ['3', 3]]) {
    const result = await new Promise(resolve => {
      const child = spawn(process.execPath, [withBuildLockScript, process.execPath, '-e', `process.exit(${code})`], { stdio: 'ignore' })
      child.on('exit', status => { resolve(status) })
    })
    assert.equal(result, expected)
  }
})
