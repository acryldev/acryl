import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { tarCommand } from './lib/portable-commands.mjs'

// npm packs with a cache of this run, not the machine's ~/.npm.
const npmCache = mkdtempSync(join(tmpdir(), 'acryl-npm-cache-'))
process.env.npm_config_cache = npmCache
test.after(() => { rmSync(npmCache, { recursive: true, force: true }) })

const launcherPackage = JSON.parse(readFileSync(new URL('../distribution/acryl-npm-launcher/package.json', import.meta.url), 'utf8'))

test('the selector manifest installs nothing with it and names the terminal agent release it fetches on first use', () => {
  const manifest = JSON.parse(execFileSync(process.execPath, ['scripts/pack-npm-selector.mjs', '--print-manifest'], { encoding: 'utf8' }))
  assert.equal(manifest.name, 'acryl')
  assert.equal(manifest.dependencies, undefined)
  assert.equal(manifest.optionalDependencies, undefined)
  assert.match(manifest.acrylRuntime, /^\d+\.\d+\.\d+$/u)
  assert.equal(manifest.acrylRuntime, launcherPackage.acrylRuntime)
  assert.equal(manifest.scripts, undefined)
})

test('the packed tarball carries every file the selector lists, the bundled launcher among them', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'acryl-npm-out-'))
  try {
    execFileSync(process.execPath, ['scripts/pack-npm-selector.mjs', outDir], { stdio: 'pipe' })
    const produced = readdirSync(outDir)
    assert.deepEqual(produced, [`acryl-${launcherPackage.version}.tgz`])
    const listed = execFileSync(tarCommand(), ['-tzf', join(outDir, produced[0])], { encoding: 'utf8' }).split(/\r?\n/u).filter(Boolean)
    for (const file of launcherPackage.files) assert.ok(listed.includes(`package/${file}`), `the acryl tarball lacks ${file}: ${listed.join(', ')}`)
  } finally {
    rmSync(outDir, { recursive: true, force: true })
  }
})
