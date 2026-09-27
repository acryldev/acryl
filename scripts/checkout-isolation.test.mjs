import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { checkoutIsolation, isGitWorktree } from './lib/checkout-isolation.mjs'

test('the main working tree keeps every default', () => {
  assert.deepEqual(checkoutIsolation('/repo/acryl', {}, '/h', false), {})
})

test('a worktree gets its own home, port and Electron app name', () => {
  assert.deepEqual(checkoutIsolation('/repo/acryl.worktrees/036-x', {}, '/h', true), {
    ACRYL_HOME: '/h/.acryl-worktrees/036-x', ACRYL_WEB_PORT: '3081', ACRYL_LOCAL_PRODUCT_NAME: 'ACRYL Development 036-x',
  })
})

test('anything set explicitly wins', () => {
  const extra = checkoutIsolation('/w/x', { DSH_HOME: '/tmp/d', ACRYL_WEB_PORT: '4000', ACRYL_LOCAL_PRODUCT_NAME: 'Mine' }, '/h', true)
  assert.deepEqual(extra, {})
  assert.equal(checkoutIsolation('/w/x', { ACRYL_HOME: '/a' }, '/h', true).ACRYL_HOME, undefined)
})

test('a worktree is recognised by its .git file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'iso-'))
  try {
    mkdirSync(join(dir, 'main', '.git'), { recursive: true }); assert.equal(isGitWorktree(join(dir, 'main')), false)
    mkdirSync(join(dir, 'wt')); writeFileSync(join(dir, 'wt', '.git'), 'gitdir: ../main/.git/worktrees/wt\n'); assert.equal(isGitWorktree(join(dir, 'wt')), true)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
