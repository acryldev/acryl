import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FileExporter } from '../src/file-exporter.ts'
import { LogFileSink } from '../src/log-files.ts'

function todaySuffix(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const temporaryDirectories: string[] = []
afterEach(() => { for (const dir of temporaryDirectories.splice(0)) rmSync(dir, { recursive: true, force: true }) })

function exporter(threshold: 'debug' | 'info' | 'warn' | 'error' = 'info'): { e: FileExporter; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-log-'))
  temporaryDirectories.push(dir)
  const sink = new LogFileSink(dir, { maxFileBytes: 10 * 1024 * 1024, maxDirectoryBytes: 200 * 1024 * 1024 })
  return { e: new FileExporter(sink, threshold), dir }
}

describe('FileExporter', () => {
  it('never throws into the caller when the disk write fails (a removed log directory)', () => {
    const { e, dir } = exporter('info')
    rmSync(dir, { recursive: true, force: true })
    expect(() => { e.export({ sn: 0, ts: Date.now(), name: 'test', type: 'warn', level: 1, args: ['after the directory is gone'] }) }).not.toThrow()
  })


  it('renders and writes a message with a level and name prefix', () => {
    const { e, dir } = exporter('info')
    e.export({ sn: 0, ts: Date.now(), name: 'test', type: 'info', level: 1, args: ['hello'] })
    e.close()
    const day = todaySuffix()
    const text = readFileSync(join(dir, `dsh-${day}.log`), 'utf8')
    expect(text).toContain('[I] [test] hello')
  })

  it('drops debug messages at the info threshold', () => {
    const { e, dir } = exporter('info')
    e.export({ sn: 0, ts: Date.now(), name: 'test', type: 'debug', level: 3, args: ['hidden'] })
    e.close()
    expect(readdirSync(dir)).toEqual([])
  })
})
