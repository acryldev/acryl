import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { main } from '../src/bin/secret-check.js'

describe('acryl-secret-check', () => {
  it('scans what git tracks, not what it ignores', () => {
    const dir = mkdtempSync(join(tmpdir(), 'secret-check-'))
    try {
      spawnSync('git', ['init', '--quiet'], { cwd: dir })
      writeFileSync(join(dir, '.gitignore'), 'local.env.js\n')
      writeFileSync(join(dir, 'ok.js'), 'export const x = 1\n')
      writeFileSync(join(dir, 'local.env.js'), 'const k = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz"\n')
      spawnSync('git', ['add', '.'], { cwd: dir })
      expect(main([dir], () => {})).toBe(0)
      writeFileSync(join(dir, 'leak.js'), 'const k = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz"\n')
      spawnSync('git', ['add', 'leak.js'], { cwd: dir })
      const lines: string[] = []
      expect(main([dir], line => lines.push(line))).toBe(1)
      expect(lines[0]).toBe('leak.js:1  Anthropic API key')
      expect(main([join(dir, '..', 'definitely-not-a-repo-xyz')], () => {})).toBe(2)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})
