// Example: host-route.basic
// Type:     host-route
// Surfaces: web desktop
// Teaches:  a Host plugin serves an HTTP route through the webServer service; a client bundle can fetch it. Not available on tui.
// Expect:   ACTIVE on web/desktop; GET /api/example/hello returns "ok".
// Docs:     extending.host-route
// Pattern:  workspace run.mjs / cordis-plugin-market host/routes
export const name = 'acryl-example-route'
export const inject = ['webServer']

export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/api/example/hello',
    handler: (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end('ok')
    },
  }), 'example-route: hello')
}
