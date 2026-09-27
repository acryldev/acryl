import assert from 'node:assert/strict'
import test from 'node:test'
import { blankLaunchPlan, parseFlags } from './blank.mjs'

test('web runs the blank blueprint in its own home and never on 3080', () => {
  const plan = blankLaunchPlan('web', { name: 'Orbit' }, { PATH: 'x' }, '/h', '/r')
  assert.equal(plan.env.ACRYL_BLUEPRINT, 'acryl.blank')
  assert.equal(plan.env.ACRYL_BRAND_NAME, 'Orbit')
  assert.equal(plan.env.DSH_HOME, '/h/.acryl-blank/.dsh')
  assert.equal(plan.webPort, 3081)
})

test('cli shares the isolated home, desktop gets its own home and user data', () => {
  assert.equal(blankLaunchPlan('cli', {}, {}, '/h', '/r').env.DSH_HOME, '/h/.acryl-blank/.dsh')
  const desktop = blankLaunchPlan('desktop', {}, {}, '/h', '/r')
  assert.equal(desktop.env.ACRYL_LOCAL_HOME_DIR, '.acryl-blank')
  assert.equal(desktop.env.ACRYL_LOCAL_PRODUCT_NAME, 'ACRYL Blank')
})

test('bad surface and bad port fail loudly', () => {
  assert.throws(() => blankLaunchPlan('tv', {}, {}), /unknown surface/)
  assert.throws(() => blankLaunchPlan('web', { port: '80' }, {}), /1024/)
})

test('web passes its port through ACRYL_WEB_PORT', () => {
  assert.equal(blankLaunchPlan('web', { port: '4000' }, {}, '/h', '/r').env.ACRYL_WEB_PORT, '4000')
})

test('flags parse in both forms', () => {
  assert.deepEqual(parseFlags(['--name', 'Orbit', '--accent=#112233']), { name: 'Orbit', accent: '#112233' })
})

test('a blueprint file replaces the built-in and is passed as an absolute path', () => {
  const plan = blankLaunchPlan('web', { blueprint: 'samples/x.yaml' }, {}, '/h', '/r')
  assert.ok(plan.env.ACRYL_BLUEPRINT.endsWith('/samples/x.yaml') && plan.env.ACRYL_BLUEPRINT.startsWith('/'))
})
