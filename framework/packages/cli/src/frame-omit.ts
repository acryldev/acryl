/**
 * What a framed app does not install although DSH brings it (frame/packages.json `omit`): the npm packages swapped for an empty placeholder, and the
 * rows switched off because they would need them. The generated `package.json` (npm `overrides`), `pnpm-workspace.yaml` (pnpm `overrides`) and
 * `cordis.patch.yml` (the rows) all read it from here, so the three cannot disagree.
 */
import release from '../../../frame/packages.json' with { type: 'json' }

/** The empty package an omitted package becomes, as `name@version`. */
export const OMIT_PLACEHOLDER: string = release.omit.placeholder

/** The packages a framed app does not install. */
export const OMITTED_PACKAGES: readonly string[] = release.omit.packages

/** The rows switched off because what they load is not installed. */
export const OMITTED_ROWS: readonly string[] = release.omit.rows

/** The override each omitted package gets, the same for npm and pnpm: an alias of the placeholder. */
export function omitOverrides(): Record<string, string> {
  return Object.fromEntries(OMITTED_PACKAGES.map((name) => [name, `npm:${OMIT_PLACEHOLDER}`]))
}
