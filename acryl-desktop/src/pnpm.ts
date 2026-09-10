/** Desktop-owned package-manager capability for the active DSH profile. */

import { delimiter, isAbsolute, resolve as resolvePath } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Readable } from 'node:stream'
import { Context, Service } from '@deepseek-ai/cordis'
import type {
  SubprocessHandle,
  SubprocessOutcome,
  SubprocessSpawnSpec,
} from '@deepseek-ai/dsh-subprocess'
import {
  DesktopInstallRecoveryStore,
} from './install-recovery.ts'
import { profileDependencyNames, reconcileProfileBundles } from './desktop-plugin-reconcile.ts'
import { assertDesktopProfileName } from './profile-manager.ts'

const BIN_NAME = 'acryl-desktop'
const ELECTRON_HEADERS_URL = 'https://electronjs.org/headers'
const TERMINATION_GRACE_MS = 3_000
const NPM_PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u
const NPM_EXACT_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u

/** Launcher-resolved values used by the active desktop pnpm generation. */
export interface DesktopPnpmBootstrap {
  /** Profile selected for this immutable Cordis generation. */
  readonly activeProfileName: string
  /** Absolute directory containing the active profile manifest. */
  readonly activeProfileDir: string
  /** Harness home containing every managed profile. */
  readonly homeDir: string
  /** Electron executable reused through RunAsNode. */
  readonly appExecutable: string
  /** Physical JavaScript entry for the packaged pnpm release. */
  readonly pnpmBinPath: string
  /** Electron version used when pnpm installs native dependencies. */
  readonly electronVersion: string
  /** Private directory containing the Electron-backed Node command. */
  readonly nodeBinDir: string
  /** Private Electron-backed Node command used by pnpm lifecycle scripts. */
  readonly nodeShimPath: string
  /** Preloaded module that removes RunAsNode before a JavaScript entry executes. */
  readonly clearEnvironmentPath: string
  /** Desktop bootstrap that clears RunAsNode before importing the packaged DSH CLI. */
  readonly dshBootstrapPath: string
  /** Desktop-private install recovery WAL shared with the launcher and built-in terminal. */
  readonly installRecoveryStatePath: string
  /** Opaque identity shared by every install surface in this Electron generation. */
  readonly generationId: string
  /** Whether the selected Market provider may use the non-WAL external install boundary. */
  readonly externalMarketInstallEnabled: boolean
}

/** Exit facts for one desktop-owned package-manager operation. */
export interface DesktopPnpmOutcome {
  /** Process exit code, or `null` when a signal terminated the operation. */
  readonly exitCode: number | null
  /** Terminating signal, or `null` after a normal exit. */
  readonly signal: NodeJS.Signals | null
}

/** Streaming handle for one package-manager operation. */
export interface DesktopPnpmHandle {
  /** Standard output emitted by DSH and pnpm. */
  readonly stdout: Readable
  /** Standard error emitted by DSH and pnpm. */
  readonly stderr: Readable
  /** Settles only after the complete operation process tree has exited. */
  readonly done: Promise<DesktopPnpmOutcome>
  /** Begin termination of the complete operation process tree. */
  cancel(): void
}

/** Receipt identity tied to one recoverable plugin installation. */
export interface DesktopPluginInstallRecovery {
  readonly packageName: string
  readonly packageVersion: string
  /** Host-generated before installation so every crash window can reconcile the receipt. */
  readonly receiptId: string
}

/** Complete request for one Desktop-owned, recoverable plugin installation. */
export interface DesktopPluginInstallRequest {
  /** pnpm flags after the enforced `add` command and before the exact generated target. */
  readonly pnpmOptions?: readonly string[]
  /** Absolute caller directory used to anchor relative package specifications. */
  readonly invokingDir: string
  readonly recovery: DesktopPluginInstallRecovery
  readonly signal?: AbortSignal
}

/** Public package-operation interface for one immutable Desktop profile generation. */
export interface DesktopPnpm {
  run(args: readonly string[], signal?: AbortSignal): DesktopPnpmHandle
  runPlugin(args: readonly string[], invokingDir: string, signal?: AbortSignal): DesktopPnpmHandle
  /**
   * Run the dsh-market add operation without its per-install WAL.
   * The launcher enables this boundary only for the selected dsh-market provider.
   */
  runExternalMarketPluginInstall(
    args: readonly string[],
    invokingDir: string,
    signal?: AbortSignal,
  ): DesktopPnpmHandle
  /** @deprecated Use `installPlugin()` so Desktop constructs the exact package target. */
  runPluginInstall(
    args: readonly string[],
    invokingDir: string,
    recovery: DesktopPluginInstallRecovery,
    signal?: AbortSignal,
  ): Promise<DesktopPnpmHandle>
  installPlugin(request: DesktopPluginInstallRequest): Promise<DesktopPnpmHandle>
  recoveredInstallReceiptIds(): Promise<readonly string[]>
  acknowledgeRecoveredInstall(receiptId: string): Promise<void>
  rollbackPluginInstall(receiptId: string): Promise<boolean>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Launcher-private inputs from which the Host provider constructs the service. */
    desktopPnpmBootstrap: DesktopPnpmBootstrap
    /** Package-manager operations scoped to the active desktop profile generation. */
    desktopPnpm: DesktopPnpm
  }
}

interface ActiveOperation {
  child: SubprocessHandle
  done: Promise<DesktopPnpmOutcome>
  recoveryTransactionId?: string
  /**
   * Post-exit reconciliation run only after a zero-exit pnpm operation, before
   * the recovery WAL is sealed. A throw here fails the operation (WAL rolls
   * back, reported exit code becomes non-zero) so a broken `dsh.profile.bundles`
   * never survives as a "successful" install.
   */
  onSuccess?: () => void | Promise<void>
}

/** Read PATH with Windows-compatible environment-name matching. */
function inheritedPath(): string {
  const exact = process.env.PATH
  if (exact !== undefined || process.platform !== 'win32') return exact ?? ''
  return Object.entries(process.env)
    .find(([key]) => key.toUpperCase() === 'PATH')?.[1] ?? ''
}

/** Reject an unsafe or unresolved bootstrap path. */
function assertAbsolutePath(label: string, value: string): void {
  if (value.length === 0 || value.includes('\0') || !isAbsolute(value)) {
    throw new Error(`${BIN_NAME}: desktop pnpm ${label} must be an absolute path without NUL`)
  }
}

/**
 * Anchor a relative filesystem spec against the caller's directory. pnpm runs
 * with cwd = the profile directory, so a bare `./plugin` (or its `file:` /
 * `link:` form) would otherwise resolve inside the profile. Registry names and
 * every other argument pass through untouched. Mirrors `dsh`'s `anchorPathSpec`.
 */
function anchorRelativeSpec(argument: string, callerDir: string): string {
  const match = /^(?<prefix>(?:file|link):)?(?<path>\.{1,2}(?:[/\\].*)?)$/u.exec(argument)
  if (match?.groups?.path === undefined) return argument
  return `${match.groups.prefix ?? ''}${resolvePath(callerDir, match.groups.path)}`
}

/** Validate one argv list before it crosses the process boundary. */
function validatedArgs(args: readonly string[]): string[] {
  if (args.length === 0) {
    throw new Error(`${BIN_NAME}: desktop pnpm arguments must not be empty`)
  }
  if (args.some(argument => argument.includes('\0'))) {
    throw new Error(`${BIN_NAME}: desktop pnpm arguments must not contain NUL`)
  }
  return [...args]
}

/** Validate the narrow dsh-market command shape before it crosses the process boundary. */
function validateExternalMarketInstallArgs(args: readonly string[]): string[] {
  const resolvedArgs = validatedArgs(args)
  if (resolvedArgs[0] !== 'add' || resolvedArgs.length < 2) {
    throw new Error(`${BIN_NAME}: external Market plugin install requires add with one exact npm package target`)
  }
  const targets = resolvedArgs.slice(1).filter(argument => !argument.startsWith('-'))
  const target = targets[0]
  if (targets.length !== 1 || target === undefined) {
    throw new Error(`${BIN_NAME}: external Market plugin install accepts exactly one npm package target and flag options`)
  }
  const at = target.lastIndexOf('@')
  const packageName = at > 0 ? target.slice(0, at) : ''
  const packageVersion = at > 0 ? target.slice(at + 1) : ''
  if (
    !NPM_PACKAGE_NAME_PATTERN.test(packageName)
    || !NPM_EXACT_VERSION_PATTERN.test(packageVersion)
  ) {
    throw new Error(`${BIN_NAME}: external Market plugin install requires an exact npm package target`)
  }
  return resolvedArgs
}

/** Validate the immutable launcher values once, before the service is published. */
function validateBootstrap(bootstrap: DesktopPnpmBootstrap): void {
  assertDesktopProfileName(bootstrap.activeProfileName)
  if (typeof bootstrap.externalMarketInstallEnabled !== 'boolean') {
    throw new Error(`${BIN_NAME}: external Market install capability must be a boolean`)
  }
  for (const [label, value] of [
    ['active profile directory', bootstrap.activeProfileDir],
    ['Harness home', bootstrap.homeDir],
    ['application executable', bootstrap.appExecutable],
    ['pnpm entry', bootstrap.pnpmBinPath],
    ['Node command directory', bootstrap.nodeBinDir],
    ['Node command', bootstrap.nodeShimPath],
    ['environment preloader', bootstrap.clearEnvironmentPath],
    ['DSH bootstrap', bootstrap.dshBootstrapPath],
    ['install recovery state', bootstrap.installRecoveryStatePath],
  ] as const) assertAbsolutePath(label, value)
  if (bootstrap.electronVersion.length === 0 || bootstrap.electronVersion.includes('\0')) {
    throw new Error(`${BIN_NAME}: desktop pnpm Electron version must not be empty or contain NUL`)
  }
  if (bootstrap.generationId.length < 8 || bootstrap.generationId.includes('\0')) {
    throw new Error(`${BIN_NAME}: desktop pnpm generation id is invalid`)
  }
}

/** Cordis adapter implementing the public Desktop package-operation interface. */
class DesktopPnpmService extends Service implements DesktopPnpm {
  private active: ActiveOperation | undefined
  private installPreparationActive = false
  private closed = false
  private readonly installRecovery: DesktopInstallRecoveryStore

  /**
   * Register the service for one immutable desktop profile generation.
   * @param ctx - Host context providing the managed subprocess capability.
   * @param bootstrap - launcher-resolved profile and packaged runtime paths.
   */
  constructor(ctx: Context, private readonly bootstrap: DesktopPnpmBootstrap) {
    validateBootstrap(bootstrap)
    super(ctx, 'desktopPnpm')
    this.installRecovery = new DesktopInstallRecoveryStore({
      statePath: bootstrap.installRecoveryStatePath,
      profileName: bootstrap.activeProfileName,
      profileDir: bootstrap.activeProfileDir,
      generationId: bootstrap.generationId,
    })
    ctx.effect(
      () => async () => {
        this.closed = true
        const active = this.active
        if (active === undefined) return
        active.child.terminate()
        await active.done.catch(() => {})
      },
      'acryl-desktop: active pnpm operation teardown',
    )
  }

  /**
   * Run packaged pnpm directly in the active profile.
   * @param args - pnpm arguments following the executable name.
   * @param signal - optional cancellation for this operation.
   * @returns live output streams, completion, and cancellation.
   */
  run(args: readonly string[], signal?: AbortSignal): DesktopPnpmHandle {
    const resolvedArgs = validatedArgs(args)
    return this.start({
      argv: [
        this.bootstrap.appExecutable,
        '--import',
        pathToFileURL(this.bootstrap.clearEnvironmentPath).href,
        this.bootstrap.pnpmBinPath,
        ...resolvedArgs,
      ],
      cwd: this.bootstrap.activeProfileDir,
      ...(signal === undefined ? {} : { signal }),
    })
  }

  /**
   * Run a non-`add` profile plugin operation (`remove`, `update`, `why`, ...).
   *
   * `dsh@0.1.5`'s `plugin` command hard-rejects `--profile desktop`, so this
   * runs packaged pnpm directly in the active profile and then reconciles
   * `dsh.profile.bundles` itself (a no-op write when nothing changed).
   * @param args - pnpm arguments (`add` is routed to the recoverable boundary).
   * @param invokingDir - absolute caller directory used to anchor relative specs.
   * @param signal - optional cancellation for this operation.
   * @returns live output streams, completion, and cancellation.
   */
  runPlugin(
    args: readonly string[],
    invokingDir: string,
    signal?: AbortSignal,
  ): DesktopPnpmHandle {
    const resolvedArgs = validatedArgs(args)
    if (resolvedArgs[0] === 'add') {
      if (this.bootstrap.externalMarketInstallEnabled) {
        return this.runExternalMarketPluginInstall(resolvedArgs, invokingDir, signal)
      }
      throw new Error(`${BIN_NAME}: plugin add must use the recoverable install boundary`)
    }
    assertAbsolutePath('plugin invoking directory', invokingDir)
    const anchoredArgs = resolvedArgs.map(argument => anchorRelativeSpec(argument, invokingDir))
    return this.start({
      argv: this.directPnpmArgv(anchoredArgs),
      cwd: this.bootstrap.activeProfileDir,
      onSuccess: this.reconcileClosure(),
      ...(signal === undefined ? {} : { signal }),
    })
  }

  /** Run one dsh-market install without creating a per-install recovery WAL. */
  runExternalMarketPluginInstall(
    args: readonly string[],
    invokingDir: string,
    signal?: AbortSignal,
  ): DesktopPnpmHandle {
    if (!this.bootstrap.externalMarketInstallEnabled) {
      throw new Error(`${BIN_NAME}: external Market plugin install is unavailable for the selected Market provider`)
    }
    const resolvedArgs = validateExternalMarketInstallArgs(args)
    assertAbsolutePath('plugin invoking directory', invokingDir)
    return this.start({
      argv: this.directPnpmArgv(resolvedArgs.map(argument => anchorRelativeSpec(argument, invokingDir))),
      cwd: this.bootstrap.activeProfileDir,
      onSuccess: this.reconcileClosure(),
      ...(signal === undefined ? {} : { signal }),
    })
  }

  /** Preserve the v2.0.1 install surface without allowing callers to choose another target. */
  async runPluginInstall(
    args: readonly string[],
    invokingDir: string,
    recovery: DesktopPluginInstallRecovery,
    signal?: AbortSignal,
  ): Promise<DesktopPnpmHandle> {
    const resolvedArgs = validatedArgs(args)
    const expectedTarget = `${recovery.packageName}@${recovery.packageVersion}`
    if (
      resolvedArgs[0] !== 'add'
      || resolvedArgs.at(-1) !== expectedTarget
      || resolvedArgs.slice(1, -1).some(argument => !argument.startsWith('-'))
    ) {
      throw new Error(`${BIN_NAME}: recoverable plugin install requires the exact receipt target`)
    }
    return await this.installPlugin({
      pnpmOptions: resolvedArgs.slice(1, -1),
      invokingDir,
      recovery,
      ...(signal === undefined ? {} : { signal }),
    })
  }

  /**
   * Snapshot the active profile before running one `dsh plugin add` operation.
   * The returned handle seals the post-install image before `done` resolves.
   */
  async installPlugin(request: DesktopPluginInstallRequest): Promise<DesktopPnpmHandle> {
    const resolvedOptions = request.pnpmOptions === undefined ? [] : [...request.pnpmOptions]
    if (resolvedOptions.some(argument => argument.includes('\0'))) {
      throw new Error(`${BIN_NAME}: desktop pnpm arguments must not contain NUL`)
    }
    assertAbsolutePath('plugin invoking directory', request.invokingDir)
    if (this.closed) throw new Error(`${BIN_NAME}: desktop pnpm generation is closed`)
    if (this.active !== undefined || this.installPreparationActive) {
      throw new Error(`${BIN_NAME}: another desktop pnpm operation is already running`)
    }
    request.signal?.throwIfAborted()
    this.installPreparationActive = true
    let transaction: Awaited<ReturnType<DesktopInstallRecoveryStore['begin']>> | undefined
    try {
      transaction = await this.installRecovery.begin(request.recovery)
      const target = `${request.recovery.packageName}@${request.recovery.packageVersion}`
      const handle = this.start({
        argv: this.directPnpmArgv([
          'add',
          ...resolvedOptions,
          ...(resolvedOptions.includes('--save-exact') ? [] : ['--save-exact']),
          target,
        ]),
        cwd: this.bootstrap.activeProfileDir,
        recoveryTransactionId: transaction.transactionId,
        allowInstallPreparation: true,
        onSuccess: this.reconcileClosure(),
        ...(request.signal === undefined ? {} : { signal: request.signal }),
      })
      this.installPreparationActive = false
      return handle
    } catch (cause) {
      try {
        if (transaction !== undefined) await this.rollbackUnstartedInstall(transaction.transactionId)
      } finally {
        this.installPreparationActive = false
      }
      throw cause
    }
  }

  /** Return the exact rolled-back receipt id, if startup recovery still awaits Market cleanup. */
  async recoveredInstallReceiptIds(): Promise<readonly string[]> {
    const state = await this.installRecovery.read()
    return state?.phase === 'rolled-back' ? [state.receiptId] : []
  }

  /** Clear a rolled-back transaction only after its exact Market receipt has been removed. */
  async acknowledgeRecoveredInstall(receiptId: string): Promise<void> {
    const state = await this.installRecovery.read()
    if (state?.phase !== 'rolled-back' || state.receiptId !== receiptId) return
    await this.installRecovery.clear(state.transactionId)
  }

  /** Restore and clear the exact current-generation install when later Host validation fails. */
  async rollbackPluginInstall(receiptId: string): Promise<boolean> {
    const state = await this.installRecovery.read()
    if (state === undefined || state.receiptId !== receiptId) return false
    if (state.createdByGeneration !== this.bootstrap.generationId) {
      throw new Error(`${BIN_NAME}: plugin install recovery belongs to another generation`)
    }
    if (state.phase === 'rolled-back') {
      await this.installRecovery.clear(state.transactionId)
      return true
    }
    if (state.phase !== 'prepared' && state.phase !== 'awaiting-restart') {
      throw new Error(`${BIN_NAME}: plugin install recovery cannot roll back phase ${state.phase}`)
    }
    const result = await this.installRecovery.restoreCurrentInstall(state.transactionId, 'install-failed')
    if (result.status === 'manual-recovery-required') {
      throw new Error(`${BIN_NAME}: plugin install recovery requires manual repair`)
    }
    await this.installRecovery.clear(state.transactionId)
    return true
  }

  /** argv for a direct packaged-pnpm run (RunAsNode, cleared environment). */
  private directPnpmArgv(pnpmArgs: readonly string[]): string[] {
    return [
      this.bootstrap.appExecutable,
      '--import',
      pathToFileURL(this.bootstrap.clearEnvironmentPath).href,
      this.bootstrap.pnpmBinPath,
      ...pnpmArgs,
    ]
  }

  /**
   * Snapshot the profile's current dependency names and return a post-exit
   * closure that reconciles `dsh.profile.bundles` against the installed state.
   * Called before the pnpm child runs so the "before" set is accurate.
   */
  private reconcileClosure(): () => void {
    const profileDir = this.bootstrap.activeProfileDir
    let before: readonly string[] = []
    try {
      before = profileDependencyNames(profileDir)
    } catch {
      before = []
    }
    return () => { reconcileProfileBundles(profileDir, before) }
  }

  /** Start one managed child after applying the generation-wide gate. */
  private start(command: {
    argv: readonly string[]
    cwd: string
    signal?: AbortSignal
    recoveryTransactionId?: string
    allowInstallPreparation?: boolean
    onSuccess?: () => void | Promise<void>
  }): DesktopPnpmHandle {
    if (this.closed) {
      throw new Error(`${BIN_NAME}: desktop pnpm generation is closed`)
    }
    if (this.active !== undefined || (this.installPreparationActive && command.allowInstallPreparation !== true)) {
      throw new Error(`${BIN_NAME}: another desktop pnpm operation is already running`)
    }
    command.signal?.throwIfAborted()
    const path = inheritedPath()
    const spec: SubprocessSpawnSpec = {
      argv: command.argv,
      cwd: command.cwd,
      stdio: {
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
      },
      graceMs: TERMINATION_GRACE_MS,
      ...(command.signal === undefined ? {} : { signal: command.signal }),
      env: {
        PATH: path.length === 0
          ? this.bootstrap.nodeBinDir
          : `${this.bootstrap.nodeBinDir}${delimiter}${path}`,
        NODE: this.bootstrap.nodeShimPath,
        ELECTRON_RUN_AS_NODE: '1',
        DSH_HOME: this.bootstrap.homeDir,
        CI: 'true',
        npm_config_runtime: 'electron',
        npm_config_target: this.bootstrap.electronVersion,
        npm_config_disturl: ELECTRON_HEADERS_URL,
      },
    }
    const child = this.ctx.subprocess.spawn(spec)
    if (child.stdout === undefined || child.stderr === undefined) {
      child.terminate()
      throw new Error(`${BIN_NAME}: desktop pnpm subprocess did not expose piped output`)
    }
    const active: ActiveOperation = {
      child,
      done: Promise.resolve({ exitCode: null, signal: null }),
      ...(command.recoveryTransactionId === undefined
        ? {}
        : { recoveryTransactionId: command.recoveryTransactionId }),
      ...(command.onSuccess === undefined ? {} : { onSuccess: command.onSuccess }),
    }
    active.done = this.settle(active)
    this.active = active
    return {
      stdout: child.stdout,
      stderr: child.stderr,
      done: active.done,
      cancel: () => { child.terminate() },
    }
  }

  /** Keep the operation gate held until the complete process tree is gone. */
  private async settle(active: ActiveOperation): Promise<DesktopPnpmOutcome> {
    let outcome: SubprocessOutcome | undefined
    let reconcileFailed = false
    try {
      outcome = await active.child.done
      // A zero-exit pnpm run still has to reconcile `dsh.profile.bundles`
      // before the install counts as successful; a failure here demotes the
      // operation so the WAL rolls back rather than seals.
      if (active.onSuccess !== undefined && outcome.exitCode === 0 && outcome.signal === null) {
        try {
          await active.onSuccess()
        } catch (cause) {
          reconcileFailed = true
          this.ctx.logger?.error?.(cause)
        }
      }
      return reconcileFailed
        ? { exitCode: outcome.exitCode === 0 ? 1 : outcome.exitCode, signal: outcome.signal }
        : { exitCode: outcome.exitCode, signal: outcome.signal }
    } finally {
      try {
        await active.child.waitForExit()
        if (active.recoveryTransactionId !== undefined) {
          if (outcome?.exitCode === 0 && outcome.signal === null && !reconcileFailed) {
            await this.installRecovery.seal(active.recoveryTransactionId)
          } else {
            await this.rollbackUnstartedInstall(active.recoveryTransactionId)
          }
        }
      } finally {
        if (this.active === active) this.active = undefined
      }
    }
  }

  private async rollbackUnstartedInstall(transactionId: string): Promise<void> {
    const result = await this.installRecovery.restoreCurrentInstall(transactionId, 'install-failed')
    if (result.status !== 'manual-recovery-required') {
      await this.installRecovery.clear(transactionId)
    }
  }
}

/** Stable Cordis provider name. */
export const name = 'desktop-pnpm'

/** Launcher bootstrap and subprocess service required by this Host provider. */
export const inject = ['desktopPnpmBootstrap', 'subprocess']

/**
 * Provide the active generation's desktop package-manager capability.
 * @param ctx - Host context carrying launcher bootstrap values and subprocess ownership.
 */
export function apply(ctx: Context): void {
  new DesktopPnpmService(ctx, ctx.desktopPnpmBootstrap)
}
