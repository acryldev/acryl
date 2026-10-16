// An app IS its Blend (spec 036): capture records into the app folder, keeps the user's blend.yaml (comments included) and adds only the rows of
// installed plugins it does not name; extensions already in the app are locked in place, and the result verifies.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { captureApp, verifyBlend, writeAppBlend } from '../lib/blend-capture.js'
import { stagePackage } from '../lib/stage.js'
import { appHomeDir, blendDir, useAppInstance } from '../lib/scopes.js'

const DEFINITION = `# Stage Sound: what this app is.
apiVersion: blends.acryl.dev/v1alpha1
kind: Blend
metadata:
  id: app.stage-sound
  name: Stage Sound
  version: 0.1.0
spec:
  runtime: cordis
  lineage:
    blueprint: acryl.blank
    blueprintVersion: 0.1.0
  rows:
    - id: brand # the product name lives here
      name: acryl-brand
      config:
        name: Stage Sound
`

function plugin(dir, name) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version: '0.1.0', type: 'module', main: './index.js', dsh: { bundle: { patch: './cordis.patch.yml' } } }))
  writeFileSync(join(dir, 'cordis.patch.yml'), `- insert:\n    - id: ${name}\n      name: ${name}\n`)
  writeFileSync(join(dir, 'index.js'), `export const name = ${JSON.stringify(name)}\nexport function apply() {}\n`)
}

test('snapshot inside an app records into the app folder and keeps the definition the user wrote', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'app-blend-')))
  const app = join(root, 'stage-sound'); const profile = join(root, 'profile'); const stage = join(root, 'stage')
  try {
    mkdirSync(profile, { recursive: true }); mkdirSync(stage, { recursive: true })
    writeFileSync(join(app + '.yaml'), '')   // unrelated neighbour file, must stay untouched
    plugin(join(app, 'extensions', 'setlist'), 'setlist')
    plugin(join(root, 'elsewhere', 'tuner'), 'tuner')
    writeFileSync(join(app, 'blend.yaml'), DEFINITION)
    const staged = { setlist: stagePackage(join(app, 'extensions', 'setlist'), stage).dir, tuner: stagePackage(join(root, 'elsewhere', 'tuner'), stage).dir }
    const deps = Object.fromEntries(Object.entries(staged).map(([name, dir]) => [name, `file:${dir}`]))
    // What an install leaves in the profile: the package linked into node_modules (capture reads each package's rows from there).
    mkdirSync(join(profile, 'node_modules'), { recursive: true })
    for (const [name, dir] of Object.entries(staged)) symlinkSync(dir, join(profile, 'node_modules', name))
    writeFileSync(join(profile, 'package.json'), JSON.stringify({ dependencies: deps, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'setlist', 'tuner'] } } }))

    const undo = useAppInstance({ home: app, definitionFile: join(app, 'blend.yaml') })
    try {
      assert.equal(appHomeDir(), app)
      assert.equal(blendDir('/any/workspace'), app, 'inside an app the Blend folder is the app, whatever project is open')
      const capture = captureApp({ profileDir: profile, appHome: app })
      assert.deepEqual(capture.addedRows, ['setlist', 'tuner'])
      const files = writeAppBlend(capture, app)
      assert.deepEqual(files, ['blend.yaml', 'blend.lock.json', 'extensions/tuner/'])
      const yaml = readFileSync(join(app, 'blend.yaml'), 'utf8')
      assert.match(yaml, /# Stage Sound: what this app is\./u)
      assert.match(yaml, /# the product name lives here/u)
      assert.match(yaml, /id: setlist/u)
      const lock = JSON.parse(readFileSync(join(app, 'blend.lock.json'), 'utf8'))
      assert.equal(lock.origin.id, 'app.stage-sound')
      assert.deepEqual(lock.modules.map(m => [m.name, m.source]), [['setlist', 'extensions/setlist'], ['tuner', 'extensions/tuner']])
      assert.deepEqual(verifyBlend(app), { ok: true, problems: [], checked: 3 })
      // A second capture with nothing new changes nothing in the definition.
      const again = captureApp({ profileDir: profile, appHome: app })
      assert.equal(again.manifestChanged, false)
      // Editing the definition afterwards is detected until the next snapshot.
      writeFileSync(join(app, 'blend.yaml'), `${yaml}# edited\n`)
      assert.match(verifyBlend(app).problems.join(), /changed since the lock/u)
    } finally { undo() }
  } finally { rmSync(root, { recursive: true, force: true }) }
})
