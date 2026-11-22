import assert from 'node:assert/strict'
import { join } from 'node:path'
import test from 'node:test'
import { CREATE_SPEC } from '../forward.js'
import { MANAGED, managedSteps, openFolderEnv, runtimeInstallStep, runtimePrefix, surfaceFrom } from '../managed.js'

const context = { env: {}, platform: 'linux', cwd: '/work', execPath: '/usr/bin/node', exists: () => false }
const home = '/u/.acryl'
const ade = join(home, 'ade')

test('acryl ade opens in the browser unless a surface is named; --desktop and --cli are the same as --gui and --tui', () => {
  assert.deepEqual(surfaceFrom([]), { surface: 'web', rest: [] })
  assert.deepEqual(surfaceFrom(['--gui']), { surface: 'gui', rest: [] })
  assert.deepEqual(surfaceFrom(['--desktop']), { surface: 'gui', rest: [] })
  assert.deepEqual(surfaceFrom(['--cli', '-p', 'hi']), { surface: 'tui', rest: ['-p', 'hi'] })
})

test('two surfaces, or words the browser cannot take, are refused with what to type', () => {
  assert.match(surfaceFrom(['--web', '--tui']).error, /one surface at a time/u)
  assert.equal(surfaceFrom(['--gui', '--desktop']).surface, 'gui')
  assert.match(surfaceFrom(['-p', 'hi']).error, /acryl ade --tui -p hi/u)
})

test('the first run makes ADE from the registry in ~/.acryl/ade, installs it, then starts it', () => {
  const steps = managedSteps(MANAGED.ade, 'web', { home, context, exists: () => false })
  assert.deepEqual(steps.map(({ command, args, cwd }) => ({ command, args, cwd })), [
    { command: 'npm', args: ['exec', '--yes', CREATE_SPEC, '--', 'ade', '--from', 'acryl.ade', '--no-start'], cwd: home },
    { command: 'npm', args: ['install', '--no-audit', '--no-fund'], cwd: ade },
    { command: 'npm', args: ['run', 'dev'], cwd: ade },
  ])
})

test('a made and installed ADE only starts; --gui starts its window', () => {
  const steps = managedSteps(MANAGED.ade, 'gui', { home, context, exists: () => true, update: false })
  assert.deepEqual(steps.map(step => step.args), [['run', 'desktop']])
})

test('an install cut short (no npm lockfile in node_modules) is done again', () => {
  const made = path => path === join(ade, 'blend.yaml') || path === join(ade, 'node_modules')
  assert.deepEqual(managedSteps(MANAGED.ade, 'web', { home, context, exists: made, update: false }).map(step => step.args[0]), ['install', 'run'])
})

test('acryl --gui and --web make ACRYL Control Center in ~/.acryl/control-center once, then open it in a window or the browser', () => {
  const launcher = join(home, 'control-center')
  const steps = managedSteps(MANAGED.launcher, 'gui', { home, context, exists: () => false })
  assert.deepEqual(steps[0].args.slice(-4), ['control-center', '--from', 'acryl.control-center', '--no-start'])
  assert.deepEqual(steps.map(step => step.cwd), [home, launcher, launcher])
  assert.deepEqual(steps[2].args, ['run', 'desktop'])
  assert.deepEqual(managedSteps(MANAGED.launcher, 'web', { home, context, exists: () => true, update: false }).map(step => step.args), [['run', 'dev']])
})

test('ACRYL_CREATE pins the create package, as for acryl new', () => {
  const [create] = managedSteps(MANAGED.ade, 'web', { home, context: { ...context, env: { ACRYL_CREATE: 'file:/x.tgz' } }, exists: () => false })
  assert.equal(create.args[2], 'file:/x.tgz')
})

test('the terminal agent installs into ~/.acryl/runtime/<version>, never beside the selector', () => {
  const step = runtimeInstallStep({ home, version: '0.2.7', packageName: 'acryl-cli-linux-x64', context })
  assert.equal(runtimePrefix(home, '0.2.7'), join(home, 'runtime', '0.2.7'))
  assert.deepEqual(step.args, ['install', '--prefix', join(home, 'runtime', '0.2.7'), '--no-save', '--no-audit', '--no-fund', 'acryl-cli-linux-x64@0.2.7'])
})

test('acryl ade passes the folder it was started in, but not the home or ACRYL\'s own folder', () => {
  const homes = { userHome: '/u', acrylHome: '/u/.acryl' }
  assert.deepEqual(openFolderEnv('/u/code/shop', homes), { ACRYL_OPEN_FOLDER: '/u/code/shop' })
  assert.deepEqual(openFolderEnv('/u', homes), {})
  assert.deepEqual(openFolderEnv('/u/.acryl', homes), {})
  assert.deepEqual(openFolderEnv('/u/.acryl/ade', homes), {})
  assert.deepEqual(openFolderEnv('/u/.acryl-notes', homes), { ACRYL_OPEN_FOLDER: '/u/.acryl-notes' })
})
