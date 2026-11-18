import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import { blueprintsIn, loadManifest } from '../index.ts'
import { applyUpgrade, describePlan, planUpgrade } from '../upgrade.ts'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const blueprint = (version: string, rows: string) => `apiVersion: blends.acryl.dev/v1alpha1
kind: Blueprint
metadata: { id: acme.shop, name: Shop, version: ${version} }
spec:
  runtime: cordis
  rows:
${rows}`

const V1_ROWS = `    - id: http
      name: http
    - id: routes
      name: routes
      config: { title: base }
    - id: server
      name: server
      config: { port: 3000 }
`

const BLEND = `# my shop: a Blend of acme.shop
apiVersion: blends.acryl.dev/v1alpha1
kind: Blend
metadata: { id: me.my-shop, name: my-shop, version: 0.1.0 }
spec:
  runtime: cordis
  lineage: { blueprint: acme.shop, blueprintVersion: 1.0.0 } # moves on upgrade
  overrides:
    - id: server
      config: { port: 8080 }
    - id: routes
      disabled: true
  rows:
    - id: cache
      name: cache
`

function setup(newVersion: string, newRows: string) {
  const dir = mkdtempSync(join(tmpdir(), 'upgrade-test-'))
  dirs.push(dir)
  writeFileSync(join(dir, 'v1.yaml'), blueprint('1.0.0', V1_ROWS))
  writeFileSync(join(dir, 'v2.yaml'), blueprint(newVersion, newRows))
  writeFileSync(join(dir, 'blend.yaml'), BLEND)
  return {
    blendFile: join(dir, 'blend.yaml'),
    oldBlueprint: join(dir, 'v1.yaml'),
    newBlueprint: join(dir, 'v2.yaml'),
    dir,
  }
}

test('a safe upgrade: the plan says what the Blueprint changed, what the app would do differently, and what the overrides hide', () => {
  const files = setup(
    '1.1.0',
    `    - id: http
      name: http
    - id: metrics
      name: metrics
    - id: routes
      name: routes
      config: { title: updated }
    - id: server
      name: server
      config: { port: 4000 }
`,
  )
  const plan = planUpgrade(files)
  assert.deepEqual(plan.blueprintChanges, [
    { id: 'metrics', change: 'added' },
    { id: 'routes', change: 'changed', fields: ['config'] },
    { id: 'server', change: 'changed', fields: ['config'] },
  ])
  // The Blend sets port itself, so the Blueprint's new port changes nothing here.
  assert.deepEqual(plan.shadowed, [{ id: 'server', keys: ['port'] }])
  assert.deepEqual(plan.appChanges, [
    { id: 'metrics', change: 'added' },
    { id: 'routes', change: 'changed', fields: ['config'] },
  ])
  assert.deepEqual([plan.safe, plan.conflicts, plan.from, plan.to], [true, [], '1.0.0', '1.1.0'])
  assert.match(
    describePlan(plan),
    /acme\.shop: 1\.0\.0 -> 1\.1\.0[\s\S]*your app would change:[\s\S]*safe to apply/,
  )
})

test('an upgrade that removes a row the Blend overrides, or adds one the Blend already has, is not safe and changes nothing', () => {
  const removed = planUpgrade(
    setup(
      '2.0.0',
      V1_ROWS.replace(/ {4}- id: routes\n {6}name: routes\n {6}config: \{ title: base \}\n/, ''),
    ),
  )
  assert.equal(removed.safe, false)
  assert.deepEqual(
    removed.conflicts.map((c) => `${c.code} ${c.path}`),
    ['override-unknown-id spec.overrides[1].id'],
  )
  assert.deepEqual(removed.appChanges, [])
  assert.match(describePlan(removed), /this Blend would break:[\s\S]*NOT safe/)

  const collides = planUpgrade(setup('1.2.0', `${V1_ROWS}    - id: cache\n      name: cache\n`))
  assert.deepEqual(
    collides.conflicts.map((c) => `${c.code} ${c.path}`),
    ['insert-id-collision spec.rows[0].id'],
  )
  const files = setup('1.2.0', `${V1_ROWS}    - id: cache\n      name: cache\n`)
  assert.throws(() => applyUpgrade(files.blendFile, planUpgrade(files)), /conflict/)
  assert.equal(readFileSync(files.blendFile, 'utf8'), BLEND)
})

test('applying a safe plan moves only the lineage version, keeps the comments, and the Blend resolves over the new Blueprint', () => {
  const files = setup('1.1.0', `${V1_ROWS}    - id: metrics\n      name: metrics\n`)
  const plan = planUpgrade(files)
  applyUpgrade(files.blendFile, plan)
  const after = readFileSync(files.blendFile, 'utf8')
  assert.equal(after, BLEND.replace('blueprintVersion: 1.0.0', 'blueprintVersion: 1.1.0'))
  assert.match(after, /# my shop: a Blend of acme\.shop/)
  assert.throws(
    () => applyUpgrade(files.blendFile, plan),
    /the Blend says 1\.1\.0 but the plan was made from 1\.0\.0/,
  )
  // The Blend now resolves over the new Blueprint, found by id.
  writeFileSync(join(files.dir, 'acme.shop.yaml'), readFileSync(files.newBlueprint, 'utf8'))
  const resolved = loadManifest(files.blendFile, { getBlueprint: blueprintsIn(files.dir) })
  assert.deepEqual(
    resolved.plugins.map((row) => row.id),
    ['http', 'routes', 'server', 'metrics', 'cache'],
  )
})

test('input that is not an upgrade is refused with a reason: a Blueprint, the wrong Blueprint, the wrong old version', () => {
  const files = setup('1.1.0', V1_ROWS)
  assert.throws(
    () => planUpgrade({ ...files, blendFile: files.oldBlueprint }),
    /is a Blueprint; an upgrade applies to a Blend/,
  )
  writeFileSync(files.newBlueprint, blueprint('1.1.0', V1_ROWS).replace('acme.shop', 'acme.other'))
  assert.throws(
    () => planUpgrade(files),
    /newBlueprint is 'acme\.other' but the Blend is made from 'acme\.shop'/,
  )
  writeFileSync(files.oldBlueprint, blueprint('0.9.0', V1_ROWS))
  assert.throws(
    () => planUpgrade({ ...files, newBlueprint: files.oldBlueprint }),
    /oldBlueprint is version 0\.9\.0 but the Blend's lineage says 1\.0\.0/,
  )
})
