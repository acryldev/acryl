import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ShortcutBinding, ShortcutCommandId } from '@deepseek-ai/dsh-client-shortcuts/client'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { MountAnchorInspector } from './MountAnchorInspector.tsx'
import { createInspectorToggle } from './inspector-toggle.ts'

export const name = 'acryl-mount-anchors-client'
export const inject = ['shortcuts']

/** Stable id of the toggle command in DSH's shortcut catalog (Settings > Keyboard shortcuts lists and rebinds it). */
const TOGGLE_COMMAND_ID = 'acryl-mount-anchors.toggle' as ShortcutCommandId

/** Cmd/Ctrl+Shift+. - the combination the inspector has always used. */
const DEFAULT_BINDING: ShortcutBinding = { code: 'Period', modifiers: ['primary', 'shift'] }

/**
 * Mount the inspector directly - not through the `shell.overlay` slot. That slot only exists
 * where the advanced frame declares it, so a slot-based version would silently do nothing on a
 * stock frame. Mounting an independent React root directly onto `document.body` needs no slot to
 * exist at all, so the exact same plugin works on both surfaces. `react-dom/client`'s `createRoot` is a genuine
 * platform seed word (`deepseek-harness/packages/client/web/src/seed.ts`), not a workaround.
 */
export function apply(ctx: ClientContext): void {
  const toggle = createInspectorToggle()
  ctx.effect(() => ctx.shortcuts.register({
    id: TOGGLE_COMMAND_ID,
    label: () => 'Toggle mount-anchor inspector',
    aliases: ['mount anchors', 'inspector', 'point at element'],
    defaults: {
      'desktop:macos': DEFAULT_BINDING,
      'desktop:windows': DEFAULT_BINDING,
      'desktop:linux': DEFAULT_BINDING,
      'web:macos': DEFAULT_BINDING,
      'web:windows': DEFAULT_BINDING,
      'web:linux': DEFAULT_BINDING,
    },
    regions: ['page'],
    modals: [],
    resolve: () => ({ status: 'handled', run: () => { toggle.toggle() } }),
  }), 'acryl-mount-anchors: toggle shortcut')
  ctx.effect(() => {
    const container = document.createElement('div')
    container.id = 'acryl-mount-anchors-root'
    document.body.appendChild(container)
    const root = createRoot(container)
    root.render(createElement(MountAnchorInspector, { toggle }))
    return () => {
      root.unmount()
      container.remove()
    }
  }, 'acryl-mount-anchors: overlay root')
}

export { MountAnchorInspector } from './MountAnchorInspector.tsx'
export { createInspectorToggle } from './inspector-toggle.ts'
export type { InspectorToggle } from './inspector-toggle.ts'
export type { MountAnchor, MountAnchorComponent, MountAnchorTarget } from './MountAnchorInspector.tsx'
