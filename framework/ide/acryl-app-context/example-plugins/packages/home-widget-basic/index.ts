/**
 * A widget on the app's home page: a count and a button that adds one, backed by the plugin's own routes.
 *
 * The widget is registered with `ctx.home.widget` inside `ctx.effect`, so it leaves the page with the plugin (switched off in Settings > Plugins,
 * its row disabled, or the plugin removed). Its HTML is rendered into the home page at each request, so the page's tests and the door's `look`
 * see it. Its script calls the plugin's routes by the app's own paths (`/home-widget-basic/count`); the frame serves them under its prefix.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from 'acrylblends'
import type {} from '../home/index.ts'

export const name = 'home-widget-basic'
export const inject = ['router', 'home']

export function apply(ctx: Context): void {
  // Kept in memory: it starts at 0 whenever the plugin starts. A value that must survive a restart lives in a file (see state-json-file).
  let count = 0
  const app = new Acryl()
    .get('/count', (c) => c.json({ count }))
    .post('/count', (c) => {
      count += 1
      return c.json({ count })
    })
  ctx.router.route('/home-widget-basic', app)
  ctx.effect(() =>
    ctx.home.widget({
      id: 'home-widget-basic',
      title: 'Counter',
      render: () => `<p><output id="home-widget-basic-count">${count}</output> clicks</p>
<button id="home-widget-basic-add" type="button">Add one</button>
<script type="module">
  const output = document.getElementById('home-widget-basic-count')
  document.getElementById('home-widget-basic-add').addEventListener('click', async () => {
    const answer = await fetch('/home-widget-basic/count', { method: 'POST' }).then((response) => response.json())
    output.textContent = String(answer.count)
  })
</script>`,
    }),
  )
}
