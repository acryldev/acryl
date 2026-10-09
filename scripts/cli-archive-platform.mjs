/** Return the executable name used to spawn Corepack on the build host. */
export function corepackCommand(platform) {
  return platform === 'win32' ? 'corepack.cmd' : 'corepack'
}

/** Return the spawn options needed for the platform's Corepack entrypoint. */
export function corepackSpawnOptions(platform) {
  return platform === 'win32' ? { shell: true } : {}
}

/**
 * The pnpm release that builds a release archive's dependency closure with `pnpm deploy --legacy`.
 *
 * The repository pins pnpm 11.11.0, whose legacy deploy resolves the whole graph, exits 0 and installs nothing: the deployed folder has
 * no node_modules, so an archive built with it is missing every dependency (found 2026-10-09, the CLI and Web release failed on
 * "closure missing required loader entries"). 11.8.0 and 11.28.5 install correctly. Only this one step runs under another release;
 * moving the repository pin is T040 (spec 001) because that pin is also the pnpm the Desktop app and the plugin manager ship.
 */
export const DEPLOY_PNPM = 'pnpm@11.8.0'

/** Arguments for `corepack` that run `pnpm deploy` for one workspace package under {@link DEPLOY_PNPM}. */
export function deployArguments(packageName, targetDirectory) {
  return [DEPLOY_PNPM, '--filter', packageName, 'deploy', targetDirectory, '--prod', '--legacy']
}

/** The environment for that step: Corepack must accept a release other than the one `packageManager` pins. */
export function deployEnvironment(environment, extra = {}) {
  return { ...environment, CI: 'true', COREPACK_ENABLE_STRICT: '0', ...extra }
}
