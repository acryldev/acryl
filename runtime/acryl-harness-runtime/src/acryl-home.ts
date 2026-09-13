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
 * `$ACRYL_HOME`, if a caller has set it, is authoritative: it is the
 * product-level root, so the DSH engine home becomes `<ACRYL_HOME>/.dsh`
 * regardless of any ambient `$DSH_HOME`. That is what makes
 * `ACRYL_HOME=/tmp/x acryl ...` a complete isolation switch. When
 * `$ACRYL_HOME` is unset, an explicit `$DSH_HOME` is still honored, and with
 * neither set the default is `<~/.acryl>/.dsh` rather than the harness's own
 * bare `~/.dsh`.
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

function isSet(value: string | undefined): boolean {
  return value !== undefined && value.trim() !== ''
}

/** ACRYL's own root — `~/.acryl` unless `$ACRYL_HOME` overrides it. */
export function resolveAcrylHome(env: Record<string, string | undefined> = process.env): string {
  const overridden = env.ACRYL_HOME?.trim()
  return overridden && overridden !== '' ? overridden : join(homedir(), ACRYL_HOME_DIR_NAME)
}

/**
 * The DSH engine home ACRYL boots against. Precedence, highest first:
 *
 * 1. `$ACRYL_HOME` set -> `<acrylHome>/.dsh`. ACRYL is the product that owns
 *    the root and engines nest inside it, so pinning ACRYL's root is a
 *    **complete** isolation switch.
 * 2. `$DSH_HOME` set (and `$ACRYL_HOME` unset) -> that value, for callers
 *    pointing ACRYL at an existing DSH home.
 * 3. Neither -> `<~/.acryl>/.dsh`, never the harness's own bare `~/.dsh`.
 *
 * An ambient `$DSH_HOME` must NOT outrank an explicit `$ACRYL_HOME`. That
 * ordering used to invert these, which made isolation silently unenforceable:
 * `DSH_HOME` is commonly exported in a developer shell (and set by the DSH
 * Desktop app), so `ACRYL_HOME=/tmp/x` would read and write the operator's
 * real `~/.dsh` unchanged - credentials, sessions and all. A cold-start or
 * clean-room test written that way passes while never being isolated.
 */
export function resolveAcrylDshHome(env: Record<string, string | undefined> = process.env): string {
  if (!isSet(env.ACRYL_HOME) && isSet(env.DSH_HOME)) return resolveDshHome(undefined, env)
  return resolveDshHome(join(resolveAcrylHome(env), ACRYL_DSH_ENGINE_DIR_NAME), env)
}
