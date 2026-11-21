/**
 * A product on Arch Linux (and Omarchy, which is Arch): a portable tarball beside the .deb, and a PKGBUILD that installs it. The tarball is the
 * app folder electron-builder lays out (`linux-unpacked`) under `lib/`, a launcher, a .desktop file and the icon; the PKGBUILD downloads the tarball
 * of the product's GitHub release and puts it in /opt/<name>, with the launcher on the PATH.
 */

/** Arch's names for the CPUs the products are built for. */
export const ARCH_LINUX_CPU = { x64: 'x86_64', arm64: 'aarch64' }

/**
 * What Electron needs on Arch: the libraries electron-builder's .deb depends on (libgtk-3-0, libnotify4, libnss3, libxss1, libxtst6, xdg-utils,
 * libatspi2.0-0, libuuid1, libsecret-1-0, libasound2) under their Arch names, and git, which the app runs (it ships its own on macOS only).
 */
export const ARCH_LINUX_DEPENDS = [
  'gtk3',
  'libnotify',
  'nss',
  'libxss',
  'libxtst',
  'xdg-utils',
  'at-spi2-core',
  'util-linux-libs',
  'libsecret',
  'alsa-lib',
  'git',
]

/**
 * The launcher at the top of the tarball. It finds the app beside itself through any symlink (the PKGBUILD links it into /usr/bin), lets Electron
 * pick Wayland or X11 (Omarchy runs Hyprland on Wayland), and turns Chromium's sandbox off only where it cannot run: a chrome-sandbox that is not
 * setuid root (an unpacked tarball) on a kernel that refuses unprivileged user namespaces (Ubuntu 24.04's AppArmor default). Arch allows them.
 */
export function launcherScript(exe) {
  return `#!/bin/sh
# ${exe}: starts the app in lib/ beside this file.
here=$(dirname -- "$(readlink -f -- "$0")")
set -- --ozone-platform-hint=auto "$@"
if [ ! -u "$here/lib/chrome-sandbox" ] && ! unshare -Ur true 2>/dev/null; then set -- --no-sandbox "$@"; fi
exec "$here/lib/${exe}" "$@"
`
}

/** The menu entry; Exec and Icon name the launcher and icon the PKGBUILD installs. */
export function desktopEntry({ exe, product, description }) {
  return `[Desktop Entry]
Type=Application
Name=${product}
Comment=${description}
Exec=${exe} %U
Icon=${exe}
Terminal=false
Categories=Development;
StartupWMClass=${product}
`
}

/** The tarball a release carries for a CPU: `ACRYL-Control-Center-linux-x64.tar.gz`. */
export const tarballName = (fileName, arch) => `${fileName}-linux-${arch}.tar.gz`

/**
 * The PKGBUILD for a release: one package for every CPU whose tarball is given (`tarballs: { x64: sha256, arm64: sha256 }`), each downloaded from
 * the release's own assets. `version` is the release's (0.2.6 for the tag v0.2.6).
 */
export function pkgbuildText({ exe, product, description, version, repo, fileName, tarballs }) {
  if (!/^\d+\.\d+\.\d+$/u.test(version))
    throw new Error(`pkgbuild: ${version} is not a release version (like 0.2.6)`)
  if (!/^[\w.-]+\/[\w.-]+$/u.test(repo))
    throw new Error(`pkgbuild: ${repo} is not a GitHub repository (owner/name)`)
  const cpus = Object.keys(tarballs).filter((arch) => ARCH_LINUX_CPU[arch] !== undefined)
  if (cpus.length === 0)
    throw new Error('pkgbuild: no Linux tarball (x64 or arm64) to install from')
  const quote = (text) => `'${text.replaceAll("'", '')}'`
  const perCpu = cpus.flatMap((arch) => {
    const cpu = ARCH_LINUX_CPU[arch]
    const url = `https://github.com/${repo}/releases/download/v${version}/${tarballName(fileName, arch)}`
    return [
      `source_${cpu}=("${exe}-${version}-${cpu}.tar.gz::${url}")`,
      `sha256sums_${cpu}=('${tarballs[arch]}')`,
    ]
  })
  return `# ${product} for Arch Linux and Omarchy: makepkg -si installs the release's tarball in /opt/${exe}.
# Maintainer: ACRYL Blends <build@acryldev.dev>
pkgname=${exe}-bin
pkgver=${version}
pkgrel=1
pkgdesc=${quote(description)}
arch=(${cpus.map((arch) => `'${ARCH_LINUX_CPU[arch]}'`).join(' ')})
url='https://github.com/${repo}'
license=('MIT')
depends=(${ARCH_LINUX_DEPENDS.map((name) => `'${name}'`).join(' ')})
provides=('${exe}')
conflicts=('${exe}')
options=('!strip' '!debug')
${perCpu.join('\n')}

package() {
  install -d "$pkgdir/opt/${exe}" "$pkgdir/usr/bin"
  cp -a "$srcdir/${exe}/." "$pkgdir/opt/${exe}/"
  # Chromium's sandbox helper must be setuid root, as the .deb installs it.
  chmod 4755 "$pkgdir/opt/${exe}/lib/chrome-sandbox"
  ln -s "/opt/${exe}/${exe}" "$pkgdir/usr/bin/${exe}"
  install -Dm644 "$srcdir/${exe}/${exe}.desktop" "$pkgdir/usr/share/applications/${exe}.desktop"
  install -Dm644 "$srcdir/${exe}/${exe}.png" "$pkgdir/usr/share/pixmaps/${exe}.png"
  if [ -f "$srcdir/${exe}/LICENSE" ]; then install -Dm644 "$srcdir/${exe}/LICENSE" "$pkgdir/usr/share/licenses/$pkgname/LICENSE"; fi
}
`
}
