/**
 * ACRYL's own data root, nested one level above the DSH engine home it
 * composes.
 *
 * The stock DSH Desktop app (from dshdesktop.com) uses plain `~/.dsh`, and so
 * did every ACRYL surface until now — sharing that root made the two
 * genuinely different products silently share credentials/settings/sessions,
 * which is both confusing and useless for comparing ACRYL against a stock
 * DSH Desktop install side by side. ACRYL now owns `~/.acryl` and nests each
 * engine's artifacts under it by engine name:
 *
 * ```txt
 * ~/.acryl/            ACRYL's own root — everything not engine-specific
 * ~/.acryl/.dsh/        the DSH engine home (what DSH_HOME resolves to)
 * ~/.acryl/.pi/         reserved for a future pi.dev engine
 * ```
 *
 * `$DSH_HOME`, if a caller has already set it explicitly, still wins — this
 * only changes the *default* the harness's own `resolveDshHome()` falls
 * back to when nothing overrides it.
 *
 * @module acryl-harness-runtime/acryl-home
 */

import { homedir } from 'node:os'
import { join } from 'node:path'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'

/** ACRYL's own root directory name under the OS home. */
export const ACRYL_HOME_DIR_NAME = '.acryl'

/** The DSH engine's directory name, nested under ACRYL's root. */
export const ACRYL_DSH_ENGINE_DIR_NAME = '.dsh'

/** ACRYL's own root — `~/.acryl` unless `$ACRYL_HOME` overrides it. */
export function resolveAcrylHome(env: Record<string, string | undefined> = process.env): string {
  const overridden = env.ACRYL_HOME?.trim()
  return overridden && overridden !== '' ? overridden : join(homedir(), ACRYL_HOME_DIR_NAME)
}

/**
 * The DSH engine home ACRYL boots against: `$DSH_HOME` if a caller already
 * set it (highest precedence, same as `resolveDshHome()` itself), otherwise
 * `<acrylHome>/.dsh` instead of the harness's own bare `~/.dsh` default.
 */
export function resolveAcrylDshHome(env: Record<string, string | undefined> = process.env): string {
  const overridden = env.DSH_HOME?.trim()
  if (overridden && overridden !== '') return resolveDshHome(undefined, env)
  return resolveDshHome(join(resolveAcrylHome(env), ACRYL_DSH_ENGINE_DIR_NAME), env)
}
