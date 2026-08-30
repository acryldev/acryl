/** Return the executable name used to spawn Corepack on the build host. */
export function corepackCommand(platform) {
  return platform === 'win32' ? 'corepack.cmd' : 'corepack'
}

/** Return the spawn options needed for the platform's Corepack entrypoint. */
export function corepackSpawnOptions(platform) {
  return platform === 'win32' ? { shell: true } : {}
}
