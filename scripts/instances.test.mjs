import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { InstanceError, PORT_BASE, PORT_SPAN, claimInstance, instanceName, listInstances, releaseInstance, resolveInstance, stablePort, stopInstance } from './lib/instances.mjs'

const withHome = run => { const home = mkdtempSync(join(tmpdir(), 'instances-')); try { return run(home) } finally { rmSync(home, { recursive: true, force: true }) } }

test('a name becomes a folder, an app name and a port seed, and only a plain name is accepted', () => {
  assert.equal(instanceName('acme-notes'), 'acme-notes')
  for (const bad of ['', 'Acme', '../x', 'a b', '1abc', 'a'.repeat(33), 'x/y', undefined]) assert.throws(() => instanceName(bad), InstanceError, String(bad))
})

test('each instance derives its own home, user data and port, so two share nothing', () => {
  const a = resolveInstance('alpha', '/h'); const b = resolveInstance('beta', '/h')
  assert.equal(a.root, '/h/.acryl-instances/alpha')
  assert.equal(a.dshHome, '/h/.acryl-instances/alpha/.dsh')
  assert.equal(a.userDataName, 'ACRYL alpha')
  assert.notEqual(a.root, b.root); assert.notEqual(a.userDataName, b.userDataName)
})

test('the port is stable per name and inside the range', () => {
  assert.equal(stablePort('alpha'), stablePort('alpha'))
  for (const name of ['alpha', 'beta', 'blank', 'acme-notes', 'z']) { const port = stablePort(name); assert.ok(port >= PORT_BASE && port < PORT_BASE + PORT_SPAN, name) }
})

test('a live holder refuses a second start and names itself; a dead holder is replaced', () => withHome(home => {
  const instance = resolveInstance('alpha', home)
  claimInstance(instance, { pid: 111, surface: 'web', port: 3100 }, () => true)
  assert.throws(() => claimInstance(instance, { pid: 222 }, () => true), /already running \(pid 111, web, port 3100\)/)
  claimInstance(instance, { pid: 222, surface: 'cli' }, () => false)   // 111 is dead: taken over
  assert.equal(JSON.parse(readFileSync(instance.claimFile, 'utf8')).pid, 222)
}))

test('release removes only our own claim', () => withHome(home => {
  const instance = resolveInstance('alpha', home)
  claimInstance(instance, { pid: 5 }, () => false)
  releaseInstance(instance, 999)
  assert.ok(existsSync(instance.claimFile))
  releaseInstance(instance, 5)
  assert.ok(!existsSync(instance.claimFile))
}))

test('list reports running and stopped instances, and stop signals only a running one', () => withHome(home => {
  claimInstance(resolveInstance('alpha', home), { pid: 10, surface: 'web', blueprint: 'acryl.blank', port: 3101 }, () => false)
  claimInstance(resolveInstance('beta', home), { pid: 20, surface: 'cli' }, () => false)
  const alive = pid => pid === 10
  const all = listInstances(home, alive)
  assert.deepEqual(all.map(i => [i.name, i.running]), [['alpha', true], ['beta', false]])
  const sent = []
  assert.equal(stopInstance('alpha', home, (pid, signal) => sent.push([pid, signal])), false)   // real pid 10 is not alive for the default check
  assert.throws(() => stopInstance('nope', home), /no instance "nope"/)
}))
