/**
 * Web's own `desktopProfiles`/`desktopPnpm` capabilities (spec 034 T006,
 * scoped v1) - what `dsh-community-market`'s install service needs to make
 * its Installed-tab Install/Uninstall buttons do a real package operation on
 * Web, instead of the "ACRYL is required" gate it shows without them.
 *
 * Deliberately NOT a port of Desktop's own `pnpm.ts`/`install-recovery.ts`
 * (1,500+ lines together): that size is almost entirely a crash-recovery
 * write-ahead-log built around Electron's own generation-restart cycle - if
 * the whole app crashes mid-install, the WAL lets the next launch detect and
 * roll back a half-finished operation. Web has no equivalent "the whole
 * process restarts and we verify it came back healthy" cycle to protect
 * against: a `dsh plugin add` child process either finishes within this one
 * request or it doesn't, with no separate "recovered after restart" state to
 * track. So this file's own `recoveredInstallReceiptIds`/
 * `acknowledgeRecoveredInstall`/`rollbackPluginInstall`/
 * `acknowledgeLiveInstall` are trivial - there is no WAL for them to manage.
 *
 * Also deliberately does NOT attempt `livePluginActivation` (activating a
 * freshly-installed row without a process restart) - `specs/032-universal-
 * hot-reload` documents real, hard-to-diagnose crashes from an earlier
 * attempt at exactly that class of live-Loader-mutation-plus-client-reload
 * change on Desktop. The market's own install flow already degrades
 * gracefully without it (a restart prompt), so v1 leans on that rather than
 * re-attempting a proven-risky mechanism under time pressure.
 *
 * The install mechanics themselves reuse `dsh plugin --profile web add/
 * remove`, the exact same CLI path a human operator already uses - not a
 * reimplementation of pnpm invocation and `dsh.profile.bundles`
 * reconciliation from scratch (which Desktop's own version needs only
 * because Electron's packaged `dsh` CLI hard-rejects `--profile desktop`;
 * confirmed directly that `--profile web` has no such restriction).
 */

import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { PassThrough, Readable } from 'node:stream'
import { type Context, Service } from '@deepseek-ai/cordis'

/** Matches `dsh-community-market`'s own `MarketDesktopProfile` shape (`src/install/service.ts`). */
export interface WebMarketProfile {
  readonly name: string
  readonly dir: string
}

/** Matches `dsh-community-market`'s own `MarketDesktopPnpmOutcome` shape. */
export interface WebMarketPnpmOutcome {
  readonly exitCode: number | null
  readonly signal: NodeJS.Signals | null
}

/** Matches `dsh-community-market`'s own `MarketDesktopPnpmHandle` shape. */
export interface WebMarketPnpmHandle {
  readonly stdout: Readable
  readonly stderr: Readable
  readonly done: Promise<WebMarketPnpmOutcome>
  cancel(): void
}

// No `declare module '@deepseek-ai/cordis'` augmentation here on purpose:
// acryl-desktop's own pnpm.ts/desktop-plugins.ts already declare
// `desktopProfiles`/`desktopPnpm`/`desktopPlugins` on Context with their own
// (richer, Electron-specific) types. `Service`'s own constructor signature is
// `(ctx: Context, name: string)` - a plain string, not `keyof Context` - so
// providing under these exact names needs no static declaration here at all;
// adding one anyway would be two different packages both augmenting the same
// ambient property with structurally different types, which the TypeScript
// compiler correctly refuses to merge (reproduced directly: acryl-desktop's
// own typecheck failed with "Subsequent property declarations must have the
// same type" the moment this block existed). This file only ever *provides*
// these services; it never reads `ctx.get('desktopProfiles' | 'desktopPnpm')`
// itself, so the missing consumer-side typing costs it nothing.

/** Matches `dsh-community-market`'s own `MarketDesktopPnpm` shape exactly - the six methods it actually calls. */
export interface WebMarketPnpm {
  runPlugin(args: readonly string[], invokingDir: string, signal?: AbortSignal): WebMarketPnpmHandle
  installPlugin(request: {
    readonly pnpmOptions?: readonly string[]
    readonly invokingDir: string
    readonly recovery: { readonly packageName: string; readonly packageVersion: string; readonly receiptId: string }
    readonly signal?: AbortSignal
  }): Promise<WebMarketPnpmHandle>
  recoveredInstallReceiptIds(): Promise<readonly string[]>
  acknowledgeRecoveredInstall(receiptId: string): Promise<void>
  rollbackPluginInstall(receiptId: string): Promise<boolean>
  acknowledgeLiveInstall(packageName: string): Promise<void>
}

const require = createRequire(import.meta.url)

/** Absolute path to the pinned `@deepseek-ai/dsh` CLI's own compiled entry - resolved once, from this package's own installation, not guessed. */
function resolveDshBin(): string {
  const manifestPath = require.resolve('@deepseek-ai/dsh/package.json')
  return join(dirname(manifestPath), 'lib/bin.js')
}

/** Web's single profile is always named `web` - unlike Desktop, there is no multi-profile picker to resolve against. */
export class WebProfilesService extends Service {
  constructor(ctx: Context, private readonly profileDir: string) {
    super(ctx, 'desktopProfiles')
  }

  get current(): WebMarketProfile {
    return { name: 'web', dir: this.profileDir }
  }
}

/**
 * Runs `dsh plugin --profile web <verb> <...args>` as a real child process,
 * inheriting this server's own `DSH_HOME` (already set correctly by
 * `resolveWebEngineComposition` before this service is ever constructed) -
 * the exact command a human operator already runs by hand, `-w` included for
 * pnpm's own workspace-root safety check on a profile's single-package
 * pnpm workspace.
 */
export class WebPnpmService extends Service implements WebMarketPnpm {
  private readonly dshBin: string

  constructor(ctx: Context, private readonly profileName: string) {
    super(ctx, 'desktopPnpm')
    this.dshBin = resolveDshBin()
  }

  runPlugin(args: readonly string[], _invokingDir: string, signal?: AbortSignal): WebMarketPnpmHandle {
    const child = spawn(process.execPath, [this.dshBin, 'plugin', '--profile', this.profileName, ...args, '-w'], {
      env: process.env,
      signal,
    })
    // The market resumes/discards these itself (`handle.stdout.resume()`) -
    // pass real streams through rather than buffering, matching Desktop's
    // own handle shape.
    const stdout = new PassThrough()
    const stderr = new PassThrough()
    child.stdout?.pipe(stdout)
    child.stderr?.pipe(stderr)
    const done = new Promise<WebMarketPnpmOutcome>((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', (exitCode, exitSignal) => resolve({ exitCode, signal: exitSignal }))
    })
    return {
      stdout,
      stderr,
      done,
      cancel: () => { child.kill() },
    }
  }

  async installPlugin(request: {
    readonly pnpmOptions?: readonly string[]
    readonly invokingDir: string
    readonly recovery: { readonly packageName: string; readonly packageVersion: string; readonly receiptId: string }
    readonly signal?: AbortSignal
  }): Promise<WebMarketPnpmHandle> {
    // No recovery WAL to open here (see this module's own doc comment) - the
    // exact npm target still comes from `recovery`, matching Desktop's own
    // `installPlugin` (never trust `pnpmOptions` alone to carry the target).
    const target = `${request.recovery.packageName}@${request.recovery.packageVersion}`
    const options = request.pnpmOptions === undefined ? [] : [...request.pnpmOptions]
    return this.runPlugin(['add', ...options, target], request.invokingDir, request.signal)
  }

  // No WAL (see this module's own doc comment): nothing was ever recorded as
  // "awaiting restart", so there is never anything to report as recovered,
  // acknowledge, or roll back.
  async recoveredInstallReceiptIds(): Promise<readonly string[]> {
    return []
  }

  async acknowledgeRecoveredInstall(_receiptId: string): Promise<void> {}

  async rollbackPluginInstall(_receiptId: string): Promise<boolean> {
    return false
  }

  async acknowledgeLiveInstall(_packageName: string): Promise<void> {}
}

/**
 * Provide `desktopProfiles`/`desktopPnpm` on the host root, before
 * `dsh-community-market`'s own row mounts - matching the same `prepare`-hook
 * timing `createWebEngineDefinition`'s brand/market row materialization
 * already relies on.
 * @param profileDir - the web profile's own directory (`resolveWebEngineComposition`'s `profile.dir`).
 */
export function provideWebMarketInstall(ctx: Context, profileDir: string): void {
  ctx.plugin(WebProfilesService, profileDir)
  ctx.plugin(WebPnpmService, 'web')
}
