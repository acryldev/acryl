/**
 * Synchronize the repository-owned ACRYL logos into native application
 * assets (app icon, tray icons). The browser-embeddable data URLs are a
 * separate concern owned by `dsh-client-ui-brand-acryl`'s own
 * `generate-acryl-brand-data.mjs`, which reads the same workspace-root
 * source PNGs - this script no longer writes a client module.
 */

import { copyFile, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const workspaceRoot = dirname(packageRoot)
const buildRoot = join(packageRoot, 'build')
const blackSource = join(workspaceRoot, 'acryl-logo.png')
const whiteSource = join(workspaceRoot, 'acryl-logo-white.png')
const blackBuild = join(buildRoot, 'acryl-logo.png')
const whiteBuild = join(buildRoot, 'acryl-logo-white.png')

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

async function logo(path) {
  const data = await readFile(path)
  if (!data.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error(`generate-acryl-brand: ${path} is not a PNG`)
  }
  const metadata = await sharp(data).metadata()
  if (metadata.width !== 974 || metadata.height !== 974 || metadata.hasAlpha !== true) {
    throw new Error(`generate-acryl-brand: ${path} must be the supplied 974x974 transparent logo`)
  }
  return data
}

const [black] = await Promise.all([logo(blackSource), logo(whiteSource)])
await Promise.all([
  copyFile(blackSource, blackBuild),
  copyFile(whiteSource, whiteBuild),
])

const logoArtwork = await sharp(black)
  .resize({ width: 760, height: 760, fit: 'contain', kernel: sharp.kernel.lanczos3 })
  .png()
  .toBuffer()
const background = Buffer.from(
  '<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg"><rect width="1024" height="1024" rx="216" fill="#fff"/></svg>',
)
await sharp({
  create: {
    width: 1024,
    height: 1024,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite([
    { input: background, left: 0, top: 0 },
    { input: logoArtwork, left: 132, top: 132 },
  ])
  .toColourspace('rgb16')
  .withIccProfile('p3')
  .png({ compressionLevel: 9, progressive: false, palette: false })
  .toFile(join(buildRoot, 'app-icon.png'))
