/**
 * The blueprint context (spec 036): pure domain rules, no engine. What a Blueprint composes per surface is the contract,
 * so it is asserted as exact row ids, in mount order.
 */
import { describe, expect, it } from 'vitest'
import {
  BLANK_BLUEPRINT,
  FULL_BLUEPRINT,
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
    expect(selectBlueprint(undefined)).toBe(FULL_BLUEPRINT)
    expect(selectBlueprint('  ')).toBe(FULL_BLUEPRINT)
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
  it('full ACRYL keeps today\'s web rows in mount order', () => {
    const { patches, packages } = composeBlueprintRows(FULL_BLUEPRINT, 'web')
    expect(insertedIds(patches)).toEqual(['ui-acryl', 'community-market', 'extension-context', 'acryl-system-prompt', '@acryl/ui', 'acryl-shortcuts', 'acryl-mount-anchors'])
    expect(packages).toContain('dsh-client-ui-brand-acryl')
  })

  it('blank web: brand, extension pack, prompt shaping and UI library only', () => {
    const { patches } = composeBlueprintRows(BLANK_BLUEPRINT, 'web')
    expect(insertedIds(patches)).toEqual(['brand', 'extension-context', 'acryl-system-prompt', '@acryl/ui'])
    const capabilities = new Set(BLANK_BLUEPRINT.capabilities)
    const capabilityIds = insertedIds(createAcrylCodingCapabilityPatches(new Set(['web']), new Set(), capabilities))
    expect(capabilityIds).toEqual(['authorization'])
    expect(createAcrylShellCapabilityPatches(new Set(['web']), 'advanced', new Set(), capabilities)).toEqual([])
  })

  it('blank keeps the agent essentials on the terminal and adds no browser rows', () => {
    const { patches, packages } = composeBlueprintRows(BLANK_BLUEPRINT, 'tui')
    expect(insertedIds(patches)).toEqual(['extension-context', 'acryl-system-prompt'])
    expect(packages).toContain('acryl-ui-tui')
    const tui = insertedIds(createAcrylCodingCapabilityPatches(new Set(['tui']), new Set(), new Set(BLANK_BLUEPRINT.capabilities)))
    expect(tui).toEqual(['agent-presets', 'session-stats', 'authorization'])
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
