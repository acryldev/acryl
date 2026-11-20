import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { parseArgs } from 'node:util'
import {
  type ChangedLine,
  ownerChangeLines,
  stripRegistrations,
  withRegistrations,
} from './app-registration.ts'
import { diffStat, unifiedDiff } from './diff'
import { type FrameProfileSpecs, frameProfileForApp, frameProfileInput } from './frame-release'
import { APP_PLUGINS_FILE, appFrameRows, carriesComposeInto } from './frame-rows'
import {
  GENERATED_MARKER,
  type IdeProfileInput,
  type IdeProfileWritePlan,
  planIdeProfileWrite,
  writeIdeProfilePlan,
} from './ide-profile'
import { UsageError } from './init'
import type { Io } from './io'
import {
  appNameOf,
  brokenEntry,
  carriesFrame,
  identifyTemplate,
  readLegacy,
  releasedRange,
} from './legacy'
import {
  closure,
  copyPlugin,
  LEGACY_WARNING,
  LIBRARY_LIST,
  type LibraryPlugin,
  PACKAGED,
  packagedDependency,
  pluginsFolder,
  readLibrary,
  recordLibraryCopy,
} from './library'
import { hashFolder, readHistory, readLock, recordLock } from './lock'
import { appendGitignore, mergeDependencies, mergeImports, mergeTooling } from './project'
import { type Template, templateDir } from './templates'
import { VERSION } from './version'

/** The app's package.json dependencies. */
function readManifestDependencies(appDir: string): Readonly<Record<string, string>> {
  return (
    (
      JSON.parse(readText(join(appDir, 'package.json'))) as {
        dependencies?: Record<string, string>
      }
    ).dependencies ?? {}
  )
}

export interface UpgradeOptions {
  /** Library plugins to upgrade; none means every library plugin the app carries. */
  readonly names: readonly string[]
  readonly directory: string | undefined
  /** Show what would change and stop. */
  readonly dryRun: boolean
  /** Replace a file the app edited too (the edited version is saved first). */
  readonly force: boolean
  /** Print the diff of every changed file, not only of the edited ones. */
  readonly diff: boolean
}

/** Parse `upgrade [plugin...] [--dir <app>] [--dry-run] [--force] [--diff]`. */
export function parseUpgradeOptions(argv: readonly string[]): UpgradeOptions {
  let parsed: ReturnType<typeof parse>
  try {
    parsed = parse(argv)
  } catch (error) {
    throw new UsageError((error as Error).message)
  }
  return {
    names: parsed.positionals,
    directory: parsed.values.dir,
    dryRun: parsed.values['dry-run'] === true,
    force: parsed.values.force === true,
    diff: parsed.values.diff === true,
  }
}

const parse = (argv: readonly string[]) =>
  parseArgs({
    args: [...argv],
    allowPositionals: true,
    strict: true,
    options: {
      dir: { type: 'string' },
      'dry-run': { type: 'boolean' },
      force: { type: 'boolean' },
      diff: { type: 'boolean' },
    },
  })

type FileState = 'same' | 'add' | 'update' | 'conflict' | 'remove' | 'extra'

interface PluginPlan {
  readonly plugin: LibraryPlugin
  /** The app does not have this plugin at all (a new requirement of one that it has). */
  readonly isNew: boolean
  /** Path inside the plugin folder to what happens to it. */
  readonly files: Map<string, FileState>
  /** The hashes of the files the current library would copy. */
  readonly fresh: Record<string, string>
}

const posix = (path: string): string => path.split(sep).join('/')

function readText(path: string): string {
  return readFileSync(path, 'utf8')
}

/** The library copies an app carries: the plugins listed in `plugins/library.json`, or when there is none the folders of `plugins/` that the library knows. */
function carriedCopies(dir: string): string[] {
  const listFile = join(dir, LIBRARY_LIST)
  const listed = existsSync(listFile)
    ? ((JSON.parse(readFileSync(listFile, 'utf8')) as { plugins?: string[] }).plugins ?? [])
    : readdirSync(dir).filter((name) => statSync(join(dir, name)).isDirectory())
  return listed.filter((name) => existsSync(join(dir, name)))
}

/** The plugins the frame's host layer mounts by path: any framed app carries them, and an app made before the frame gets them here. */
const HOST_PLUGINS = ['@acryldev/web-server', '@acryldev/page'] as const

/** A library plugin a scaffold file imports: `from '../plugins/<name>/...'`. */
const PLUGIN_IMPORT = /from '\.\.\/plugins\/([^/']+)\//gu

/** The profile script the DSH-profile layout used; the host launcher replaced it, so an app upgraded from that layout drops it. */
const OLD_PROFILE_SCRIPT = 'scripts/ide-profile.mjs'

/** One file the frame step writes: a template scaffold file, the frame row, or the generated composition row. */
interface FrameFileWrite {
  readonly file: string
  readonly text: string
  readonly state: 'add' | 'same' | 'update' | 'conflict'
}

/**
 * Scaffold files the app owns from its first edit: the release's copy is only the starting point, so an edited (or removed) one is never written, refused
 * over or backed up. A copy the app never edited is still the release's and is updated like any other scaffold file.
 */
export const KEPT_BY_THE_APP = new Set(['src/routes.ts'])

/** What the frame row of every template imports from `src/routes.ts`: an app-owned copy without it cannot be shown in the frame. */
const FRAME_PREFIX_EXPORT = /\bexport const FRAME_MOUNT_PREFIX\b/u

/** What `upgrade` does about the frame for one app: nothing (and why), or a plan computed before anything is written. */
export type FrameStep =
  | { readonly kind: 'unidentified' }
  | { readonly kind: 'broken-scaffold'; readonly file: string }
  | { readonly kind: 'no-frame-template'; readonly template: Template }
  | { readonly kind: 'unavailable'; readonly template: Template | undefined }
  | {
      readonly kind: 'planned'
      /** The template whose scaffold the app carries; undefined for an app built on its own (a registry blueprint), whose scaffold is never written. */
      readonly template: Template | undefined
      /** What the overlay's rows and the package.json merge are planned from. */
      readonly input: IdeProfileInput
      readonly profile: IdeProfileWritePlan
      /** The app's scaffold, its frame row and the generated composition row. */
      readonly files: readonly FrameFileWrite[]
      /** App-owned scaffold files left exactly as the app has them (edited or removed), each with whether the frame can mount it. */
      readonly kept: readonly { readonly file: string; readonly mountable: boolean }[]
      /**
       * Library plugins the app does not carry yet and gets: the frame's host plugins, and every plugin the scaffold files written here import (with what
       * they require), so a release whose template mounts a new plugin (the agent template's `home`) leaves an app that starts.
       */
      readonly addedPlugins: readonly string[]
      /** The DSH-profile script of the older layout, removed when it is acrylblends' own. */
      readonly removeProfileScript: boolean
      /** Paths the app edited; refused without `--force`. */
      readonly conflicts: readonly string[]
      /** For a scaffold file with the owner's own lines: the lines, so the refusal names them. */
      readonly conflictLines?: Readonly<Record<string, readonly ChangedLine[]>>
      readonly changed: boolean
    }

/** The state of one generated file that already exists: our marker makes it ours to update, anything else is the app's. */
function generatedState(existing: string | undefined, text: string): FrameFileWrite['state'] {
  if (existing === undefined) return 'add'
  if (existing === text) return 'same'
  return GENERATED_MARKER.test(existing.split('\n', 1)[0] ?? '') ? 'update' : 'conflict'
}

/**
 * Plan the frame half of an upgrade: an app made by the previous published release gets the frame-hosted layout (`scripts/ide-host.mjs`, the overlay with
 * the app's rows, `frame/app-plugins.mjs` with its entry isolate, the mount config in its composition root, the host plugins), and the template's own files
 * are replaced only where the app still has the released ones. An app whose scaffold was edited is refused by the caller unless it passes --force; an app
 * of a template without a frame row yet, or one whose scaffold is not this release's, stays standalone and is told so.
 */
export function planFrameStep(
  appDir: string,
  library: ReadonlyMap<string, LibraryPlugin>,
  templateDirFor: (template: Template) => string = templateDir,
): FrameStep {
  const name = appNameOf(appDir)
  // The releases before 0.7.8 wrote an entry module that cannot run (see brokenEntry): nothing the upgrade writes can make it boot.
  const broken = brokenEntry(appDir)
  if (broken !== undefined) return { kind: 'broken-scaffold', file: broken }
  const template = identifyTemplate(appDir, name)
  if (template === undefined) {
    // Not a template's scaffold: an app built on its own (a registry blueprint). Its scaffold is its own and never written; when it already carries the
    // frame row and the composition the frame calls, it gets the rest of the frame (the host's layout, the generated row, the host plugins) all the same.
    if (!ownsFrameRow(appDir)) return { kind: 'unidentified' }
    const specs = frameProfileForApp(appDir)
    if (specs === undefined) return { kind: 'unavailable', template: undefined }
    return planFrameWrites(appDir, library, name, specs, undefined, [], [], undefined)
  }
  if (!carriesFrame(template, templateDirFor(template)))
    return { kind: 'no-frame-template', template }
  const specs = frameProfileForApp(appDir)
  if (specs === undefined) return { kind: 'unavailable', template }
  const released = readLegacy(appDir, template, name)
  // src/routes.ts is the app's own from its first edit: an edited or removed one is never taken as the template's, never refused over, and never
  // overwritten with --force (the backup list takes its files from this list too). An untouched released copy is updated: the frame row needs the new one.
  const ownedByTheApp = (file: { file: string; state: FrameFileWrite['state'] }) =>
    KEPT_BY_THE_APP.has(file.file) && (file.state === 'conflict' || file.state === 'add')
  const kept = released.files.filter(ownedByTheApp).map((file) => {
    const path = join(appDir, file.file)
    return {
      file: file.file,
      mountable: existsSync(path) && FRAME_PREFIX_EXPORT.test(readText(path)),
    }
  })
  const files: FrameFileWrite[] = released.files
    .filter((file) => !ownedByTheApp(file))
    .map((file) => ({
      file: file.file,
      text: file.text,
      state: file.state,
    }))
  // The framework's own `add` registration lines are not the owner's edits: keep them on the app.ts the upgrade writes, and report only the rest.
  const appIndex = files.findIndex((file) => file.file === 'src/app.ts')
  const appFile = appIndex < 0 ? undefined : files[appIndex]
  let conflictLines: Record<string, readonly ChangedLine[]> | undefined
  if (appFile !== undefined && appFile.state === 'conflict') {
    const appTsPath = join(appDir, 'src', 'app.ts')
    const current = existsSync(appTsPath) ? readText(appTsPath) : undefined
    if (current !== undefined) {
      const stripped = stripRegistrations(current, undefined, appFile.text)
      const target = withRegistrations(appFile.text, stripped.edits)
      if (stripped.text === appFile.text) {
        files[appIndex] = {
          file: 'src/app.ts',
          text: target,
          state: target === current ? 'same' : 'update',
        }
      } else {
        conflictLines = { 'src/app.ts': ownerChangeLines(current, target) }
      }
    }
  }
  return planFrameWrites(appDir, library, name, specs, template, files, kept, conflictLines)
}

/**
 * Whether an app built on its own carries what the frame mounts: its routes row (`src/frame.ts`), a `src/routes.ts` that says where the frame shows it, and
 * the composition the generated row calls (`composeInto` in `src/app.ts`). A registry blueprint made in the frame has all three.
 */
function ownsFrameRow(appDir: string): boolean {
  const at = (file: string) => join(appDir, 'src', file)
  return (
    existsSync(at('frame.ts')) &&
    existsSync(at('routes.ts')) &&
    FRAME_PREFIX_EXPORT.test(readText(at('routes.ts'))) &&
    existsSync(at('app.ts')) &&
    carriesComposeInto(readText(at('app.ts')))
  )
}

/** The part of the frame plan every framed app shares: the generated composition row, the host plugins, the launcher and overlay, and what conflicts. */
function planFrameWrites(
  appDir: string,
  library: ReadonlyMap<string, LibraryPlugin>,
  name: string,
  specs: FrameProfileSpecs,
  template: Template | undefined,
  files: FrameFileWrite[],
  kept: readonly { readonly file: string; readonly mountable: boolean }[],
  conflictLines: Record<string, readonly ChangedLine[]> | undefined,
): FrameStep {
  // The composition root as it will be once the scaffold is written: the plan may be about to replace it.
  const plannedAppTs = files.find((file) => file.file === 'src/app.ts')?.text
  const appTs =
    plannedAppTs ??
    (existsSync(join(appDir, 'src', 'app.ts'))
      ? readText(join(appDir, 'src', 'app.ts'))
      : undefined)
  const rows = appFrameRows(appDir, { ...(appTs === undefined ? {} : { appTs }), hasFrame: true })
  if (rows.appPlugins !== undefined) {
    const path = join(appDir, APP_PLUGINS_FILE)
    files.push({
      file: APP_PLUGINS_FILE,
      text: rows.appPlugins,
      state: generatedState(existsSync(path) ? readText(path) : undefined, rows.appPlugins),
    })
  }
  const imported = files
    .filter((file) => file.file.endsWith('.ts'))
    .flatMap((file) => [...file.text.matchAll(PLUGIN_IMPORT)].map((match) => match[1] as string))
  const addedPlugins = closure(
    [...new Set([...HOST_PLUGINS, ...imported])].filter((plugin) => library.has(plugin)),
    library,
  )
    // A packaged plugin (PACKAGED) is there when the app depends on its package; npm, not this, keeps it current.
    .filter((plugin) => {
      const packaged = packagedDependency(plugin)
      return packaged === undefined
        ? !existsSync(join(appDir, 'plugins', plugin.name))
        : Object.keys(packaged).some((name) => readManifestDependencies(appDir)[name] === undefined)
    })
    .map((plugin) => plugin.name)
  const oldScript = join(appDir, OLD_PROFILE_SCRIPT)
  const removeProfileScript =
    existsSync(oldScript) && GENERATED_MARKER.test(readText(oldScript).split('\n', 1)[0] ?? '')
  const input: IdeProfileInput = frameProfileInput(specs, name, rows.rows)
  const profile = planIdeProfileWrite(appDir, input)
  const conflicts = [
    ...files.filter((file) => file.state === 'conflict').map((file) => file.file),
    ...profile.files.filter((file) => file.state === 'conflict').map((file) => file.file),
  ]
  const changed =
    files.some((file) => file.state !== 'same') ||
    profile.manifestChanged ||
    profile.files.some((file) => file.state !== 'same') ||
    addedPlugins.length > 0 ||
    removeProfileScript
  return {
    kind: 'planned',
    template,
    input,
    profile,
    files,
    kept,
    addedPlugins,
    removeProfileScript,
    conflicts,
    ...(conflictLines === undefined ? {} : { conflictLines }),
    changed,
  }
}

/** The `frame` line `upgrade` prints: every file it changes, or why it leaves the app alone. */
export function frameReport(frame: FrameStep): string {
  if (frame.kind === 'broken-scaffold')
    return `${frame.file} imports './plugins/...', as acrylblends 0.3.0 through 0.7.7 wrote it (the plugins are one folder up; 0.7.8 fixed the paths), so the app cannot start: change those imports to '../plugins/...' and run again`
  if (frame.kind === 'unidentified')
    return `not the scaffold of any published acrylblends release (${releasedRange()}), so it was edited or another version made it: left on the framework alone`
  if (frame.kind === 'no-frame-template')
    return `the ${frame.template} template has no src/frame.ts yet: left standalone`
  if (frame.kind === 'unavailable')
    return 'left on the framework alone: not a desktop app (`acrylblends add desktop` makes it one), or ACRYLBLENDS_FRAME_PACKAGES is none'
  const parts: string[] = []
  for (const file of frame.files)
    if (file.state !== 'same')
      parts.push(`${file.file} ${file.state === 'update' ? 'updated' : 'added'}`)
  for (const file of frame.profile.files)
    if (file.state !== 'same')
      parts.push(`${file.file} ${file.state === 'update' ? 'updated' : 'added'}`)
  if (frame.profile.clientRowsAdded.length > 0)
    parts.push(
      `scripts/ide-host.mjs client rows added (${frame.profile.clientRowsAdded.join(', ')})`,
    )
  for (const plugin of frame.addedPlugins) parts.push(`plugins/${plugin} added`)
  if (frame.removeProfileScript) parts.push(`${OLD_PROFILE_SCRIPT} removed`)
  if (frame.profile.manifestChanged)
    parts.push('package.json merged (dev runs scripts/ide-host.mjs)')
  for (const { file, mountable } of frame.kept)
    if (!mountable)
      parts.push(
        `${file} kept as the app's (edited): it does not export FRAME_MOUNT_PREFIX, so the frame cannot show the app until it does (a fresh app's ${file} shows how)`,
      )
  return parts.length === 0 ? 'up to date' : parts.join(', ')
}

/**
 * `acrylblends upgrade`: bring the library plugins an app carries (the router, the server, the door, `extensions`, ...) up to the version of this package. Each file is compared with what
 * the app was given: an untouched file is replaced, a file the app edited stops the upgrade (it is shown as a diff and nothing changes) unless `--force`, which saves the edited version
 * under `.acryl/upgrade-backup/` first. Returns the exit code: 0 done or nothing to do, 1 refused or failed.
 */
export async function upgrade(options: UpgradeOptions, io: Io): Promise<number> {
  const appDir = resolve(io.cwd, options.directory ?? '.')
  if (!existsSync(join(appDir, 'package.json')) || !existsSync(join(appDir, 'src'))) {
    io.stderr.write(
      `error: ${appDir} is not an app (no package.json and src/); run "acrylblends init" first\n`,
    )
    return 1
  }
  const folder = pluginsFolder(appDir)
  if (folder.legacy) {
    io.stderr.write(
      `${LEGACY_WARNING}\nerror: upgrade needs the one-folder layout (plugins/); move the plugins first\n`,
    )
    return 1
  }
  const library = readLibrary()
  const carried = carriedCopies(folder.dir)
  const unknown = carried.filter((name) => !library.has(name))
  for (const name of options.names)
    if (!carried.includes(name)) {
      io.stderr.write(
        `error: the app carries no library plugin "${name}" (it carries: ${carried.filter((n) => library.has(n)).join(', ') || 'none'})\n`,
      )
      return 1
    }
  const selected = (options.names.length > 0 ? [...options.names] : carried).filter((name) =>
    library.has(name),
  )
  // The frame half of the upgrade, planned before anything is written so a refusal leaves the folder exactly as it was.
  const frame = planFrameStep(appDir, library)
  if (frame.kind === 'planned' && frame.conflicts.length > 0 && !options.force) {
    const own = frame.conflictLines?.['src/app.ts'] ?? []
    const detail =
      own.length === 0
        ? ''
        : `\n  src/app.ts keeps the framework's plugin registrations; the app's own lines are ${own.map((line) => `line ${String(line.line)} (${JSON.stringify(line.text)})`).join(', ')}`
    io.stderr.write(
      `error: ${frame.conflicts.join(', ')} in ${appDir} ${frame.conflicts.length === 1 ? 'is' : 'are'} not the previous release's scaffold and acrylblends did not write ${frame.conflicts.length === 1 ? 'it' : 'them'}; nothing was changed.${detail} Move the app's version aside (or merge it into the template's) and run again, or run again with --force (the app's versions are saved under .acryl/upgrade-backup/ first)\n`,
    )
    return 1
  }
  const frameChanged = frame.kind === 'planned' && frame.changed
  if (selected.length === 0 && !frameChanged) {
    io.stdout.write(
      frame.kind === 'planned'
        ? 'nothing to upgrade: the library plugins and the frame are up to date\n'
        : `nothing to upgrade: the app carries no library plugins\n  ${'frame'.padEnd(22)} ${frameReport(frame)}\n`,
    )
    return 0
  }

  // What the current library would copy, into a scratch folder inside the app (`.acryl/`, the app's own state folder, is ignored by git).
  const scratch = join(appDir, '.acryl', `upgrade-${process.pid}-${Date.now()}`)
  const lock = readLock(folder.dir)
  const history = readHistory()
  const plans: PluginPlan[] = []
  try {
    mkdirSync(join(scratch, 'plugins'), { recursive: true })
    // A packaged plugin is not a copy to bring up to date: npm installs its version.
    const wanted = closure(selected, library).filter((plugin) => !PACKAGED.has(plugin.name))
    for (const plugin of wanted) copyPlugin(plugin, scratch)
    for (const plugin of wanted) {
      const here = join(folder.dir, plugin.name)
      const fresh = hashFolder(join(scratch, 'plugins', plugin.name))
      const files = new Map<string, FileState>()
      const isNew = !existsSync(here)
      const mine = isNew ? {} : hashFolder(here)
      const recorded = lock.plugins[plugin.name]?.files ?? {}
      const pristine = (file: string, hash: string): boolean =>
        recorded[file] === hash || (history[plugin.name]?.[file]?.includes(hash) ?? false)
      for (const [file, hash] of Object.entries(fresh)) {
        const have = mine[file]
        files.set(
          file,
          have === undefined
            ? 'add'
            : have === hash
              ? 'same'
              : pristine(file, have)
                ? 'update'
                : 'conflict',
        )
      }
      for (const [file, hash] of Object.entries(mine))
        if (!(file in fresh)) files.set(file, pristine(file, hash) ? 'remove' : 'extra')
      plans.push({ plugin, isNew, files, fresh })
    }

    // The report.
    const count = (plan: PluginPlan, state: FileState): string[] =>
      [...plan.files].filter(([, s]) => s === state).map(([file]) => file)
    io.stdout.write(`upgrade: the library plugins of ${appDir} to acrylblends ${VERSION}\n`)
    let conflicts = 0
    let changes = 0
    for (const plan of plans) {
      const [updated, added, removed, edited, extra] = (
        ['update', 'add', 'remove', 'conflict', 'extra'] as const
      ).map((state) => count(plan, state))
      const label = plan.plugin.name.padEnd(22)
      conflicts += (edited as string[]).length
      if (plan.isNew) {
        changes += 1
        io.stdout.write(`  ${label} new (required by a plugin of the app)\n`)
        continue
      }
      if (
        (updated as string[]).length +
          (added as string[]).length +
          (removed as string[]).length +
          (edited as string[]).length ===
        0
      ) {
        io.stdout.write(
          `  ${label} up to date${(extra as string[]).length > 0 ? ` (keeps ${(extra as string[]).length} file(s) of its own)` : ''}\n`,
        )
        continue
      }
      changes += 1
      let plus = 0
      let minus = 0
      for (const file of [...(updated as string[]), ...(edited as string[])]) {
        const stat = diffStat(
          readText(join(folder.dir, plan.plugin.name, file)),
          readText(join(scratch, 'plugins', plan.plugin.name, file)),
        )
        plus += stat.added
        minus += stat.removed
      }
      const parts = [
        (updated as string[]).length > 0
          ? `${(updated as string[]).length} updated (+${plus} -${minus})`
          : '',
        (added as string[]).length > 0 ? `${(added as string[]).length} added` : '',
        (removed as string[]).length > 0 ? `${(removed as string[]).length} removed` : '',
        (edited as string[]).length > 0 ? `${(edited as string[]).length} EDITED HERE` : '',
        (extra as string[]).length > 0 ? `${(extra as string[]).length} of its own kept` : '',
      ].filter(Boolean)
      io.stdout.write(`  ${label} ${parts.join(', ')}\n`)
    }
    for (const name of unknown)
      io.stdout.write(`  ${name.padEnd(22)} not in this library: left alone\n`)
    io.stdout.write(`  ${'frame'.padEnd(22)} ${frameReport(frame)}\n`)

    // Diffs: always of the edited files (what would be lost), of every changed file with --diff.
    for (const plan of plans) {
      for (const [file, state] of plan.files) {
        if (
          !(
            state === 'conflict' ||
            (options.diff && (state === 'update' || state === 'add' || state === 'remove'))
          )
        )
          continue
        const name = `plugins/${plan.plugin.name}/${file}`
        const before = state === 'add' ? '' : readText(join(folder.dir, plan.plugin.name, file))
        const after =
          state === 'remove' ? '' : readText(join(scratch, 'plugins', plan.plugin.name, file))
        io.stdout.write(
          `\n${state === 'conflict' ? 'EDITED HERE, the upgrade would replace it:\n' : ''}${unifiedDiff(name, before, after)}`,
        )
      }
    }
    if (conflicts > 0 && !options.force) {
      io.stderr.write(
        `\nerror: ${conflicts} file(s) were edited in this app and the upgrade would replace them; nothing was changed. Review the diffs above, move your changes out of the plugin (a plugin of your own in plugins/<name>/), or run again with --force (the edited versions are saved under .acryl/upgrade-backup/)\n`,
      )
      return 1
    }
    if (options.dryRun) {
      io.stdout.write(
        `\n${changes === 0 && !frameChanged ? 'everything is up to date' : 'dry run: nothing was changed'}\n`,
      )
      return 0
    }
    if (changes === 0 && !frameChanged) {
      io.stdout.write('\neverything is up to date\n')
      return 0
    }

    // Apply.
    const backup = join(
      appDir,
      '.acryl',
      'upgrade-backup',
      new Date().toISOString().replace(/[:.]/gu, '-'),
    )
    const addedDependencies: string[] = []
    for (const plan of plans) {
      const here = join(folder.dir, plan.plugin.name)
      if (plan.isNew) {
        // Copied the way `add` copies it: the plugin, and what it needs in package.json.
        mkdirSync(here, { recursive: true })
        cpSync(join(scratch, 'plugins', plan.plugin.name), here, { recursive: true })
        recordLibraryCopy(folder.dir, plan.plugin.name)
      } else {
        for (const [file, state] of plan.files) {
          const target = join(here, file)
          if (state === 'conflict') {
            mkdirSync(dirname(join(backup, plan.plugin.name, file)), { recursive: true })
            cpSync(target, join(backup, plan.plugin.name, file))
          }
          if (state === 'add' || state === 'update' || state === 'conflict') {
            mkdirSync(dirname(target), { recursive: true })
            cpSync(join(scratch, 'plugins', plan.plugin.name, file), target)
          } else if (state === 'remove') rmSync(target, { force: true })
        }
        recordLibraryCopy(folder.dir, plan.plugin.name)
      }
      recordLock(folder.dir, plan.plugin.name, plan.fresh)
      const plugin = plan.plugin
      if (plugin.imports) mergeImports(appDir, plugin.imports, posix(relative(appDir, folder.dir)))
      addedDependencies.push(...mergeDependencies(appDir, plugin.dependencies))
      addedDependencies.push(...mergeTooling(appDir, plugin).devDependencies)
      appendGitignore(appDir, plugin.gitignore)
    }
    // The package the app depends on moves with its plugins.
    const manifestFile = join(appDir, 'package.json')
    const manifest = JSON.parse(readFileSync(manifestFile, 'utf8')) as {
      dependencies?: Record<string, string>
    }
    if (
      manifest.dependencies?.['@acryldev/blends'] !== undefined &&
      manifest.dependencies['@acryldev/blends'] !== `^${VERSION}`
    ) {
      manifest.dependencies['@acryldev/blends'] = `^${VERSION}`
      writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`)
    }
    // The frame last: the app's scaffold, the frame row, the generated composition row, the host plugins and the launcher/overlay write as `init` writes
    // them for a fresh app. A file of the app's own (no marker, or not the released template's) was refused above unless --force, which backs it up here.
    let frameBackups = 0
    if (frame.kind === 'planned' && frameChanged) {
      for (const file of [...frame.files, ...frame.profile.files]) {
        if (file.state !== 'conflict') continue
        mkdirSync(dirname(join(backup, file.file)), { recursive: true })
        cpSync(join(appDir, file.file), join(backup, file.file))
        frameBackups += 1
      }
      for (const plugin of frame.addedPlugins) {
        const known = library.get(plugin)
        // A plugin the library step above just copied (a plugin of the app requires it too) is there already, with its dependencies.
        if (known === undefined || existsSync(join(folder.dir, plugin))) continue
        const packaged = packagedDependency(known)
        if (packaged !== undefined) {
          addedDependencies.push(...mergeDependencies(appDir, packaged))
          addedDependencies.push(...mergeTooling(appDir, known).devDependencies)
          continue
        }
        copyPlugin(known, appDir)
        if (known.imports) mergeImports(appDir, known.imports, 'plugins')
        addedDependencies.push(...mergeDependencies(appDir, known.dependencies))
        addedDependencies.push(...mergeTooling(appDir, known).devDependencies)
        appendGitignore(appDir, known.gitignore)
        recordLibraryCopy(folder.dir, plugin)
      }
      for (const file of frame.files) {
        if (file.state === 'same') continue
        const target = join(appDir, file.file)
        mkdirSync(dirname(target), { recursive: true })
        writeFileSync(target, file.text)
      }
      // Re-planned against the manifest the plugin step and the host plugins left.
      writeIdeProfilePlan(appDir, planIdeProfileWrite(appDir, frame.input))
      if (frame.removeProfileScript) rmSync(join(appDir, OLD_PROFILE_SCRIPT), { force: true })
    }
    const upgradedPlugins = plans
      .filter((p) => [...p.files.values()].some((s) => s !== 'same' && s !== 'extra') || p.isNew)
      .map((p) => p.plugin.name)
    io.stdout.write(
      `\nupgraded ${[...upgradedPlugins, ...(frameChanged ? ['the frame'] : [])].join(', ')}\n`,
    )
    if (conflicts + frameBackups > 0)
      io.stdout.write(
        `the ${conflicts + frameBackups} edited file(s) replaced by --force are saved in ${posix(relative(appDir, backup))}/\n`,
      )
    io.stdout.write(
      `acrylblends is now ^${VERSION} in package.json${addedDependencies.length > 0 ? `; dependencies to install: ${[...new Set(addedDependencies)].join(', ')}` : ''}: run npm install, then npm run check and npm test\n`,
    )
    return 0
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}
