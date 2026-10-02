/**
 * The blueprint context (spec 036): pure domain rules, no engine. What a Blueprint composes per surface is the contract,
 * so it is asserted as exact row ids, in mount order.
 */
import { describe, expect, it } from 'vitest'
import {
  ACRYL_CODING_CAPABILITIES,
  BLANK_BLUEPRINT,
  IDE_BLUEPRINT,
  InvalidBrandIdentityError,
  UnknownBlueprintError,
  blueprintFromEnvironment,
  brandIdentity,
  composeBlueprintRows,
  createAcrylCodingCapabilityPatches,
  createAcrylShellCapabilityPatches,
  identityLine,
  selectBlueprint,
} from '../src/index.ts'

function insertedIds(patches: readonly unknown[]): string[] {
  return patches.flatMap(patch => ((patch as { insert?: { id?: string }[] }).insert ?? []).map(row => row.id ?? ''))
}

describe('brand identity', () => {
  it('needs a name and rejects malformed colors, oversized text and non-objects', () => {
    expect(brandIdentity({ name: ' Orbit ' }).name).toBe('Orbit')
    expect(() => brandIdentity({})).toThrow(InvalidBrandIdentityError)
    expect(() => brandIdentity({ name: 'X', accent: 'blue' })).toThrow(/#rrggbb/)
    expect(() => brandIdentity({ name: 'x'.repeat(41) })).toThrow(/at most 40/)
    expect(() => brandIdentity('Orbit')).toThrow(/expected an object/)
  })

  it('names the brand in the agent identity line', () => {
    expect(identityLine(brandIdentity({ name: 'Orbit' }))).toContain('inside Orbit')
  })
})

describe('blueprint selection', () => {
  it('defaults to the full ACRYL, resolves built-ins, and fails loud on an unknown id', () => {
    expect(selectBlueprint(undefined)).toBe(IDE_BLUEPRINT)
    expect(selectBlueprint('  ')).toBe(IDE_BLUEPRINT)
    expect(selectBlueprint('acryl.blank')).toBe(BLANK_BLUEPRINT)
    expect(() => selectBlueprint('acryl.nope')).toThrow(UnknownBlueprintError)
  })

  it('reads the blueprint and rebrands it from the environment without mutating the built-in', () => {
    const rebranded = blueprintFromEnvironment({ ACRYL_BLUEPRINT: 'acryl.blank', ACRYL_BRAND_NAME: 'Orbit', ACRYL_BRAND_ACCENT: '#e8590c' })
    expect(rebranded.brand).toEqual({ kind: 'custom', identity: expect.objectContaining({ name: 'Orbit', accent: '#e8590c' }) })
    expect(BLANK_BLUEPRINT.brand.kind === 'custom' && BLANK_BLUEPRINT.brand.identity.name).toBe('Blank')
    expect(() => blueprintFromEnvironment({ ACRYL_BRAND_NAME: 'X', ACRYL_BRAND_ACCENT: 'red' })).toThrow(InvalidBrandIdentityError)
  })
})

describe('what each Blueprint composes', () => {
  it('the IDE is a Blend grown from blank: it keeps every capability and row of the blank canvas and says so', () => {
    expect(IDE_BLUEPRINT.grewFrom).toBe(BLANK_BLUEPRINT.id)
    for (const capability of BLANK_BLUEPRINT.capabilities) expect(IDE_BLUEPRINT.capabilities).toContain(capability)
    for (const row of BLANK_BLUEPRINT.rows) expect(IDE_BLUEPRINT.rows).toContain(row)
  })

  it('full ACRYL composes every declared capability, including ones added later', () => {
    expect([...IDE_BLUEPRINT.capabilities].sort()).toEqual(ACRYL_CODING_CAPABILITIES.map(capability => capability.id).sort())
  })

  it('full ACRYL keeps today\'s web rows in mount order', () => {
    const { patches, packages } = composeBlueprintRows(IDE_BLUEPRINT, 'web')
    expect(insertedIds(patches)).toEqual(['ui-acryl', 'community-market', 'extension-context', 'acryl-system-prompt', '@acryl/ui', 'acryl-app-save'])
    // `shortcuts` and `mount-anchors` are DETACHED on the DSH 0.2 branch (spec 001 R25), so they compose nowhere for now.
    expect(packages).toContain('dsh-client-ui-brand-acryl')
  })

  it('blank web: brand, extension pack, prompt shaping and UI library only', () => {
    const { patches } = composeBlueprintRows(BLANK_BLUEPRINT, 'web')
    expect(insertedIds(patches)).toEqual(['brand', 'extension-context', 'acryl-system-prompt', '@acryl/ui', 'acryl-app-save'])
    const capabilities = new Set(BLANK_BLUEPRINT.capabilities)
    const capabilityIds = insertedIds(createAcrylCodingCapabilityPatches(new Set(['web']), new Set(), capabilities))
    expect(capabilityIds).toEqual(['authorization', 'acryl-settings'])
    expect(createAcrylShellCapabilityPatches(new Set(['web']), 'advanced', new Set(), capabilities)).toEqual([])
  })

  it('blank keeps the agent essentials on the terminal and adds no browser rows', () => {
    const { patches, packages } = composeBlueprintRows(BLANK_BLUEPRINT, 'tui')
    expect(insertedIds(patches)).toEqual(['extension-context', 'acryl-system-prompt', 'acryl-app-save'])
    expect(packages).toContain('acryl-ui-tui')
    const tui = insertedIds(createAcrylCodingCapabilityPatches(new Set(['tui']), new Set(), new Set(BLANK_BLUEPRINT.capabilities)))
    expect(tui).toEqual(['agent-preset-registry', 'session-stats', 'authorization', 'acryl-settings'])
  })

  it('a custom brand carries into the system prompt identity, and a row the profile already has is not composed twice', () => {
    const { patches } = composeBlueprintRows(BLANK_BLUEPRINT, 'web', new Set(['extension-context']))
    expect(insertedIds(patches)).not.toContain('extension-context')
    const prompt = patches.flatMap(patch => patch.insert ?? []).find(row => row.id === 'acryl-system-prompt')
    expect(String((prompt?.config as { identity?: string }).identity)).toContain('inside Blank')
  })

  it('returns fresh objects every call so one root cannot mutate another', () => {
    const first = composeBlueprintRows(BLANK_BLUEPRINT, 'web').patches
    const second = composeBlueprintRows(BLANK_BLUEPRINT, 'web').patches
    expect(first).not.toBe(second)
    expect(first).toEqual(second)
  })
})
