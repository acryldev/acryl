import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { main } from '../../src/bin/registry-index.js'

const starter = (id: string, visibility = 'public') => `apiVersion: blends.acryl.dev/v1alpha1\nkind: Blend\nmetadata:\n  id: ${id}\n  name: X\n  version: 0.1.0\n  license: MIT\n  visibility: ${visibility}\nspec:\n  runtime: cordis\n  lineage:\n    blueprint: acryl.blank\n    blueprintVersion: 0.1.0\n`

describe('blends-registry-index', () => {
  it('writes the index, then --check passes until an entry changes, and a refused entry fails the run', () => {
    const root = mkdtempSync(join(tmpdir(), 'registry-'))
    try {
      mkdirSync(join(root, 'blends', 'acme.accounting'), { recursive: true })
      writeFileSync(join(root, 'blends', 'acme.accounting', 'blend.yaml'), starter('acme.accounting'))
      const lines: string[] = []
      expect(main([root], line => lines.push(line))).toBe(0)
      expect(JSON.parse(readFileSync(join(root, 'index.json'), 'utf8')).entries[0].id).toBe('acme.accounting')
      expect(main([root, '--check'], () => {})).toBe(0)
      mkdirSync(join(root, 'blends', 'acme.secret'))
      writeFileSync(join(root, 'blends', 'acme.secret', 'blend.yaml'), starter('acme.secret', 'private'))
      const after: string[] = []
      expect(main([root, '--check'], line => after.push(line))).toBe(1)
      expect(after.join('\n')).toContain('refused blends/acme.secret')
      expect(main([], () => {})).toBe(2)
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
})
