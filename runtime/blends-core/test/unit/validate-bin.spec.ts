import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { main } from '../../src/bin/validate.js'

describe('blends-validate', () => {
  it('passes a valid manifest, reports each problem of an invalid one, and refuses bad usage', () => {
    const dir = mkdtempSync(join(tmpdir(), 'validate-'))
    try {
      const good = join(dir, 'good.yaml'); const bad = join(dir, 'bad.yaml')
      writeFileSync(good, 'apiVersion: blends.acryl.dev/v1alpha1\nkind: Blueprint\nmetadata:\n  id: acme.x\n  name: X\n  version: 0.1.0\nspec:\n  runtime: cordis\n')
      writeFileSync(bad, 'apiVersion: blends.acryl.dev/v1alpha1\nkind: Blend\nmetadata:\n  id: acme.y\n  name: Y\n  version: 0.1.0\nspec:\n  runtime: cordis\n')
      const lines: string[] = []
      expect(main([good], line => lines.push(line))).toBe(0)
      expect(main([good, bad], line => lines.push(line))).toBe(1)
      expect(lines.join('\n')).toMatch(/bad\.yaml: .*lineage/u)
      expect(main(['--mode', 'loose'], () => {})).toBe(2)
      expect(main([join(dir, 'missing.yaml')], () => {})).toBe(2)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})
