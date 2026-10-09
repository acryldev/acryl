/** Build an unsigned macOS DMG smoke artifact on a native macOS host. */

import { spawnSync } from 'node:child_process'
import { readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { withoutMacReleaseSecrets } from './release-preflight.ts'
import { prepareInstalledMacUniversalRuntime } from './mac-universal.ts'

/** Injectable native macOS packaging boundary used by focused tests. */
export interface MacSmokePackageOptions {
  /** `universal` (default) ships both CPUs in one DMG; `host` ships only the CPU of this machine, about half the installed size. */
  readonly target?: 'universal' | 'host'
  /** Environment inherited by the packaging command. */
  readonly env: NodeJS.ProcessEnv
  /** Platform executing the package build. */
  readonly platform: NodeJS.Platform
  /** Node architecture executing the package build. */
  readonly arch: string
  /** Node version executing the package build. */
  readonly nodeVersion: string
  /** Repository root containing the PNPM workspace. */
  readonly workspaceRoot: string
  /** Desktop package root containing electron-builder configuration. */
  readonly desktopRoot: string
  /** Dedicated smoke output directory, isolated from signed release artifacts. */
  readonly outputDir: string
  /** Remove only the dedicated generated smoke output before packaging. */
  readonly resetOutput: () => void
  /** Validate and prepare both architecture-specific runtime trees. */
  readonly prepareRuntime: () => void
  /** Absolute electron-builder CLI module. */
  readonly builderCli: string
  /** Absolute packaged-DMG verification script. */
  readonly verifier: string
  /** Absolute script that seals the unsigned app bundle ad hoc, between building the app and building the DMG. */
  readonly sealer: string
  /** The built `.app` the first builder run left in the output directory. */
  readonly findApp: () => string
  /** Node executable used to run package-local scripts. */
  readonly nodeExecutable: string
  /** Execute one packaging command. */
  readonly run: (
    command: string,
    args: readonly string[],
    cwd: string,
    env: NodeJS.ProcessEnv,
  ) => void
  /** Report non-secret packaging progress. */
  readonly log: (message: string) => void
}

function run(
  command: string,
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): void {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit' })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with ${String(result.status)}`)
  }
}

/** The `.app` electron-builder left under `<output>/mac*` (`mac-arm64`, `mac`, `mac-universal`). */
function findBuiltApp(outputDir: string): string {
  for (const entry of readdirSync(outputDir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith('mac')) {
      const candidate = join(outputDir, entry.name, 'ACRYL.app')
      try {
        if (readdirSync(candidate).length > 0) return candidate
      } catch { /* not this folder */ }
    }
  }
  throw new Error(`electron-builder left no ACRYL.app under ${outputDir}`)
}

function defaultOptions(): MacSmokePackageOptions {
  const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const workspaceRoot = resolve(desktopRoot, '..')
  const require = createRequire(import.meta.url)
  const hostOnly = process.argv.includes('--host')
  const outputDir = resolve(desktopRoot, 'dist', hostOnly ? `mac-${process.arch}` : 'mac-smoke')
  return {
    target: hostOnly ? 'host' : 'universal',
    env: process.env,
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.versions.node,
    workspaceRoot,
    desktopRoot,
    outputDir,
    resetOutput: () => rmSync(outputDir, { recursive: true, force: true }),
    prepareRuntime: () => prepareInstalledMacUniversalRuntime(desktopRoot),
    builderCli: require.resolve('electron-builder/cli.js'),
    verifier: fileURLToPath(new URL('./verify-mac-smoke.ts', import.meta.url)),
    sealer: fileURLToPath(new URL('./seal-mac-app.mjs', import.meta.url)),
    findApp: () => findBuiltApp(outputDir),
    nodeExecutable: process.execPath,
    run,
    log: message => console.log(message),
  }
}

/**
 * Run the headless release gates and package one unsigned macOS DMG smoke.
 *
 * The signed and notarized release stays a manual step on a credentialed
 * machine; this smoke exists so macOS packaging regressions fail in CI before
 * a manual release. The universal target exercises both Intel and Apple
 * Silicon packaging in one artifact.
 * @param options - Injectable process and command boundaries.
 */
export function packageMacSmoke(options: MacSmokePackageOptions = defaultOptions()): void {
  if (options.platform !== 'darwin') {
    throw new Error('macOS DMG smoke must be built on a native macOS host')
  }
  if (options.arch !== 'x64' && options.arch !== 'arm64') {
    throw new Error(`macOS DMG smoke requires x64 or arm64 Node; received ${options.arch}`)
  }
  const versionMatch = /^(\d+)\.(\d+)\./u.exec(options.nodeVersion)
  const major = Number(versionMatch?.[1])
  const minor = Number(versionMatch?.[2])
  if (!((major === 22 && minor >= 19) || major === 24)) {
    throw new Error(
      `macOS DMG smoke requires Node 22.19+ or Node 24.x with bundled Corepack; received ${options.nodeVersion}`,
    )
  }

  const cleanEnvironment = withoutMacReleaseSecrets(options.env)
  options.log('Building an unsigned macOS DMG smoke; signing and notarization are release-only steps.')
  if (options.env.DSH_PACKAGE_CHECK_ALREADY_RAN !== '1') {
    options.run(
      'corepack',
      ['pnpm', '--filter', 'acryl-desktop', 'run', 'check:mac-package'],
      options.workspaceRoot,
      cleanEnvironment,
    )
  } else {
    options.log('Skipping the macOS package preflight; the package gate already passed.')
  }
  const hostOnly = options.target === 'host'
  options.resetOutput()
  if (!hostOnly) options.prepareRuntime()
  // Two builder runs with a seal between them: electron-builder skips signing without a Developer ID, which leaves a bundle `codesign --verify --strict` rejects (macOS
  // calls a downloaded copy damaged); the app directory is sealed ad hoc, then the DMG is built from that prepackaged, sealed app.
  const builderArguments = (target: 'dir' | 'dmg', prepackaged?: string): string[] => [
    options.builderCli,
    '--mac',
    target,
    hostOnly ? `--${options.arch}` : '--universal',
    ...(prepackaged === undefined ? [] : ['--prepackaged', prepackaged]),
    '--publish',
    'never',
    '--config.mac.notarize=false',
    '--config.npmRebuild=false',
    `--config.directories.output=${options.outputDir}`,
  ]
  const builderEnvironment = { ...cleanEnvironment, CSC_IDENTITY_AUTO_DISCOVERY: 'false' }
  options.run(options.nodeExecutable, builderArguments('dir'), options.desktopRoot, builderEnvironment)
  const app = options.findApp()
  options.run(options.nodeExecutable, [options.sealer, app], options.desktopRoot, cleanEnvironment)
  options.run(options.nodeExecutable, builderArguments('dmg', app), options.desktopRoot, builderEnvironment)
  options.run(
    options.nodeExecutable,
    hostOnly ? [options.verifier, options.outputDir, options.arch] : [options.verifier, options.outputDir],
    options.desktopRoot,
    cleanEnvironment,
  )
}

const invokedPath = process.argv[1]
if (invokedPath !== undefined && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  try {
    packageMacSmoke()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
