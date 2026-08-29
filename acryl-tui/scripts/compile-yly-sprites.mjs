// Compile the ACRYL YLY sprite sheet (13-cell horizontal strip, 96x84 cells)
// into ANSI half-block terminal frames at build time. No image decoder ships at
// runtime: the generated file is arrays of ANSI strings rendered by the pi-tui
// pet, matching the react mockup's `ylyFrames.ts` (CELL_W=96, CELL_H=84, 13 cells).
//
// Usage: node scripts/compile-yly-sprites.mjs [sheet] [out]
//   sheet (default) acryl-tui/assets/yly_sheet.png
//   out   (default) acryl-tui/src/yly/yly-frames.generated.ts
import sharp from 'sharp'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url))) // acryl-tui
const SOURCE = process.argv[2] ?? resolve(packageRoot, 'assets/yly_sheet.png')
const OUTPUT = process.argv[3] ?? resolve(packageRoot, 'src/yly/yly-frames.generated.ts')

// The sheet is a single horizontal strip of 13 cells, 96x84 each.
const CELL_W = 96
const CELL_H = 84
const FRAME_COUNT = 13

// Terminal size presets (col x row) matching the mockup's responsive sizes.
const SIZES = {
  small: { cols: 10, rows: 6 },
  medium: { cols: 14, rows: 8 },
  large: { cols: 20, rows: 11 },
}

const KEY_OUT_BLACK = false // the distilled sheet uses real alpha; do not key out dark pixels
const RESET = '\x1b[0m'

function transparent(p) {
  return p.a < 32
}
const fg = p => `\x1b[38;2;${p.r};${p.g};${p.b}m`
const bg = p => `\x1b[48;2;${p.r};${p.g};${p.b}m`

// Crop one cell, find the pet's opaque bounding box (the sheet cells carry a
// transparent border), then fit just that region into a (cols x rows) terminal
// viewport where each terminal row is TWO raster rows via half-block ▀ (top px
// -> fg, bottom px -> bg). `contain` (not `fill`) preserves the pet's native
// aspect ratio (~82x71 -> ~1.15): `fill` stretched the whole 96x84 cell
// non-uniformly into the preset grid (large 20x11 -> aspect 0.91), which is
// what made the mascot look distorted/simplified. The bbox is letterboxed and
// centred so all frames keep their height and the pet never jitters.
async function encodeCell(cellIndex, cols, rows) {
  const rasterW = cols
  const rasterH = rows * 2
  // Pass 1: raw cell buffer to find the opaque bbox (sharp's `.trim()` resets
  // geometry when chained after `.extract()`, so we scan alpha ourselves).
  const { data, info } = await sharp(SOURCE)
    .extract({ left: cellIndex * CELL_W, top: 0, width: CELL_W, height: CELL_H })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const { width, height } = info
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > 32) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < minX || maxY < minY) {
    return Array.from({ length: rows }, () => ' '.repeat(cols))
  }
  const bboxW = maxX - minX + 1
  const bboxH = maxY - minY + 1
  // Pass 2: fit just the opaque bbox into the grid, preserving aspect.
  const cell = await sharp(SOURCE)
    .extract({ left: cellIndex * CELL_W + minX, top: minY, width: bboxW, height: bboxH })
    .resize(rasterW, rasterH, { fit: 'contain', position: 'centre', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const { data: cellData, info: cellInfo } = cell
  const { width: cellW, height: cellH } = cellInfo
  const pixel = (x, y) => {
    const i = (y * cellW + x) * 4
    return { r: cellData[i], g: cellData[i + 1], b: cellData[i + 2], a: cellData[i + 3] }
  }
  const lines = []
  for (let y = 0; y < cellH; y += 2) {
    let line = ''
    for (let x = 0; x < cellW; x += 1) {
      const top = pixel(x, y)
      const bottom = y + 1 < cellH ? pixel(x, y + 1) : { r: 0, g: 0, b: 0, a: 0 }
      const tE = transparent(top)
      const bE = transparent(bottom)
      if (tE && bE) line += ' '
      else if (tE) line += `${fg(bottom)}▄${RESET}`
      else if (bE) line += `${fg(top)}▀${RESET}`
      else if (top.r === bottom.r && top.g === bottom.g && top.b === bottom.b) line += `${fg(top)}▀${RESET}`
      else line += `${fg(top)}${bg(bottom)}▀${RESET}`
    }
    lines.push(line)
  }
  return lines
}

async function main() {
  // Compile each size preset once at high resolution; the pet picks the preset
  // by terminal width. We emit a single canonical set (large) plus the other two
  // presets so narrow terminals get a smaller, still-crisp mascot.
  const frames = {}
  for (const [name, size] of Object.entries(SIZES)) {
    frames[name] = []
    for (let i = 0; i < FRAME_COUNT; i++) frames[name].push(await encodeCell(i, size.cols, size.rows))
  }
  mkdirSync(dirname(OUTPUT), { recursive: true })
  const serialize = obj => JSON.stringify(obj, null, 2)
    // strip nulls / collapse formatting kept readable
  const out = `/* eslint-disable */
// GENERATED by scripts/compile-yly-sprites.mjs from assets/yly_sheet.png.
// 13 frames x {small,medium,large} ANSI half-block preset. No runtime image decoder.
export const YLY_CELL_W = ${CELL_W}
export const YLY_CELL_H = ${CELL_H}
export const YLY_FRAME_COUNT = ${FRAME_COUNT}
export const YLY_SIZES = ${serialize(SIZES)} as const
export const YLY_FRAMES: Record<'small'|'medium'|'large', readonly (readonly string[])[]> = ${serialize(frames)}
`
  writeFileSync(OUTPUT, out)
  // ASCII preview of the large idle (frame 0) so the crop can be eyeballed.
  const strip = s => s.replace(/\x1b\[[0-9;]*m/g, '').replace(/[▀▄]/g, '█')
  console.log(`Wrote ${FRAME_COUNT} frames x 3 presets -> ${OUTPUT}\n--- large frame 0 ---\n${frames.large[0].map(strip).join('\n')}`)
}

main().catch(err => { console.error(err); process.exit(1) })
