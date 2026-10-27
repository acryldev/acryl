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
  builtInCatalog,
  composeBlueprintRows,
  parseBlueprint,
} from '../src/index.ts'
import { fileURLToPath } from 'node:url'
import { blueprintRowForModule } from '../src/blueprint/index.ts'
import { ACRYL_CODING_CAPABILITIES } from '../src/coding-capabilities.ts'

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
    // Written before spec 044 step 1b renamed the row: read as its current name.
    expect(blueprint.rows).toContain('plugin-context')
    expect(blueprint.rows).not.toContain('extension-context' as never)
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

  it('refuses a capability that needs the router without the framework kit that serves its routes, and every built-in with one has the kit', () => {
    expect(() => parseBlueprint({ id: 'acme.ide', extends: 'acryl.ide', rows: ['plugin-context', 'system-prompt'] })).toThrow(/"framework-kit"/)
    expect(() => parseBlueprint({ id: 'acme.ws', capabilities: ['workspace'] })).toThrow(/"workspace" capability needs the "framework-kit"/)
    expect(() => parseBlueprint({ id: 'acme.door', capabilities: ['agent-control-ui'] })).toThrow(/"agent-control-ui" capability needs the "framework-kit"/)
    expect(() => parseBlueprint({ id: 'acme.login', capabilities: ['sign-in'] })).toThrow(/"sign-in" capability needs the "framework-kit"/)
    expect(parseBlueprint({ id: 'acme.ws', capabilities: ['workspace'], rows: ['framework-kit'] }).rows).toEqual(['framework-kit'])
    expect(parseBlueprint({ id: 'acme.door', capabilities: ['agent-control-ui'], rows: ['framework-kit'] }).capabilities).toEqual(['agent-control-ui'])
    const routed = ACRYL_CODING_CAPABILITIES.filter(capability => capability.needsRouter === true).map(capability => capability.id)
    expect(routed).toEqual(['workspace', 'plugin-admin', 'sign-in', 'support', 'agent-control-ui'])
    for (const blueprint of builtInCatalog().list()) {
      if (blueprint.capabilities.some(id => routed.includes(id))) expect(blueprint.rows).toContain('framework-kit')
    }
  })

  it('every row id a file may name composes on at least one surface (the id list cannot drift from the row table)', () => {
    for (const id of BLUEPRINT_ROW_IDS) {
      const probe = parseBlueprint({ id: 'probe', rows: [id], capabilities: ['authorization'] })
      const composed = (['tui', 'web', 'desktop'] as const).some(surface => composeBlueprintRows(probe, surface).packages.some(name => name !== 'dsh-client-ui-brand-acryl' && name !== 'acryl-brand'))
      expect(composed, id).toBe(true)
    }
  })

  it('a Blend with the app-shell row owns its frame on Web and Desktop: the frame package and row, the stock layout off, sidebar and conversation on', () => {
    const blueprint = parseBlueprint({ id: 'acme.music', extends: 'acryl.blank', rows: [...BLANK_BLUEPRINT.rows, 'app-shell'] })
    for (const surface of ['web', 'desktop'] as const) {
      const { packages, patches } = composeBlueprintRows(blueprint, surface)
      expect(packages).toContain('acryl-app-shell')
      expect(patches.flatMap(patch => patch.insert ?? []).map(row => row.id)).toContain('acryl-app-shell')
      expect(patches).toEqual(expect.arrayContaining([{ id: 'ui-layout', disabled: true }, { id: 'ui-sidebar', disabled: false }, { id: 'ui-conversation', disabled: false }]))
    }
    const tui = composeBlueprintRows(blueprint, 'tui')
    expect(tui.packages).not.toContain('acryl-app-shell')
    expect(tui.patches).not.toContainEqual({ id: 'ui-layout', disabled: true })
    expect(blueprintRowForModule('acryl-app-shell')).toBe('app-shell')
  })

  it('a Blend without it keeps the stock frame', () => {
    expect(composeBlueprintRows(BLANK_BLUEPRINT, 'web').patches).not.toContainEqual({ id: 'ui-layout', disabled: true })
  })
})

describe('a blueprint file selected from the environment', () => {
  it('the documented private-brand sample is valid', () => {
    const sample = fileURLToPath(new URL('../../../specs/036-cordis-ecosystem-and-acryl-blends/samples/private-brand.blueprint.yaml', import.meta.url))
    const blueprint = blueprintFromEnvironment({ ACRYL_BLUEPRINT: sample })
    expect(blueprint.id).toBe('acme.notes')
    expect(blueprint.rows).not.toContain('acryl-workspace' as never)
    expect(composeBlueprintRows(blueprint, 'web').patches.flatMap(patch => patch.insert ?? []).map(row => row.id)).toEqual(['brand', 'acrylblends/cordis/router', 'acrylblends/cordis/router-http', 'acrylblends/cordis/state', 'acrylblends/cordis/inspect', 'acryl-plugin-context', 'acryl-system-prompt', '@acryl/ui', 'acryl-app-save', 'acryl-plugin-hub', 'acryl-plugin-hub/manager'])
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
