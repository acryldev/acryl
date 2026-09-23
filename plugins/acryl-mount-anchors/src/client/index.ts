import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
// Type-only: pulls the ShortcutsRegistry Context merge (ctx.shortcuts).
import type {} from 'acryl-shortcuts/client'
import { MountAnchorInspector } from './MountAnchorInspector.tsx'

export const name = 'acryl-mount-anchors-client'
export const inject = ['shortcuts']

/** Stable id this inspector registers its toggle under (spec 039's Settings > Shortcuts page). */
const TOGGLE_ACTION_ID = 'acryl-mount-anchors.toggle'

/**
 * Mount the inspector directly - not through the `shell.overlay` slot. That slot only exists
 * where `apps/acryl-desktop`'s `AdvancedFrame` declares it, so a slot-based version worked on
 * Desktop and silently did nothing at all on Web (confirmed: `apps/acryl-web` has no advanced
 * shell, no `sidebar`/`desktop.main`/`details`/`shell.overlay` slots declared anywhere). Mounting
 * an independent React root directly onto `document.body` needs no slot to exist at all, so the
 * exact same plugin now works on both surfaces. `react-dom/client`'s `createRoot` is a genuine
 * platform seed word (`deepseek-harness/packages/client/web/src/seed.ts`), not a workaround.
 */
export function apply(ctx: ClientContext): void {
  ctx.shortcuts.register({
    id: TOGGLE_ACTION_ID,
    label: 'Toggle mount-anchor inspector',
    defaultCombo: 'cmd+shift+.',
  })
  ctx.effect(() => {
    const container = document.createElement('div')
    container.id = 'acryl-mount-anchors-root'
    document.body.appendChild(container)
    const root = createRoot(container)
    root.render(createElement(MountAnchorInspector, { shortcuts: ctx.shortcuts, actionId: TOGGLE_ACTION_ID }))
    return () => {
      root.unmount()
      container.remove()
    }
  }, 'acryl-mount-anchors: overlay root')
}

export { MountAnchorInspector } from './MountAnchorInspector.tsx'
export type { MountAnchor, MountAnchorComponent, MountAnchorTarget } from './MountAnchorInspector.tsx'
