/**
 * The compact ACRYL wordmark shown in the fixed header, next to the pet.
 *
 * The full pixelized brand wordmark (`assets/pixelized/`) is thin, stroke-
 * based line art — 54 columns by 21 rows at native resolution — which reads
 * fine as a wide splash banner but turns to noise compressed into the
 * header's ~30-column slot. This is a deliberately separate, purpose-built
 * mark instead: a classic 5x7 dot-matrix block font, rendered solid, sized
 * to stay legible at the header's actual width. Not a downsampled copy of
 * the pixelized wordmark — a different asset for a different constraint.
 *
 * Letter bitmaps are 5 columns x 7 rows, '1' = filled. Verified by printing
 * `ACRYL_MARK_ROWS` directly before wiring it into the header — same
 * proven-before-embedding convention as `yly/compile-sprites.mjs`.
 * @module @tomowave/dsh-tui/tui/acrylMark
 */

const FONT_5X7: Record<string, readonly string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
}

const GLYPH_HEIGHT = 7
const FILLED = '█'
const EMPTY = ' '

function renderWord(word: string): readonly string[] {
  const rows: string[] = []
  for (let row = 0; row < GLYPH_HEIGHT; row++) {
    rows.push(word
      .split('')
      .map(letter => {
        const bitmap = FONT_5X7[letter]
        if (bitmap === undefined) throw new Error(`acrylMark: no 5x7 bitmap for letter "${letter}"`)
        return bitmap[row]!.split('').map(bit => (bit === '1' ? FILLED : EMPTY)).join('')
      })
      .join(' '))
  }
  return rows
}

/** The plain (uncolored) rows of the ACRYL mark — 7 lines, 29 columns. */
export const ACRYL_MARK_ROWS: readonly string[] = renderWord('ACRYL')
