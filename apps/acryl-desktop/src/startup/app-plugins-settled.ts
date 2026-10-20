/**
 * Wait for `acryl-plugin-context`'s startup pass before the window loads. The
 * pass installs an app's own plugins and re-syncs changed ones one tick after
 * the engine boots; the web client composes once from the plugin list it
 * loads and fails its boot audit for anything missing, so a window loaded
 * first boots without the app's client plugin (for an app that claims the
 * advanced shell: no `layout` service, "web boot: 22 entries did not
 * activate"). Reproduced 2026-10-20 on the CityCopy app: the renderer error
 * was logged 0.2 s before "startup: re-synced acryl-citycopy".
 */

import type { Context } from '@deepseek-ai/cordis'

/** The part of `acryl-plugin-context`'s `pluginContext` service this reads. */
interface PluginContextStartup {
  /** Settles when the startup install/re-sync pass has finished, failed, or could not run. */
  readonly startupSettled?: Promise<void>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    pluginContext: PluginContextStartup
  }
}

/** Longest wait: a slow install still lets the window open, as it did before the wait existed. */
export const APP_PLUGINS_SETTLE_LIMIT_MS = 60_000

/**
 * Resolve when the startup pass settles, at once when no `pluginContext` is
 * mounted, or after {@link APP_PLUGINS_SETTLE_LIMIT_MS}.
 * @param ctx - the booted engine context.
 * @param limitMs - the longest wait.
 * @returns `'settled'`, `'absent'`, or `'timed-out'`.
 */
export async function appPluginsSettled(ctx: Context, limitMs: number = APP_PLUGINS_SETTLE_LIMIT_MS): Promise<'settled' | 'absent' | 'timed-out'> {
  const settled = ctx.get('pluginContext')?.startupSettled
  if (settled === undefined) return 'absent'
  let timer: ReturnType<typeof setTimeout> | undefined
  const limit = new Promise<'timed-out'>(resolve => { timer = setTimeout(() => resolve('timed-out'), limitMs) })
  try {
    return await Promise.race([settled.then(() => 'settled' as const), limit])
  } finally {
    clearTimeout(timer)
  }
}
