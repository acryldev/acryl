import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { blankLaunchPlan } from './blank.mjs'
import { InstanceError } from './lib/instances.mjs'
import { scaffoldFiles, writeScaffold } from './init-instance.mjs'

const temp = run => { const dir = mkdtempSync(join(tmpdir(), 'init-')); try { return run(dir) } finally { rmSync(dir, { recursive: true, force: true }) } }

test('the scaffold is a definition, an extensions folder, a runner and a gitignore', () => {
  const files = scaffoldFiles('/x/orbit', { name: 'Orbit', accent: '#e8590c' }, '/fw')
  assert.deepEqual(Object.keys(files).sort(), ['.gitignore', 'README.md', 'acryl.instance.yaml', 'extensions/.gitkeep', 'run.sh'])
  assert.match(files['acryl.instance.yaml'], /^id: orbit$/mu)
  assert.match(files['acryl.instance.yaml'], /extends: acryl.blank/)
  assert.match(files['acryl.instance.yaml'], /name: "Orbit"/)
  assert.match(files['acryl.instance.yaml'], /accent: "#e8590c"/)
  assert.match(files['.gitignore'], /\.dsh\//)
  assert.match(files['run.sh'], /"\/fw\/scripts\/blank\.mjs"/)
})

test('a name that could break YAML is quoted, never interpreted', () => {
  const yaml = scaffoldFiles('/x/orbit', { name: 'A: "b" # c' }, '/fw')['acryl.instance.yaml']
  assert.match(yaml, /name: "A: \\"b\\" # c"/)
})

test('init writes a runnable folder, refuses a non-empty one, and never overwrites', () => temp(dir => {
  const target = join(dir, 'orbit')
  const { files } = writeScaffold(target, { name: 'Orbit' }, '/fw')
  assert.ok(files.length >= 5 && existsSync(join(target, 'extensions')))
  assert.ok(statSync(join(target, 'run.sh')).mode & 0o100)
  writeFileSync(join(target, 'extensions', 'mine.txt'), 'x')
  assert.throws(() => writeScaffold(target, {}, '/fw'), InstanceError)
  assert.equal(readFileSync(join(target, 'extensions', 'mine.txt'), 'utf8'), 'x')
  mkdirSync(join(dir, 'empty')); assert.doesNotThrow(() => writeScaffold(join(dir, 'empty'), {}, '/fw'))
}))

test('a bad folder name or blueprint is rejected with a message', () => {
  assert.throws(() => scaffoldFiles('/x/My Project', {}), /instance name/)
  assert.throws(() => scaffoldFiles('/x/ok', { blueprint: 'acryl.nope' }), /unknown blueprint/)
})

test('running a scaffolded folder makes the folder the ACRYL home and its definition the blueprint', () => temp(dir => {
  const target = join(dir, 'orbit')
  writeScaffold(target, { name: 'Orbit' }, '/fw')
  const plan = blankLaunchPlan('web', { dir: target }, {}, '/h', '/r')
  assert.equal(plan.env.ACRYL_HOME, target)
  assert.match(plan.env.ACRYL_INSTANCE, /^orbit-[0-9a-f]{4}$/u)
  assert.equal(plan.env.ACRYL_BLUEPRINT, join(target, 'acryl.instance.yaml'))
  assert.equal(plan.instance.claimFile, join(target, 'instance.json'))
}))
