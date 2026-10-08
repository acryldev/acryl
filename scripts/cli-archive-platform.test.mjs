import assert from 'node:assert/strict'
import test from 'node:test'
import { corepackCommand, corepackSpawnOptions, deployArguments, deployEnvironment } from './cli-archive-platform.mjs'

test('uses the Windows command shim when spawning Corepack', () => {
  assert.equal(corepackCommand('win32'), 'corepack.cmd')
})

test('uses Corepack directly on Unix-like platforms', () => {
  assert.equal(corepackCommand('darwin'), 'corepack')
  assert.equal(corepackCommand('linux'), 'corepack')
})

test('runs Windows command shims through a shell', () => {
  assert.deepEqual(corepackSpawnOptions('win32'), { shell: true })
  assert.deepEqual(corepackSpawnOptions('darwin'), {})
})

test('deploys the closure under the pnpm release whose legacy deploy installs dependencies', () => {
  assert.deepEqual(deployArguments('acryl-cli', '/tmp/out'), ['pnpm@11.8.0', '--filter', 'acryl-cli', 'deploy', '/tmp/out', '--prod', '--legacy'])
})

test('lets Corepack run a pnpm release other than the pinned one for the deploy step', () => {
  const environment = deployEnvironment({ PATH: '/bin' }, { npm_config_arch: 'arm64' })
  assert.equal(environment.COREPACK_ENABLE_STRICT, '0')
  assert.equal(environment.CI, 'true')
  assert.equal(environment.npm_config_arch, 'arm64')
  assert.equal(environment.PATH, '/bin')
})
