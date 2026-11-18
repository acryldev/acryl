/**
 * What an app in the ACRYL frame needs from pnpm to install and start as it does with npm, kept in the app's `pnpm-workspace.yaml` (npm never reads it).
 *
 * - `nodeLinker: hoisted`: the frame's host composes about a hundred DSH rows by package name from the app's own folder, which finds them only in a flat
 *   `node_modules` (npm's layout). pnpm's isolated layout hides them, and the host stops with "failed to import" on every row.
 * - `allowBuilds`: pnpm 11 and later refuse to finish an install while a dependency's build script is neither allowed nor denied. The frame's packages
 *   whose scripts run under npm (frame/packages.json `pnpm.allowBuilds`) are allowed, so pnpm installs what npm installs.
 * - `overrides`: what the frame omits (frame/packages.json `omit`, the LibreOffice engines) becomes the same empty placeholder npm installs.
 *
 * The file is the person's too (pnpm itself writes `minimumReleaseAgeExclude` there), so it is edited by lines: a key they set is never changed, and
 * their comments and layout stay.
 */
import release from '../../../frame/packages.json' with { type: 'json' }
import { omitOverrides } from './frame-omit.ts'

/** The frame's dependencies whose build scripts pnpm must run. */
export const FRAME_ALLOW_BUILDS: readonly string[] = release.pnpm.allowBuilds

export const PNPM_WORKSPACE_FILE = 'pnpm-workspace.yaml'

/** A top-level key line (`name:` at column 0), with or without a value after it. */
function topKey(line: string): string | undefined {
  return /^([A-Za-z][\w-]*):/u.exec(line)?.[1]
}

/** A YAML map key, quoted when it is not a plain word (a scoped package name). */
function yamlKey(name: string): string {
  return /^[\w.-]+$/u.test(name) ? name : `'${name}'`
}

/** The keys a top-level block (`allowBuilds:`, `overrides:`) already has, and the line right after its last entry. */
function blockKeys(lines: readonly string[], start: number): { names: Set<string>; end: number } {
  const names = new Set<string>()
  // Right after the block's last entry: blank lines and comments after it belong to what follows.
  let end = start + 1
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue
    if (!/^\s/u.test(line)) break
    const key = /^\s+(['"]?)(.+?)\1\s*:/u.exec(line)?.[2]
    if (key !== undefined) names.add(key)
    end = index + 1
  }
  return { names, end }
}

/**
 * Add `entries` to the top-level block `key`: the whole block, under `comment`, when there is none, else only the keys it lacks. A key the person set is
 * never changed, and an inline value (`allowBuilds: {}`) is theirs: only a block is extended.
 */
function mergeBlock(
  lines: string[],
  key: string,
  entries: readonly (readonly [string, string])[],
  comment: string,
): void {
  const at = lines.findIndex((line) => topKey(line) === key)
  if (at === -1) {
    if (entries.length > 0)
      lines.push(
        comment,
        `${key}:`,
        ...entries.map(([name, value]) => `  ${yamlKey(name)}: ${value}`),
      )
    return
  }
  const { names, end } = blockKeys(lines, at)
  const missing = entries.filter(([name]) => !names.has(name))
  if (missing.length > 0 && new RegExp(`^${key}:\\s*(#.*)?$`, 'u').test(lines[at] ?? ''))
    lines.splice(end, 0, ...missing.map(([name, value]) => `  ${yamlKey(name)}: ${value}`))
}

/**
 * `pnpm-workspace.yaml` with the frame's settings added: the whole file when there is none, else only what it lacks. `builds` defaults to the frame's
 * list, `overrides` to what the frame omits. Returns the text unchanged when nothing is missing.
 */
export function withFramePnpmSettings(
  text: string | undefined,
  builds: readonly string[] = FRAME_ALLOW_BUILDS,
  overrides: Readonly<Record<string, string>> = omitOverrides(),
): string {
  const lines = text === undefined || text === '' ? [] : text.replace(/\n$/u, '').split('\n')
  const keys = new Set(lines.map(topKey).filter((key) => key !== undefined))
  if (!keys.has('nodeLinker')) {
    lines.push(
      '# The ACRYL frame finds its packages in a flat node_modules, as npm lays it out (acrylblends writes this; npm ignores the file).',
      'nodeLinker: hoisted',
    )
  }
  mergeBlock(
    lines,
    'allowBuilds',
    builds.map((name) => [name, 'true'] as const),
    "# The frame's packages whose install scripts npm runs too; pnpm stops an install while a build is neither allowed nor denied.",
  )
  mergeBlock(
    lines,
    'overrides',
    Object.entries(overrides).map(([name, spec]) => [name, `'${spec}'`] as const),
    "# What the frame does not install (the LibreOffice engines, 153 MB): an empty placeholder, as npm's overrides in package.json. Settings > Plugins > Office preview brings it back.",
  )
  const next = lines.length === 0 ? '' : `${lines.join('\n')}\n`
  return text !== undefined && next === text ? text : next
}
