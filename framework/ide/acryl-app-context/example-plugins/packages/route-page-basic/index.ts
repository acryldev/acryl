/**
 * A page and a JSON route of the plugin's own: GET /hello answers a page, GET /hello/greeting answers JSON.
 *
 * The routes are an `Acryl` app mounted with `ctx.router.route`, from the plugin's own context: the mount goes away when the plugin is switched off
 * or removed. The paths are the app's own (`/hello`): the frame serves the same routes under its canvas prefix, so a plugin never names that prefix.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from 'acrylblends'

export const name = 'route-page-basic'
export const inject = ['router']

const page = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Hello</title></head>
  <body>
    <main>
      <h1>Hello</h1>
      <p id="greeting">...</p>
      <script type="module">
        const answer = await fetch('/hello/greeting').then((response) => response.json())
        document.getElementById('greeting').textContent = answer.text
      </script>
    </main>
  </body>
</html>`

export function apply(ctx: Context): void {
  const app = new Acryl()
    .get('/', (c) => c.html(page))
    .get('/greeting', (c) => c.json({ text: 'Hello from a plugin' }))
  ctx.router.route('/hello', app)
}
