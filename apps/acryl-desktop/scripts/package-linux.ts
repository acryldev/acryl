/** Build an unsigned Debian package (.deb) on a native Linux host. */

import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Injectable native Linux packaging boundary used by focused tests. */
export interface LinuxPackageOptions {
  /** Environment inherited by the packaging commands. */
  readonly env: NodeJS.ProcessEnv
  /** Platform executing the package build. */
  readonly platform: NodeJS.Platform
  /** Node architecture executing the package build. */
  readonly arch: string
  /** Node version executing the package build. */
  readonly nodeVersion: string
  /** Repository root containing the PNPM workspace. */
  readonly workspaceRoot: string
  /** Desktop package root containing the electron-builder configuration. */
  readonly desktopRoot: string
  /** Absolute electron-builder CLI module. */
  readonly builderCli: string
  /** Node executable used to run package-local scripts. */
  readonly nodeExecutable: string
  /** Execute one packaging command. */
  readonly run: (command: string, args: readonly string[], cwd: string, env: NodeJS.ProcessEnv) => void
  /** Names of the files in one directory (empty when it does not exist). */
  readonly listFiles: (directory: string) => readonly string[]
  /** Report non-secret packaging progress. */
  readonly log: (message: string) => void
}

function run(command: string, args: readonly string[], cwd: string, env: NodeJS.ProcessEnv): void {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit' })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited with ${String(result.status)}`)
}

/** Create the native packaging options for this machine. */
export function createLinuxPackageOptions(): LinuxPackageOptions {
  const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const require = createRequire(import.meta.url)
  return {
    env: process.env,
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.versions.node,
    workspaceRoot: resolve(desktopRoot, '..', '..'),
    desktopRoot,
    builderCli: require.resolve('electron-builder/cli.js'),
    nodeExecutable: process.execPath,
    run,
    listFiles: (directory) => { try { return readdirSync(directory) } catch { return [] } },
    log: message => console.log(message),
  }
}

/** Where the packages for one architecture are written, relative to the Desktop package. */
export function linuxOutputDirectory(arch: string): string {
  return join('dist', `linux-${arch}`)
}

/**
 * Package one unsigned `.deb` for the architecture of this host: the same electron-builder invocation the release workflow runs, after the build and the
 * runtime-closure check it runs first. A `.deb` is built where it will run (x64 or arm64 Linux); electron-builder's Debian tooling is not run from macOS.
 * @returns the path of the package that was written.
 */
export function packageLinuxDeb(options: LinuxPackageOptions = createLinuxPackageOptions()): string {
  if (options.platform !== 'linux') throw new Error('A Linux .deb must be built on a native Linux host')
  if (options.arch !== 'x64' && options.arch !== 'arm64') throw new Error(`A Linux .deb requires an x64 or arm64 host; received ${options.arch}`)
  const versionMatch = /^(\d+)\.(\d+)\./u.exec(options.nodeVersion)
  const major = Number(versionMatch?.[1])
  const minor = Number(versionMatch?.[2])
  if (!((major === 22 && minor >= 19) || major === 24)) {
    throw new Error(`A Linux .deb requires Node 22.19+ or Node 24.x with bundled Corepack; received ${options.nodeVersion}`)
  }

  const environment = { ...options.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' }
  const outputDirectory = linuxOutputDirectory(options.arch)
  options.log(`Building an unsigned Linux ${options.arch} .deb into apps/acryl-desktop/${outputDirectory}`)
  options.run('corepack', ['pnpm', '--filter', 'acryl-desktop', 'run', 'build'], options.workspaceRoot, environment)
  options.run('corepack', ['pnpm', '--filter', 'acryl-desktop', 'run', 'verify:closure'], options.workspaceRoot, environment)
  options.run(
    options.nodeExecutable,
    [
      options.builderCli,
      '--linux',
      'deb',
      `--${options.arch}`,
      '--publish',
      'never',
      '--config.npmRebuild=false',
      `--config.directories.output=${outputDirectory}`,
    ],
    options.desktopRoot,
    environment,
  )
  const written = options.listFiles(join(options.desktopRoot, outputDirectory)).filter(name => name.endsWith('.deb'))
  if (written.length === 0) throw new Error(`electron-builder finished but wrote no .deb into ${outputDirectory}`)
  const packagePath = join(options.desktopRoot, outputDirectory, written[0] as string)
  options.log(`Wrote ${packagePath}`)
  return packagePath
}

const invokedPath = process.argv[1]
if (invokedPath !== undefined && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  try {
    packageLinuxDeb()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
