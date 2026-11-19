import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { trackedBlendDir } from '../lib/blend-ledger.js'
import { discoverPlugins } from '../lib/reconcile.js'
import { appPluginsDir, blendDir, currentInstance, isProjectPluginPath, projectPluginsDir, projectPluginsLabel, useAppInstance } from '../lib/scopes.js'

test('the main app keeps the classic shared project locations', () => {
  assert.equal(projectPluginsDir('/w', undefined), join('/w', '.acryl-plugins'))
  assert.equal(blendDir('/w', undefined), join('/w', '.acryl', 'blend'))
  assert.equal(projectPluginsLabel(undefined), '<workspace>/.acryl-plugins/<name>/')
})

test('a named instance keeps everything it authors under its own namespace', () => {
  assert.equal(projectPluginsDir('/w', 'orbit'), join('/w', '.acryl', 'instances', 'orbit', 'plugins'))
  assert.equal(blendDir('/w', 'orbit'), join('/w', '.acryl', 'instances', 'orbit', 'blend'))
  assert.match(projectPluginsLabel('orbit'), /instances\/orbit\/plugins/)
})

test('the scope comes from the app instance, an invalid one is ignored, and the disposer restores the previous one', () => {
  const restore = useAppInstance({ home: '/a', projectScope: 'orbit' })
  assert.equal(currentInstance(), 'orbit')
  for (const bad of ['../x', 'A', '', 'a/b', 'x'.repeat(65)]) { const undo = useAppInstance({ home: '/a', projectScope: bad }); assert.equal(currentInstance(), undefined, bad); undo() }
  restore()
  assert.equal(currentInstance(), undefined)
})

test('provenance recognises both project locations', () => {
  assert.ok(isProjectPluginPath('/w/.acryl-plugins/x/index.js'))
  assert.ok(isProjectPluginPath('/w/.acryl/instances/orbit/plugins/x/index.js'))
  // Under the names they had before the rename, too
  assert.ok(isProjectPluginPath('/w/.acryl-extensions/x/index.js'))
  assert.ok(isProjectPluginPath('/w/.acryl/instances/orbit/extensions/x/index.js'))
  assert.ok(!isProjectPluginPath('/elsewhere/x/index.js'))
})

test('two instances opening one project see only their own extensions and their own Blend', () => {
  const ws = mkdtempSync(join(tmpdir(), 'scopes-'))
  const make = (dir, name) => { mkdirSync(join(dir, name), { recursive: true }); writeFileSync(join(dir, name, 'package.json'), JSON.stringify({ name, version: '1.0.0' })) }
  try {
    make(projectPluginsDir(ws, 'orbit'), 'orbit-organizer')
    make(projectPluginsDir(ws, 'acme'), 'acme-notes')
    make(projectPluginsDir(ws, undefined), 'shared-project-plugin')
    // discoverPlugins reads the instance from the environment; drive it per instance
    for (const [instance, expected] of [['orbit', ['orbit-organizer']], ['acme', ['acme-notes']], [undefined, ['shared-project-plugin']]]) {
      const undo = useAppInstance(instance === undefined ? undefined : { home: '/a', projectScope: instance })
      try { assert.deepEqual(discoverPlugins({ workspaceDir: ws, globalDir: undefined }).map(e => e.name), expected, String(instance)) } finally { undo() }
    }
    // A Blend captured by one instance is invisible to the other.
    mkdirSync(blendDir(ws, 'orbit'), { recursive: true }); writeFileSync(join(blendDir(ws, 'orbit'), 'blend.yaml'), 'x')
    let undo = useAppInstance({ home: '/a', projectScope: 'orbit' }); assert.equal(trackedBlendDir(ws), blendDir(ws, 'orbit')); undo()
    undo = useAppInstance({ home: '/a', projectScope: 'acme' }); assert.equal(trackedBlendDir(ws), undefined); undo()
    assert.equal(trackedBlendDir(ws), undefined)
  } finally { rmSync(ws, { recursive: true, force: true }) }
})

test('inside an app (its home has blend.yaml) plugins go to the app\'s extensions folder', async () => {
  const definitionFile = join('/apps/stage', 'blend.yaml')
  let undo = useAppInstance({ home: '/apps/stage', definitionFile }, path => path === definitionFile)
  assert.equal(appPluginsDir(), join('/apps/stage', 'plugins')); undo()
  undo = useAppInstance({ home: '/apps/stage', definitionFile }, () => false)
  assert.equal(appPluginsDir(), undefined); undo()
  assert.equal(appPluginsDir(), undefined)
})
