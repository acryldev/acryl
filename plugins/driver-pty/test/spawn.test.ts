/** A terminal program is resolved to its full path before node-pty sees it: on Windows node-pty does not search PATH, and a bare name is "File not found". */
import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { resolveProgram } from '../spawn.ts'

const dir = mkdtempSync(join(tmpdir(), 'resolve-program-'))
after(() => rmSync(dir, { recursive: true, force: true }))

test('a bare program on Windows is resolved with PATHEXT, and a path is left as it is', () => {
  const exe = join(dir, 'runner.EXE')
  writeFileSync(exe, '')
  const env = { PATH: dir, PATHEXT: '.COM;.EXE;.BAT;.CMD' }
  assert.equal(resolveProgram('runner', env, 'win32').toLowerCase(), exe.toLowerCase())
  // A name that already carries its extension is used as it is. Create that exact file too: Windows resolves runner.exe to runner.EXE, but a case-sensitive
  // filesystem (the Linux CI runner) does not.
  const exact = join(dir, 'runner.exe')
  writeFileSync(exact, '')
  assert.equal(resolveProgram('runner.exe', env, 'win32').toLowerCase(), exact.toLowerCase())
  // Only the extensions PATHEXT names.
  assert.equal(resolveProgram('runner', { PATH: dir, PATHEXT: '.BAT' }, 'win32'), 'runner')
  // Anything with a separator is the caller's path already.
  assert.equal(resolveProgram('C:\\tools\\runner.exe', env, 'win32'), 'C:\\tools\\runner.exe')
  assert.equal(resolveProgram('tools/runner', env, 'win32'), 'tools/runner')
})

test('the current platform resolves an executable on PATH and leaves a name it cannot find alone', () => {
  const windows = process.platform === 'win32'
  const file = join(dir, windows ? 'finder.EXE' : 'finder')
  writeFileSync(file, '')
  if (!windows) chmodSync(file, 0o755)
  assert.equal(resolveProgram('finder', { PATH: dir }).toLowerCase(), file.toLowerCase())
  assert.equal(
    resolveProgram('definitely-not-a-program-here', { PATH: dir }),
    'definitely-not-a-program-here',
  )
  assert.equal(resolveProgram('/definitely/not/here', { PATH: dir }), '/definitely/not/here')
})
