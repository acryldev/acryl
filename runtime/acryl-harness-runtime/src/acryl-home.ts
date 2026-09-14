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

/**
 * The isolated local-dev DSH home (`~/.acryl-dev/.dsh`) — a third root,
 * deliberately sibling to (not nested inside) both `resolveAcrylDshHome`'s
 * packaged-install default (`~/.acryl/.dsh`) and the stock DSH Desktop's
 * plain `~/.dsh`, so a dev run never collides with either.
 *
 * `scripts/dev-local.mjs` at the repo root is this value's one canonical,
 * hand-written definition (it runs before any workspace package builds, so
 * it cannot import this module) and is what actually sets `$DSH_HOME` for
 * `pnpm run dev`. Every *other* desktop dev-mode entry point - `apps/
 * acryl-desktop/scripts/launch-dev.mjs`, `verify-loader-boot.mjs`,
 * `verify-profile-boot.mjs` - runs strictly after that package already
 * built, so they import this exported copy instead of re-deriving it, and
 * default `$DSH_HOME` to it when unset. That is what makes running the
 * desktop package's own script directly (`pnpm --filter acryl-desktop run
 * dev`, bypassing the root orchestrator) resolve the identical isolated
 * home rather than silently falling back to `resolveAcrylDshHome`'s
 * packaged-install default - a real, reproduced footgun (2026-09-14) that
 * this function exists to close for good.
 */
export const ACRYL_DEV_HOME_DIR_NAME = '.acryl-dev'

/** The isolated local-dev DSH home - see {@link ACRYL_DEV_HOME_DIR_NAME}'s doc comment. */
export function resolveAcrylDevDshHome(): string {
  return join(homedir(), ACRYL_DEV_HOME_DIR_NAME, ACRYL_DSH_ENGINE_DIR_NAME)
}

/**
 * Default `$DSH_HOME` (in-place, on the given env) to the isolated
 * local-dev home when neither `$ACRYL_HOME` nor `$DSH_HOME` is already set.
 * Call this once, at the very top of a desktop dev-mode script, before
 * anything else reads the environment.
 */
export function applyIsolatedDevHomeDefault(env: Record<string, string | undefined> = process.env): void {
  if (isSet(env.ACRYL_HOME) || isSet(env.DSH_HOME)) return
  env.DSH_HOME = resolveAcrylDevDshHome()
}
