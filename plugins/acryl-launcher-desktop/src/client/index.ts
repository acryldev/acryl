/**
 * Cordis Client plugin: the ACRYL screen, the first screen of the desktop app (spec 050 T012). It registers one entry in the frame's `shell.overlay`
 * seat: a full-window layer over the workspace, open when the app starts, closed by the "ACRYL ADE" card and reopened by the small ACRYL button. It owns its
 * styles inside one effect and talks to its Host half over the private same-origin routes.
 */
import type {} from '@acryl/ui/frame'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { createLauncherApi } from './api.ts'
import { LauncherScreen, type LauncherScreenProps } from './Screen.tsx'
import { LauncherVisibility } from './store.ts'
import { installLauncherStyles } from './styles.ts'

export const name = 'acryl-launcher-desktop-client'
export const inject = ['slots']

/** Desktop hands an http(s) page opened by the window to the system browser; Web opens a tab. */
function openExternal(url: string): void {
  const target = new URL(url)
  if (target.protocol !== 'https:' && target.protocol !== 'http:') return
  window.open(target.href, '_blank', 'noopener,noreferrer')
}

export function apply(ctx: ClientContext): void {
  const injected: LauncherScreenProps = { api: createLauncherApi(), visibility: new LauncherVisibility(true), openExternal }
  ctx.effect(() => installLauncherStyles(), 'acryl-launcher-desktop: styles')
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'acryl-launcher-desktop',
    order: -1000,
    inject: () => injected,
  }, LauncherScreen))
}

export { LauncherScreen } from './Screen.tsx'
export { createLauncherApi } from './api.ts'
export type { LauncherApi } from './api.ts'
export { LauncherVisibility } from './store.ts'
