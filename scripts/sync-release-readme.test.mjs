import assert from 'node:assert/strict'
import test from 'node:test'
import { DESKTOP_ASSET_NAMES, rewriteReleaseLinks } from './sync-release-readme.mjs'

const repo = 'https://github.com/acryldev/acryl'
const stale = [
  `[DMG](${repo}/releases/download/v0.2.0/acryl-desktop-mac-arm64.dmg)`,
  `[DEB](${repo}/releases/download/v0.2.0/dsh-plugin-desktop_0.2.0_amd64.deb)`,
  `[DEB](${repo}/releases/download/v0.2.0/dsh-plugin-desktop_0.2.0_arm64.deb)`,
  `[DEB](${repo}/releases/download/v0.2.0/acryl-desktop-linux-x64.deb)`,
  `[Download](${repo}/releases/tag/v0.2.0)`,
].join('\n')

test('points the Desktop installers at the Desktop release and the right constant names', () => {
  const text = rewriteReleaseLinks(stale, 'v0.2.1')
  assert.match(text, new RegExp(`${repo}/releases/download/desktop-v0\\.2\\.1/acryl-desktop-mac-arm64\\.dmg`))
  assert.match(text, new RegExp(`${repo}/releases/download/desktop-v0\\.2\\.1/acryl-desktop-linux-amd64\\.deb`))
  assert.match(text, new RegExp(`${repo}/releases/download/desktop-v0\\.2\\.1/acryl-desktop-linux-arm64\\.deb`))
  assert.doesNotMatch(text, /dsh-plugin-desktop|linux-x64\.deb|v0\.2\.0/)
})

test('leaves the release page link on the full release tag', () => {
  assert.ok(rewriteReleaseLinks(stale, 'v0.2.1').includes(`${repo}/releases/tag/v0.2.1`))
})

test('is stable when run twice and for the next release', () => {
  const once = rewriteReleaseLinks(stale, 'v0.2.1')
  assert.equal(rewriteReleaseLinks(once, 'v0.2.1'), once)
  assert.equal(rewriteReleaseLinks(once, 'v0.3.0'), rewriteReleaseLinks(stale, 'v0.3.0'))
})

test('names exactly the five installers the Desktop release publishes', () => {
  assert.deepEqual([...DESKTOP_ASSET_NAMES].sort(), [
    'acryl-desktop-linux-amd64.deb', 'acryl-desktop-linux-arm64.deb', 'acryl-desktop-mac-arm64.dmg', 'acryl-desktop-mac-x64.dmg', 'acryl-desktop-win-x64.exe',
  ])
})
