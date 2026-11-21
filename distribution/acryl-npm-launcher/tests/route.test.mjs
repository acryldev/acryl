import assert from 'node:assert/strict'
import { test } from 'node:test'
import { controlCenterArgs, desktopEntryExec, firstAddress, installedControlCenter, opensBrowser } from '../control-center.js'
import { createdAppName, forwardCommand } from '../forward.js'
import { HELP } from '../help.js'
import { MANAGED, managedSteps } from '../managed.js'
import { routeArgs } from '../route.js'

const terminal = { terminal: true }
const pipe = { terminal: false }

test('acryl and acryl --tui open the terminal Control Center; without a terminal a bare acryl prints the help', () => {
  assert.deepEqual(routeArgs([], terminal), { kind: 'tui' })
  assert.deepEqual(routeArgs(['--tui'], terminal), { kind: 'tui' })
  assert.deepEqual(routeArgs([], pipe), { kind: 'help' })
  assert.equal(routeArgs(['--tui'], pipe).kind, 'error')
  assert.equal(routeArgs(['--tui', 'x'], terminal).kind, 'error')
})

test('--gui and --web are the Control Center in a window and the browser, with --update and nothing else', () => {
  assert.deepEqual(routeArgs(['--gui'], pipe), { kind: 'control-center', surface: 'gui', update: false })
  assert.deepEqual(routeArgs(['--web', '--update'], pipe), { kind: 'control-center', surface: 'web', update: true })
  assert.deepEqual(routeArgs(['web'], pipe), { kind: 'control-center', surface: 'web', update: false })
  assert.match(routeArgs(['--gui', 'now'], pipe).message, /takes only --update/u)
  assert.deepEqual(controlCenterArgs(['--gui', '--update']), { surface: 'gui', update: true })
})

test('the script commands: help, version, apps, model, store, ade, desktop; other words go to the terminal agent', () => {
  for (const words of [['--help'], ['-h'], ['help']]) assert.deepEqual(routeArgs(words, terminal), { kind: 'help' })
  assert.deepEqual(routeArgs(['--version'], pipe), { kind: 'version' })
  assert.deepEqual(routeArgs(['apps', 'add', 'x'], pipe), { kind: 'apps', args: ['add', 'x'] })
  assert.deepEqual(routeArgs(['store', 'notes'], pipe), { kind: 'store', args: ['notes'] })
  assert.deepEqual(routeArgs(['model', 'set', 'deepseek'], pipe), { kind: 'model', args: ['set', 'deepseek'] })
  assert.deepEqual(routeArgs(['code', '--gui'], pipe), { kind: 'ade', args: ['--gui'] })
  assert.deepEqual(routeArgs(['desktop', '--no-open'], pipe), { kind: 'desktop', args: ['--no-open'] })
  assert.deepEqual(routeArgs(['-p', 'hello'], pipe), { kind: 'agent', args: ['-p', 'hello'] })
  for (const command of ['acryl --tui', 'acryl --gui', 'acryl --web', 'acryl make <name> --from <id>', 'acryl store', 'acryl apps', 'acryl model']) assert.ok(HELP.includes(command), command)
})

test('acryl make is acryl new: the same create command, and the made folder is listed', () => {
  const context = { env: {}, platform: 'linux', cwd: '/w', execPath: '/node', exists: () => false }
  assert.deepEqual(forwardCommand(['make', 'notes', '--from', 'acrylblends.notes'], context), forwardCommand(['new', 'notes', '--from', 'acrylblends.notes'], context))
  assert.equal(createdAppName(['make', 'notes', '--from', 'acrylblends.notes']), 'notes')
})

test('--gui finds the installed app on each OS, and ACRYL_CONTROL_CENTER=blend always takes the Blend copy', () => {
  const at = paths => ({ exists: path => paths.includes(path), read: path => files[path] ?? '', list: folder => Object.keys(files).filter(path => path.startsWith(`${folder}/`)).map(path => path.slice(folder.length + 1)) })
  const files = { '/usr/share/applications/acryl-control-center.desktop': '[Desktop Entry]\nName=ACRYL Control Center\nExec="/opt/ACRYL Control Center/acryl-control-center" %U\n', '/usr/share/applications/other.desktop': 'Name=Other\nExec=/bin/other\n' }
  assert.deepEqual(installedControlCenter({ platform: 'darwin', env: { HOME: '/Users/me' }, fs: at(['/Users/me/Applications/ACRYL Control Center.app']) }), { command: 'open', args: ['-a', '/Users/me/Applications/ACRYL Control Center.app'], at: '/Users/me/Applications/ACRYL Control Center.app' })
  assert.equal(installedControlCenter({ platform: 'darwin', env: { HOME: '/Users/me', ACRYL_CONTROL_CENTER: 'blend' }, fs: at(['/Applications/ACRYL Control Center.app']) }), undefined)
  assert.equal(installedControlCenter({ platform: 'darwin', env: { HOME: '/Users/me' }, fs: at([]) }), undefined)
  const exe = 'C:\\Users\\me\\AppData\\Local\\Programs\\ACRYL Control Center\\ACRYL Control Center.exe'
  assert.deepEqual(installedControlCenter({ platform: 'win32', env: { LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' }, fs: at([exe]) }), { command: exe, args: [], at: exe })
  assert.equal(installedControlCenter({ platform: 'linux', env: { HOME: '/home/me' }, fs: at([]) }).command, '/opt/ACRYL Control Center/acryl-control-center')
  assert.equal(desktopEntryExec('Name=Other\nExec=/bin/other'), undefined)
})

test('--web opens the first tokenized address the Control Center prints, unless told not to', () => {
  assert.equal(firstAddress('\x1b[32mACRYL Control Center: http://127.0.0.1:4123/?token=abc\x1b[0m\n'), 'http://127.0.0.1:4123/?token=abc')
  assert.equal(firstAddress('installing...'), undefined)
  assert.equal(opensBrowser({}), true)
  assert.equal(opensBrowser({ ACRYL_NO_OPEN: '1' }), false)
  assert.equal(opensBrowser({ BROWSER: 'none' }), false)
})

test('one Control Center copy in the ACRYL home: made once, then only started; --update merges its newer release first', () => {
  const context = { env: {}, platform: 'linux', execPath: '/node', exists: () => false }
  const made = path => path === '/h/.acryl/control-center/blend.yaml' || path.endsWith('.package-lock.json')
  const first = managedSteps(MANAGED.launcher, 'web', { home: '/h/.acryl', context, exists: () => false })
  assert.deepEqual(first.map(step => step.label.split(' ')[0]), ['making', 'installing', 'starting'])
  const later = managedSteps(MANAGED.launcher, 'gui', { home: '/h/.acryl', context, exists: made })
  assert.deepEqual(later.map(step => [step.args.join(' '), step.cwd]), [['run desktop', '/h/.acryl/control-center']])
  const updated = managedSteps(MANAGED.launcher, 'web', { home: '/h/.acryl', context, exists: made, update: true })
  assert.deepEqual(updated.map(step => step.args.join(' ')), ['exec --yes acrylblends@latest -- update', 'run dev'])
})

test('acryl desktop says where the earlier desktop went and still offers its installer', async () => {
  const { DESKTOP_MOVED } = await import('../help.js')
  for (const where of ['63-acryl-control-center/releases/latest', '05-acryl-ade/releases/latest', 'acryldev/acryl-desktop', 'acryldev/acryl/releases', 'acryl desktop --installer'])
    assert.ok(DESKTOP_MOVED.includes(where), where)
})
