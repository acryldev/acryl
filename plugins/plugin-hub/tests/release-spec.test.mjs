import assert from 'node:assert/strict'
import test from 'node:test'
import { gitAddress, releaseSpec } from '../release-spec.js'

test('reads every git address DSH\'s box accepts, and leaves names, folders and tarballs alone', () => {
  assert.deepEqual(gitAddress('github:inboxxobni/acryl-quick-notes'), { host: 'github.com', owner: 'inboxxobni', repo: 'acryl-quick-notes' })
  assert.deepEqual(gitAddress('git+https://github.com/inboxxobni/acryl-quick-notes.git'), { host: 'github.com', owner: 'inboxxobni', repo: 'acryl-quick-notes' })
  assert.deepEqual(gitAddress('https://github.com/inboxxobni/acryl-quick-notes'), { host: 'github.com', owner: 'inboxxobni', repo: 'acryl-quick-notes' })
  assert.deepEqual(gitAddress('git@github.com:inboxxobni/acryl-quick-notes.git#main'), { host: 'github.com', owner: 'inboxxobni', repo: 'acryl-quick-notes', ref: 'main' })
  assert.deepEqual(gitAddress('gitlab:group/plugin'), { host: 'gitlab.com', owner: 'group', repo: 'plugin' })
  for (const spec of ['dsh-plugin-whale-pet', '@scope/name@1.2.3', '/abs/folder', '/abs/x-1.0.0.tgz', 'https://github.com/o/r/releases/download/v1/r-1.0.0.tgz']) assert.equal(gitAddress(spec), undefined, spec)
})

test('a GitHub address becomes its latest release in the store; other hosts, branches, no release and missing services are refused', async () => {
  const pulls = []
  const hub = result => ({ async pull(source, options) { pulls.push([source, options]); if (result instanceof Error) throw result; return result } })
  const ok = { status: 'stored', name: 'acryl-quick-notes', version: '0.2.2', path: '/store/acryl-quick-notes/0.2.2.tgz' }
  assert.deepEqual(await releaseSpec('dsh-plugin-whale-pet', hub(ok)), { spec: 'dsh-plugin-whale-pet' })
  assert.deepEqual(await releaseSpec('github:inboxxobni/acryl-quick-notes', hub(ok)), { spec: ok.path, pulled: ok })
  assert.deepEqual(pulls, [['github:inboxxobni/acryl-quick-notes', { install: false }]])
  assert.match((await releaseSpec('gitlab:group/plugin', hub(ok))).refused, /gitlab\.com is not supported yet/u)
  assert.match((await releaseSpec('github:o/r#main', hub(ok))).refused, /#main is a branch or commit, not a release/u)
  assert.match((await releaseSpec('github:o/r', hub(new Error('o/r has no release; ask its author to publish one')))).refused, /has no release/u)
  assert.match((await releaseSpec('github:o/r', hub({ status: 'missing-services', name: 'n', version: '1.0.0', missing: ['trackMixer'] }))).refused, /needs trackMixer/u)
})

test('the manager works when Cordis calls it through its service proxy (no #private members), and refuses before DSH\'s installer runs', async () => {
  const { default: AcrylPluginManager } = await import('../manager.js')
  assert.deepEqual(AcrylPluginManager.inject, ['loader', 'profileContext', 'appInstance'])
  const target = Object.create(AcrylPluginManager.prototype)
  target.ctx = { appInstance: { home: '/nonexistent-home' }, get: () => undefined }
  const viaProxy = new Proxy(target, {})
  const result = await AcrylPluginManager.prototype.installBundle.call(viaProxy, 'gitlab:group/plugin')
  assert.equal(result.application, 'failed')
  assert.equal(result.error.code, 'invalid-spec')
  assert.match(result.error.diagnostic, /gitlab\.com is not supported yet/u)
  const inspected = await AcrylPluginManager.prototype.inspect.call(viaProxy, 'github:o/r#main')
  assert.deepEqual([inspected.status, inspected.problem], ['refused', 'unknown'])
  assert.match(inspected.reason, /#main is a branch or commit, not a release/u)
})
