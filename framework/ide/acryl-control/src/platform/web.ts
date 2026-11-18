/**
 * The web port of the ACRYL platform: where the thing that serves the page listens, and nothing else. Routes and WebSocket upgrades are
 * served by the framework's router (`ctx.router`, `ctx.routerHttp`); a plugin injects `acrylWeb` only for the address itself (the loopback
 * check, an origin to hand to a child process). Plugins never inject a DeepSeek Harness service, so the carrier behind it can change (DSH's web
 * server today, an ACRYL-owned one later) without touching them. The provider is an adapter in the engine seam (`acryl-harness-runtime`).
 *
 * @module acryl-control/platform/web
 */

export interface AcrylWeb {
  /** The address the carrier is bound to. ACRYL's plugins refuse anything but loopback. */
  readonly host: string
  /** The listening port (the OS-assigned one when it was configured as zero). */
  readonly port: number
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    acrylWeb: AcrylWeb
  }
}
