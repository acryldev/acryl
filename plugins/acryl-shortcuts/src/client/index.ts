import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ShortcutBinding, ShortcutCommandId } from '@deepseek-ai/dsh-client-shortcuts/client'

export const name = 'acryl-shortcuts-client'
export const inject = ['shortcuts']

/**
 * ACRYL's keyboard commands, registered on DSH's own shortcut service (`ctx.shortcuts`, DSH 0.2).
 *
 * DSH owns the registry, the persisted rebinding and the "Edit shortcuts" editor, so a command registered here shows up there and can be
 * rebound like any upstream one. A command only announces itself with a window event; the plugin that owns the feature listens, so
 * no package imports another's values (a sibling's built client bundle has no statically analyzable named exports).
 */

/** Window event the palette owner (`acryl-workspace`) listens for. Keep the string in step with its listener. */
export const PALETTE_TOGGLE_EVENT = 'acryl:toggle-command-palette'

/** Stable id in DSH's shortcut catalog. */
export const PALETTE_COMMAND_ID = 'acryl.command-palette.toggle' as ShortcutCommandId

/**
 * Cmd/Ctrl+Shift+P. The palette's old Cmd/Ctrl+Shift+K overlaps upstream's `session.search` (Cmd/Ctrl+K), and DSH's registry refuses overlapping
 * defaults. A Web page on Linux may only bind a short list of combinations, so that profile gets no default (the command is still listed and bindable).
 */
const PALETTE_BINDING: ShortcutBinding = { code: 'KeyP', modifiers: ['primary', 'shift'] }

export function apply(ctx: ClientContext): void {
  ctx.effect(() => registerPalette(ctx), 'acryl-shortcuts: toggle command palette')
}

/** A refused registration (a reserved or conflicting default) costs this one command, never the plugin or the page boot. */
function registerPalette(ctx: ClientContext): () => void {
  try {
    return ctx.shortcuts.register({
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
      // Also from a focused terminal or text field: the palette is reachable from anywhere in the window.
      regions: ['page', 'editable', 'terminal'],
      modals: [],
      resolve: () => ({ status: 'handled', run: () => { window.dispatchEvent(new CustomEvent(PALETTE_TOGGLE_EVENT)) } }),
    })
  } catch (cause) {
    ctx.logger.warn(`acryl-shortcuts: could not register the command palette shortcut: ${cause instanceof Error ? cause.message : String(cause)}`)
    return () => {}
  }
}
