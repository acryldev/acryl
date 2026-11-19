// Example: host-route.basic
// Type:     host-route
// Surfaces: web desktop
// Teaches:  a Host plugin serves HTTP routes as one app on the framework's router, under a prefix it mounts; a client bundle can fetch them. Not on tui.
// Expect:   ACTIVE on web/desktop (PENDING without the router); GET /api/example/hello returns "ok".
// Docs:     extending.host-route
// Pattern:  acryl-support src/route.ts, acryl-plugin-admin src/index.ts
import { Acryl } from 'acrylblends'

export const name = 'acryl-example-route'
// Both come from the app's framework-kit row. Until they exist this plugin is PENDING, not failed.
export const inject = ['router', 'routerHttp']

export function apply(ctx) {
  const app = new Acryl()
  app.get('/api/example/hello', c => c.text('ok'))
  // The routes and the mount belong to this plugin: they go away when it unloads, no effect or disposer to write.
  ctx.router.route('/', app)
  ctx.routerHttp.mount('/api/example')
}
