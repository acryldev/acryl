/**
 * Starter client entry. This plugin has no dependency on @acryl/ui - every component under
 * `ui/` was copied here by `acryl ui add <id> .` and is now this plugin's own source, free to
 * edit. Add components with more `acryl ui add`, import them below, and build them into a
 * screen. The slot registration below is the same one-line pattern @acryl/ui's own
 * `settingsSection` helper uses internally (spec 038-ui-component-library); it is inlined here
 * so this plugin needs no import from the library it copied source out of.
 */
import type { Context } from '@deepseek-ai/cordis'
import { createElement as h } from 'react'

interface SlotContext {
  slots: { inject(slot: string, register: () => unknown): unknown, register(options: { name: string, id: string, order: number, label?: string }, component: React.ComponentType<never>): unknown }
}

function Placeholder() {
  return h('div', { style: { padding: '1rem' } },
    h('h2', null, 'my-ui-plugin'),
    h('p', null, 'Run `acryl ui add <id> .` from this plugin\'s directory, then import the added component here.'))
}

export const inject = ['slots']

/**
 * Register a Settings page. Replace `Placeholder` with a component imported
 * from `ui/<name>/<Name>.tsx` once you've added one.
 * @param ctx - client plugin context.
 */
export function apply(ctx: Context): void {
  const slots = (ctx as unknown as SlotContext).slots
  ctx.effect(() => slots.inject('settings.section', () =>
    slots.register({ name: 'settings.section', id: 'my-ui-plugin', order: 90, label: 'My plugin' }, Placeholder)))
}
