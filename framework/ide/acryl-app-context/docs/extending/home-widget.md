# A home widget: UI on the app's first screen

The canvas shows the app's first screen. A plugin puts its UI there with a widget: `ctx.home.widget({ id, title, render })`, from the `home`
row's service. The first screen renders every widget at each request, and a widget leaves with the plugin that registered it.

```ts
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from 'acrylblends'
import type {} from '../home/index.ts'

export const name = 'counter'
export const inject = ['router', 'home']

export function apply(ctx: Context): void {
  let count = 0
  ctx.router.route('/counter', new Acryl().post('/count', (c) => c.json({ count: ++count })))
  ctx.effect(() =>
    ctx.home.widget({
      id: 'counter',
      title: 'Counter',
      render: () => `<output id="counter-count">${count}</output>
<button id="counter-add" type="button">Add one</button>
<script type="module">
  document.getElementById('counter-add').addEventListener('click', async () => {
    const answer = await fetch('/counter/count', { method: 'POST' }).then((response) => response.json())
    document.getElementById('counter-count').textContent = String(answer.count)
  })
</script>`,
    }),
  )
}
```

- `id` is the plugin's name. `title` is the widget's heading (the page escapes it). `render()` returns the widget's HTML and may be async; it
  runs at each request of the first screen, so it shows the plugin's current data.
- Register inside `ctx.effect(() => ctx.home.widget(...))`: the effect gives the widget's disposer to the plugin, so switching the plugin off
  takes the widget off the page. A widget registered outside an effect stays after the plugin is gone.
- The HTML is inserted into the page as it is: escape every piece of user text (`&`, `<`, `>`, `"`), as `state-json-file` does.
- The widget's script talks to the plugin's own routes by the app's paths (`fetch('/counter/count')`), never `/app/...`. Prefix element ids with
  the plugin's name: every widget shares the page.
- The page is server-rendered: after a change the script either updates the elements it owns or calls `location.reload()`.
- The section the page draws is `<section class="widget" data-widget="<id>">`: a test asserts the widget by that attribute, and
  `.acryl/bin/acryl look` shows its heading and content.
- The page styles that section as a card in the frame's look, light or dark with the system, and the plain HTML inside it: a list, a form,
  inputs, buttons, links and an `<output>`. Write plain elements without classes or a `<style>` and the widget looks finished; add a `<style>`
  only for what is special to the widget, with selectors under `[data-widget="<id>"]` so no other widget changes.

Examples: `../example-plugins/packages/home-widget-basic/` (a widget with its own route) and `../example-plugins/packages/state-json-file/`
(a widget over data kept in a file, with a form).
