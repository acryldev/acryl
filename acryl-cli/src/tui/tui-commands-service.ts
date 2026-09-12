/**
 * TUI-side counterpart to Web's `dsh.client` slot registry (spec 034 T009).
 *
 * `docs/ACRYL-RUNTIME-SURFACE-CONTRACT.md` already promises that "Dynamic
 * ACRYL plugins load into the runtime. They may contribute ... declared TUI,
 * Electron, or Web presentation slots" - this service is what makes that true
 * for the terminal surface. An installed plugin's own host-side `apply(ctx)`
 * calls `ctx.get('tuiCommands')?.register({...})`; `acryl-cli`'s own TUI
 * session reads the registry once at boot (matching `/plugins`' own
 * snapshot-at-open-time convention - the tree rarely changes mid-session) to
 * extend the static `SLASH_COMMANDS` table and dispatch.
 *
 * Deliberately narrow: a registration supplies a `command`/`description` (the
 * same shape `SlashCommand` already uses) plus an `open()` factory returning a
 * real `pi-tui` `Component` - the CLI and the Loader tree share one process,
 * so there is no wire protocol to design here (unlike Web's `/editor` RPC
 * channel): `open()` runs synchronously in-process and its returned Component
 * is pushed onto the same overlay stack every built-in overlay uses.
 * @module acryl-cli/tui/tui-commands-service
 */

import { type Context, Service } from '@deepseek-ai/cordis'
import type { Component, TUI } from '@earendil-works/pi-tui'

/**
 * Arguments a registration's `open()` factory receives to build its overlay.
 * Deliberately just `tui` - the one thing a plugin's own `apply(ctx)` cannot
 * already close over (it is the live render-time object the TUI app owns,
 * not a Loader-composition-time value). Anything else the plugin needs
 * (`ctx.get('fs')`, its own config, ...) it already has from its own
 * `apply(ctx)` scope when it calls `register()` - `open()`'s closure carries
 * that forward.
 */
export interface TuiCommandOpenContext {
  readonly tui: TUI
}

/** One plugin-contributed slash command. */
export interface TuiCommandRegistration {
  /** Must start with `/`; matched exactly against what the user types. */
  readonly command: string
  /** Shown in the command palette next to `command`. */
  readonly description: string
  /** Builds the overlay `Component` shown when the command runs. Called fresh each invocation - no state survives between opens unless the plugin's own closure keeps it. */
  open(context: TuiCommandOpenContext): Component
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    tuiCommands: TuiCommandsService
  }
}

/**
 * Holds every plugin-registered TUI command for one Loader tree. One instance
 * per `createAcrylEngineHost` root, provided once via that host's own
 * `prepare` hook - before any engine's Loader entries mount, so a plugin
 * mounted as part of the initial composition can register during its own
 * `apply()` without racing this service's own construction.
 */
export class TuiCommandsService extends Service {
  private readonly registrations = new Map<string, TuiCommandRegistration>()

  constructor(ctx: Context) {
    super(ctx, 'tuiCommands')
  }

  /**
   * Add one command. Returns a disposer removing exactly this registration -
   * callers should wrap it in `ctx.effect()` so an engine swap or plugin
   * disable removes the command instead of leaving it dangling.
   * @throws if `command` doesn't start with `/`, or a command with the same name is already registered.
   */
  register(registration: TuiCommandRegistration): () => void {
    if (!registration.command.startsWith('/') || registration.command.trim() === '/') {
      throw new Error(`tuiCommands: command must start with "/" and name something, got ${JSON.stringify(registration.command)}`)
    }
    if (this.registrations.has(registration.command)) {
      throw new Error(`tuiCommands: command ${registration.command} is already registered`)
    }
    this.registrations.set(registration.command, registration)
    let active = true
    return () => {
      if (!active) return
      active = false
      if (this.registrations.get(registration.command) === registration) {
        this.registrations.delete(registration.command)
      }
    }
  }

  /** Every currently-registered command, in registration order. */
  list(): readonly TuiCommandRegistration[] {
    return [...this.registrations.values()]
  }

  /** One registration by exact command name, or `undefined` if none is registered. */
  get(command: string): TuiCommandRegistration | undefined {
    return this.registrations.get(command)
  }
}
