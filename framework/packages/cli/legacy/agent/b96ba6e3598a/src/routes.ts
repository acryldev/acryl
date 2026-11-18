import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../plugins/acryl-router/src/index.ts'
import { bodyLimit } from '../plugins/acryl-router/src/middleware/index.ts'
import type {} from '../plugins/agent/index.ts'
import type {} from '../plugins/extensions/index.ts'
import type {} from '../plugins/tasks/index.ts'

export const APP_NAME = '__APP_NAME__'

/** The only place the app's mount prefix is named: the root on its own server (`npm start`), `/app` when the ACRYL frame hosts it (`npm run dev`). */
export const FRAME_MOUNT_PREFIX = '/app'

/** The door's page script (`.acryl/bin/acryl look` and `act`), in development only: `src/app.ts` leaves the door out in production and with ACRYL_DOOR=off. */
const DOOR_TAG =
  process.env.NODE_ENV !== 'production' && process.env.ACRYL_DOOR !== 'off'
    ? '<script type="module" src="/api/acryl-door/page.js"></script>'
    : ''

/**
 * The app's own routes on the router. Always: the page and `GET /health`. While the agent, the extensions and the task recorder run: `POST /ask` for the agent; `GET /extensions`
 * (and `POST /extensions/approve` and `/deny`) and `GET /tasks` to observe and steer what it did (every run is a durable task owning one task per tool call); `POST /tasks/cancel`.
 * What changes is also streamed: `GET /api/state/tasks/events` and `GET /api/state/extensions/events` (a page follows them with `watch` of `/api/state/client.js`, over one WebSocket). In production `src/app.ts` leaves the agent and builder rows out
 * and starts the extensions read-only (unless `ACRYL_PRODUCTION_KEEP` names them), and then those routes are not mounted at all. The mounts are removed when the plugin is disposed.
 */
/**
 * The app's look: the person's choice from /settings (kept in this browser), as `GET /appearance.js`. One script tag in a page's head (`<script src="/appearance.js"></script>`) applies it
 * before the page paints, again whenever another window of the app changes it (the `storage` event), and defines the colours as custom properties for the page to use:
 * `--bg`, `--fg`, `--muted`, `--surface`, `--border`, `--accent` (`html[data-theme=dark|light]` is set when the person chose one, and the system's choice decides otherwise). A page the agent builds
 * carries the tag and colours itself with `var(--bg)` and the rest, and so follows Dark and Light.
 */
const APPEARANCE_JS = `(function () {
  var root = document.documentElement
  function apply() {
    var saved
    try { saved = localStorage.getItem('theme') } catch (e) { /* storage blocked: follow the system */ }
    if (saved === 'dark' || saved === 'light') root.dataset.theme = saved
    else delete root.dataset.theme
  }
  apply()
  addEventListener('storage', function (event) { if (event.key === null || event.key === 'theme') apply() })
  var light = '--bg:#ffffff;--fg:#111827;--muted:#6b7280;--surface:#f3f4f6;--border:#d1d5db;--accent:#2563eb'
  var dark = '--bg:#111827;--fg:#f9fafb;--muted:#9ca3af;--surface:#1f2937;--border:#374151;--accent:#60a5fa'
  var style = document.createElement('style')
  style.id = 'appearance'
  style.textContent = ':root{color-scheme:light dark;' + light + '}'
    + '@media (prefers-color-scheme:dark){html:not([data-theme]){' + dark + '}}'
    + 'html[data-theme=dark]{color-scheme:dark;' + dark + '}'
    + 'html[data-theme=light]{color-scheme:light;' + light + '}'
    + 'html{background:var(--bg);color:var(--fg)}'
  ;(document.head || root).appendChild(style)
})()
`
/** The home and settings pages' own layout; their colours come from /appearance.js. */
const APPEARANCE_STYLE =
  '<style>body{font:16px system-ui,sans-serif;margin:2rem auto;max-width:42rem;padding:0 1rem}a{color:inherit}</style>'
const appearanceScript = (prefix: string) => `<script src="${prefix}/appearance.js"></script>`

/** `/settings`: the one setting the template has, the appearance. The desktop app's Settings menu item opens this page. */
const settingsPage = (prefix: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Settings - ${APP_NAME}</title>${APPEARANCE_STYLE}${appearanceScript(prefix)}</head><body><h1>Settings</h1><p><label for="theme">Appearance</label> <select id="theme" name="theme"><option value="system">Match the system</option><option value="light">Light</option><option value="dark">Dark</option></select></p><p id="saved" role="status"></p><p><a href="${prefix}/">Back to ${APP_NAME}</a></p><script>(function(){var select=document.getElementById('theme'),saved=document.getElementById('saved');try{select.value=localStorage.getItem('theme')||'system'}catch(e){}select.addEventListener('change',function(){var value=select.value;try{if(value==='system'){localStorage.removeItem('theme');delete document.documentElement.dataset.theme}else{localStorage.setItem('theme',value);document.documentElement.dataset.theme=value}saved.textContent='Saved: '+select.options[select.selectedIndex].text}catch(e){saved.textContent='This browser would not keep the setting.'}})})()</script></body></html>`

/**
 * The app's own pages and routes, mountable at any prefix: the standalone server mounts it at the root, the frame row at {@link FRAME_MOUNT_PREFIX}.
 * Every absolute URL a page writes is derived from the prefix it is mounted at.
 */
export function makeApp(prefix = ''): Acryl {
  const limit = bodyLimit({ maxSize: 64 * 1024 })
  return (
    new Acryl()
      .use(limit)
      // A browser gets a page (the door's and the agent panel's script tags are added where they are mounted); everything else gets the JSON.
      .get('/', (c) =>
        (c.req.header('accept') ?? '').includes('text/html')
          ? c.html(
              `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${APP_NAME}</title>${APPEARANCE_STYLE}${appearanceScript(prefix)}</head><body><h1>${APP_NAME}</h1><p>This app runs an agent unless it is switched off (production switches it off, see ACRYL_PRODUCTION_KEEP in AGENTS.md). In ACRYL, ask it for a change in the chat beside the app (or with <code>POST /ask</code>); published with the assistant on, it helps visitors use the app without changing it.</p>${DOOR_TAG}</body></html>`,
            )
          : c.json({ app: APP_NAME, ok: true }),
      )
      .get('/health', (c) => c.json({ ok: true }))
      .get('/settings', (c) => c.html(settingsPage(prefix)))
      .get('/appearance.js', (c) =>
        c.body(APPEARANCE_JS, 200, {
          'content-type': 'text/javascript; charset=utf-8',
          'cache-control': 'no-cache',
        }),
      )
  )
}

/** The app's own routes: an `App` mounted on the router at `options.prefix` (empty or absent: the root). */
export const routes = {
  name: 'routes',
  inject: ['router'],
  apply(ctx: Context, options: { readonly prefix?: string; readonly agentRoutes?: boolean } = {}) {
    const prefix = options.prefix ?? ''
    // A body here is a name, an id or a question; anything bigger is refused before it is read.
    const json = async (c: {
      req: { json(): Promise<unknown> }
    }): Promise<Record<string, unknown>> => {
      const body = await c.req.json().catch(() => undefined)
      return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
    }
    const limit = bodyLimit({ maxSize: 64 * 1024 })
    // The app's own page and routes at the one prefix; the agent routes below mount at the same prefix.
    ctx.router.route(prefix === '' ? '/' : prefix, makeApp(prefix))
    // The routes that give a visitor the agent: mounted only while the agent, the extensions and the tasks run (see the header).
    // `agentRoutes: false` (the production Assistant) keeps them unmounted although the agent runs.
    if (options.agentRoutes === false) return
    ctx.inject(['agent', 'extensions', 'tasks'], (inner) => {
      const app = new Acryl().use(limit).get('/extensions', (c) =>
        c.json({
          installed: inner.extensions.list(),
          notInstalled: inner.extensions.pending(),
          waitingForApproval: inner.extensions.approvals(),
        }),
      )
      // The owner's decision on an install that is waiting (the `approval` parameter in blend.yaml).
      for (const [path, decide] of [
        ['/extensions/approve', (name: string) => inner.extensions.approve(name)],
        ['/extensions/deny', (name: string) => inner.extensions.deny(name)],
      ] as const) {
        app.post(path, async (c) => {
          const { name } = await json(c)
          if (typeof name !== 'string') return c.json({ error: 'name must be a string' }, 400)
          return c.json(await decide(name))
        })
      }
      app
        .get('/tasks', (c) => c.json(inner.tasks.list().slice(0, 100)))
        .post('/tasks/cancel', async (c) => {
          const { id } = await json(c)
          if (typeof id !== 'string' || !inner.tasks.get(id))
            return c.json({ error: 'no such task' }, 404)
          return c.json({ cancelled: inner.tasks.cancel(id) })
        })
        .post('/ask', async (c) => {
          const { question } = await json(c)
          if (typeof question !== 'string')
            return c.json({ error: 'question must be a string' }, 400)
          return c.json(await inner.agent.run(question))
        })
      inner.router.route(prefix === '' ? '/' : prefix, app)
    })
  },
}
