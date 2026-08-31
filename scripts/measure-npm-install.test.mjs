import assert from 'node:assert/strict'
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { countInstalledPackages } from './measure-npm-install.mjs'

function packageAt(root, path, name) {
  const directory = join(root, path)
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ name }))
}

test('counts real package roots once and ignores .bin and pnpm metadata', () => {
  const root = mkdtempSync(join(tmpdir(), 'acryl-measure-test-'))
  const modules = join(root, 'node_modules')
  packageAt(modules, 'alpha', 'alpha')
  packageAt(modules, '@scope/beta', '@scope/beta')
  packageAt(modules, '.pnpm/ignored', 'ignored')
  mkdirSync(join(modules, '.bin'), { recursive: true })
  symlinkSync(join(modules, 'alpha'), join(modules, 'alpha-alias'))

  assert.equal(countInstalledPackages(modules), 2)
})
