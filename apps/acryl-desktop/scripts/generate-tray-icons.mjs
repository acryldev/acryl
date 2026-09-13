/** Generate native tray bitmaps from the supplied transparent ACRYL logo. */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const buildRoot = join(packageRoot, 'build')
const sourcePath = join(buildRoot, 'acryl-logo.png')
const BRAND_BLUE = '#4D6BFE'

const metadata = await sharp(sourcePath).metadata()
if (metadata.width !== 974 || metadata.height !== 974 || metadata.hasAlpha !== true) {
  throw new Error('generate-tray-icons: acryl-logo.png must be the supplied 974x974 transparent logo')
}

const alpha = await sharp(sourcePath).ensureAlpha().extractChannel('alpha').raw().toBuffer()
const variants = [
  ['tray-iconTemplate.png', '#000000', 16],
  ['tray-iconTemplate@2x.png', '#000000', 32],
  ['tray-icon-blue.png', BRAND_BLUE, 16],
  ['tray-icon-blue@1.25x.png', BRAND_BLUE, 20],
  ['tray-icon-blue@1.5x.png', BRAND_BLUE, 24],
  ['tray-icon-blue@2x.png', BRAND_BLUE, 32],
]

await Promise.all(variants.map(async ([filename, color, size]) => {
  const rgb = await sharp({
    create: { width: 974, height: 974, channels: 3, background: color },
  }).raw().toBuffer()
  await sharp(rgb, { raw: { width: 974, height: 974, channels: 3 } })
    .joinChannel(alpha, { raw: { width: 974, height: 974, channels: 1 } })
    .resize({ width: size, height: size, fit: 'contain', kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9 })
    .toFile(join(buildRoot, filename))
}))
