/**
 * The showcase's cards: what each plugin in the app is, who made it and where to find what it adds. Pure, so the page, the stream and the tests
 * render the same thing.
 */
import type { SharedPluginInfo } from '../plugin-share/index.ts'

/** One plugin as the showcase shows it. */
export interface ShowcaseCard {
  readonly name: string
  /** The release's version, or the installed content's short digest for a plugin without one. */
  readonly version: string
  readonly state: string
  /** The GitHub login of whoever released it; absent for a plugin made in this app or pulled from a local file. */
  readonly author?: string
  /** Where it came from: the pulled source, or `this app`. */
  readonly source: string
  /** The pages it serves (`GET` routes without parameters), as the plugin wrote them. */
  readonly pages: readonly string[]
  /** It has a widget on the home page. */
  readonly widget: boolean
  /** The tool of its name, when it registered one. */
  readonly tool?: string
}

/** What else the app knows about its plugins: the tools registered and the home page's widgets, by name. */
export interface Offered {
  readonly tools: readonly string[]
  readonly widgets: readonly string[]
}

/** A GitHub login: what `author` must look like before the page links to github.com. */
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/u

/** A path a person can open: no `:param`, no wildcard. */
const PAGE = /^\/[^:*]*$/u

/** The cards, one per plugin, in the order the app lists them. */
export function showcaseCards(
  plugins: readonly SharedPluginInfo[],
  offered: Offered,
): ShowcaseCard[] {
  return plugins.map((plugin) => {
    const pages = [
      ...new Set(
        plugin.routes
          .filter((route) => route.method === 'GET' && PAGE.test(route.path))
          .map((route) => route.path),
      ),
    ]
    return {
      name: plugin.name,
      version: plugin.release ?? plugin.version,
      state: plugin.state,
      ...(plugin.author !== undefined && LOGIN.test(plugin.author)
        ? { author: plugin.author }
        : {}),
      source: plugin.pulledFrom ?? 'this app',
      pages,
      widget: offered.widgets.includes(plugin.name),
      ...(offered.tools.includes(plugin.name) ? { tool: plugin.name } : {}),
    }
  })
}

const escapeHtml = (text: string): string =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

/**
 * The path the app is served at, read from the showcase's own request path: `''` on the app's own server, `/app` in the frame. Links are built from it,
 * because a relative link cannot name the app's root (`./` from `/app/showcase` is `/app/`, which the app does not serve).
 */
export function appBase(requestPath: string): string {
  const at = requestPath.lastIndexOf('/showcase')
  return at <= 0 ? '' : requestPath.slice(0, at)
}

/** A path of the app as the browser asks for it: under `base`, and the root as `base` itself (or `/`). */
const inApp = (base: string, path: string): string =>
  path === '/' ? base || '/' : `${base}${path}`

/** The cards as HTML: the list the page shows, and what the stream sends on each change. Every value is escaped. */
export function renderCards(cards: readonly ShowcaseCard[], base = ''): string {
  if (cards.length === 0)
    return '<p class="empty">No plugins yet. Pull one: <code>npm run acryl -- plugin pull github:&lt;owner&gt;/&lt;repo&gt;</code>, or a group\'s list with <code>--from group.txt</code>.</p>'
  return cards
    .map((card) => {
      const author =
        card.author === undefined
          ? '<span class="dim">made here</span>'
          : `<a href="https://github.com/${escapeHtml(card.author)}" target="_blank" rel="noopener">@${escapeHtml(card.author)}</a>`
      const links = [
        ...card.pages.map(
          (page) => `<a href="${escapeHtml(inApp(base, page))}">${escapeHtml(page)}</a>`,
        ),
        ...(card.widget ? [`<a href="${escapeHtml(inApp(base, '/'))}">home widget</a>`] : []),
        ...(card.tool === undefined
          ? []
          : [
              `<span title="the app's agent can call it">tool <code>${escapeHtml(card.tool)}</code></span>`,
            ]),
      ]
      return [
        `<article class="card" data-plugin="${escapeHtml(card.name)}" data-state="${escapeHtml(card.state)}">`,
        `<header><h2>${escapeHtml(card.name)}</h2><p class="meta"><span class="version">${escapeHtml(card.version)}</span><span class="state state-${escapeHtml(card.state)}">${escapeHtml(card.state)}</span></p></header>`,
        `<p class="author">${author}</p>`,
        `<p class="source"><code>${escapeHtml(card.source)}</code></p>`,
        links.length === 0
          ? '<p class="dim">no page of its own</p>'
          : `<p class="links">${links.join(' ')}</p>`,
        '</article>',
      ].join('')
    })
    .join('\n')
}

const STYLES = `:root{--bg:#fff;--surface:#f7f7f9;--border:#e2e2e8;--text:#18181b;--dim:#6b6b75;--accent:#5468ff;--ok:#2f9e44;--warn:#d9480f;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#0b0b0d;--surface:#18181b;--border:#2a2a2f;--text:#e8e8ea;--dim:#8b8b93;color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;padding:24px 16px;background:var(--bg);color:var(--text);font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1080px;margin:0 auto}
h1{margin:0 0 4px;font-size:20px}
.lead{margin:0 0 20px;color:var(--dim)}
#cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
.card{padding:14px 16px;border:1px solid var(--border);border-radius:12px;background:var(--surface);min-width:0}
.card header{margin-bottom:8px}
.card h2{margin:0 0 4px;font-size:15px;font-weight:600;overflow-wrap:anywhere}
.card .meta{display:flex;align-items:center;gap:8px;margin:0}
.version{color:var(--dim);font-variant-numeric:tabular-nums}
.state{padding:1px 8px;border-radius:999px;border:1px solid var(--border);font-size:12px;color:var(--dim)}
.state-active{color:var(--ok);border-color:currentColor}
.state-failed,.state-pending{color:var(--warn);border-color:currentColor}
.card p{margin:4px 0}
.source code{font-size:12px;color:var(--dim);overflow-wrap:anywhere}
.links{display:flex;flex-wrap:wrap;gap:6px 12px}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
.dim,.empty{color:var(--dim)}
#live{font-size:12px;color:var(--dim)}`

/** The whole page; the script follows the stream and replaces the cards on each change. */
export function renderPage(cards: readonly ShowcaseCard[], base = ''): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Showcase</title><style>${STYLES}</style></head>
<body><main>
<h1>Showcase</h1>
<p class="lead">Every plugin in this app, who made it and where it came from. <span id="live" role="status"></span></p>
<section id="cards" aria-live="polite">${renderCards(cards, base)}</section>
</main>
<script type="module">
const cards = document.getElementById('cards')
const live = document.getElementById('live')
const events = new EventSource(${JSON.stringify(`${base}/showcase/events`).replaceAll('<', '\\u003c')})
events.addEventListener('cards', (event) => { cards.innerHTML = event.data; live.textContent = 'live' })
events.onerror = () => { live.textContent = 'reconnecting...' }
</script>
</body></html>`
}
