/** Blueprints defined by a file (spec 036): a team's own starter and brand, no code. Pure parsing plus the one file boundary. */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  BLANK_BLUEPRINT,
  BLUEPRINT_ROW_IDS,
  InvalidBlueprintError,
  blueprintFromEnvironment,
  composeBlueprintRows,
  parseBlueprint,
} from '../src/index.ts'

const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { force: true, recursive: true }) })

function file(name: string, body: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'acryl-blueprint-'))
  dirs.push(dir)
  const path = join(dir, name)
  writeFileSync(path, body)
  return path
}

describe('parseBlueprint', () => {
  it('reads dshChat, inherits it from the parent, and refuses a non-boolean', () => {
    expect(parseBlueprint({ id: 'acme.own-agents', extends: 'acryl.ide', dshChat: false }).dshChat).toBe(false)
    expect(parseBlueprint({ id: 'acme.child', extends: 'acryl.agents' }).dshChat).toBe(false)
    expect(parseBlueprint({ id: 'acme.plain' }).dshChat).toBe(true)
    expect(() => parseBlueprint({ id: 'acme.bad', dshChat: 'no' })).toThrow(InvalidBlueprintError)
  })

  it('extends a known blueprint, overriding only what it names', () => {
    const blueprint = parseBlueprint({ id: 'acme.notes', name: 'Acme Notes', extends: 'acryl.blank', brand: { name: 'Acme Notes', accent: '#0a7d4b' }, rows: ['extension-context', 'system-prompt', 'ui-library', 'community-market'] })
    expect(blueprint.id).toBe('acme.notes')
    expect(blueprint.capabilities).toEqual(BLANK_BLUEPRINT.capabilities)
    expect(blueprint.rows).toContain('community-market')
    expect(blueprint.brand).toEqual({ kind: 'custom', identity: expect.objectContaining({ name: 'Acme Notes', accent: '#0a7d4b' }) })
  })

  it('stands alone with safe defaults when it extends nothing', () => {
    const blueprint = parseBlueprint({ id: 'tiny' })
    expect(blueprint.capabilities).toEqual(['authorization', 'acryl-settings'])
    expect(blueprint.shell).toBe('compatibility')
  })

  it('rejects what it cannot honor: typos, unknown rows and capabilities, a bad id, a missing parent', () => {
    expect(() => parseBlueprint({ id: 'x', rowz: [] })).toThrow(/unknown key "rowz"/)
    expect(() => parseBlueprint({ id: 'x', rows: ['market'] })).toThrow(/"market"/)
    expect(() => parseBlueprint({ id: 'x', capabilities: ['teleport'] })).toThrow(InvalidBlueprintError)
    expect(() => parseBlueprint({ id: 'Bad Id' })).toThrow(/"id" is required/)
    expect(() => parseBlueprint({ id: 'x', extends: 'nope' })).toThrow(/not a known blueprint/)
    expect(() => parseBlueprint({ id: 'x', shell: 'wide' })).toThrow(/"shell"/)
    expect(() => parseBlueprint([])).toThrow(/expected an object/)
  })

  it('every row id a file may name composes on at least one surface (the id list cannot drift from the row table)', () => {
    for (const id of BLUEPRINT_ROW_IDS) {
      const probe = parseBlueprint({ id: 'probe', rows: [id], capabilities: ['authorization'] })
      const composed = (['tui', 'web', 'desktop'] as const).some(surface => composeBlueprintRows(probe, surface).packages.some(name => name !== 'dsh-client-ui-brand-acryl' && name !== 'acryl-brand'))
      expect(composed, id).toBe(true)
    }
  })
})

describe('a blueprint file selected from the environment', () => {
  it('the documented private-brand sample is valid', () => {
    const sample = new URL('../../../specs/036-cordis-ecosystem-and-acryl-blends/samples/private-brand.blueprint.yaml', import.meta.url).pathname
    const blueprint = blueprintFromEnvironment({ ACRYL_BLUEPRINT: sample })
    expect(blueprint.id).toBe('acme.notes')
    expect(blueprint.rows).not.toContain('acryl-workspace' as never)
    expect(composeBlueprintRows(blueprint, 'web').patches.flatMap(patch => patch.insert ?? []).map(row => row.id)).toEqual(['brand', 'extension-context', 'acryl-system-prompt', '@acryl/ui', 'acryl-app-save'])
  })

  it('is read, validated and rebranded like a built-in', () => {
    const path = file('acme.yaml', 'id: acme.notes\nextends: acryl.blank\nbrand:\n  name: Acme Notes\n  accent: "#0a7d4b"\n')
    const blueprint = blueprintFromEnvironment({ ACRYL_BLUEPRINT: path, ACRYL_BRAND_TAGLINE: 'Notes that write themselves' })
    expect(blueprint.id).toBe('acme.notes')
    expect(blueprint.brand).toEqual({ kind: 'custom', identity: expect.objectContaining({ name: 'Acme Notes', tagline: 'Notes that write themselves' }) })
  })

  it('fails loudly on a missing file, bad YAML and an invalid definition instead of booting the wrong product', () => {
    expect(() => blueprintFromEnvironment({ ACRYL_BLUEPRINT: join(tmpdir(), 'does-not-exist.yaml') })).toThrow(/cannot read/)
    expect(() => blueprintFromEnvironment({ ACRYL_BLUEPRINT: file('bad.yaml', 'id: [unclosed') })).toThrow(/not valid YAML/)
    expect(() => blueprintFromEnvironment({ ACRYL_BLUEPRINT: file('invalid.yml', 'id: x\nrows: [nope]\n') })).toThrow(/"nope"/)
  })
})
