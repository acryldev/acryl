/** Return the executable name used to spawn Corepack on the build host. */
export function corepackCommand(platform) {
  return platform === 'win32' ? 'corepack.cmd' : 'corepack'
}
