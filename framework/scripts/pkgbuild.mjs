#!/usr/bin/env node
/**
 * `acrylblends pkgbuild --dir <release files> --product "Name" --version 0.2.6 --repo owner/name`: the PKGBUILD (Arch Linux, Omarchy) for a release,
 * written into <dir> beside the Linux tarballs `acrylblends pack` made there; it installs from the release's own assets, so it goes up with them.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { pkgbuildText, tarballName } from './lib/arch-linux.mjs'

const { values } = parseArgs({
  options: {
    dir: { type: 'string' },
    product: { type: 'string' },
    version: { type: 'string' },
    repo: { type: 'string' },
  },
})
for (const name of ['dir', 'product', 'version', 'repo'])
  if (values[name] === undefined) {
    console.error(
      `pkgbuild: --${name} is missing (acrylblends pkgbuild --dir out --product "Name" --version 0.2.6 --repo owner/name)`,
    )
    process.exit(2)
  }
const dir = resolve(values.dir)
const product = values.product
const fileName = product.replace(/[^A-Za-z0-9]+/gu, '-')
const tarballs = {}
for (const arch of ['x64', 'arm64']) {
  const file = join(dir, tarballName(fileName, arch))
  if (existsSync(file))
    tarballs[arch] = createHash('sha256').update(readFileSync(file)).digest('hex')
}
const text = pkgbuildText({
  exe: fileName.toLowerCase(),
  product,
  description: `${product}, an ACRYL Blends app`,
  version: values.version.replace(/^v/u, ''),
  repo: values.repo,
  fileName,
  tarballs,
})
writeFileSync(join(dir, 'PKGBUILD'), text)
console.log(`pkgbuild: ${join(dir, 'PKGBUILD')} for ${Object.keys(tarballs).join(', ')}`)
