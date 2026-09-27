/**
 * The product name Electron shows in the Dock, the application menu, the window and diagnostics. It is `ACRYL` unless the instance is branded
 * (`ACRYL_BRAND_NAME`, spec 036): then several Desktop instances of different Blends are told apart at a glance instead of all reading "ACRYL".
 * Pure: the caller passes the environment.
 */

export const DEFAULT_PRODUCT_NAME = 'ACRYL'
const MAX_PRODUCT_NAME = 40

export function resolveProductName(env: NodeJS.ProcessEnv = process.env): string {
  const branded = env.ACRYL_BRAND_NAME?.trim()
  if (branded === undefined || branded === '') return DEFAULT_PRODUCT_NAME
  // A control character or an over-long value would end up in a window title and a log header: fall back rather than show it.
  // eslint-disable-next-line no-control-regex
  if (branded.length > MAX_PRODUCT_NAME || /[\u0000-\u001f\u007f]/u.test(branded)) return DEFAULT_PRODUCT_NAME
  return branded
}
