/**
 * One pnpm for every surface. `dsh plugin add` shells out to a bare `pnpm` found on PATH, so the Web and CLI surfaces used whatever pnpm
 * the user's machine had (measured: 12.4.2 against a repository pinned to 11.8.0 and a profile created by pnpm 9), and a different major
 * refuses an existing modules directory (ERR_PNPM_PUBLIC_HOIST_PATTERN_DIFF). Desktop already bundles the pinned pnpm behind its own PATH
 * shim; this gives Web and CLI the same: the `pnpm` package this runtime depends on, exposed as a `pnpm` shim first on the PATH of the
 * spawned `dsh plugin` process. When the package cannot be resolved the environment is returned unchanged, so a broken install degrades to
 * the previous behavior instead of failing.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { delimiter, dirname, join } from 'node:path'
import { resolveAcrylHome } from './acryl-home.ts'

const require = createRequire(import.meta.url)

export interface PinnedPnpm {
  /** Absolute path of the pinned pnpm entry (`bin/pnpm.mjs`). */
  readonly entry: string
  /** The pinned version (`package.json` of the resolved `pnpm` package). */
  readonly version: string
}

/** The pnpm this runtime depends on, or undefined when it is not installed. */
export function resolvePinnedPnpm(): PinnedPnpm | undefined {
  try {
    // The package exports only `.` (its package.json), so resolving the bare name yields the manifest path.
    const manifestPath = require.resolve('pnpm')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { version?: string }
    const entry = join(dirname(manifestPath), 'bin', 'pnpm.mjs')
    return existsSync(entry) && typeof manifest.version === 'string' ? { entry, version: manifest.version } : undefined
  } catch {
    return undefined
  }
}

function writeIfChanged(path: string, content: string, mode: number): void {
  if (existsSync(path) && readFileSync(path, 'utf8') === content) return
  writeFileSync(path, content, { mode })
  chmodSync(path, mode)
}

/**
 * Environment for a spawned `dsh plugin` process with the pinned pnpm first on PATH.
 * @param env - the parent environment.
 * @param binDir - where the shim lives (default: `<acryl home>/runtime/pnpm-bin`).
 * @param platform - target platform (tests).
 */
export function pinnedPnpmEnv(
  env: NodeJS.ProcessEnv = process.env,
  binDir: string = join(resolveAcrylHome(env), 'runtime', 'pnpm-bin'),
  platform: NodeJS.Platform = process.platform,
): NodeJS.ProcessEnv {
  const pinned = resolvePinnedPnpm()
  if (pinned === undefined) return env
  try {
    mkdirSync(binDir, { recursive: true, mode: 0o700 })
    if (platform === 'win32') {
      writeIfChanged(join(binDir, 'pnpm.cmd'), `@echo off\r\n"${process.execPath}" "${pinned.entry}" %*\r\n`, 0o600)
    } else {
      writeIfChanged(join(binDir, 'pnpm'), `#!/bin/sh\nexec "${process.execPath}" "${pinned.entry}" "$@"\n`, 0o755)
    }
  } catch {
    return env
  }
  const pathKey = platform === 'win32' ? (Object.keys(env).find(key => key.toLowerCase() === 'path') ?? 'Path') : 'PATH'
  return { ...env, [pathKey]: [binDir, env[pathKey]].filter(Boolean).join(delimiter) }
}
