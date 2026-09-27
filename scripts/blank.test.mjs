import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { blankLaunchPlan, ensureWebPort, parseFlags } from './blank.mjs'

test('web runs the blank blueprint in its own home and never on 3080', () => {
  const plan = blankLaunchPlan('web', { name: 'Orbit' }, { PATH: 'x' }, '/h', '/r')
  assert.equal(plan.env.ACRYL_BLUEPRINT, 'acryl.blank')
  assert.equal(plan.env.ACRYL_BRAND_NAME, 'Orbit')
  assert.equal(plan.env.DSH_HOME, '/h/.acryl-blank/.dsh')
  assert.equal(plan.webPort, 3391)
})

test('cli shares the isolated home, desktop keeps the dev-local isolation', () => {
  assert.equal(blankLaunchPlan('cli', {}, {}, '/h', '/r').env.DSH_HOME, '/h/.acryl-blank/.dsh')
  assert.equal(blankLaunchPlan('desktop', {}, {}, '/h', '/r').env.DSH_HOME, undefined)
})

test('bad surface and bad port fail loudly', () => {
  assert.throws(() => blankLaunchPlan('tv', {}, {}), /unknown surface/)
  assert.throws(() => blankLaunchPlan('web', { port: '80' }, {}), /1024/)
})

test('the web port patch is written once and never overwrites the user\'s own', () => {
  const home = mkdtempSync(join(tmpdir(), 'blank-'))
  try {
    assert.equal(ensureWebPort(home, 4000), true)
    assert.match(readFileSync(join(home, 'profiles', 'web', 'cordis.patch.yml'), 'utf8'), /port: 4000/)
    assert.equal(ensureWebPort(home, 5000), false)
  } finally { rmSync(home, { recursive: true, force: true }) }
})

test('flags parse in both forms', () => {
  assert.deepEqual(parseFlags(['--name', 'Orbit', '--accent=#112233']), { name: 'Orbit', accent: '#112233' })
})

test('a blueprint file replaces the built-in and is passed as an absolute path', () => {
  const plan = blankLaunchPlan('web', { blueprint: 'samples/x.yaml' }, {}, '/h', '/r')
  assert.ok(plan.env.ACRYL_BLUEPRINT.endsWith('/samples/x.yaml') && plan.env.ACRYL_BLUEPRINT.startsWith('/'))
})
