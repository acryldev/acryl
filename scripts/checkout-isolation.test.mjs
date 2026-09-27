import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { checkoutIsolation } from './lib/checkout-isolation.mjs'

const temp = run => { const dir = mkdtempSync(join(tmpdir(), 'iso-')); try { return run(dir) } finally { rmSync(dir, { recursive: true, force: true }) } }

test('the main working tree keeps every default', () => temp(dir => {
  mkdirSync(join(dir, 'acryl', '.git'), { recursive: true })
  assert.deepEqual(checkoutIsolation(join(dir, 'acryl'), {}, '/h'), {})
}))

test('a worktree gets its own home, port and Electron app name', () => temp(dir => {
  const wt = join(dir, '036-x'); mkdirSync(wt); writeFileSync(join(wt, '.git'), 'gitdir: x\n')
  const env = checkoutIsolation(wt, {}, '/h')
  assert.equal(env.ACRYL_HOME, '/h/.acryl-worktrees/036-x')
  assert.equal(env.DSH_HOME, '/h/.acryl-worktrees/036-x/.dsh')
  assert.equal(env.ACRYL_WEB_PORT, '3081')
  assert.equal(env.ACRYL_LOCAL_PRODUCT_NAME, 'ACRYL Development 036-x')
}))

test('anything pinned explicitly wins', () => temp(dir => {
  const wt = join(dir, 'x'); mkdirSync(wt); writeFileSync(join(wt, '.git'), 'gitdir: x\n')
  assert.deepEqual(checkoutIsolation(wt, { DSH_HOME: '/tmp/d' }, '/h'), {})
  assert.deepEqual(checkoutIsolation(wt, { ACRYL_HOME: '/a' }, '/h'), {})
}))
