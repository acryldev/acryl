import assert from 'node:assert/strict'
import test from 'node:test'
import { desktopAssetNames, rewriteReleaseLinks } from './sync-release-readme.mjs'

const repo = 'https://github.com/acryldev/acryl'
const stale = [
  `[DMG](${repo}/releases/download/desktop-v0.2.1/acryl-desktop-mac-arm64.dmg)`,
  `[DEB](${repo}/releases/download/v0.2.0/dsh-plugin-desktop_0.2.0_amd64.deb)`,
  `[DEB](${repo}/releases/download/v0.2.0/dsh-plugin-desktop_0.2.0_arm64.deb)`,
  `[DEB](${repo}/releases/download/v0.2.0/acryl-desktop-linux-x64.deb)`,
  `[Download](${repo}/releases/tag/v0.2.0)`,
].join('\n')

test('points the Desktop installers at the one release, with the right constant names (and moves old desktop-v links into it)', () => {
  const text = rewriteReleaseLinks(stale, 'v0.2.2')
  assert.match(text, new RegExp(`${repo}/releases/download/v0\\.2\\.2/acryl-desktop-mac-arm64-v0\\.2\\.2\\.dmg`))
  assert.match(text, new RegExp(`${repo}/releases/download/v0\\.2\\.2/acryl-desktop-linux-amd64-v0\\.2\\.2\\.deb`))
  assert.match(text, new RegExp(`${repo}/releases/download/v0\\.2\\.2/acryl-desktop-linux-arm64-v0\\.2\\.2\\.deb`))
  assert.doesNotMatch(text, /dsh-plugin-desktop|linux-x64\.deb|v0\.2\.0|desktop-v0\.2/)
})

test('leaves the release page link on the full release tag', () => {
  assert.ok(rewriteReleaseLinks(stale, 'v0.2.2').includes(`${repo}/releases/tag/v0.2.2`))
})

test('is stable when run twice and for the next release', () => {
  const once = rewriteReleaseLinks(stale, 'v0.2.2')
  assert.equal(rewriteReleaseLinks(once, 'v0.2.2'), once)
  assert.equal(rewriteReleaseLinks(once, 'v0.3.0'), rewriteReleaseLinks(stale, 'v0.3.0'))
})

test('names exactly the five installers the Desktop release publishes, with the version in each name', () => {
  assert.deepEqual([...desktopAssetNames('v0.2.2')].sort(), [
    'acryl-desktop-linux-amd64-v0.2.2.deb', 'acryl-desktop-linux-arm64-v0.2.2.deb', 'acryl-desktop-mac-arm64-v0.2.2.dmg', 'acryl-desktop-mac-x64-v0.2.2.dmg', 'acryl-desktop-win-x64-v0.2.2.exe',
  ])
})

test('moves an older release\'s versioned names to the new release', () => {
  const old = `${repo}/releases/download/v0.2.2/acryl-desktop-win-x64-v0.2.2.exe`
  assert.equal(rewriteReleaseLinks(old, 'v0.2.3'), `${repo}/releases/download/v0.2.3/acryl-desktop-win-x64-v0.2.3.exe`)
})
