import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { acquireDesktopInstaller } from '../desktop-runtime.js'

const asset = name => ({ name, browser_download_url: `https://example.test/${name}`, size: 3 })
const installers = ['acryl-desktop-mac-arm64.dmg', 'acryl-desktop-mac-x64.dmg', 'acryl-desktop-win-x64.exe', 'acryl-desktop-linux-amd64.deb', 'acryl-desktop-linux-arm64.deb'].map(asset)
const cliOnly = [asset('acryl-cli-linux-x64.tar.gz'), asset('acryl-web-linux-x64.tar.gz'), asset('acryl-release-manifest.json')]

/** Run one acquisition against a fake GitHub releases API and report the tags it asked for. */
async function acquire(releases) {
  const home = mkdtempSync(join(tmpdir(), 'acryl-desktop-test-'))
  const previousHome = process.env.ACRYL_DESKTOP_HOME
  const previousFetch = globalThis.fetch
  const asked = []
  process.env.ACRYL_DESKTOP_HOME = home
  globalThis.fetch = async url => {
    const tag = String(url).split('/').at(-1)
    asked.push(tag)
    const release = releases[tag]
    return release === undefined ? { ok: false, status: 404, statusText: 'Not Found' } : { ok: true, status: 200, json: async () => release }
  }
  try {
    const result = await acquireDesktopInstaller({ version: '0.2.2', download: async () => Buffer.from('abc') })
    return { result, asked }
  } finally {
    globalThis.fetch = previousFetch
    if (previousHome === undefined) delete process.env.ACRYL_DESKTOP_HOME
    else process.env.ACRYL_DESKTOP_HOME = previousHome
    rmSync(home, { recursive: true, force: true })
  }
}

test('takes the installer from the one release, next to the CLI and Web archives', async () => {
  const { result, asked } = await acquire({ 'v0.2.2': { assets: [...cliOnly, ...installers] } })
  assert.deepEqual(asked, ['v0.2.2'])
  assert.match(result.path, /acryl-desktop-(mac|win|linux)-/u)
})

test('falls back to the separate desktop-v release older versions used', async () => {
  const { result, asked } = await acquire({ 'v0.2.2': { assets: cliOnly }, 'desktop-v0.2.2': { assets: installers } })
  assert.deepEqual(asked, ['v0.2.2', 'desktop-v0.2.2'])
  assert.match(result.path, /acryl-desktop-/u)
})

test('says which releases it looked in when neither has an installer', async () => {
  await assert.rejects(acquire({ 'v0.2.2': { assets: cliOnly } }), /v0\.2\.2 or desktop-v0\.2\.2 not found/u)
})
