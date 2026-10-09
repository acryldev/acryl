import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import AdmZip from 'adm-zip'
import { afterEach, describe, expect, it } from 'vitest'
import { verifyWindowsPortable, windowsPortableName } from '../scripts/verify-win-portable.ts'

const temporaryRoots: string[] = []

function portableExecutable(): Buffer {
  const executable = Buffer.alloc(132)
  executable.write('MZ', 0, 'ascii')
  executable.writeUInt32LE(128, 0x3c)
  executable.write('PE\0\0', 128, 'binary')
  return executable
}

function fixture(): { readonly root: string; readonly portable: string } {
  const root = mkdtempSync(join(tmpdir(), 'dsh-win-portable-'))
  temporaryRoots.push(root)
  const dist = join(root, 'dist')
  mkdirSync(dist, { recursive: true })
  const portable = join(dist, windowsPortableName('2.0.0'))
  const archive = new AdmZip()
  archive.addFile('ACRYL.exe', portableExecutable())
  archive.addFile('resources/app.asar', Buffer.from('asar'))
  archive.writeZip(portable)
  return { root, portable }
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('Windows portable artifact verification', () => {
  it('accepts the release-named portable ZIP archive', () => {
    const value = fixture()

    expect(verifyWindowsPortable({ desktopRoot: value.root, version: '2.0.0' })).toBe(value.portable)
  })

  it('rejects a stale portable archive from another version', () => {
    const value = fixture()
    rmSync(value.portable)
    writeFileSync(join(dirname(value.portable), 'acryl-desktop-win-x64-v1.9.0.zip'), 'stale')

    expect(() => verifyWindowsPortable({ desktopRoot: value.root, version: '2.0.0' }))
      .toThrow(windowsPortableName('2.0.0'))
  })

  it('rejects an application entry without a Windows PE header', () => {
    const value = fixture()
    const invalid = portableExecutable()
    invalid.write('NO', 0, 'ascii')
    const archive = new AdmZip()
    archive.addFile('ACRYL.exe', invalid)
    archive.addFile('resources/app.asar', Buffer.from('asar'))
    archive.writeZip(value.portable)

    expect(() => verifyWindowsPortable({ desktopRoot: value.root, version: '2.0.0' }))
      .toThrow('does not have a Windows PE header')
  })
})
