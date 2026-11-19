import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { productGit, withGitFirst } from '../git.ts'

/** Temporary folders this file makes; removed after its tests, also when one fails. */
const tempDirs: string[] = []
const tempDir = (prefix: string): string => {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}
after(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

test('the product’s git is found beside the app (bin/git, cmd/git.exe on Windows), and a product packed without it has none', () => {
  const resources = tempDir('acryl-git-')
  assert.equal(productGit(resources, 'darwin'), undefined)
  mkdirSync(join(resources, 'git', 'bin'), { recursive: true })
  writeFileSync(join(resources, 'git', 'bin', 'git'), '#!/bin/sh\n')
  assert.deepEqual(productGit(resources, 'darwin'), {
    executable: join(resources, 'git', 'bin', 'git'),
    bin: join(resources, 'git', 'bin'),
    licence: join(resources, 'git', 'COPYING.txt'),
    source: join(resources, 'git', 'SOURCE.txt'),
  })
  assert.equal(productGit(resources, 'win32'), undefined, 'Windows looks for cmd/git.exe')
})

test('the frame host’s PATH starts with the product’s git, once, and the rest keeps its order; Windows keeps its own variable name', () => {
  const git = { executable: '/R/git/bin/git', bin: '/R/git/bin', licence: '', source: '' }
  assert.equal(
    withGitFirst({ PATH: '/usr/bin:/R/git/bin:/bin' }, git, 'darwin').PATH,
    '/R/git/bin:/usr/bin:/bin',
  )
  assert.equal(withGitFirst({}, git, 'linux').PATH, '/R/git/bin')
  const windows = {
    executable: 'C:\\R\\git\\cmd\\git.exe',
    bin: 'C:\\R\\git\\cmd',
    licence: '',
    source: '',
  }
  const env = withGitFirst({ Path: 'C:\\Windows;C:\\Tools' }, windows, 'win32')
  assert.equal(env.Path, 'C:\\R\\git\\cmd;C:\\Windows;C:\\Tools')
  assert.equal('PATH' in env, false)
})
