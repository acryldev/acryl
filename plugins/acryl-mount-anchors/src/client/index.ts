import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only, matches every other `shell.overlay` contributor's pattern
// (`cordis-plugin-market`): the `ctx.slots` Context augmentation lives in
// `dsh-client-ui-renderer`, and a real import (not a bare `import type {}`)
// reliably pulls in its ambient `declare module` augmentation. `shell.overlay`
// itself is declared by `dsh-client-ui-layout` (a real, shared upstream slot -
// checked directly, not assumed - `apps/acryl-desktop`'s AdvancedFrame just
// re-exposes it as one of the root slot's children, it doesn't own the type).
import '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { MountAnchorInspector } from './MountAnchorInspector.tsx'

export const name = 'acryl-mount-anchors-client'
export const inject = ['slots']

/**
 * Contribute the mount-anchor inspector to the desktop shell's overlay list.
 * Advanced-mode only (`shell.overlay` is declared only by the advanced shell,
 * same guard `acryl-workspace`/the reference canvas plugin use): the inject
 * throws in compatibility mode, where the slot is undeclared, so this is
 * caught and treated as "nothing to contribute" rather than a load failure.
 */
export function apply(ctx: ClientContext): void {
  try {
    ctx.slots.inject('shell.overlay', () => ctx.slots.register({
      name: 'shell.overlay',
      id: 'acryl-mount-anchors',
      order: 90, // renders after other overlays (e.g. the Market modal) so its veil/toast sit on top
    }, MountAnchorInspector))
  } catch (error) {
    if (error instanceof Error && error.message.includes('is not declared')) return
    throw error
  }
}

export { MountAnchorInspector } from './MountAnchorInspector.tsx'
export type { MountAnchor, MountAnchorComponent } from './MountAnchorInspector.tsx'
