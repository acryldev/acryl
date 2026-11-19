/**
 * The `acrylWeb` service: where the thing that serves the page listens, and nothing else. ACRYL's plugins inject `acrylWeb` only for the address itself
 * (the loopback check, an origin to hand to a child process), never a harness service, so the carrier behind it can change without touching them. The
 * carrier is DSH's `webServer`; routes and upgrades stay with the framework's router (`ctx.router`, `ctx.routerHttp`). The service is provided inside
 * one effect, so a carrier that is replaced re-binds it and a plugin unload removes it. Mounted by ACRYL's engine (Web and Desktop) and by every Blends
 * app's frame (row `@acryldev/web`).
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { AcrylWeb } from '@acryldev/control'

// The service's contract is declared once, in @acryldev/control (`src/platform/web.ts`); this package only provides it.

export const name = '@acryldev/web'
export const inject = ['webServer']

export function apply(ctx: Context): void {
  ctx.effect(() => {
    const port: AcrylWeb = {
      get host() {
        return ctx.webServer.host
      },
      get port() {
        return ctx.webServer.port
      },
    }
    const dispose = ctx.reflect.provide('acrylWeb', port)
    return () => {
      void dispose()
    }
  }, '@acryldev/web: acrylWeb')
}
