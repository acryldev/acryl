import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { InstanceError, appFolder, claimInstance, listInstances, managedApp, releaseInstance, removeInstance, stopInstance } from './lib/instances.mjs'

const withHome = run => { const home = realpathSync(mkdtempSync(join(tmpdir(), 'instances-'))); try { return run(home) } finally { rmSync(home, { recursive: true, force: true }) } }

test('a live holder refuses a second start and names itself; a dead holder is replaced', () => withHome(home => {
  const app = managedApp('alpha', home)
  claimInstance(app, { pid: 111, surface: 'web', port: 3100 }, () => true, home)
  assert.throws(() => claimInstance(app, { pid: 222 }, () => true, home), /already running \(pid 111, web, port 3100\)/)
  claimInstance(app, { pid: 222, surface: 'cli' }, () => false, home)
  releaseInstance(app, 222, home)
  assert.ok(!existsSync(app.runLockFile))
}))

test('ps lists managed apps (running or stopped) and running apps anywhere', () => withHome(home => {
  claimInstance(managedApp('alpha', home), { pid: 10, surface: 'web', port: 3101 }, () => false, home)
  mkdirSync(join(home, '.acryl-instances', 'beta'), { recursive: true })
  const elsewhere = join(home, 'work', 'orbit'); mkdirSync(elsewhere, { recursive: true }); writeFileSync(join(elsewhere, 'blend.yaml'), 'x')
  const folder = appFolder(elsewhere, home)
  claimInstance(folder, { pid: 30, surface: 'desktop' }, () => false, home)
  const all = listInstances(home, pid => pid === 10 || pid === 30)
  assert.deepEqual(all.map(app => [app.id, app.running]), [['alpha', true], ['beta', false], [folder.id, true]])
  assert.throws(() => stopInstance('nope', home), InstanceError)
}))

test('rm deletes a stopped managed app, refuses a running one, and cannot escape the managed root', () => withHome(home => {
  const app = managedApp('alpha', home)
  claimInstance(app, { pid: 10 }, () => false, home)
  assert.throws(() => removeInstance('alpha', home, () => true), /is running/)
  assert.equal(removeInstance('alpha', home, () => false), realpathSync(join(home, '.acryl-instances')) + '/alpha')
  assert.ok(!existsSync(app.home))
  assert.throws(() => removeInstance('../escape', home), InstanceError)
}))
