import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import AdmZip from 'adm-zip'
import { afterAll, describe, expect, it } from 'vitest'
import { buildDiagnosticsArchive } from '../src/archive.ts'

const dir = mkdtempSync(join(tmpdir(), 'acryl-diag-'))
afterAll(() => { rmSync(dir, { recursive: true, force: true }) })
const now = () => new Date('2026-09-27T10:00:00.000Z')

const entries = (buffer: Buffer): Map<string, string> => new Map(new AdmZip(buffer).getEntries().map(e => [e.entryName, e.getData().toString('utf8')]))

describe('buildDiagnosticsArchive', () => {
  it('bundles system facts and the recent log files, masking secrets again', () => {
    writeFileSync(join(dir, 'dsh-2026-09-26.log'), 'started\nkey is sk-1234abcd5678efgh\n')
    writeFileSync(join(dir, 'dsh-2026-09-26.error.log'), 'boom\n')
    writeFileSync(join(dir, 'notes.txt'), 'not a log of ours')
    const result = buildDiagnosticsArchive({ logsDir: dir, surface: 'web', appVersion: '1.2.3', now })
    const files = entries(result.zip)
    expect([...files.keys()].sort()).toEqual(['README.txt', 'logs/dsh-2026-09-26.error.log', 'logs/dsh-2026-09-26.log', 'system-info.txt'])
    expect(files.get('logs/dsh-2026-09-26.log')).toContain('started')
    expect(files.get('logs/dsh-2026-09-26.log')).not.toContain('sk-1234abcd5678efgh')
    expect(files.get('system-info.txt')).toContain('surface: web')
    expect(files.get('system-info.txt')).toContain('version: 1.2.3')
    expect(files.get('system-info.txt')).toContain('generated: 2026-09-27T10:00:00.000Z')
    expect(result.includedLogFiles).toBe(2)
    expect(result.fileName).toBe('acryl-diagnostics-2026-09-27T10-00-00-000Z.zip')
  })

  it('never follows a link out of the log directory', () => {
    const secret = join(tmpdir(), `acryl-diag-secret-${String(process.pid)}.txt`)
    writeFileSync(secret, 'TOP SECRET')
    symlinkSync(secret, join(dir, 'dsh-2026-09-27.log'))
    const files = entries(buildDiagnosticsArchive({ logsDir: dir, surface: 'web', appVersion: '1', now }).zip)
    expect(files.has('logs/dsh-2026-09-27.log')).toBe(false)
    expect([...files.values()].join('')).not.toContain('TOP SECRET')
    rmSync(secret)
  })

  it('stops at the size cap, newest first, and says what it skipped', () => {
    const big = mkdtempSync(join(tmpdir(), 'acryl-diag-big-'))
    writeFileSync(join(big, 'dsh-2026-09-01.log'), 'a'.repeat(600))
    writeFileSync(join(big, 'dsh-2026-09-02.log'), 'b'.repeat(600))
    const result = buildDiagnosticsArchive({ logsDir: big, surface: 'web', appVersion: '1', maxLogBytes: 1000, now })
    expect(result.includedLogFiles).toBe(1)
    expect(result.skippedLogFiles).toBe(1)
    expect(entries(result.zip).get('system-info.txt')).toContain('log files skipped')
    rmSync(big, { recursive: true, force: true })
  })

  it('still produces an archive when the log directory is missing', () => {
    const result = buildDiagnosticsArchive({ logsDir: join(dir, 'nope'), surface: 'web', appVersion: '1', now })
    expect(result.includedLogFiles).toBe(0)
    expect(entries(result.zip).has('system-info.txt')).toBe(true)
  })

  it('keeps a version with a newline on one line', () => {
    const files = entries(buildDiagnosticsArchive({ logsDir: dir, surface: 'web', appVersion: '1\nsurface: forged', now }).zip)
    expect(files.get('system-info.txt')?.split('\n').filter(l => l.startsWith('surface:'))).toHaveLength(1)
  })
})
