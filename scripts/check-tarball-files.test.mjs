import assert from 'node:assert/strict'
import { test } from 'node:test'
import { missingEntries, requiredPrefix } from './check-tarball-files.mjs'

test('a files entry names the fixed part a tarball must hold', () => {
  assert.equal(requiredPrefix('docs'), 'docs')
  assert.equal(requiredPrefix('lib/**'), 'lib')
  assert.equal(requiredPrefix('./bin/x.js'), 'bin/x.js')
  assert.equal(requiredPrefix('!lib/**/*.map'), undefined)
  assert.equal(requiredPrefix('*.md'), undefined)
})

test('the 1.7.1 CLI tarball without docs and plugins is caught, 1.7.0 passes', () => {
  const files = ['bin', 'lib', 'docs', 'plugins', '!lib/**/*.map']
  assert.deepEqual(missingEntries(files, ['package.json', 'bin/a.js', 'lib/index.js']), ['docs', 'plugins'])
  assert.deepEqual(missingEntries(files, ['bin/a.js', 'lib/index.js', 'docs/framework/README.md', 'plugins/x/index.ts']), [])
})
