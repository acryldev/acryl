import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ShortcutBinding, ShortcutCommandId, Shortcuts } from '@acryl/ui/frame'

/** One command as `ctx.shortcuts.register` takes it. */
type ShortcutRegistration = Parameters<Shortcuts['register']>[0]
import { ShortcutsSection } from './ShortcutsSection.tsx'
import { installShortcutsStyles } from './styles.ts'

export const name = 'acryl-shortcuts-client'
export const inject = ['shortcuts']

/**
 * ACRYL's keyboard commands, registered on DSH's own shortcut service (`ctx.shortcuts`, DSH 0.2), and Settings > Shortcuts, which lists and
 * rebinds every command on that service.
 *
 * DSH owns the registry and the persisted rebinding, so a command registered here also shows in DSH's "Edit shortcuts" dialog. A command
 * only announces itself with a window event; the plugin that owns the feature listens, so no package imports another's values (a sibling's
 * built client bundle has no statically analyzable named exports).
 */

/** Window event the palette owner (`acryl-workspace`) listens for. Keep the string in step with its listener. */
export const PALETTE_TOGGLE_EVENT = 'acryl:toggle-command-palette'

/** Stable id in DSH's shortcut catalog. */
export const PALETTE_COMMAND_ID = 'acryl.command-palette.toggle' as ShortcutCommandId

/** Dictionary namespace for the section's name in the Settings list. */
const LOCALE_NAMESPACE = 'acryl.shortcuts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'acryl.shortcuts': 'nav'
  }
}

/**
 * Cmd/Ctrl+Shift+P. The palette's old Cmd/Ctrl+Shift+K overlaps upstream's `session.search` (Cmd/Ctrl+K), and DSH's registry refuses overlapping
 * defaults. A Web page on Linux may only bind a short list of combinations, so that profile gets no default (the command is still listed and bindable).
 */
const PALETTE_BINDING: ShortcutBinding = { code: 'KeyP', modifiers: ['primary', 'shift'] }

export function apply(ctx: ClientContext): void {
  ctx.effect(() => registerPalette(ctx), 'acryl-shortcuts: toggle command palette')
  // A child plugin: the section waits for the Settings slots and the locale service, the shortcuts above do not.
  ctx.plugin({
    name: 'acryl-shortcuts-settings',
    inject: ['slots', 'locale'],
    apply(child: ClientContext): void {
      child.effect(() => child.locale.register(LOCALE_NAMESPACE, { en: { nav: 'Shortcuts' }, zh: { nav: '快捷键' } }), 'acryl-shortcuts: dictionary')
      child.effect(() => installShortcutsStyles(), 'acryl-shortcuts: styles')
      const t = child.locale.bind(LOCALE_NAMESPACE)
      child.slots.inject('settings.section', () => child.slots.register({
        name: 'settings.section',
        id: 'acryl-shortcuts',
        // After ACRYL's Agents (40), Tabs (41) and Command palette (42).
        order: 43,
        label: () => t('nav'),
        locale: LOCALE_NAMESPACE,
        inject: () => ({ shortcuts: ctx.shortcuts }),
      }, ShortcutsSection))
    },
  })
}

/**
 * The palette's shortcut as registered: the same keys everywhere a page may take them, working from anywhere in the window (a focused
 * terminal or text field too). Web on Linux has no default: a browser there lets a page take only Ctrl+/, Ctrl+Shift+, and Ctrl+Shift+.
 * (DSH's `isWebBindingAllowed`), and DSH refuses a whole registration with one refused default, which took the palette's shortcut away
 * everywhere.
 * @param run - what pressing it does.
 */
export function paletteShortcut(run: () => void): ShortcutRegistration {
  return {
    id: PALETTE_COMMAND_ID,
    label: () => 'Toggle command palette',
    aliases: ['palette', 'commands', 'quick open'],
    defaults: {
      'desktop:macos': PALETTE_BINDING,
      'desktop:windows': PALETTE_BINDING,
      'desktop:linux': PALETTE_BINDING,
      'web:macos': PALETTE_BINDING,
      'web:windows': PALETTE_BINDING,
    },
    regions: ['page', 'editable', 'terminal'],
    modals: [],
    resolve: () => ({ status: 'handled', run }),
  }
}

/** A refused registration (a reserved or conflicting default) costs this one command, never the plugin or the page boot. */
function registerPalette(ctx: ClientContext): () => void {
  try {
    return ctx.shortcuts.register(paletteShortcut(() => { window.dispatchEvent(new CustomEvent(PALETTE_TOGGLE_EVENT)) }))
  } catch (cause) {
    ctx.logger.warn(`acryl-shortcuts: could not register the command palette shortcut: ${cause instanceof Error ? cause.message : String(cause)}`)
    return () => {}
  }
}
