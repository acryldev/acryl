/**
 * The product name Electron shows in the Dock, the application menu, the window and diagnostics. An app built on the framework is the user's product
 * (spec 036), so it carries the app's own name: `ACRYL_BRAND_NAME` when set, else the brand of the selected Blueprint or app definition (`blend.yaml`), else
 * `ACRYL`. A definition that cannot be read falls back to `ACRYL` here; the runtime reports the error itself when it boots.
 */

import { blueprintFromEnvironment } from 'acryl-harness-runtime'

export const DEFAULT_PRODUCT_NAME = 'ACRYL'
const MAX_PRODUCT_NAME = 40

export function resolveProductName(env: NodeJS.ProcessEnv = process.env): string {
  const branded = env.ACRYL_BRAND_NAME?.trim() || blueprintBrandName(env)
  if (branded === undefined || branded === '') return DEFAULT_PRODUCT_NAME
  // A control character or an over-long value would end up in a window title and a log header: fall back rather than show it.
  // eslint-disable-next-line no-control-regex
  if (branded.length > MAX_PRODUCT_NAME || /[\u0000-\u001f\u007f]/u.test(branded)) return DEFAULT_PRODUCT_NAME
  return branded
}

function blueprintBrandName(env: NodeJS.ProcessEnv): string | undefined {
  try {
    const blueprint = blueprintFromEnvironment(env)
    return blueprint.brand.kind === 'custom' ? blueprint.brand.identity.name : undefined
  } catch {
    return undefined
  }
}
