import type { GetConnInfo } from '../../helper/conninfo/index.ts'

/**
 * Get connection information from Cloudflare Pages
 * @param c - Context
 * @returns Connection information including remote address
 * @example
 * ```ts
 * import { Acryl } from 'acrylblends'
 * import { handle, getConnInfo } from 'acrylblends/cloudflare-pages'
 *
 * const app = new Acryl()
 *
 * app.get('/', (c) => {
 *   const info = getConnInfo(c)
 *   return c.text(`Your IP: ${info.remote.address}`)
 * })
 *
 * export const onRequest = handle(app)
 * ```
 */
export const getConnInfo: GetConnInfo = (c) => ({
  remote: {
    address: c.req.header('cf-connecting-ip'),
  },
})
