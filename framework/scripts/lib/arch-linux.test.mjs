import assert from 'node:assert/strict'
import { test } from 'node:test'
import { desktopEntry, launcherScript, pkgbuildText, tarballName } from './arch-linux.mjs'

const product = {
  exe: 'acryl-control-center',
  product: 'ACRYL Control Center',
  description: 'ACRYL Control Center, an ACRYL Blends app',
}

test('the PKGBUILD installs each CPU from its own release tarball, with Arch names and checksums', () => {
  const text = pkgbuildText({
    ...product,
    version: '0.2.6',
    repo: 'acrylblends/63-acryl-control-center',
    fileName: 'ACRYL-Control-Center',
    tarballs: { x64: 'a'.repeat(64), arm64: 'b'.repeat(64) },
  })
  assert.match(text, /^pkgname=acryl-control-center-bin$/mu)
  assert.match(text, /^pkgver=0\.2\.6$/mu)
  assert.match(text, /^arch=\('x86_64' 'aarch64'\)$/mu)
  assert.match(
    text,
    /^source_x86_64=\("acryl-control-center-0\.2\.6-x86_64\.tar\.gz::https:\/\/github\.com\/acrylblends\/63-acryl-control-center\/releases\/download\/v0\.2\.6\/ACRYL-Control-Center-linux-x64\.tar\.gz"\)$/mu,
  )
  assert.match(text, /^sha256sums_aarch64=\('b{64}'\)$/mu)
  assert.match(text, /depends=\([^)]*'gtk3'[^)]*'nss'[^)]*'git'\)/u)
  assert.match(text, /usr\/share\/licenses\/\$pkgname\/LICENSE/u)
  assert.match(text, /chmod 4755 "\$pkgdir\/opt\/acryl-control-center\/lib\/chrome-sandbox"/u)
})

test('a PKGBUILD for one CPU names only that one; a wrong version or repository is refused', () => {
  const one = pkgbuildText({
    ...product,
    version: '1.0.0',
    repo: 'o/r',
    fileName: 'F',
    tarballs: { x64: 'c'.repeat(64) },
  })
  assert.match(one, /^arch=\('x86_64'\)$/mu)
  assert.doesNotMatch(one, /aarch64/u)
  assert.throws(
    () =>
      pkgbuildText({
        ...product,
        version: 'v1.0.0',
        repo: 'o/r',
        fileName: 'F',
        tarballs: { x64: 'c' },
      }),
    /release version/u,
  )
  assert.throws(
    () =>
      pkgbuildText({
        ...product,
        version: '1.0.0',
        repo: 'nope',
        fileName: 'F',
        tarballs: { x64: 'c' },
      }),
    /GitHub repository/u,
  )
  assert.throws(
    () => pkgbuildText({ ...product, version: '1.0.0', repo: 'o/r', fileName: 'F', tarballs: {} }),
    /no Linux tarball/u,
  )
})

test('the launcher starts lib/<exe> beside itself with Wayland-or-X11 and the menu entry runs it', () => {
  const script = launcherScript('acryl-control-center')
  assert.match(script, /^#!\/bin\/sh\n/u)
  assert.match(script, /--ozone-platform-hint=auto/u)
  assert.match(script, /exec "\$here\/lib\/acryl-control-center" "\$@"/u)
  const entry = desktopEntry(product)
  assert.match(entry, /^Exec=acryl-control-center %U$/mu)
  assert.match(entry, /^Name=ACRYL Control Center$/mu)
  assert.equal(tarballName('ACRYL-ADE', 'arm64'), 'ACRYL-ADE-linux-arm64.tar.gz')
})
