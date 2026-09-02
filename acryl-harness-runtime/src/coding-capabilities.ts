import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'

export type AcrylSurface = 'tui' | 'web' | 'desktop' | 'acp'

export interface AcrylCodingCapability {
  readonly id: 'authorization'
  // Product surfaces this capability applies to. This is a declaration of
  // intended applicability, not proof every root already mounts it. Task 2 adds
  // the Web/Desktop composition sites.
  readonly surfaces: readonly AcrylSurface[]
  readonly loaderPatches: readonly PatchOptions[]
}

// The ACRYL repo root (this package sits at `<repo>/acryl-harness-runtime`). The
// shipped agent presets live in the pinned DSH submodule rather than the
// published npm bundle, so point the roster at that source dir.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const shippedPresetsDir = join(
  repoRoot,
  'deepseek-harness',
  'packages',
  'preset',
  'agent-presets',
  'presets',
)
const agentPresetConfig: Record<string, unknown> = {
  default: 'standard',
  roots: existsSync(shippedPresetsDir)
    ? [{ path: shippedPresetsDir, trust: 'system' }]
    : [],
  includeShippedRoot: false,
  includeUserRoot: true,
}

/*
 * Rows the ACRYL runtime composes on top of a base profile. dsh-base alone
 * mounts no persona, no agent-preset service, and no session-stat projection;
 * these are what let a surface open a real coding agent. `hmr` is deliberately
 * NOT forced here: the boot guard below must keep rejecting an HMR-enabled
 * profile in a non-exposed process, and each surface decides its own HMR policy.
 * Values are defaults a surface or user patch layer may override.
 */
const authorizationCapabilityPatches = [
  {
    id: 'system-prompt',
    name: '@deepseek-ai/dsh-system-prompt',
    config: {
      persona: 'You are a coding agent powered by the {{model}} model. Your working directory is {{cwd}}.',
    },
  },
  {
    // `system-prompt` is already in dsh-base's include tree, so a plain id-targeted
    // row overrides its config. `agent-presets` and `session-stats` are NOT in the
    // base include set, so they must be `insert`ed - a plain row only overrides an
    // existing entry, it does not create one (that is why they silently never
    // composed before).
    insert: [
      { id: 'agent-presets', name: '@deepseek-ai/dsh-agent-presets', config: agentPresetConfig },
      { id: 'session-stats', name: '@deepseek-ai/dsh-session-stats' },
      // The authorization seam that `dsh-llm-pi-ai` registers its OAuth
      // sign-in flows into; without it the pi-ai adapter stays PENDING and
      // `/login` has no providers to offer.
      { id: 'authorization', name: '@deepseek-ai/dsh-authorization' },
    ],
  },
] as const satisfies readonly PatchOptions[]

const NON_TUI_SHARED_ROW_IDS: ReadonlySet<string> = new Set(['authorization'])

function selectNonTuiCapabilityPatches(
  patches: readonly PatchOptions[],
): readonly PatchOptions[] {
  return patches.flatMap((patch) => {
    if (!('insert' in patch) || !Array.isArray(patch.insert)) return []
    const insert = patch.insert.filter(row => NON_TUI_SHARED_ROW_IDS.has(row.id))
    return insert.length === 0 ? [] : [{ insert }]
  })
}

export const ACRYL_CODING_CAPABILITIES = [
  {
    id: 'authorization',
    // Declared product applicability. Individual roots still opt into these
    // shared patches by calling `createAcrylCodingCapabilityPatches()` with the
    // surfaces they mount today.
    surfaces: ['tui', 'web', 'desktop', 'acp'],
    loaderPatches: authorizationCapabilityPatches,
  },
] as const satisfies readonly AcrylCodingCapability[]

export function createAcrylCodingCapabilityPatches(
  surfaces: ReadonlySet<AcrylSurface>,
): readonly PatchOptions[] {
  const includeSharedCodingRows = surfaces.has('tui') || surfaces.has('acp')
  return structuredClone(
    ACRYL_CODING_CAPABILITIES
      .filter(capability => capability.surfaces.some(surface => surfaces.has(surface)))
      .flatMap(capability => includeSharedCodingRows
        ? capability.loaderPatches
        : selectNonTuiCapabilityPatches(capability.loaderPatches)),
  )
}
