import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../plugins/acryl-router/src/index.ts'
import { type Home, renderWidgets } from '../plugins/home/index.ts'
import { aboutPage } from './about.tsx'
import { FIRST_PAGE_MARKER } from './first-page.ts'

export const APP_NAME = '__APP_NAME__'

/**
 * The only place the app's mount prefix is named. On its own server (production, `npm start`) the app mounts at the root and
 * its public URLs are `/`, `/about`, `/health`; when the ACRYL frame hosts it (`npm run dev`) the routes mount here, and the
 * frame opens its tile at `/app` (`/app/` answers too). Every page link and asset URL this template writes is derived from the prefix it is
 * mounted at, so the same source serves both.
 */
export const FRAME_MOUNT_PREFIX = '/app'

/** The scaffold's name comes from the folder, so the first screen escapes it like any other user text. */
const escapeHtml = (text: string): string =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

/**
 * The first screen: the page a browser gets at the root, which is what the ACRYL frame's first tile shows. A blank app whose root answered JSON to
 * every client gave the tile Chrome's JSON viewer, nearly invisible in the frame's dark surface (owner review, 2026-11-02); the root now answers a page
 * to a browser and the JSON hello to everything else, the way the agent template does. The About link is relative, so it works under the frame's /app
 * mount and on the app's own server alike.
 */
const homePage = (name: string, widgets: string): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(name)}</title>
    <style>:root{color-scheme:light dark;background:Canvas;color:CanvasText}body{margin:2rem auto;max-width:44rem;padding:0 1rem;font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}h1{font-size:1.6rem;margin:0 0 .5rem}a{color:#5468ff}code{font:.9em ui-monospace,"SF Mono",Menlo,monospace}</style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(name)}</h1>
      <p>Your app is running. ${FIRST_PAGE_MARKER}; edit <code>src/routes.ts</code> to change it.</p>
      <p><a href="./about">About</a></p>
      ${widgets}
    </main>
  </body>
</html>`

/**
 * The app's own pages and routes, mountable at any prefix: the standalone server mounts it at the root, the frame host at {@link FRAME_MOUNT_PREFIX}.
 * The first screen shows the widgets of the app's plugins (`ctx.home`), read at each request, so a plugin switched on or off shows at the next load.
 */
export function makeApp(home: Home, name: () => string = () => APP_NAME): Acryl {
  return (
    new Acryl()
      // A browser gets the first screen; an API client gets the JSON hello.
      .get('/', async (c) =>
        (c.req.header('accept') ?? '').includes('text/html')
          ? c.html(homePage(name(), await renderWidgets(home)))
          : c.json({ app: name(), ok: true }),
      )
      .get('/health', (c) => c.json({ ok: true }))
      .get('/about', (c) => c.html(aboutPage()))
  )
}

/** The app's own routes: an `App` mounted on the router at `options.prefix` (empty or absent: the root). The mount is removed when this plugin is disposed. */
export const routes = {
  name: 'routes',
  inject: ['router', 'home'],
  apply(ctx: Context, options: { readonly prefix?: string } = {}) {
    const prefix = options.prefix ?? ''
    // The name the app has now (Settings > App renames it), else the one the scaffold was made with.
    ctx.router.route(
      prefix === '' ? '/' : prefix,
      makeApp(ctx.home, () => ctx.get('appInstance')?.name ?? APP_NAME),
    )
  },
}
