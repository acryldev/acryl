// An app plugin of the framework, loaded as a row of the DSH web profile: it owns /api/spike/hello and a page at /board on the framework router, which routerHttp serves on DSH's own web server.
import { Acryl } from 'acrylblends'
export const name = 'spike-hello'
export const inject = ['router', 'routerHttp', 'sessions']
export function apply(ctx) {
  ctx.router.route(
    '/',
    new Acryl()
      .get('/api/spike/hello', (c) =>
        c.json({ hello: 'from the framework router', sessionsService: typeof ctx.sessions }),
      )
      .get('/board', (c) =>
        c.html("<!doctype html><title>Board</title><h1>The app, on DSH's host</h1>"),
      ),
  )
  ctx.routerHttp.mount('/api/spike')
  ctx.routerHttp.mount('/board')
}
