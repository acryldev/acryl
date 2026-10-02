/**
 * Blueprint: a named, minimal starting composition of ACRYL. The stem cell of the framework: `blank` is the smallest
 * thing that is still a working agent, and everything else is grown from it by adding Cordis plugins (locally first,
 * published when worth sharing). `acryl.ide`, the agentic coding IDE the team ships, is not a separate product: it is one
 * Blend grown from `acryl.blank` (the flagship example of what the framework builds), and `grewFrom` records that lineage.
 *
 * A Blueprint is pure data, keyed by the ubiquitous language of the Blends spec: it names capabilities and optional
 * rows, never Loader mechanics. Turning it into Loader patches is `compose.ts`; choosing one is `selection.ts`.
 * Nothing here is special-cased in the runtime: every row a Blueprint names is an ordinary Cordis plugin, so adding
 * one later, or disabling one, is the same reversible row edit for a human, an agent or a Blend file.
 *
 * @module acryl-harness-runtime/blueprint/blueprint
 */

import { ACRYL_CODING_CAPABILITIES, type AcrylCodingCapabilityId, type AcrylShellMode } from '../coding-capabilities.ts'
import { brandIdentity, type BrandIdentity } from './brand-identity.ts'

/** ACRYL-owned rows a Blueprint may include on top of the capabilities. Each is one independently replaceable plugin. */
export type BlueprintRowId =
  | 'extension-context'
  | 'system-prompt'
  | 'ui-library'
  | 'community-market'
  | 'shortcuts'
  | 'mount-anchors'
  | 'app-save'

/** Every row id, as data: what a Blueprint file may name. Kept next to the type so the two cannot drift (a test asserts it). */
export const BLUEPRINT_ROW_IDS: readonly BlueprintRowId[] = ['extension-context', 'system-prompt', 'ui-library', 'app-save', 'community-market', 'shortcuts', 'mount-anchors']

/** `acryl`: the stock ACRYL brand plugin. `custom`: the configurable `acryl-brand` plugin carrying this identity. */
export type BlueprintBrand =
  | { readonly kind: 'acryl' }
  | { readonly kind: 'custom', readonly identity: BrandIdentity }

export interface Blueprint {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly capabilities: readonly AcrylCodingCapabilityId[]
  readonly rows: readonly BlueprintRowId[]
  readonly brand: BlueprintBrand
  readonly shell: AcrylShellMode
  /** The Blueprint this one was grown from, when it is a Blend of another (the IDE grew from the blank canvas). */
  readonly grewFrom?: string
}

function freezeBlueprint(blueprint: Blueprint): Blueprint {
  return Object.freeze(blueprint)
}

/**
 * The stem cell: an agent to talk to, a model chooser (authorization), an input, and the extension pack so the agent can
 * grow the rest. No workspace, no Market, no admin panel. The brand is configurable so it can be renamed without code.
 */
export const BLANK_BLUEPRINT: Blueprint = freezeBlueprint({
  id: 'acryl.blank',
  name: 'Blank',
  description: 'The smallest working agent that can grow itself: chat, model choice, and the extension pack.',
  // `acryl-settings` is essential: surface plugins (Desktop's shell, notifications) keep their preferences there.
  capabilities: ['persona', 'agent-roster', 'session-stats', 'authorization', 'acryl-settings'],
  rows: ['extension-context', 'system-prompt', 'ui-library', 'app-save'],
  brand: { kind: 'custom', identity: brandIdentity({ name: 'Blank', tagline: 'Ask for what you need. It builds it.', accent: '#3b6ef5', accentDark: '#7c9dff' }) },
  shell: 'compatibility',
})

/**
 * ACRYL the agentic coding IDE: the blank canvas grown into a development environment (workspace, plugin admin, Market, shortcuts, mount anchors, the
 * advanced shell, the ACRYL brand). Written as blank plus what it added, so the lineage is the definition, not a comment. Still the default when no
 * Blueprint is selected, because it is what ACRYL's own installs are.
 */
export const IDE_BLUEPRINT: Blueprint = freezeBlueprint({
  id: 'acryl.ide',
  name: 'ACRYL',
  description: 'The agentic coding IDE: a Blend grown from acryl.blank with the workspace, Market, plugin admin, shortcuts and mount anchors.',
  // Every declared capability, derived so a capability added to the table is part of the IDE without a second edit here.
  capabilities: ACRYL_CODING_CAPABILITIES.map(capability => capability.id),
  rows: [...BLANK_BLUEPRINT.rows, 'community-market', 'shortcuts', 'mount-anchors'],
  brand: { kind: 'acryl' },
  shell: 'advanced',
  grewFrom: BLANK_BLUEPRINT.id,
})

/** Read-only port: where Blueprints come from. Built-ins today; a hub, a Blend lock or a private registry later. */
export interface BlueprintCatalog {
  get(id: string): Blueprint | undefined
  list(): readonly Blueprint[]
}

export function builtInCatalog(): BlueprintCatalog {
  const all = [BLANK_BLUEPRINT, IDE_BLUEPRINT]
  return { get: id => all.find(blueprint => blueprint.id === id), list: () => all }
}

export class UnknownBlueprintError extends Error {
  constructor(id: string, known: readonly Blueprint[]) {
    super(`Unknown blueprint ${JSON.stringify(id)}. Known: ${known.map(blueprint => blueprint.id).join(', ')}`)
    this.name = 'UnknownBlueprintError'
  }
}

/** Use case: pick the Blueprint a surface boots with. No selection means the IDE, what ACRYL's own installs are. */
export function selectBlueprint(id: string | undefined, catalog: BlueprintCatalog = builtInCatalog()): Blueprint {
  if (id === undefined || id.trim() === '') return IDE_BLUEPRINT
  const found = catalog.get(id.trim())
  if (found === undefined) throw new UnknownBlueprintError(id, catalog.list())
  return found
}

/** A copy of a Blueprint under a different brand. Immutable: the original is untouched. */
export function withBrand(blueprint: Blueprint, identity: BrandIdentity): Blueprint {
  return freezeBlueprint({ ...blueprint, brand: { kind: 'custom', identity } })
}
