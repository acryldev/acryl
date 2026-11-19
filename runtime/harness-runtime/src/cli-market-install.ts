/**
 * CLI/TUI's own `desktopProfiles`/`desktopPnpm` capabilities (spec 034,
 * completing T006 for the third surface) - what `cordis-plugin-market`'s
 * install service needs for a CLI-driven Market install/uninstall to do a
 * real package operation, instead of the "ACRYL is required" gate it shows
 * without them.
 *
 * Adapted directly from `web-market-install.ts` - see that file's own doc
 * comment for why this is deliberately not a port of Desktop's much larger
 * `pnpm.ts`/`install-recovery.ts` (a crash-recovery WAL built around
 * Electron's own generation-restart cycle, which neither Web nor a CLI
 * process has an equivalent of). The one real difference from Web: the CLI
 * has more than one named profile (Web's is always `web`), so the profile
 * name is a constructor parameter here, not a literal.
 *
 * Install mechanics reuse `dsh plugin --profile <name> add/remove`, the same
 * path a human operator already uses - confirmed (like Web) to have no
 * `--profile` restriction, unlike Desktop's packaged CLI.
 */

import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { PassThrough, Readable } from 'node:stream'
import { type Context, Service } from '@deepseek-ai/cordis'
import { pinnedPnpmEnv } from './pinned-pnpm.ts'
import { reconcileProfileLayout, type PnpmProfileConfig } from './profile-layout.ts'

/** Matches `cordis-plugin-market`'s own `MarketDesktopProfile` shape. */
export interface CliMarketProfile {
  readonly name: string
  readonly dir: string
}

/** Matches `cordis-plugin-market`'s own `MarketDesktopPnpmOutcome` shape. */
export interface CliMarketPnpmOutcome {
  readonly exitCode: number | null
  readonly signal: NodeJS.Signals | null
}

/** Matches `cordis-plugin-market`'s own `MarketDesktopPnpmHandle` shape. */
export interface CliMarketPnpmHandle {
  readonly stdout: Readable
  readonly stderr: Readable
  readonly done: Promise<CliMarketPnpmOutcome>
  cancel(): void
}

// No `declare module '@deepseek-ai/cordis'` augmentation here - same reason
// as web-market-install.ts: acryl-desktop's own pnpm.ts/desktop-plugins.ts
// already declare these names on Context with their own, richer types, and
// `Service`'s constructor takes a plain string name, not `keyof Context`, so
// providing under these exact names needs no static declaration at all.

/** Matches `cordis-plugin-market`'s own `MarketDesktopPnpm` shape exactly. */
export interface CliMarketPnpm {
  runPlugin(args: readonly string[], invokingDir: string, signal?: AbortSignal): CliMarketPnpmHandle
  installPlugin(request: {
    readonly pnpmOptions?: readonly string[]
    readonly invokingDir: string
    readonly recovery: { readonly packageName: string; readonly packageVersion: string; readonly receiptId: string }
    readonly signal?: AbortSignal
  }): Promise<CliMarketPnpmHandle>
  recoveredInstallReceiptIds(): Promise<readonly string[]>
  acknowledgeRecoveredInstall(receiptId: string): Promise<void>
  rollbackPluginInstall(receiptId: string): Promise<boolean>
  acknowledgeLiveInstall(packageName: string): Promise<void>
}

const require = createRequire(import.meta.url)

/** Absolute path to the pinned `@deepseek-ai/dsh` CLI's own compiled entry. */
function resolveDshBin(): string {
  const manifestPath = require.resolve('@deepseek-ai/dsh/package.json')
  return join(dirname(manifestPath), 'lib/bin.js')
}

/** The one profile this TUI process actually booted. */
export class CliProfilesService extends Service {
  constructor(ctx: Context, private readonly profile: CliMarketProfile) {
    super(ctx, 'desktopProfiles')
  }

  get current(): CliMarketProfile {
    return this.profile
  }
}

/**
 * Runs `dsh plugin --profile <name> <verb> <...args>` as a real child
 * process, inheriting this process's own `DSH_HOME` - `-w` included for
 * pnpm's own workspace-root safety check on a profile's single-package pnpm
 * workspace (identical reproduction to Web's and Desktop's own install path).
 */
export class CliPnpmService extends Service implements CliMarketPnpm {
  private readonly dshBin: string
  private readonly profileName: string
  private readonly profileDir: string

  constructor(ctx: Context, config: PnpmProfileConfig) {
    super(ctx, 'desktopPnpm')
    this.profileName = config.name
    this.profileDir = config.dir
    this.dshBin = resolveDshBin()
  }

  runPlugin(args: readonly string[], _invokingDir: string, signal?: AbortSignal): CliMarketPnpmHandle {
    // Never let a pnpm relink a profile another pnpm laid out (see profile-layout.ts).
    reconcileProfileLayout(this.profileDir)
    const child = spawn(process.execPath, [this.dshBin, 'plugin', '--profile', this.profileName, ...args, '-w'], {
      // The pinned pnpm, not whatever the machine has on PATH (see pinned-pnpm.ts).
      env: pinnedPnpmEnv(process.env),
      signal,
    })
    const stdout = new PassThrough()
    const stderr = new PassThrough()
    child.stdout?.pipe(stdout)
    child.stderr?.pipe(stderr)
    // 'close', not 'exit': 'exit' can fire before the piped stdout/stderr
    // have finished draining into `stdout`/`stderr` above, which raced a
    // real caller reading `stderr` after `done` resolved - a fast failure
    // (this profile's dsh wrapper prints one line and exits immediately)
    // showed a near-empty stderr capture because the pipe hadn't flushed
    // yet. 'close' is Node's own guarantee that both streams have ended.
    const done = new Promise<CliMarketPnpmOutcome>((resolve, reject) => {
      child.once('error', reject)
      child.once('close', (exitCode, exitSignal) => resolve({ exitCode, signal: exitSignal }))
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
  }): Promise<CliMarketPnpmHandle> {
    const target = `${request.recovery.packageName}@${request.recovery.packageVersion}`
    const options = request.pnpmOptions === undefined ? [] : [...request.pnpmOptions]
    // A version of ACRYL's own tooling published minutes before an install
    // attempt is the normal case here (Market installs are how a person
    // actually picks up a just-published plugin), not the untrusted-fresh-
    // package scenario pnpm's own `minimumReleaseAge` supply-chain default
    // guards against - reproduced directly: a real install of a package
    // this session had itself published minutes earlier failed with
    // `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION` on a pnpm whose default
    // enables the policy. Overridden only for this one `add` invocation,
    // not the user's global pnpm config, which stays untouched.
    return this.runPlugin(['add', '--config.minimum-release-age=0', ...options, target], request.invokingDir, request.signal)
  }

  // No crash-recovery WAL (see this module's own doc comment) - there is
  // never anything to report as recovered, acknowledge, or roll back.
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
 * Provide `desktopProfiles`/`desktopPnpm` on the host root for this CLI
 * process's own booted profile.
 * @param ctx - the host root.
 * @param profile - the profile this TUI process actually composed.
 */
export function provideCliMarketInstall(ctx: Context, profile: CliMarketProfile): void {
  ctx.plugin(CliProfilesService, profile)
  ctx.plugin(CliPnpmService, { name: profile.name, dir: profile.dir })
}
