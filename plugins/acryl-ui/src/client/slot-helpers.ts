import type { Context } from '@deepseek-ai/cordis'
import type { ComponentType } from 'react'

interface SlotContext {
  slots: { inject(slot: string, register: () => unknown): unknown, register(options: { name: string, id: string, order: number, label?: string }, component: ComponentType<never>): unknown }
}

/**
 * Register a component in a slot: `ctx.slots.inject(<slot>, () => ctx.slots.register(...))`, so registration waits for the slot's own declaration and load order does not
 * matter. The consumer declares `inject = ['slots']`.
 */
const slotHelper = (slot: string) => (ctx: Context, { id, order = 50, label }: { id: string, order?: number, label?: string }, component: ComponentType<never>): unknown => {
  const slots = (ctx as unknown as SlotContext).slots
  return slots.inject(slot, () => slots.register({ name: slot, id, order, ...(label === undefined ? {} : { label }) }, component))
}

export const footerAction = slotHelper('sidebar.footer.action')
export const headerAction = slotHelper('conversation.session.header.actions')
export const sidebarTab = slotHelper('sidebar.right.pane.tab')
export const settingsSection = slotHelper('settings.section')
