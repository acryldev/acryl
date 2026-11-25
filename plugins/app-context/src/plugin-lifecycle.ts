/**
 * `acrPluginLifecycle` in a Blends frame (spec 052 T055d): ACRYL's plugin lifecycle (`@acryldev/control`), so `@acryldev/plugin-admin`'s tools list and switch
 * the app's plugins from the chat and from every agent. The frame owns the switching: it provides `frameAppPlugins` (@acryldev/blends-frame), the same list
 * and switch as Settings > Plugins, and this is the thin adapter over it, as `acryl-tools.ts` is for the tools port. The frame's own rows are listed and locked.
 * The shared controller is not used here: it switches Loader entries and persists in the ACRYL runtime's profile state, while a Blend's plugins are rows of
 * `blend.yaml` and folders of `plugins/`, started together by one row, and `blend.yaml` is where a switch persists.
 */
import type { Context } from '@deepseek-ai/cordis'
import {
  PluginLifecycleError,
  type AcrPluginLifecycle,
  type PluginLifecycleEntryView,
  type PluginLifecycleFiberPhase,
  type PluginLifecycleReceipt,
  type PluginLifecycleSnapshot,
} from '@acryldev/control'

/** What the frame provides as `frameAppPlugins`. */
export interface FrameAppPluginsPort {
  list(): readonly { readonly name: string; readonly kind: 'row' | 'made'; readonly on: boolean }[]
  frame(): readonly { readonly id: string; readonly name: string; readonly disabled: boolean; readonly fiberState?: number | undefined }[]
  switch(kind: 'row' | 'made', name: string, on: boolean): Promise<void>
  restart(): Promise<void>
}

const APP = 'app:'
const FRAME = 'frame:'
const FRAME_REASON = 'Part of the frame around the app: it is not switched here.'
// Cordis `FiberState` by value (a const enum): pending, loading, active, failed, disposed, unloading.
const PHASES: readonly PluginLifecycleFiberPhase[] = ['pending', 'loading', 'active', 'failed', null, 'unloading']

/** The lifecycle over the frame's plugin port; changes run one at a time. */
export function lifecycleOver(port: FrameAppPluginsPort): AcrPluginLifecycle {
  const snapshot = (): PluginLifecycleSnapshot => {
    const app: PluginLifecycleEntryView[] = port.list().map(plugin => ({
      entryId: `${APP}${plugin.name}`, moduleName: plugin.name, enabled: plugin.on, hostPhase: null, mutable: true, protectedReason: null, dependents: [],
    }))
    const frame: PluginLifecycleEntryView[] = port.frame().map(row => ({
      entryId: `${FRAME}${row.id}`, moduleName: row.name, enabled: !row.disabled,
      hostPhase: row.fiberState === undefined ? null : PHASES[row.fiberState] ?? null, mutable: false, protectedReason: FRAME_REASON, dependents: [],
    }))
    return { entries: [...app, ...frame] }
  }
  let queue: Promise<unknown> = Promise.resolve()
  const inTurn = <T>(run: () => Promise<T>): Promise<T> => {
    const next = queue.then(run, run)
    queue = next
    return next
  }
  const appPlugin = (entryId: string) => {
    const plugin = port.list().find(candidate => `${APP}${candidate.name}` === entryId)
    if (plugin !== undefined) return plugin
    if (port.frame().some(row => `${FRAME}${row.id}` === entryId)) throw new PluginLifecycleError('protected-entry', FRAME_REASON)
    throw new PluginLifecycleError('unknown-entry', `There is no plugin ${entryId}.`)
  }
  const done = async (run: () => Promise<void>): Promise<void> => {
    try {
      await run()
    } catch (cause) {
      throw new PluginLifecycleError('lifecycle-failed', cause instanceof Error ? cause.message : String(cause))
    }
  }
  return {
    snapshot,
    setEnabled: (entryId, enabled) => inTurn(async (): Promise<PluginLifecycleReceipt> => {
      const plugin = appPlugin(entryId)
      if (plugin.on === enabled) throw new PluginLifecycleError(enabled ? 'already-enabled' : 'already-disabled', `${plugin.name} is already ${enabled ? 'on' : 'off'}.`)
      await done(() => port.switch(plugin.kind, plugin.name, enabled))
      return { accepted: true, action: enabled ? 'enable' : 'disable', entryIds: [entryId], snapshot: snapshot() }
    }),
    // The app's plugins start together, in one row: a reload of one is a restart of that row.
    reload: entryId => inTurn(async (): Promise<PluginLifecycleReceipt> => {
      if (entryId !== undefined) appPlugin(entryId)
      await done(() => port.restart())
      const entryIds = entryId !== undefined ? [entryId] : port.list().filter(plugin => plugin.on).map(plugin => `${APP}${plugin.name}`)
      return { accepted: true, action: 'reload', entryIds, snapshot: snapshot() }
    }),
  }
}

/** Provide `acrPluginLifecycle` while the frame provides its plugins; it leaves with them. */
export function provideAcrPluginLifecycle(ctx: Context): void {
  ctx.inject(['frameAppPlugins'], (child) => {
    const lifecycle = lifecycleOver((child as unknown as { frameAppPlugins: FrameAppPluginsPort }).frameAppPlugins)
    child.effect(() => {
      const dispose = child.reflect.provide('acrPluginLifecycle', lifecycle)
      return () => { void dispose() }
    }, '@acryldev/app-context: acrPluginLifecycle')
  })
}
