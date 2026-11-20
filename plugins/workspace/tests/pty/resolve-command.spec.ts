/**
 * On Windows npm installs an agent as `pi.cmd` plus an extensionless `pi` shell shim in the same folder. Windows cannot run the shim,
 * so the lookup must pick the `.cmd` (found on mbpi9win: the Pi tab closed at once). Elsewhere the bare name stays the only candidate.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveWorkspacePtyCommand } from '../../src/pty/service.ts'

const folders: string[] = []
afterEach(() => {
  while (folders.length > 0) rmSync(folders.pop() ?? '', { recursive: true, force: true })
})

function folderWith(...files: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'acryl-resolve-'))
  folders.push(dir)
  for (const file of files) writeFileSync(join(dir, file), '')
  return dir
}

describe('resolveWorkspacePtyCommand on win32', () => {
  it('picks pi.cmd over the extensionless npm shim beside it', () => {
    const dir = folderWith('pi', 'pi.cmd')
    expect(resolveWorkspacePtyCommand('pi', [dir], 'win32')).toBe(join(dir, 'pi.cmd'))
  })

  it('prefers .exe, and finds nothing when only the shim is there', () => {
    expect(resolveWorkspacePtyCommand('claude', [folderWith('claude.exe', 'claude.cmd')], 'win32')).toMatch(/claude\.exe$/)
    expect(resolveWorkspacePtyCommand('pi', [folderWith('pi')], 'win32')).toBeUndefined()
  })

  it('keeps a command that already names a runnable extension', () => {
    const dir = folderWith('codex.cmd')
    expect(resolveWorkspacePtyCommand('codex.cmd', [dir], 'win32')).toBe(join(dir, 'codex.cmd'))
  })
})
