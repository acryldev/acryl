/**
 * The compact ACRYL wordmark shown in the fixed header, next to the pet.
 *
 * This is the real pixelized brand wordmark (`assets/pixelized/`), rendered
 * natively as half-block characters (each terminal row packs 2 pixel rows
 * via \u2580/\u2584/\u2588) instead of downsampled or replaced with a different mark \u2014 54
 * columns wide at the artwork's own resolution, not simplified. Generated
 * from the SVG's rect grid and verified by printing it before wiring into
 * the header \u2014 same proven-before-embedding convention as
 * `yly/compile-sprites.mjs`.
 * @module @tomowave/dsh-tui/tui/acrylMark
 */

/** The plain (uncolored) rows of the ACRYL mark \u2014 11 lines, 54 columns. */
export const ACRYL_MARK_ROWS: readonly string[] = [
  '                    ▄▀▀▀▀▀▀▀▀                         ',
  '                  ▄▀   ▄▄▄▄▄▄▄▄▄                      ',
  '      ▄▄         ▄             ▀▄                     ',
  '    ▄█▀█▄      ▄▀         ▄▄▄▄▄█                      ',
  '  ▄█▀    ▀█▀▀▀▀█▄          ▀▄                ▄▀       ',
  ' █▀       ▀▄    ▀█          ▀▄▄            ▄█         ',
  '▀▀          ▀    ▀█▄           ▄         ▄██▄▄▄▄▄▄▄▄▄▄',
  '                   ▀▀▀▀▀▀▀▀▀▀▀  ▀▀▄   ▄▀▀             ',
  '                                  ▀▄▄▄▀               ',
  '                                    █                 ',
  '                                    ▀                 ',
]
