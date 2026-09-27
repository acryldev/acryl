import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
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
  const real = realpathSync(target)   // an instance is identified by its real path
  assert.equal(plan.env.ACRYL_HOME, real)
  assert.match(plan.env.ACRYL_INSTANCE, /^orbit-[0-9a-f]{4}$/u)
  assert.equal(plan.env.ACRYL_BLUEPRINT, join(real, 'acryl.instance.yaml'))
  assert.equal(plan.instance.claimFile, join(real, 'instance.json'))
}))

test('a house that carries its runtime starts with the framework gone, and only the Web runtime', () => temp(dir => {
  // A stand-in for the extracted acryl-web release archive: bin.js records what it was started with.
  const runtime = join(dir, 'archive'); mkdirSync(join(runtime, 'lib'), { recursive: true })
  writeFileSync(join(runtime, 'lib', 'bin.js'), "require('node:fs').writeFileSync(process.env.PROOF, JSON.stringify({ args: process.argv.slice(2), home: process.env.ACRYL_HOME, instance: process.env.ACRYL_INSTANCE, blueprint: process.env.ACRYL_BLUEPRINT, port: process.env.ACRYL_WEB_PORT, cwd: process.cwd() }))\n")
  const framework = join(dir, 'framework'); mkdirSync(join(framework, 'scripts', 'lib'), { recursive: true })
  for (const file of ['blank.mjs', 'lib/instances.mjs']) writeFileSync(join(framework, 'scripts', file), readFileSync(new URL(`./${file}`, import.meta.url)))
  const house = join(dir, 'orbit')
  writeScaffold(house, { name: 'Orbit', runtime }, framework)
  assert.ok(existsSync(join(house, 'runtime', 'lib', 'bin.js')) && existsSync(join(house, '.house', 'launch.mjs')))
  assert.doesNotMatch(readFileSync(join(house, 'run.sh'), 'utf8'), /framework/)
  rmSync(framework, { recursive: true, force: true })   // the construction company leaves
  const proof = join(dir, 'proof.json')
  const home = join(dir, 'home'); mkdirSync(home)
  const result = spawnSync(join(house, 'run.sh'), ['web'], { env: { ...process.env, HOME: home, PROOF: proof }, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  const seen = JSON.parse(readFileSync(proof, 'utf8'))
  assert.equal(seen.home, realpathSync(house)); assert.match(seen.instance, /^orbit-[0-9a-f]{4}$/u)
  assert.equal(seen.blueprint, join(realpathSync(house), 'acryl.instance.yaml')); assert.deepEqual(seen.args, ['--no-open'])
  assert.ok(Number(seen.port) >= 3100 && Number(seen.port) < 4000)
  assert.ok(!existsSync(join(house, 'instance.json')), 'the name is freed when the app exits')
  const cli = spawnSync(join(house, 'run.sh'), ['cli'], { env: { ...process.env, HOME: home, PROOF: proof }, encoding: 'utf8' })
  assert.notEqual(cli.status, 0); assert.match(cli.stderr, /carries only the Web runtime/)
}))

test('a runtime that is not an ACRYL Web runtime is rejected before anything is written', () => temp(dir => {
  assert.throws(() => writeScaffold(join(dir, 'orbit'), { runtime: dir }, '/fw'), /not an ACRYL Web runtime/)
  assert.ok(!existsSync(join(dir, 'orbit')))
}))
