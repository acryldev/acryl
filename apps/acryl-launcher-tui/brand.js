// The ACRYL look in a terminal: the mark, the spectrum of acryl.dev (cyan, violet, pink, amber) as a gradient over text, the title shimmer and the
// spinner. Every function here is pure: the same arguments give the same lines, so a test reads exactly what the terminal shows.
import { visibleWidth } from '@earendil-works/pi-tui'

const ESC = '\x1b'

/** The ACRYL mark (assets/pixelized, as half blocks; the same rows the ACRYL CLI header draws): 11 rows, 54 columns. */
export const MARK_ROWS = Object.freeze([
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
])
export const MARK_WIDTH = 54

/**
 * acryl.dev's spectrum (--spectrum-start, -mid, -end: oklch hue 200, 320, 95) with violet between cyan and pink, as RGB stops. A light terminal gets
 * deeper tones of the same hues, so every letter keeps a readable contrast on white.
 */
export const SPECTRUM = Object.freeze({
  dark: Object.freeze([[34, 211, 238], [139, 92, 246], [236, 72, 153], [245, 158, 11]]),
  light: Object.freeze([[8, 145, 178], [109, 40, 217], [190, 24, 93], [180, 83, 9]]),
})

/** Colors on or off: off for NO_COLOR (any value, no-color.org), TERM=dumb, or output that is not a terminal; FORCE_COLOR turns them on. */
export function colorEnabled(env = {}, isTTY = false) {
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') return false
  if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== '0') return true
  return isTTY && env.TERM !== 'dumb'
}

const mix = (a, b, t) => a.map((channel, index) => Math.round(channel + (b[index] - channel) * t))

/** The spectrum's color at `t` (0 at cyan, 1 at amber). */
export function spectrumAt(t, mode = 'dark') {
  const stops = SPECTRUM[mode] ?? SPECTRUM.dark
  const at = Math.min(1, Math.max(0, t)) * (stops.length - 1)
  const index = Math.min(stops.length - 2, Math.floor(at))
  return mix(stops[index], stops[index + 1], at - index)
}

const fg = ([r, g, b]) => `${ESC}[38;2;${r};${g};${b}m`

/**
 * `text` painted across the spectrum, one color per visible character (spaces carry none, so a half-block mark keeps its shape). `shimmer`, between 0 and
 * 1, is where a bright band crosses the text (the title's start animation); undefined draws none. `span` stretches the gradient over more columns than
 * the text has, so the lines of the mark share one gradient. With `color` false the text comes back unchanged.
 */
export function gradient(text, { mode = 'dark', color = true, shimmer, span, bold = false } = {}) {
  if (!color) return text
  const chars = [...text]
  const width = Math.max(2, span ?? chars.length)
  const glow = mode === 'light' ? [0, 0, 0] : [255, 255, 255]
  let out = bold ? `${ESC}[1m` : ''
  chars.forEach((char, index) => {
    if (char === ' ') { out += char; return }
    const t = index / (width - 1)
    let rgb = spectrumAt(t, mode)
    if (shimmer !== undefined) {
      const distance = Math.abs(t - (shimmer * 1.4 - 0.2))
      if (distance < 0.18) rgb = mix(rgb, glow, (1 - distance / 0.18) * 0.55)
    }
    out += fg(rgb) + char
  })
  return `${out}${ESC}[0m`
}

/** The mark, every row on one shared gradient; undefined when `width` cannot hold it (the header then shows the one-line wordmark). */
export function markLines(width, options = {}) {
  if (width < MARK_WIDTH) return undefined
  const indent = ' '.repeat(Math.floor((width - MARK_WIDTH) / 2))
  return MARK_ROWS.map(row => indent + gradient(row, { ...options, span: MARK_WIDTH }))
}

/** The one-line wordmark for narrow or short terminals: `▲ ACRYL  Control Center`. */
export function wordmark(options = {}) {
  return gradient('▲ ACRYL', { ...options, bold: true }) + (options.color === false ? '  Control Center' : `  ${ESC}[1mControl Center${ESC}[22m`)
}

/** A section title: the words in the spectrum and a thin rule after them, `width` columns in all. */
export function sectionTitle(title, width, options = {}) {
  const words = gradient(title.toUpperCase(), { ...options, bold: true })
  const rest = Math.max(0, width - visibleWidth(title) - 1)
  const rule = '─'.repeat(rest)
  return rest === 0 ? words : `${words} ${options.color === false ? rule : `${ESC}[2m${rule}${ESC}[22m`}`
}

/** A braille spinner, one frame per tick. */
export const SPINNER = Object.freeze(['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'])
export const spinnerFrame = tick => SPINNER[((tick % SPINNER.length) + SPINNER.length) % SPINNER.length]

/** How long the title shimmers after the screen opens, in ticks of `TICK_MS`. */
export const TICK_MS = 80
export const SHIMMER_TICKS = 22

/** The shimmer position for a tick, or undefined once it is over. */
export const shimmerAt = tick => (tick < SHIMMER_TICKS ? tick / (SHIMMER_TICKS - 1) : undefined)
