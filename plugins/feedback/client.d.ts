// Types for the browser client served as-is (client.js): the Host reads it as text and appends its start call; tests import the exported helpers.

/** The ACRYL frame's view handle, or undefined when the page is not in the frame's canvas. */
export function frameViewOf(win: {
  readonly parent: unknown
}): { readonly mode: 'build' | 'preview' } | undefined

/** A short name for a picked element: what it says it is, else its heading, else the first words it shows, else its tag. */
export function elementLabel(element: Element): string

/** The stored size of a screenshot: the whole view, downscaled to `maxSide`. */
export function shotSize(
  width: number,
  height: number,
  maxSide?: number,
): { width: number; height: number }

/** The largest screenshot the page sends (decoded bytes); the Host refuses more than 512 KB. */
export const SHOT_MAX_BYTES: number

/** Whether this browser can capture the current tab (Chromium only; Firefox and Safari would offer the whole screen). */
export function canCaptureTab(userAgent: string, hasDisplayCapture: boolean): boolean
