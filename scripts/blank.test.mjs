import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { blankLaunchPlan, parseFlags } from './blank.mjs'

const temp = run => { const dir = realpathSync(mkdtempSync(join(tmpdir(), 'blank-'))); try { return run(dir) } finally { rmSync(dir, { recursive: true, force: true }) } }

test('every surface runs a managed app in its own home, and no ambient placement variable leaks in', () => {
  for (const surface of ['web', 'cli', 'desktop']) {
    const plan = blankLaunchPlan(surface, {}, { PATH: 'x', DSH_HOME: '/real/home', ACRYL_WEB_PORT: '3080', ACRYL_INSTANCE: 'other' }, '/h', '/r')
    assert.equal(plan.env.ACRYL_HOME, '/h/.acryl-instances/blank', surface)
    assert.equal(plan.env.DSH_HOME, '/h/.acryl-instances/blank/.dsh', surface)
    assert.equal(plan.env.ACRYL_INSTANCE, 'blank', surface)
    assert.equal(plan.env.ACRYL_LOCAL_PRODUCT_NAME, 'ACRYL blank', surface)
    assert.equal(plan.env.ACRYL_BLUEPRINT, 'acryl.blank', surface)
    assert.notEqual(plan.env.ACRYL_WEB_PORT, '3080', surface)
    assert.equal(plan.env.PATH, 'x')
  }
})

test('two apps get different homes, ports and Desktop user data', () => {
  const a = blankLaunchPlan('web', { instance: 'alpha' }, {}, '/h', '/r')
  const b = blankLaunchPlan('web', { instance: 'beta' }, {}, '/h', '/r')
  assert.notEqual(a.env.ACRYL_HOME, b.env.ACRYL_HOME)
  assert.notEqual(a.env.ACRYL_WEB_PORT, b.env.ACRYL_WEB_PORT)
  assert.notEqual(blankLaunchPlan('desktop', { instance: 'alpha' }, {}, '/h', '/r').env.ACRYL_LOCAL_PRODUCT_NAME, blankLaunchPlan('desktop', { instance: 'beta' }, {}, '/h', '/r').env.ACRYL_LOCAL_PRODUCT_NAME)
})

test('an app folder runs with its own definition, and --port picks a start', () => temp(dir => {
  const app = join(dir, 'stage'); mkdirSync(app); writeFileSync(join(app, 'blend.yaml'), 'x')
  const plan = blankLaunchPlan('web', { dir: app, port: '4000' }, {}, '/h', '/r')
  assert.equal(plan.env.ACRYL_HOME, app)
  assert.equal(plan.env.ACRYL_BLUEPRINT, join(app, 'blend.yaml'))
  assert.equal(plan.env.ACRYL_WEB_PORT, '4000')
}))

test('brand flags pass through; bad input fails loudly', () => {
  assert.equal(blankLaunchPlan('web', { name: 'Orbit' }, {}, '/h', '/r').env.ACRYL_BRAND_NAME, 'Orbit')
  assert.throws(() => blankLaunchPlan('tv', {}, {}, '/h', '/r'), /unknown surface/)
  assert.throws(() => blankLaunchPlan('web', { port: '80' }, {}, '/h', '/r'), /1024/)
  assert.throws(() => blankLaunchPlan('web', { instance: '../evil' }, {}, '/h', '/r'), /app name/)
})

test('a second Desktop app starts from the existing build instead of rebuilding under the first', () => {
  assert.ok(!blankLaunchPlan('desktop', {}, {}, '/h', '/r', ['web']).args.includes('--skip-build'))
  assert.ok(blankLaunchPlan('desktop', {}, {}, '/h', '/r', ['desktop']).args.includes('--skip-build'))
})

test('flags parse in both forms', () => {
  assert.deepEqual(parseFlags(['--name', 'Orbit', '--accent=#112233']), { name: 'Orbit', accent: '#112233' })
})
