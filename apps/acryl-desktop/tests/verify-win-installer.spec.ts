import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { WINDOWS_INSTALLER_NAME, verifyWindowsInstaller } from '../scripts/verify-win-installer.ts'

const temporaryRoots: string[] = []

function portableExecutable(): Buffer {
  const executable = Buffer.alloc(132)
  executable.write('MZ', 0, 'ascii')
  executable.writeUInt32LE(128, 0x3c)
  executable.write('PE\0\0', 128, 'binary')
  return executable
}

function fixture(): {
  readonly root: string
  readonly installer: string
  readonly application: string
} {
  const root = mkdtempSync(join(tmpdir(), 'dsh-win-installer-'))
  temporaryRoots.push(root)
  const dist = join(root, 'dist')
  const unpacked = join(dist, 'win-unpacked')
  mkdirSync(unpacked, { recursive: true })
  const installer = join(dist, WINDOWS_INSTALLER_NAME)
  const application = join(unpacked, 'ACRYL.exe')
  writeFileSync(installer, portableExecutable())
  writeFileSync(application, portableExecutable())
  return { root, installer, application }
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('Windows installer artifact verification', () => {
  it('accepts the release-named NSIS installer and the unpacked application', () => {
    const value = fixture()

    expect(verifyWindowsInstaller({ desktopRoot: value.root, version: '2.0.0' })).toEqual({
      installerPath: value.installer,
      applicationPath: value.application,
    })
  })

  it('rejects a build that produced no installer under the release name (the old versioned name is not accepted)', () => {
    const value = fixture()
    rmSync(value.installer)
    writeFileSync(join(value.root, 'dist', 'ACRYL-2.0.0-x64-Setup.exe'), portableExecutable())

    expect(() => verifyWindowsInstaller({ desktopRoot: value.root, version: '2.0.0' }))
      .toThrow(WINDOWS_INSTALLER_NAME)
  })

  it('rejects an artifact without a Windows PE header', () => {
    const value = fixture()
    const invalid = portableExecutable()
    invalid.write('NO', 0, 'ascii')
    writeFileSync(value.installer, invalid)

    expect(() => verifyWindowsInstaller({ desktopRoot: value.root, version: '2.0.0' }))
      .toThrow('does not have a Windows PE header')
  })

  it('rejects an unpacked application without a Windows PE signature', () => {
    const value = fixture()
    const invalid = portableExecutable()
    invalid.fill(0, 128, 132)
    writeFileSync(value.application, invalid)

    expect(() => verifyWindowsInstaller({ desktopRoot: value.root, version: '2.0.0' }))
      .toThrow('does not have a Windows PE signature')
  })
})
