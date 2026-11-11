import assert from 'node:assert/strict'
import { join } from 'node:path'
import test from 'node:test'
import { appRoot, CREATE_SPEC, DOOR, forwardCommand, npmExec } from '../forward.js'

const execPath = '/usr/bin/node'
const base = { env: {}, platform: 'linux', cwd: '/work/shop', execPath, exists: () => false }

test('acryl new and create run create-acrylblends with the same words, and no -- in front of the flags', () => {
  for (const word of ['new', 'create']) {
    assert.deepEqual(forwardCommand([word, 'shop', 'notes', '--no-start'], base), {
      command: 'npm',
      args: ['exec', '--yes', CREATE_SPEC, '--', 'shop', 'notes', '--no-start'],
    })
  }
})

test('ACRYL_CREATE pins another version or a tarball without a flag', () => {
  const pinned = forwardCommand(['new', 'shop'], { ...base, env: { ACRYL_CREATE: ' file:/x/c.tgz ' } })
  assert.deepEqual(pinned.args, ['exec', '--yes', 'file:/x/c.tgz', '--', 'shop'])
})

test('the npm that started acryl runs it, with no shell; Windows without one goes through npm.cmd and a shell', () => {
  const cli = '/usr/lib/node_modules/npm/bin/npm-cli.js'
  assert.deepEqual(npmExec({ env: { npm_execpath: cli }, platform: 'win32', execPath }, 'x', ['a']), {
    command: execPath,
    args: [cli, 'exec', '--yes', 'x', '--', 'a'],
  })
  assert.deepEqual(npmExec({ env: {}, platform: 'win32', execPath }, 'x', ['a']), {
    command: 'npm.cmd',
    args: ['exec', '--yes', 'x', '--', 'a'],
    shell: true,
  })
  // pnpm or yarn started it: their path is not npm's, so npm is used.
  assert.equal(npmExec({ env: { npm_execpath: '/p/pnpm.cjs' }, platform: 'linux', execPath }, 'x', []).command, 'npm')
})

test('acryl blends and acryl update run the acrylblends command', () => {
  assert.deepEqual(forwardCommand(['blends', 'add', 'kv'], base).args, ['exec', '--yes', 'acrylblends', '--', 'add', 'kv'])
  assert.deepEqual(forwardCommand(['update', '--dry-run'], base).args, ['exec', '--yes', 'acrylblends', '--', 'upgrade', '--dry-run'])
})

test('acryl plugin runs the door of the app this directory is in, from the app folder, whichever folder inside it', () => {
  const root = '/work/shop'
  const inApp = { ...base, cwd: join(root, 'plugins', 'clock'), exists: (p) => p === join(root, DOOR) }
  for (const word of ['plugin', 'plugins']) {
    assert.deepEqual(forwardCommand([word, 'publish', 'hello', '--owner', 'x'], inApp), {
      command: execPath,
      args: [join(root, DOOR), 'plugin', 'publish', 'hello', '--owner', 'x'],
      cwd: root,
    })
  }
  assert.equal(appRoot('/elsewhere', () => false), undefined)
})

test('outside an app, or with nothing to do, plugin says what to do instead of failing obscurely', () => {
  assert.match(forwardCommand(['plugin', 'publish', 'x'], base).error, /inside an app folder/u)
  const inApp = { ...base, exists: (p) => p === join('/work/shop', DOOR) }
  assert.match(forwardCommand(['plugin'], inApp).error, /needs what to do/u)
})

test('every other word keeps its old meaning: acryl, acryl web, acryl desktop are not forwarded', () => {
  for (const argv of [[], ['web'], ['desktop'], ['--help'], ['chat']]) assert.equal(forwardCommand(argv, base), undefined)
})
