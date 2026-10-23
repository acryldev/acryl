/**
 * The Web adapter for `acryl-router` (spec 046, milestone M2). A plugin that owns routes on the router asks for a path
 * prefix to be served over HTTP: `ctx.routerHttp.mount('/api/market')` claims that prefix on the DSH `webServer` and every
 * request under it is run through `router.fetch`. The TUI and Desktop do not need this: they call `router.fetch` directly.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type {} from 'acryl-router'
import { Context, Service } from '@deepseek-ai/cordis'
import { serve } from './serve.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    routerHttp: RouterHttp
  }
}

/** Stable Cordis plugin name, equal to the package name and the Loader row id. */
export const name = 'acryl-router-http'

/** Hard requirements: both services must exist, otherwise this plugin stays PENDING. */
export const inject = ['router', 'webServer']

/**
 * The slice of the DSH `webServer` this adapter uses, as its own port: a prefix claim that returns its remover. The service
 * is read by name, so this package imports nothing from the DeepSeek Harness (the layout gate keeps that count falling).
 */
export interface WebServerPort {
  register(route: {
    readonly kind: 'prefix'
    readonly path: string
    readonly handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): () => void
}

const PREFIX_PATTERN = /^\/[A-Za-z0-9._~\-/]*[A-Za-z0-9._~-]$/

export class RouterHttp extends Service {
  private readonly router: Context['router']
  private readonly web: WebServerPort

  constructor(ctx: Context) {
    super(ctx, 'routerHttp')
    this.router = ctx.router
    this.web = ctx.get('webServer') as WebServerPort
  }

  /**
   * Serve `prefix` and everything below it through the router. Returns a remover; the mount also goes away when the
   * calling plugin unloads. A prefix another route already claims throws, as the webServer treats it as misconfiguration.
   */
  mount(prefix: string): () => void {
    if (!PREFIX_PATTERN.test(prefix)) throw new TypeError(`acryl-router-http: "${prefix}" is not a mountable path prefix`)
    const remove = this.web.register({
      kind: 'prefix',
      path: prefix,
      handler: (req, res) => serve(this.router, req, res),
    })
    this.ctx.effect(() => () => { remove() }, `acryl-router-http: mount ${prefix}`)
    return remove
  }
}

export function apply(ctx: Context): void {
  new RouterHttp(ctx)
}

export { serve, type FetchRouter } from './serve.ts'
export { sendResponse, toRequest } from './bridge.ts'
