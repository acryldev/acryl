import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { assetName, downloadInstaller, isNewer, latestRelease, macInstallScript } from '../updater.ts'

const source = { repo: 'acrylblends/63-acryl-control-center', file: 'ACRYL-Control-Center' }

test('a newer version is offered, an equal, older or pre-release one is not', () => {
  assert.equal(isNewer('0.1.16', '0.1.15'), true)
  assert.equal(isNewer('v0.2.0', '0.1.99'), true)
  assert.equal(isNewer('0.1.10', '0.1.9'), true)
  assert.equal(isNewer('0.1.15', '0.1.15'), false)
  assert.equal(isNewer('0.1.9', '0.1.10'), false)
  assert.equal(isNewer('0.2.0-rc.1', '0.1.0'), false)
})

test('each OS takes its own installer from a release', () => {
  assert.equal(assetName(source, 'darwin', 'arm64'), 'ACRYL-Control-Center-mac-arm64.dmg')
  assert.equal(assetName(source, 'win32', 'x64'), 'ACRYL-Control-Center-win-x64.exe')
  assert.equal(assetName(source, 'linux', 'x64'), 'ACRYL-Control-Center-linux-x64.deb')
  assert.equal(assetName(source, 'aix', 'x64'), undefined)
})

const answer = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status })

test('the latest release and its installer for this machine, with the digest GitHub publishes', async () => {
  const release = await latestRelease(source, 'win32', 'x64', async () =>
    answer({
      tag_name: 'v0.1.16',
      html_url: 'https://github.com/x/y/releases/tag/v0.1.16',
      assets: [
        { name: 'ACRYL-Control-Center-mac-arm64.dmg', browser_download_url: 'https://d/mac', size: 1 },
        { name: 'ACRYL-Control-Center-win-x64.exe', browser_download_url: 'https://d/win', size: 2, digest: 'sha256:ab' },
      ],
    }),
  )
  assert.deepEqual(release, {
    version: '0.1.16',
    page: 'https://github.com/x/y/releases/tag/v0.1.16',
    asset: { name: 'ACRYL-Control-Center-win-x64.exe', url: 'https://d/win', size: 2, sha256: 'ab' },
  })
  assert.equal(await latestRelease(source, 'linux', 'arm64', async () => answer({ tag_name: 'v1.0.0', assets: [] })), undefined)
  assert.equal(await latestRelease(source, 'darwin', 'arm64', async () => answer({}, 404)), undefined)
  await assert.rejects(latestRelease(source, 'darwin', 'arm64', async () => answer({}, 403)), /GitHub answered 403/u)
})

test('a download is kept only when it matches the published checksum', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'updater-'))
  try {
    const bytes = new TextEncoder().encode('installer bytes')
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    const release = { version: '1.0.0', page: '', asset: { name: 'X-mac-arm64.dmg', url: 'https://d', size: bytes.length, sha256 } }
    const seen: number[] = []
    const file = await downloadInstaller(release, folder, (fraction) => seen.push(fraction), async () => new Response(bytes))
    assert.equal(readFileSync(file, 'utf8'), 'installer bytes')
    assert.equal(seen.at(-1), 1)
    await assert.rejects(
      downloadInstaller({ ...release, asset: { ...release.asset, sha256: '00' } }, folder, () => {}, async () => new Response(bytes)),
      /does not match the checksum/u,
    )
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
})

test('the macOS install step is a valid shell script that waits for the app and swaps the bundle', () => {
  const script = macInstallScript("/tmp/it's/X.dmg", '/Applications/X Y.app', 4242)
  assert.match(script, /while kill -0 4242/u)
  assert.match(script, /rm -rf '\/Applications\/X Y\.app' && ditto "\$M\/X Y\.app" '\/Applications\/X Y\.app'/u)
  assert.match(script, /'\/tmp\/it'\\''s\/X\.dmg'/u)
  execFileSync('/bin/sh', ['-n', '-c', script])
})
