/**
 * What the .deb of a packed app says about itself. electron-builder takes the package name from package.json's `name` (a Blend's is `blend`, the same for
 * every product, so Control Center, ADE and SDE replaced one another and collided with any other `blend` package) and a default `Depends` without the
 * sound library Electron loads at start (an installed app on a machine without it died with "libasound.so.2: cannot open shared object file").
 */

/**
 * The Debian package name of a product: lower case letters, digits, `+`, `-` and `.`, at least two characters, starting with a letter or digit
 * (Debian Policy 5.6.1). "ACRYL Control Center" and "acryl-control-center" both give `acryl-control-center`.
 */
export function debPackageName(product) {
  const name = String(product ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9+.]+/gu, '-')
    .replace(/^[^a-z0-9]+|-+$/gu, '')
  if (name.length < 2)
    throw new Error(`no Debian package name can be made from ${JSON.stringify(product)}`)
  return name
}

/**
 * The libraries Electron needs on a Debian or Ubuntu machine: electron-builder's own list, which a `depends` option replaces, and the sound library
 * under both its names (`libasound2t64` from Ubuntu 24.04 and Debian 13, `libasound2` before).
 */
export const DEB_DEPENDS = [
  'libgtk-3-0',
  'libnotify4',
  'libnss3',
  'libxss1',
  'libxtst6',
  'xdg-utils',
  'libatspi2.0-0',
  'libuuid1',
  'libsecret-1-0',
  'libasound2t64 | libasound2',
]
