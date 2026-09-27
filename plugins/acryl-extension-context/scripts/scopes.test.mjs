import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { trackedBlendDir } from '../lib/blend-ledger.js'
import { discoverExtensions } from '../lib/reconcile.js'
import { blendDir, currentInstance, isProjectExtensionPath, projectExtensionsDir, projectExtensionsLabel } from '../lib/scopes.js'

test('the main app keeps the classic shared project locations', () => {
  assert.equal(projectExtensionsDir('/w', undefined), '/w/.acryl-extensions')
  assert.equal(blendDir('/w', undefined), '/w/.acryl/blend')
  assert.equal(projectExtensionsLabel(undefined), '<workspace>/.acryl-extensions/<name>/')
})

test('a named instance keeps everything it authors under its own namespace', () => {
  assert.equal(projectExtensionsDir('/w', 'orbit'), '/w/.acryl/instances/orbit/extensions')
  assert.equal(blendDir('/w', 'orbit'), '/w/.acryl/instances/orbit/blend')
  assert.match(projectExtensionsLabel('orbit'), /instances\/orbit\/extensions/)
})

test('the instance comes from ACRYL_INSTANCE and an invalid name is ignored, never turned into a path', () => {
  assert.equal(currentInstance({ ACRYL_INSTANCE: 'orbit' }), 'orbit')
  for (const bad of ['../x', 'A', '', 'a/b', 'x'.repeat(33)]) assert.equal(currentInstance({ ACRYL_INSTANCE: bad }), undefined, bad)
  assert.equal(currentInstance({}), undefined)
})

test('provenance recognises both project locations', () => {
  assert.ok(isProjectExtensionPath('/w/.acryl-extensions/x/index.js'))
  assert.ok(isProjectExtensionPath('/w/.acryl/instances/orbit/extensions/x/index.js'))
  assert.ok(!isProjectExtensionPath('/elsewhere/x/index.js'))
})

test('two instances opening one project see only their own extensions and their own Blend', () => {
  const ws = mkdtempSync(join(tmpdir(), 'scopes-'))
  const make = (dir, name) => { mkdirSync(join(dir, name), { recursive: true }); writeFileSync(join(dir, name, 'package.json'), JSON.stringify({ name, version: '1.0.0' })) }
  try {
    make(projectExtensionsDir(ws, 'orbit'), 'orbit-organizer')
    make(projectExtensionsDir(ws, 'acme'), 'acme-notes')
    make(projectExtensionsDir(ws, undefined), 'shared-project-plugin')
    // discoverExtensions reads the instance from the environment; drive it per instance
    for (const [instance, expected] of [['orbit', ['orbit-organizer']], ['acme', ['acme-notes']], [undefined, ['shared-project-plugin']]]) {
      const previous = process.env.ACRYL_INSTANCE
      if (instance === undefined) delete process.env.ACRYL_INSTANCE; else process.env.ACRYL_INSTANCE = instance
      try { assert.deepEqual(discoverExtensions({ workspaceDir: ws, globalDir: undefined }).map(e => e.name), expected, String(instance)) } finally { if (previous === undefined) delete process.env.ACRYL_INSTANCE; else process.env.ACRYL_INSTANCE = previous }
    }
    // A Blend captured by one instance is invisible to the other.
    mkdirSync(blendDir(ws, 'orbit'), { recursive: true }); writeFileSync(join(blendDir(ws, 'orbit'), 'blend.yaml'), 'x')
    process.env.ACRYL_INSTANCE = 'orbit'; assert.equal(trackedBlendDir(ws), blendDir(ws, 'orbit'))
    process.env.ACRYL_INSTANCE = 'acme'; assert.equal(trackedBlendDir(ws), undefined)
    delete process.env.ACRYL_INSTANCE; assert.equal(trackedBlendDir(ws), undefined)
  } finally { delete process.env.ACRYL_INSTANCE; rmSync(ws, { recursive: true, force: true }) }
})

test('inside an app (its home has blend.yaml) plugins go to the app\'s extensions folder', async () => {
  const { appExtensionsDir } = await import('../lib/scopes.js')
  assert.equal(appExtensionsDir({ ACRYL_HOME: '/apps/stage' }, path => path === '/apps/stage/blend.yaml'), '/apps/stage/extensions')
  assert.equal(appExtensionsDir({ ACRYL_HOME: '/apps/stage' }, () => false), undefined)
  assert.equal(appExtensionsDir({}, () => true), undefined)
})
