import assert from 'node:assert/strict'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import { blueprintsIn, loadManifest } from '../index.ts'
import { runUpgrade } from '../upgrade-cli.ts'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const blueprint = (version: string, extra: string) => `apiVersion: blends.acryl.dev/v1alpha1
kind: Blueprint
metadata: { id: acme.shop, name: Shop, version: ${version} }
spec:
  runtime: cordis
  rows:
    - id: http
      name: http
${extra}`

test('npm run upgrade plans, refuses an unsafe plan, and with --apply moves the lineage and installs the new Blueprint', () => {
  const app = mkdtempSync(join(tmpdir(), 'upgrade-cli-'))
  dirs.push(app)
  mkdirSync(join(app, 'blueprints'))
  writeFileSync(join(app, 'blueprints', 'acme.shop.yaml'), blueprint('1.0.0', ''))
  writeFileSync(
    join(app, 'blend.yaml'),
    `apiVersion: blends.acryl.dev/v1alpha1
kind: Blend
metadata: { id: me.shop, name: shop, version: 0.1.0 }
spec:
  runtime: cordis
  lineage: { blueprint: acme.shop, blueprintVersion: 1.0.0 }
  overrides:
    - id: http
      disabled: true
`,
  )
  writeFileSync(
    join(app, 'v1.1.yaml'),
    blueprint('1.1.0', '    - id: metrics\n      name: metrics\n'),
  )
  writeFileSync(
    join(app, 'v2.yaml'),
    blueprint('2.0.0', '').replace(
      '    - id: http\n      name: http\n',
      '    - id: other\n      name: other\n',
    ),
  )
  const output: string[] = []
  const say = (text: string) => void output.push(text)

  assert.equal(runUpgrade([], app, say), 2)
  assert.equal(
    runUpgrade(
      [
        '--from',
        join(app, 'blueprints', 'acme.shop.yaml'),
        '--to',
        join(app, 'v2.yaml'),
        '--apply',
      ],
      app,
      say,
    ),
    1,
  )
  assert.match(
    output.join('\n'),
    /this Blend would break:[\s\S]*override-unknown-id|spec\.overrides\[0\]\.id/,
  )
  assert.match(readFileSync(join(app, 'blend.yaml'), 'utf8'), /blueprintVersion: 1\.0\.0/)

  output.length = 0
  assert.equal(
    runUpgrade(
      ['--from', join(app, 'blueprints', 'acme.shop.yaml'), '--to', join(app, 'v1.1.yaml')],
      app,
      say,
    ),
    0,
  )
  assert.match(readFileSync(join(app, 'blend.yaml'), 'utf8'), /blueprintVersion: 1\.0\.0/)

  assert.equal(
    runUpgrade(
      [
        '--from',
        join(app, 'blueprints', 'acme.shop.yaml'),
        '--to',
        join(app, 'v1.1.yaml'),
        '--apply',
      ],
      app,
      say,
    ),
    0,
  )
  assert.match(readFileSync(join(app, 'blend.yaml'), 'utf8'), /blueprintVersion: 1\.1\.0/)
  assert.ok(existsSync(join(app, 'blueprints', 'acme.shop.yaml')))
  const resolved = loadManifest(join(app, 'blend.yaml'), {
    getBlueprint: blueprintsIn(join(app, 'blueprints')),
  })
  assert.deepEqual(
    resolved.plugins.map((row) => [row.id, row.disabled ?? false]),
    [
      ['http', true],
      ['metrics', false],
    ],
  )
  cpSync(join(app, 'blend.yaml'), join(app, 'copy.yaml'))
})
