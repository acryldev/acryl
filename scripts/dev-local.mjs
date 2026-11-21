#!/usr/bin/env node
/**
 * `pnpm dev` (also `pnpm desktop`, `pnpm gui`): ACRYL Control Center from this checkout's source, in its desktop window (scripts/launcher-blend.mjs), on an
 * isolated home: never the installed app's `~/.acryl`. The earlier ACRYL desktop this used to start moved to https://github.com/acryldev/acryl-desktop.
 */

import { spawn } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { osHomeDirectory, selectInstance } from './lib/instance-module.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * The home this launch runs in, from the runtime's instance module (spec 036, "Self-containment"): an app or home the caller pinned, else this checkout's
 * worktree instance, else the main checkout's isolated development home (`~/.acryl-dev`). Never the installed app's `~/.acryl`.
 */
export function localDesktopInstance(environment = process.env, osHome = osHomeDirectory(), checkout = repoRoot) {
  return selectInstance({ env: environment, osHome, checkout, development: true })
}

export function runDevLocal(argv = process.argv.slice(2), environment = process.env) {
  const instance = localDesktopInstance(environment)
  process.stdout.write(`dev: ACRYL Control Center from source, home=${instance.home} (${instance.kind})\n`)
  return new Promise((resolveExit, reject) => {
    const child = spawn(process.execPath, [join(repoRoot, 'scripts/launcher-blend.mjs'), ...argv], {
      stdio: 'inherit',
      cwd: repoRoot,
      env: { ...environment, ACRYL_LAUNCHER_HOME: environment.ACRYL_LAUNCHER_HOME ?? instance.home },
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => resolveExit(code ?? (signal === null ? 1 : 128)))
    // The window ends on the same signal and stops its server; this waits for it.
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => {})
  })
}

const invoked = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
if (invoked === fileURLToPath(import.meta.url)) {
  void runDevLocal().then((code) => {
    process.exitCode = code
  }, (cause) => {
    process.stderr.write(`${cause instanceof Error ? cause.stack ?? cause.message : String(cause)}\n`)
    process.exitCode = 1
  })
}
