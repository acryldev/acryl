/**
 * The `acrylWeb` provider: ACRYL's web port (`acryl-control`) answered by DeepSeek Harness's `webServer` today. A thin delegate, no logic: every call
 * goes to the live `webServer`, so a consumer's registrations land on the carrier that is serving the page, and when that carrier is replaced the
 * adapter and its consumers unload together (Cordis rebinding) and register again on the new one.
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
    register: route => ctx.webServer.register(route),
    registerUpgrade: route => ctx.webServer.registerUpgrade(route),
  }
  ctx.effect(() => {
    const dispose = ctx.reflect.provide('acrylWeb', port)
    return () => { void dispose() }
  }, 'acryl-harness-runtime: acrylWeb')
}
