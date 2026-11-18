import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import * as home from '../index.ts'

test('a widget is on the page while its plugin runs and leaves with it', async () => {
  const root = new Context()
  await root.plugin(home).await()
  const notes = root.plugin({
    name: 'notes',
    inject: ['home'],
    apply(ctx: Context) {
      ctx.effect(() =>
        ctx.home.widget({
          id: 'notes',
          title: 'Notes <1>',
          render: () => '<div id="notes"></div>',
        }),
      )
    },
  })
  await notes.await()
  const page = await home.renderWidgets(root.home)
  assert.match(page, /<section class="widget" data-widget="notes">/)
  assert.match(page, /<h2>Notes &lt;1&gt;<\/h2>/)
  assert.match(page, /<div id="notes"><\/div>/)
  // The widgets come with the frame's card look, once, before them.
  assert.ok(page.startsWith(`<style data-home-widgets>${home.WIDGET_STYLES}</style>`))
  assert.match(home.WIDGET_STYLES, /^\.widget\{/)
  // A row's own button sits at the right at its size, after a text node or an element alike, never stretched.
  assert.match(home.WIDGET_STYLES, /\.widget li>:last-child:is\(button,form\)\{margin-left:auto\}/)
  assert.doesNotMatch(home.WIDGET_STYLES, /li>:first-child\{flex:1\}/)
  for (const rule of home.WIDGET_STYLES.split('\n'))
    assert.ok(rule.startsWith('.widget') || rule.startsWith('@media'), rule)

  await notes.dispose()
  assert.equal(await home.renderWidgets(root.home), '')
})

test('a widget that throws shows one line and the page still renders', async () => {
  const registry = home.createHome()
  registry.widget({
    id: 'broken',
    title: 'Broken',
    render: () => {
      throw new Error('no <data>')
    },
  })
  registry.widget({ id: 'fine', title: 'Fine', render: async () => '<p>ok</p>' })
  const page = await home.renderWidgets(registry)
  assert.match(page, /could not be shown: no &lt;data&gt;/)
  assert.match(page, /<p>ok<\/p>/)
})

test('a widget id is a plugin name and is unique on the page', () => {
  const registry = home.createHome()
  assert.throws(
    () => registry.widget({ id: 'Notes!', title: 'x', render: () => '' }),
    /plugin name/,
  )
  const stop = registry.widget({ id: 'notes', title: 'x', render: () => '' })
  assert.throws(
    () => registry.widget({ id: 'notes', title: 'y', render: () => '' }),
    /already has a widget "notes"/,
  )
  stop()
  stop()
  registry.widget({ id: 'notes', title: 'y', render: () => '' })
  assert.deepEqual(
    registry.widgets().map((widget) => widget.title),
    ['y'],
  )
})
