/**
 * The app's home page as a place plugins put their widgets (`ctx.home`).
 *
 * A feature is its own plugin, so its UI must reach the page without anyone editing the page's code: a plugin registers a widget, the home page
 * renders every widget registered at the time of the request, and the widget leaves the page with the plugin that registered it (switched off in
 * Settings > Plugins, removed, or reloaded). The widget is HTML rendered into the page itself, not a frame, so the page, its tests and the door's
 * `look` all see it.
 *
 * A widget names its plugin's URLs as the app's own server answers them (`/notes/widget.js`, `fetch('/notes/items')`): on `npm start` they are at the
 * root, and in the frame the canvas page sends them to the same routes under its prefix.
 */
import type { Context } from '@deepseek-ai/cordis'

/** One widget on the home page. */
export interface HomeWidget {
  /** Unique on the page: the name of the plugin that registers it. */
  readonly id: string
  /** The widget's heading; the page escapes it. */
  readonly title: string
  /** The widget's HTML, rendered into the page at each request. It is inserted as it is: escape any user text in it. */
  render(): string | Promise<string>
}

export interface Home {
  /**
   * Put a widget on the home page. Call it inside `ctx.effect` so the widget leaves with the plugin:
   * `ctx.effect(() => ctx.home.widget({ id: 'notes', title: 'Notes', render: () => '<div id="notes"></div>' }))`.
   * @returns the disposer, which takes the widget off the page.
   * @throws when a widget with the same id is already on the page.
   */
  widget(widget: HomeWidget): () => void
  /** The widgets on the page now, in the order they were registered. */
  widgets(): readonly HomeWidget[]
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    home: Home
  }
}

const ID = /^[a-z0-9][a-z0-9-]*$/

export function createHome(): Home {
  const registered = new Map<string, HomeWidget>()
  return {
    widget(widget) {
      if (!ID.test(widget.id))
        throw new Error(
          `a widget id is a plugin name (lowercase letters, digits and dashes), not "${widget.id}"`,
        )
      if (registered.has(widget.id))
        throw new Error(
          `the home page already has a widget "${widget.id}", the plugin ${widget.id}'s; a widget's id is the name of the plugin that puts it there`,
        )
      registered.set(widget.id, widget)
      return () => {
        if (registered.get(widget.id) === widget) registered.delete(widget.id)
      }
    },
    widgets: () => [...registered.values()],
  }
}

const escapeHtml = (text: string): string =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

/**
 * The widgets' look, the ACRYL frame's plain one: each widget a card, and the plain HTML a widget writes (a list, a form, inputs, buttons, an output)
 * styled inside it, light or dark with the person's system. Every selector is under `.widget`, so the page around the widgets keeps its own styles,
 * and a widget's own `<style>` still wins (it comes later on the page).
 */
export const WIDGET_STYLES = `.widget{--widget-bg:#fff;--widget-surface:#f7f7f9;--widget-border:#e2e2e8;--widget-text:#18181b;--widget-dim:#6b6b75;--widget-accent:#5468ff;--widget-accent-dim:rgba(84,104,255,.18);color-scheme:light;margin:16px 0;padding:16px 18px;border:1px solid var(--widget-border);border-radius:12px;background:var(--widget-surface);color:var(--widget-text);font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
@media (prefers-color-scheme:dark){.widget{--widget-bg:#0b0b0d;--widget-surface:#18181b;--widget-border:#2a2a2f;--widget-text:#e8e8ea;--widget-dim:#8b8b93;color-scheme:dark}}
.widget h2{margin:0 0 12px;font-size:15px;font-weight:600}
.widget p{margin:0 0 10px}
.widget p:last-child,.widget ul:last-child,.widget ol:last-child,.widget form:last-child{margin-bottom:0}
.widget ul,.widget ol{list-style:none;margin:0 0 12px;padding:0}
.widget li{display:flex;align-items:center;gap:8px;padding:7px 0;border-top:1px solid var(--widget-border);overflow-wrap:anywhere}
.widget li:first-child{border-top:0}
.widget li>:last-child:is(button,form){margin-left:auto}
.widget a{color:var(--widget-accent);text-decoration:none}
.widget a:hover{text-decoration:underline}
.widget form{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 10px}
.widget input,.widget textarea,.widget select{flex:1 1 140px;min-width:0;padding:7px 10px;border:1px solid var(--widget-border);border-radius:8px;background:var(--widget-bg);color:inherit;font:inherit}
.widget input::placeholder,.widget textarea::placeholder{color:var(--widget-dim)}
.widget input:focus,.widget textarea:focus,.widget select:focus{outline:2px solid var(--widget-accent-dim);border-color:var(--widget-accent)}
.widget button{padding:7px 14px;border:0;border-radius:8px;background:var(--widget-accent);color:#fff;font:inherit;font-weight:500;cursor:pointer}
.widget button:hover{filter:brightness(1.1)}
.widget li button{flex:none;padding:3px 10px;border:1px solid var(--widget-border);background:transparent;color:var(--widget-dim);font-weight:400}
.widget output{font-weight:600;font-variant-numeric:tabular-nums}
.widget [role=alert]{color:#d9480f}`

/**
 * The widgets as one block of the page: their styles ({@link WIDGET_STYLES}), then a `<section data-widget="<id>">` with the heading and the
 * widget's HTML for each; nothing at all when there is no widget. A widget whose render throws shows one line saying so, and the page still renders.
 */
export async function renderWidgets(home: Home): Promise<string> {
  const sections = await Promise.all(
    home.widgets().map(async (widget) => {
      let body: string
      try {
        body = await widget.render()
      } catch (cause) {
        body = `<p role="alert">This widget could not be shown: ${escapeHtml(cause instanceof Error ? cause.message : String(cause))}</p>`
      }
      return `<section class="widget" data-widget="${escapeHtml(widget.id)}">\n<h2>${escapeHtml(widget.title)}</h2>\n${body}\n</section>`
    }),
  )
  return sections.length === 0
    ? ''
    : [`<style data-home-widgets>${WIDGET_STYLES}</style>`, ...sections].join('\n')
}

/** Provides `ctx.home`. Mount it before the routes that render the home page and before the plugins that put widgets on it. */
export const name = 'home'

export function apply(ctx: Context): void {
  ctx.provide('home', createHome())
}
