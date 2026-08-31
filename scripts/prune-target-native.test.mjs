import assert from 'node:assert/strict'
import test from 'node:test'
import { shouldRemoveNativePath } from './prune-target-native.mjs'

test('keeps the selected target native package and node-pty prebuild', () => {
  assert.equal(shouldRemoveNativePath('node_modules/@vscode/ripgrep-darwin-arm64/bin/rg', 'darwin', 'arm64'), false)
  assert.equal(shouldRemoveNativePath('node_modules/node-pty/prebuilds/darwin-arm64/pty.node', 'darwin', 'arm64'), false)
})

test('removes foreign platform native package and node-pty prebuild', () => {
  assert.equal(shouldRemoveNativePath('node_modules/@img/sharp-libvips-linux-x64/lib/libvips.dylib', 'darwin', 'arm64'), true)
  assert.equal(shouldRemoveNativePath('node_modules/node-pty/prebuilds/win32-x64/conpty.node', 'darwin', 'arm64'), true)
})

test('removes wrong architecture from the selected platform', () => {
  assert.equal(shouldRemoveNativePath('node_modules/@koromix/koffi-darwin-x64/darwin_x64/koffi.node', 'darwin', 'arm64'), true)
  assert.equal(shouldRemoveNativePath('node_modules/@earendil-works/pi-tui/native/darwin/prebuilds/darwin-x64/darwin-modifiers.node', 'darwin', 'arm64'), true)
})

test('does not classify ordinary JavaScript paths as native target payload', () => {
  assert.equal(shouldRemoveNativePath('node_modules/@deepseek-ai/dsh/lib/index.js', 'darwin', 'arm64'), false)
  assert.equal(shouldRemoveNativePath('node_modules/node-pty/lib/unixTerminal.js', 'darwin', 'arm64'), false)
})
