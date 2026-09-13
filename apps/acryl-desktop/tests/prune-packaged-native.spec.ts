import { describe, expect, it, vi } from 'vitest'
import { nativePathIsForeign, prunePackagedNative } from '../scripts/prune-packaged-native.ts'

describe('packaged native payload pruning', () => {
  it('uses the Electron Builder ARM64 target for a thin macOS package', () => {
    const prune = vi.fn(() => [])

    prunePackagedNative('/app.asar.unpacked', 'darwin', 3, prune)

    expect(prune).toHaveBeenCalledWith('/app.asar.unpacked', 'darwin', 'arm64')
  })

  it('uses the Electron Builder x64 target for a thin Windows package', () => {
    const prune = vi.fn(() => [])

    prunePackagedNative('/app.asar.unpacked', 'win32', 1, prune)

    expect(prune).toHaveBeenCalledWith('/app.asar.unpacked', 'win32', 'x64')
  })

  it('keeps both macOS architectures in a universal package while pruning other platforms', () => {
    const prune = vi.fn(() => [])

    prunePackagedNative('/app.asar.unpacked', 'darwin', 4, prune)

    expect(prune).toHaveBeenCalledWith('/app.asar.unpacked', 'darwin', 'universal')
  })

  it('rejects unsupported platform and architecture combinations', () => {
    expect(() => prunePackagedNative('/app.asar.unpacked', 'linux', 4, () => []))
      .toThrow('universal package is supported only on macOS')
    expect(() => prunePackagedNative('/app.asar.unpacked', 'darwin', 0, () => []))
      .toThrow('unsupported Electron Builder architecture 0')
  })
})

describe('nativePathIsForeign', () => {
  it('flags a foreign native target for a thin macOS ARM64 package', () => {
    expect(nativePathIsForeign('node_modules/@img/sharp-win32-x64/index.cjs', 'darwin', 'arm64')).toBe(true)
    expect(nativePathIsForeign('node_modules/@img/sharp-darwin-x64/index.cjs', 'darwin', 'arm64')).toBe(true)
    expect(nativePathIsForeign('node_modules/@img/sharp-linux-arm64/index.cjs', 'darwin', 'arm64')).toBe(true)
  })

  it('keeps the native target of a thin package', () => {
    expect(nativePathIsForeign('node_modules/@img/sharp-darwin-arm64/index.cjs', 'darwin', 'arm64')).toBe(false)
    expect(nativePathIsForeign('node_modules/@img/sharp-win32-x64/index.cjs', 'win32', 'x64')).toBe(false)
  })

  it('keeps both Darwin CPU trees of a universal macOS package', () => {
    expect(nativePathIsForeign('node_modules/@img/sharp-darwin-arm64/index.cjs', 'darwin', 'universal')).toBe(false)
    expect(nativePathIsForeign('node_modules/@img/sharp-darwin-x64/index.cjs', 'darwin', 'universal')).toBe(false)
    expect(nativePathIsForeign('node_modules/@img/sharp-win32-x64/index.cjs', 'darwin', 'universal')).toBe(true)
  })

  it('does not classify non-native paths as foreign', () => {
    expect(nativePathIsForeign('node_modules/yaml/dist/index.js', 'darwin', 'arm64')).toBe(false)
    expect(nativePathIsForeign('lib/main.js', 'win32', 'x64')).toBe(false)
  })
})
