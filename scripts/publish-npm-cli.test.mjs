import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

test('packed npm CLI retains the shared Web host and excludes desktop-only closure roots', () => {
  const out = mkdtempSync(join(tmpdir(), 'acryl-publish-closure-'))
  try {
    execFileSync(process.execPath, ['scripts/publish-npm-cli.mjs', '--pack-only', out], { stdio: 'ignore' })
    const tarball = readdirSync(out).find(name => /^acryl-.*\.tgz$/.test(name))
    assert.notEqual(tarball, undefined, 'publish assembly must produce one acryl tarball')
    const manifest = JSON.parse(execFileSync('tar', ['-xOf', join(out, tarball), 'package/package.json'], { encoding: 'utf8' }))
    const dependencies = manifest.dependencies
    assert.equal(dependencies['@deepseek-ai/dsh-web-app'] !== undefined, true)
    for (const name of ['acryl-development-canvas', 'dsh-community-market', 'pnpm']) {
      assert.equal(dependencies[name], undefined, `${name} must not be a shared CLI dependency`)
    }
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
}, 120_000)
