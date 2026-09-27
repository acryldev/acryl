import assert from 'node:assert/strict'
import test from 'node:test'
import { blankLaunchPlan, parseFlags } from './blank.mjs'

test('every surface runs as a named instance with its own home and never inherits an ambient DSH_HOME', () => {
  for (const surface of ['web', 'cli', 'desktop']) {
    const plan = blankLaunchPlan(surface, {}, { PATH: 'x', DSH_HOME: '/real/home' }, '/h', '/r')
    assert.equal(plan.env.ACRYL_INSTANCE, 'blank')
    assert.equal(plan.env.ACRYL_HOME, '/h/.acryl-instances/blank')
    assert.equal(plan.env.ACRYL_BLUEPRINT, 'acryl.blank')
    assert.equal(plan.env.DSH_HOME, undefined, surface)
  }
})

test('two instances get different homes, ports and desktop user data', () => {
  const a = blankLaunchPlan('web', { instance: 'alpha' }, {}, '/h', '/r')
  const b = blankLaunchPlan('web', { instance: 'beta' }, {}, '/h', '/r')
  assert.notEqual(a.env.ACRYL_HOME, b.env.ACRYL_HOME)
  assert.notEqual(a.env.ACRYL_WEB_PORT, b.env.ACRYL_WEB_PORT)
  assert.equal(blankLaunchPlan('desktop', { instance: 'alpha' }, {}, '/h', '/r').env.ACRYL_LOCAL_PRODUCT_NAME, 'ACRYL alpha')
})

test('web starts from the instance\'s stable port unless --port says otherwise', () => {
  const stable = blankLaunchPlan('web', { instance: 'alpha' }, {}, '/h', '/r').webPort
  assert.equal(blankLaunchPlan('web', { instance: 'alpha' }, {}, '/h', '/r').webPort, stable)
  assert.equal(blankLaunchPlan('web', { port: '4000' }, {}, '/h', '/r').env.ACRYL_WEB_PORT, '4000')
})

test('brand flags and a blueprint file are passed through, and bad input fails loudly', () => {
  const plan = blankLaunchPlan('web', { name: 'Orbit', accent: '#112233', blueprint: 'samples/x.yaml' }, {}, '/h', '/r')
  assert.equal(plan.env.ACRYL_BRAND_NAME, 'Orbit')
  assert.ok(plan.env.ACRYL_BLUEPRINT.startsWith('/') && plan.env.ACRYL_BLUEPRINT.endsWith('/samples/x.yaml'))
  assert.throws(() => blankLaunchPlan('tv', {}, {}), /unknown surface/)
  assert.throws(() => blankLaunchPlan('web', { port: '80' }, {}), /1024/)
  assert.throws(() => blankLaunchPlan('web', { instance: '../evil' }, {}), /instance name/)
})

test('flags parse in both forms', () => {
  assert.deepEqual(parseFlags(['--name', 'Orbit', '--accent=#112233']), { name: 'Orbit', accent: '#112233' })
})
