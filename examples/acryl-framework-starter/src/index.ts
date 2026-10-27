/**
 * A starter plugin: one route, one state cell. Copy it and rename it.
 */

import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from 'acrylblends'
import type {} from 'acrylblends/cordis/state'
import type {} from 'acrylblends/cordis/router'
import type {} from 'acrylblends/cordis/router-http'

/** Stable Cordis plugin name, equal to the package name and the Loader row id. */
export const name = 'acryl-framework-starter'
export const inject = ['router', 'state']

export function apply(ctx: Context): void {
  const visits = ctx.state.cell('starter.visits', 0)
  const api = new Acryl().get('/hello/:who', c => {
    visits.update(count => count + 1)
    return c.json({ hello: c.req.param('who'), visits: visits.get() })
  })
  ctx.router.route('/api/starter', api)
  // Over HTTP only where an adapter exists (Web and Desktop); the terminal calls `ctx.router.request(...)` in process.
  ctx.inject(['routerHttp'], inner => { inner.routerHttp.mount('/api/starter') })
}
