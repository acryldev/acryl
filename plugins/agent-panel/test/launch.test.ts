import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveLaunch } from '../launch.ts'

/** A Windows machine: the files that exist, with their text. */
const machine = (files: Record<string, string>, path = 'C:\\tools;C:\\Users\\a b\\node22') => ({
  platform: 'win32' as const,
  env: { PATH: path },
  exists: (file: string) => file in files,
  read: (file: string) => files[file] ?? '',
  execPath: 'C:\\node\\node.exe',
})

/** What npm's cmd-shim writes for a global install (the part that matters; the rest is boilerplate). */
const npmShim = (script: string) =>
  `@ECHO off\r\nGOTO start\r\n:find_dp0\r\nSET dp0=%~dp0\r\nEXIT /b\r\n:start\r\nSETLOCAL\r\nCALL :find_dp0\r\n\r\nIF EXIST "%dp0%\\node.exe" (\r\n  SET "_prog=%dp0%\\node.exe"\r\n) ELSE (\r\n  SET "_prog=node"\r\n)\r\n\r\nendLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\${script}" %*\r\n`

test('off Windows the program is started by name', () => {
  assert.deepEqual(resolveLaunch('pi', ['-p', 'hi'], { platform: 'linux' }), {
    file: 'pi',
    args: ['-p', 'hi'],
  })
})

test('an npm .cmd shim becomes node and the script it runs, with the message untouched (no shell, no cmd.exe quoting)', () => {
  const message = 'make it "red" & show 100% | done > file ^ <x>'
  const launch = resolveLaunch(
    'pi',
    ['-p', message],
    machine({
      'C:\\Users\\a b\\node22\\pi.cmd': npmShim(
        'node_modules\\@earendil-works\\pi-coding-agent\\dist\\cli.js',
      ),
    }),
  )
  assert.deepEqual(launch, {
    file: 'C:\\node\\node.exe',
    args: [
      'C:\\Users\\a b\\node22\\node_modules\\@earendil-works\\pi-coding-agent\\dist\\cli.js',
      '-p',
      message,
    ],
  })
})

test('a node.exe beside the shim is the Node that runs its script', () => {
  const launch = resolveLaunch(
    'codex',
    ['exec'],
    machine({
      'C:\\tools\\codex.cmd': npmShim('node_modules\\@openai\\codex\\bin\\codex.js'),
      'C:\\tools\\node.exe': '',
    }),
  )
  assert.deepEqual(launch, {
    file: 'C:\\tools\\node.exe',
    args: ['C:\\tools\\node_modules\\@openai\\codex\\bin\\codex.js', 'exec'],
  })
})

test('a native .exe is started as it is, and is preferred to a shim beside it', () => {
  const launch = resolveLaunch(
    'claude',
    ['-p', 'hi'],
    machine({ 'C:\\tools\\claude.exe': '', 'C:\\tools\\claude.cmd': npmShim('x.js') }),
  )
  assert.deepEqual(launch, { file: 'C:\\tools\\claude.exe', args: ['-p', 'hi'] })
})

test('a batch file that is not an npm shim, and a program that is not there, are sentences and not a spawn', () => {
  const batch = resolveLaunch(
    'pi',
    [],
    machine({ 'C:\\tools\\pi.cmd': '@echo off\r\nsomething else %*\r\n' }),
  )
  assert.ok('error' in batch)
  assert.match(
    batch.error,
    /pi is installed as C:\\tools\\pi\.cmd, a batch file the panel cannot start without a shell/,
  )
  const missing = resolveLaunch('pi', [], machine({}))
  assert.deepEqual(missing, { error: 'pi was not found on the PATH' })
  const unreadable = resolveLaunch('pi', [], {
    ...machine({ 'C:\\tools\\pi.cmd': '' }),
    read: () => {
      throw new Error('EACCES')
    },
  })
  assert.ok('error' in unreadable)
})
