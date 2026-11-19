import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Plugins that `acrylblends add` mounts itself: a row in `blend.yaml` (after the row it needs, before the `routes` row) and an entry in the `registry` of `src/app.ts`.
 * `needs` are the rows the plugin cannot run without; an app that lacks them is refused before anything is copied.
 */
export interface Mounted {
  readonly name: string
  /** The identifier of the registry import, and the plugin names (the `name:` of a row) it needs. */
  readonly local: string
  readonly needs: readonly string[]
  /** The row this one goes after (it goes before `routes` otherwise). */
  readonly after?: string
  /** The `id:` of its row, when it is not the plugin's name (`db` for @acryldev/db-sqlite). */
  readonly row?: string
  /** Its entry file inside the plugin's folder (`index.ts`, or `src/index.ts` for the plugins that keep their source in `src/`). */
  readonly entry?: string
  /** The plugin is a named export of its entry (`import { pluginShare }`), not the module itself (`import * as panel`). */
  readonly named?: boolean
}

export const MOUNTED: readonly Mounted[] = [
  { name: 'agent-panel', local: 'panel', needs: ['agent', 'extensions'] },
  { name: 'driver-pty', local: 'driverPty', needs: ['agent-panel'], after: 'agent-panel' },
  { name: 'driver-acp', local: 'driverAcp', needs: ['agent-panel'], after: 'agent-panel' },
  { name: 'feedback', local: 'feedback', needs: ['@acryldev/router'] },
  { name: 'showcase', local: 'showcase', needs: ['plugin-share'], after: 'plugin-share' },
  // Sharing (pull, publish): every template has it since 1.3, and an app made from an older starter gets it with `add plugin-share`.
  {
    name: 'plugin-share',
    local: 'pluginShare',
    named: true,
    needs: ['extensions'],
    after: 'extensions',
  },
]

/** The import line `mount` writes into `src/app.ts` for one plugin. */
export function registrationImport(plugin: Mounted): string {
  const binding = plugin.named === true ? `{ ${plugin.local} }` : `* as ${plugin.local}`
  return `import ${binding} from '../plugins/${plugin.name}/${plugin.entry ?? 'index.ts'}'`
}

/** A row, in either line ending: a file edited on Windows (or checked out with core.autocrlf) is still a Blend. */
const ROW = /^( *)- id: ?(\S+)\r?\n\1 {2}name: ?(\S+)\r?\n/gmu

/** The line ending the text already uses, so an edit keeps the file's own style. */
const eolOf = (text: string): string => (text.includes('\r\n') ? '\r\n' : '\n')

/** The `name:` of every row of the app's `blend.yaml`, or `undefined` when it has none. */
export function rowNames(appDir: string): string[] | undefined {
  const file = join(appDir, 'blend.yaml')
  if (!existsSync(file)) return undefined
  return [...readFileSync(file, 'utf8').matchAll(ROW)].map((match) => match[3] as string)
}

/** What a plugin to be mounted is missing: the rows it needs that neither the app nor this same command brings. */
export function missingRows(
  appDir: string,
  plugin: Mounted,
  alsoAdded: readonly string[],
): string[] {
  const have = rowNames(appDir) ?? []
  return plugin.needs.filter((need) => !have.includes(need) && !alsoAdded.includes(need))
}

export interface MountResult {
  readonly done: boolean
  /** What was edited, or why it was not (the person finishes by hand). */
  readonly note: string
}

/** Add the row to `blend.yaml` and the entry to `src/app.ts`; each only when it is not there yet and its place is where the template puts it. */
export function mount(appDir: string, plugin: Mounted): MountResult {
  const done: string[] = []
  const failed: string[] = []
  const manifestFile = join(appDir, 'blend.yaml')
  if (existsSync(manifestFile)) {
    let text = readFileSync(manifestFile, 'utf8')
    if ([...text.matchAll(ROW)].some((match) => match[3] === plugin.name))
      done.push('blend.yaml (already has the row)')
    else {
      const eol = eolOf(text)
      const anchor = plugin.after
        ? new RegExp(
            `^( *)- id: ?\\S+\\r?\\n\\1 {2}name: ?${plugin.after}\\r?\\n(?:\\1 {2}config:\\r?\\n(?:\\1 {4}.*\\r?\\n|\\1 {2}\\s*\\r?\\n)*)?`,
            'mu',
          )
        : /^( *)- id: ?routes\r?\n/mu
      const found = anchor.exec(text)
      if (found) {
        const indent = found[1] as string
        const row = `${indent}- id: ${plugin.row ?? plugin.name}${eol}${indent}  name: ${plugin.name}${eol}`
        const at = plugin.after ? found.index + found[0].length : found.index
        text = text.slice(0, at) + row + text.slice(at)
        writeFileSync(manifestFile, text)
        done.push(`blend.yaml (row ${plugin.name})`)
      } else
        failed.push(
          `blend.yaml: add a row \`- id: ${plugin.name}\` / \`name: ${plugin.name}\` ${plugin.after ? `after the ${plugin.after} row` : 'before the `routes` row'}`,
        )
    }
  }
  const appFile = join(appDir, 'src', 'app.ts')
  if (existsSync(appFile)) {
    let text = readFileSync(appFile, 'utf8')
    const entry = `'${plugin.name}': ${plugin.local}`
    if (text.includes(entry)) done.push('src/app.ts (already registered)')
    else {
      const eol = eolOf(text)
      const imports = [...text.matchAll(/^import .* from '\.\.\/plugins\/[^']+'\r?\n/gmu)]
      const last = imports.at(-1)
      // The registry as the templates write it: one entry per line, or all on one line (`{ '@acryldev/router': router, routes }`).
      const table = /^export const registry = \{(\r?\n)/mu.exec(text)
      if (last && table) {
        const line = `${registrationImport(plugin)}${eol}`
        const at = table.index + table[0].length
        text =
          text.slice(0, at) +
          (table[1] === '\n' || table[1] === '\r\n' ? `  ${entry},${eol}` : `${entry}, `) +
          text.slice(at)
        const lastEnd = last.index + last[0].length
        text = text.slice(0, lastEnd) + line + text.slice(lastEnd)
        writeFileSync(appFile, text)
        done.push(`src/app.ts (registered as ${plugin.local})`)
      } else
        failed.push(
          `src/app.ts: add the line \`${registrationImport(plugin)}\` and add \`${entry}\` to the registry`,
        )
    }
  } else failed.push(`src/app.ts: not found; register ${entry(plugin)} in the app's registry`)
  return {
    done: failed.length === 0,
    note: [
      done.length > 0 ? `mounted in ${done.join(' and ')}` : '',
      ...failed.map((line) => `could not edit ${line}`),
    ]
      .filter(Boolean)
      .join('\n'),
  }
}

const entry = (plugin: Mounted) => `'${plugin.name}': ${plugin.local}`
