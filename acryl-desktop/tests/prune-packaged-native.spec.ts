import { describe, expect, it, vi } from 'vitest'
import { prunePackagedNative } from '../scripts/prune-packaged-native.ts'

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
