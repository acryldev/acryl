/**
 * The `acrylWeb` provider: ACRYL's web port (`acryl-control`), the address of DeepSeek Harness's `webServer` today. A thin delegate, no logic: every
 * read goes to the live `webServer`, and when that carrier is replaced the adapter and its consumers unload together (Cordis rebinding). Nothing
 * registers through it: routes and upgrades go through the router (spec 048 T008).
 *
 * @module acryl-harness-runtime/engine-web
 */

import type { Context } from '@deepseek-ai/cordis'
import type { AcrylWeb } from 'acryl-control'
import type {} from '@deepseek-ai/dsh-host-webserver'

/**
 * Provide `acrylWeb` on `ctx`, which must be able to see `webServer` (call it inside `ctx.inject(['webServer'], ...)`). The registration is owned by `ctx`'s
 * Fiber: it ends with it.
 */
export function provideAcrylWeb(ctx: Context): void {
  const port: AcrylWeb = {
    get host() { return ctx.webServer.host },
    get port() { return ctx.webServer.port },
  }
  ctx.effect(() => {
    const dispose = ctx.reflect.provide('acrylWeb', port)
    return () => { void dispose() }
  }, 'acryl-harness-runtime: acrylWeb')
}
