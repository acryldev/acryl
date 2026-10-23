/**
 * @module
 * Powered By Middleware for App.
 */
import type { MiddlewareHandler } from '../../types.ts'

type PoweredByOptions = {
  /**
   * The value for X-Powered-By header.
   * @default App
   */
  serverName?: string
}

/**
 * Powered By Middleware for App.
 *
 * @param options - The options for the Powered By Middleware.
 * @returns {MiddlewareHandler} The middleware handler function.
 *
 * @example
 * ```ts
 * import { poweredBy } from 'acryl-router/powered-by'
 *
 * const app = new App()
 *
 * app.use(poweredBy()) // With options: poweredBy({ serverName: "My Server" })
 * ```
 */
export const poweredBy = (options?: PoweredByOptions): MiddlewareHandler => {
  return async function poweredBy(c, next) {
    await next()
    c.res.headers.set('X-Powered-By', options?.serverName ?? 'ACRYL')
  }
}
