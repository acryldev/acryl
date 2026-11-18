/** Provides the tab registry to other client plugins as the `workspaceTabs` service, for one plugin lifetime. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { WorkspaceTabRegistry } from './tab-registry.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Register tab types of your own: `ctx.workspaceTabs.register({ kind, label, description, glyph, component })`. */
    workspaceTabs: WorkspaceTabRegistry
  }
}

/** @returns disposer for the service registration. */
export function provideWorkspaceTabs(ctx: ClientContext, registry: WorkspaceTabRegistry): () => void {
  const dispose = ctx.reflect.provide('workspaceTabs', registry)
  return () => { void dispose() }
}
