/**
 * Cordis Client plugin: the Versions section and its same-origin client, for the frame's left panel.
 *
 * It provides the `acrylVersions` service so another plugin (the left panel, the Git tab) renders the
 * section and calls the API without rebuilding either, and owns its styles in one effect. The service is
 * withdrawn with the plugin's fiber.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { createElement, type ComponentType } from 'react'
import { createVersionsApi, type VersionsApi } from './api.ts'
import { installVersionsStyles } from './styles.ts'
import { VersionsSection } from './VersionsSection.tsx'

export interface AcrylVersionsService {
  /** The same-origin calls the section makes. */
  readonly api: VersionsApi
  /** Render `<Section path={worktree} />`; it renders nothing for an empty path. */
  readonly Section: ComponentType<{ path: string }>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The Versions section and its API, provided by `acryl-versions-client`. */
    acrylVersions: AcrylVersionsService
  }
}

export const name = 'acryl-versions-client'

export function apply(ctx: ClientContext): void {
  const api = createVersionsApi()
  // The section the service hands out uses the service's own API, not a second client with its own default.
  const Section: ComponentType<{ path: string }> = props => createElement(VersionsSection, { path: props.path, api })
  ctx.effect(() => installVersionsStyles(), 'acryl-versions: styles')
  ctx.effect(() => {
    const dispose = ctx.reflect.provide('acrylVersions', { api, Section })
    return () => { void dispose() }
  }, 'acryl-versions: service')
}

export { createVersionsApi, type VersionsApi } from './api.ts'
export { formatRelativeTime, VersionsSection, type VersionsSectionProps } from './VersionsSection.tsx'
export { installVersionsStyles } from './styles.ts'
