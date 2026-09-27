import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { ensureLocalAdvancedMode, localDesktopInstance, localUserDataRoot } from './dev-local.mjs'

const temp = run => { const dir = mkdtempSync(join(tmpdir(), 'dev-local-')); try { return run(dir) } finally { rmSync(dir, { recursive: true, force: true }) } }

test('the main checkout runs the isolated development app, never the installed app\'s ~/.acryl', () => temp(dir => {
  mkdirSync(join(dir, 'acryl', '.git'), { recursive: true })
  const instance = localDesktopInstance({}, '/Users/example', join(dir, 'acryl'))
  assert.equal(instance.kind, 'development')
  assert.equal(instance.dshHome, join('/Users/example', '.acryl-dev', '.dsh'))
  assert.equal(localUserDataRoot(instance, 'darwin', '/Users/example', {}), join('/Users/example', 'Library', 'Application Support', 'ACRYL Development'))
}))

test('Windows keeps user data under APPDATA and refuses without it', () => {
  const instance = localDesktopInstance({}, 'C:\\Users\\example', '/nowhere')
  assert.equal(localUserDataRoot(instance, 'win32', 'C:\\Users\\example', { APPDATA: 'C:\\Users\\example\\AppData\\Roaming' }), join('C:\\Users\\example\\AppData\\Roaming', 'ACRYL Development'))
  assert.throws(() => localUserDataRoot(instance, 'win32', 'C:\\Users\\example', {}), /APPDATA/)
})

test('a worktree checkout and an app each get their own home and Electron user data', () => temp(dir => {
  const wt = join(dir, '036-x'); mkdirSync(wt); writeFileSync(join(wt, '.git'), 'gitdir: x\n')
  const worktree = localDesktopInstance({}, '/h', wt)
  assert.equal(worktree.home, '/h/.acryl-worktrees/036-x')
  assert.equal(localUserDataRoot(worktree, 'darwin', '/h', {}), '/h/Library/Application Support/ACRYL Development 036-x')
  const app = join(dir, 'orbit'); mkdirSync(app); writeFileSync(join(app, 'blend.yaml'), 'x')
  const pinned = localDesktopInstance({ ACRYL_HOME: app }, '/h', wt)
  assert.equal(pinned.kind, 'app')
  assert.match(pinned.userDataName, /^ACRYL orbit-[0-9a-f]{4}$/u)
}))

test('seeds advanced mode so Development Canvas can mount', () => temp(home => {
  assert.equal(ensureLocalAdvancedMode(home), 'created')
  assert.match(readFileSync(join(home, 'settings.yaml'), 'utf8'), /mode: advanced/u)
  writeFileSync(join(home, 'settings.yaml'), 'dsh-desktop:\n  mode: compatibility\n')
  assert.equal(ensureLocalAdvancedMode(home), 'switched')
}))
