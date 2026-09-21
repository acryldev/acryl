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
 *
 * Namespacing: two installed plugins are free to register the same bare
 * `command` (e.g. two different `/files` implementations) - `register()`
 * never throws on a name collision. Each registration carries an optional
 * `packageName` the caller supplies, used to disambiguate (`/files:<pkg>`)
 * and address directly (`/plugin:<pkg>/files`) - see
 * `apps/acryl-cli/src/tui/commands.ts` for how these forms are exposed to
 * the user.
 *
 * This field is *not* auto-derived from Cordis topology, despite that being
 * the more tamper-proof design (a plugin author typing the wrong name only
 * misfiles their own command, not a security boundary). Tried it first and
 * reverted: a `Service`'s own `this.ctx` is fixed to its *construction*
 * scope, not the calling site's - `this.ctx.loader`/`this.ctx.fiber` inside
 * `register()` throw `cannot get property "loader" without inject`, because
 * `TuiCommandsService` itself is constructed once, in `direct.ts`'s
 * `prepare` hook, before any per-plugin Loader entry exists to match against.
 * Confirmed with a real Loader-mounted test plugin, not assumed - see this
 * file's own test at `tests/tui/tui-commands-service.spec.ts`. This is the
 * same class of bug fixed tonight in `dsh-client-connection`'s `get rpc()`
 * getter (`owner = this.ctx`, captured once, used later against a topology
 * that has moved on) - `this.ctx` on a `Service` instance is never a live
 * per-caller view, only ever the scope the instance itself was built in.
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
  /** Close this overlay - the registration's own Component calls this from its `handleInput`, matching every built-in overlay's own `actions.closeX()` convention (bare Escape at the top level would be wrong for a plugin with its own nested modes to Escape out of first). */
  close(): void
}

/**
 * Positioning hint for a registration's overlay, opting it out of the default
 * full-screen presentation `TuiApp.ts` gives every dynamic command. Deliberately
 * a narrow subset of `pi-tui`'s own `OverlayOptions` (width/anchor/margin) -
 * the fields a compact popup actually needs, not the full options surface
 * (`row`/`col`/`offsetX`/`offsetY`/`visible`/`nonCapturing` stay TuiApp-internal
 * concerns until a real plugin needs them). Reference values match
 * `almegal/pi-file-browser`'s own `ctx.ui.custom(builder, { overlay: true,
 * overlayOptions: { width: '60%', anchor: 'center', margin: { top: 2, bottom: 2 } } })`
 * call - the exact popup style a screenshot of that project showed running.
 */
export interface TuiCommandOverlayHint {
  /** Columns, or a percentage of terminal width (e.g. `'60%'`). */
  readonly width?: number | `${number}%`
  /** Defaults to `'center'`, matching `pi-tui`'s own `OverlayOptions` default. */
  readonly anchor?: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-center' | 'bottom-center' | 'left-center' | 'right-center'
  /** Distance from terminal edges; a bare number applies to all sides. */
  readonly margin?: number | { readonly top?: number; readonly bottom?: number; readonly left?: number; readonly right?: number }
}

/** One plugin-contributed slash command, as the plugin itself declares it. */
export interface TuiCommandRegistration {
  /** Must start with `/`; the bare method name a plugin author picks (e.g. `/files`) - collisions with another plugin's own bare `command` are expected and fine, see module doc. */
  readonly command: string
  /** Shown in the command palette next to `command`. */
  readonly description: string
  /** The registering plugin's own package name (its `package.json` `name`), used to build `/plugin:<packageName>/<method>` and `/<method>:<packageName>` addressing - `undefined` for a first-party, unnamespaced command (e.g. this app's own built-in `/market`). */
  readonly packageName?: string
  /**
   * Opts this command's overlay out of `TuiApp.ts`'s default full-screen
   * `FullScreenOverlay` treatment into a positioned popup instead. Absent
   * (the default for every existing registration, including this app's own
   * built-ins) means exactly today's behavior - a plugin that predates this
   * field, or simply doesn't need compact presentation (e.g. a 90-row list
   * like `/plugins` genuinely wants the vertical space), is unaffected.
   */
  readonly overlay?: TuiCommandOverlayHint
  /** Builds the overlay `Component` shown when the command runs. Called fresh each invocation - no state survives between opens unless the plugin's own closure keeps it. */
  open(context: TuiCommandOpenContext): Component
}

/** A registration as stored - `packageName` always present (possibly `undefined`), never optional-absent, so `list()`/`resolve()` consumers don't need the `in` check `TuiCommandRegistration`'s optional field would otherwise force on them. Same treatment for `overlay`. */
export type ResolvedTuiCommand = Required<Pick<TuiCommandRegistration, 'command' | 'description' | 'open'>> & { readonly packageName: string | undefined; readonly overlay: TuiCommandOverlayHint | undefined }

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
  /** Every live registration, keyed by a synthetic id (not `command` - two registrations can share a bare command name). */
  private readonly registrations = new Map<symbol, ResolvedTuiCommand>()
  /** Called after every registration change, so a live TUI can refresh its command list without a restart (pi.dev rebuilds after a reload). */
  private readonly listeners = new Set<() => void>()

  constructor(ctx: Context) {
    super(ctx, 'tuiCommands')
  }

  /**
   * Add one command. Never throws on a name collision - two plugins may both
   * register `/files`; disambiguation happens at resolve/completion time
   * (see {@link resolve} and `apps/acryl-cli/src/tui/commands.ts`'s
   * expansion), not at registration time.
   * @throws only if `command` doesn't start with `/` and name something.
   * @returns a disposer removing exactly this registration - callers should
   * wrap it in `ctx.effect()` so an engine swap or plugin disable removes
   * the command instead of leaving it dangling.
   */
  register(registration: TuiCommandRegistration): () => void {
    if (!registration.command.startsWith('/') || registration.command.trim() === '/') {
      throw new Error(`tuiCommands: command must start with "/" and name something, got ${JSON.stringify(registration.command)}`)
    }
    const id = Symbol(registration.command)
    this.registrations.set(id, { command: registration.command, description: registration.description, open: registration.open, packageName: registration.packageName, overlay: registration.overlay })
    this.notify()
    let active = true
    return () => {
      if (!active) return
      active = false
      this.registrations.delete(id)
      this.notify()
    }
  }

  /**
   * Observe registration changes (an installed plugin adding a command, or a removed one taking it away).
   * @returns a disposer removing this listener.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private notify(): void {
    for (const listener of [...this.listeners]) {
      try { listener() } catch { /* an observer must never break registration */ }
    }
  }

  /** Every currently-registered command, in registration order, with its derived owning package (if any). */
  list(): readonly ResolvedTuiCommand[] {
    return [...this.registrations.values()]
  }

  /**
   * Resolve one addressed command string to its registration, per the three
   * forms `apps/acryl-cli/src/tui/commands.ts` exposes to the user:
   * - `/plugin:<packageName>/<method>` - always resolves regardless of collisions.
   * - `/<method>:<packageName>` - the disambiguated short form, always valid to type directly.
   * - `/<method>` - resolves only when exactly one registrant owns that bare command; `undefined` for zero or 2+ (ambiguous - the caller must disambiguate, this method never silently picks one).
   */
  resolve(command: string): ResolvedTuiCommand | undefined {
    const qualified = /^\/plugin:([^/]+)\/(.+)$/u.exec(command)
    if (qualified !== null) {
      const [, packageName, method] = qualified
      return this.list().find(r => r.packageName === packageName && r.command === `/${method}`)
    }
    const suffixed = /^(\/[^:]+):([^:]+)$/u.exec(command)
    if (suffixed !== null) {
      const [, bare, packageName] = suffixed
      return this.list().find(r => r.command === bare && r.packageName === packageName)
    }
    const matches = this.list().filter(r => r.command === command)
    return matches.length === 1 ? matches[0] : undefined
  }
}
