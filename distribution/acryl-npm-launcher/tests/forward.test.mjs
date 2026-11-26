import assert from 'node:assert/strict'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { appRoot, CREATE_SPEC, DOOR, forwardCommand, INSTALL_CLI, launcherCommand, npmExec } from '../forward.js'

const execPath = '/usr/bin/node'
const base = { env: {}, platform: 'linux', cwd: '/work/shop', execPath, exists: () => false, home: '/h/.acryl', terminal: false }

test('acryl new, make and create make the app with create-acrylblends --no-install, then install it through the one install (spec 052)', () => {
  for (const word of ['new', 'make', 'create']) {
    assert.deepEqual(forwardCommand([word, 'shop', 'notes', '--no-start'], base).steps.map(({ label, ...step }) => step), [
      { command: 'npm', args: ['exec', '--yes', CREATE_SPEC, '--', 'shop', 'notes', '--no-start', '--no-install'], cwd: '/work/shop' },
      { command: execPath, args: [INSTALL_CLI, '--home', '/h/.acryl'], cwd: resolve('/work/shop', 'shop') },
    ])
  }
  assert.match(INSTALL_CLI, /app-install-cli\.mjs$/u)
})

test('in a terminal the new app then starts, as create-acrylblends would have started it; not with --no-start, --bare, or without a terminal', () => {
  const steps = forwardCommand(['new', 'shop'], { ...base, terminal: true }).steps
  assert.equal(steps.length, 3)
  assert.deepEqual({ ...steps[2], label: undefined }, { label: undefined, command: 'npm', args: ['run', 'dev'], cwd: resolve('/work/shop', 'shop') })
  assert.match(steps[2].label, /cd shop && npm run dev/u)
  for (const flag of ['--no-start', '--bare']) assert.equal(forwardCommand(['new', 'shop', flag], { ...base, terminal: true }).steps.length, 2)
  assert.equal(forwardCommand(['new', 'shop'], base).steps.length, 2)
})

test('what create-acrylblends installs on its own terms goes to it unchanged: no name, a source, --from, --install, --no-install, --pm, help', () => {
  for (const rest of [
    [],
    ['--yes'],
    ['shop', 'github:me/starter'],
    ['shop', '@me/starter'],
    ['shop', './starter.tgz'],
    ['shop', '--from', 'acrylblends.notes-desktop'],
    ['shop', '--from=acrylblends.notes-desktop'],
    ['shop', '--install'],
    ['shop', '--no-install'],
    ['shop', '--pm', 'pnpm'],
    ['--help'],
    ['-v'],
  ]) {
    assert.deepEqual(forwardCommand(['new', ...rest], base), { command: 'npm', args: ['exec', '--yes', CREATE_SPEC, '--', ...rest] }, rest.join(' '))
  }
})

test('ACRYL_CREATE pins another version or a tarball without a flag', () => {
  const pinned = forwardCommand(['new', 'shop'], { ...base, env: { ACRYL_CREATE: ' file:/x/c.tgz ' } })
  assert.deepEqual(pinned.steps[0].args, ['exec', '--yes', 'file:/x/c.tgz', '--', 'shop', '--no-install'])
  const sourced = forwardCommand(['new', 'shop', '--from', 'x'], { ...base, env: { ACRYL_CREATE: 'file:/x/c.tgz' } })
  assert.deepEqual(sourced.args, ['exec', '--yes', 'file:/x/c.tgz', '--', 'shop', '--from', 'x'])
})

test('the npm that started acryl runs it, with no shell; on Windows the npm CLI file beside node.exe, and npm.cmd through a shell only as the last resort', () => {
  const cli = '/usr/lib/node_modules/npm/bin/npm-cli.js'
  assert.deepEqual(npmExec({ env: { npm_execpath: cli }, platform: 'win32', execPath }, 'x', ['a']), {
    command: execPath,
    args: [cli, 'exec', '--yes', 'x', '--', 'a'],
  })
  // Windows without npm_execpath: the npm CLI file beside node.exe, run by node itself, no shell.
  const winNode = 'C:\\Program Files\\nodejs\\node.exe'
  const beside = 'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js'
  assert.deepEqual(
    npmExec({ env: {}, platform: 'win32', execPath: winNode, exists: (p) => p === beside }, 'x', ['a']),
    { command: winNode, args: [beside, 'exec', '--yes', 'x', '--', 'a'] },
  )
  // Only when that file is not there, npm.cmd through a shell.
  assert.deepEqual(npmExec({ env: {}, platform: 'win32', execPath: winNode, exists: () => false }, 'x', ['a']), {
    command: 'npm.cmd',
    args: ['exec', '--yes', 'x', '--', 'a'],
    shell: true,
  })
  // pnpm or yarn started it: their path is not npm's, so npm is used.
  assert.equal(npmExec({ env: { npm_execpath: '/p/pnpm.cjs' }, platform: 'linux', execPath }, 'x', []).command, 'npm')
})

test('acryl blends and acryl update run the framework command (@acryldev/blends)', () => {
  assert.deepEqual(forwardCommand(['blends', 'add', 'kv'], base).args, ['exec', '--yes', '@acryldev/blends', '--', 'add', 'kv'])
  assert.deepEqual(forwardCommand(['update', '--dry-run'], base).args, ['exec', '--yes', '@acryldev/blends', '--', 'upgrade', '--dry-run'])
})

test('acryl plugin runs the door of the app this directory is in, from the app folder, whichever folder inside it', () => {
  const root = resolve('/work/shop') // appRoot resolves, which adds the drive letter on Windows
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
  const inApp = { ...base, exists: (p) => p === join(resolve('/work/shop'), DOOR) }
  assert.match(forwardCommand(['plugin'], inApp).error, /needs what to do/u)
})

test('every other word keeps its old meaning: acryl, acryl web, acryl desktop are not forwarded', () => {
  for (const argv of [[], ['web'], ['desktop'], ['--help'], ['chat']]) assert.equal(forwardCommand(argv, base), undefined)
})

test('what the launcher chose runs through this same acryl, or through npm for an app\'s own scripts, in the folder it names', () => {
  const context = { ...base, cwd: '/work', bin: '/pkg/acryl/bin.js' }
  assert.deepEqual(launcherCommand({ program: 'acryl', args: ['new', 'shop', 'notes'], cwd: '.' }, context), {
    command: execPath, args: ['/pkg/acryl/bin.js', 'new', 'shop', 'notes'], cwd: resolve('/work'),
  })
  assert.deepEqual(launcherCommand({ program: 'acryl', args: ['plugin', 'pull', 'github:a/b'], cwd: 'shop' }, context), {
    command: execPath, args: ['/pkg/acryl/bin.js', 'plugin', 'pull', 'github:a/b'], cwd: resolve('/work', 'shop'),
  })
  assert.deepEqual(launcherCommand({ program: 'npm', args: ['run', 'dev'], cwd: 'shop' }, context), { command: 'npm', args: ['run', 'dev'], cwd: resolve('/work', 'shop') })
  assert.match(launcherCommand({ program: 'rm', args: ['-rf', '/'], cwd: '.' }, context).error, /does not run/u)
})

test('createdAppName finds the folder acryl new makes', async () => {
  const { createdAppName } = await import('../forward.js')
  assert.equal(createdAppName(['new', 'shop']), 'shop')
  assert.equal(createdAppName(['create', 'shop', 'todo']), 'shop')
  assert.equal(createdAppName(['new', 'shop', '--from', 'acrylblends.notes']), 'shop')
  assert.equal(createdAppName(['new', '--from', 'acrylblends.notes', 'shop']), 'shop')
  assert.equal(createdAppName(['new', '--template', 'notes', 'shop']), 'shop')
  assert.equal(createdAppName(['new', '--pm', 'pnpm', 'shop']), 'shop')
  assert.equal(createdAppName(['new', '--from=acrylblends.notes', 'shop']), 'shop')
  assert.equal(createdAppName(['new']), undefined)
  assert.equal(createdAppName(['update']), undefined)
})
