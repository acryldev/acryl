/**
 * The git a desktop product ships (desktop/dugite-native, packed by scripts/pack-blank-mac.mjs into `Resources/git`, beside the app). A clean Mac has only
 * the shim that asks to install the Command Line Tools, and Windows has no git, while versions, export, the terminals and every agent run `git`. The
 * frame host gets it first on its PATH, so everything it starts (versions, the workspace's git, terminals, the chat's shell, PTY agents) finds the same git
 * by name. Outside a product, or in a product packed without it, the person's own git is used as before.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'

export interface ProductGit {
  /** The executable to run (on macOS and Linux a wrapper that finds git's helpers from where it lies). */
  readonly executable: string
  /** The folder to put first on PATH. */
  readonly bin: string
  /** Git's licence and the offer of its source, shown from Settings > App. */
  readonly licence: string
  readonly source: string
}

/** The product's git under `resources` (Electron's `process.resourcesPath`), or undefined when the product carries none. */
export function productGit(resources: string, platform: NodeJS.Platform): ProductGit | undefined {
  const dir = join(resources, 'git')
  // dugite-native's Windows build is MinGit: `cmd/git.exe` finds its own helpers.
  const bin = join(dir, platform === 'win32' ? 'cmd' : 'bin')
  const executable = join(bin, platform === 'win32' ? 'git.exe' : 'git')
  if (!existsSync(executable)) return undefined
  return { executable, bin, licence: join(dir, 'COPYING.txt'), source: join(dir, 'SOURCE.txt') }
}

/** `env` with the product's git first on its PATH (Windows names the variable `Path`, in any case; the existing name is kept). */
export function withGitFirst(
  env: Readonly<Record<string, string | undefined>>,
  git: ProductGit,
  platform: NodeJS.Platform,
): Record<string, string | undefined> {
  const key =
    platform === 'win32'
      ? (Object.keys(env).find((name) => name.toUpperCase() === 'PATH') ?? 'Path')
      : 'PATH'
  const separator = platform === 'win32' ? ';' : ':'
  const rest = (env[key] ?? '').split(separator).filter((dir) => dir !== '' && dir !== git.bin)
  return { ...env, [key]: [git.bin, ...rest].join(separator) }
}
