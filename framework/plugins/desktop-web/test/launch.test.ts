import assert from 'node:assert/strict'
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
