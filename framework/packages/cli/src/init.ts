import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { frameProfileForInit, frameProfileInput } from './frame-release'
import { APP_PLUGINS_FILE, appFrameRows } from './frame-rows'
import { applyIdeProfile } from './ide-profile'
import type { Io } from './io'
import { closure, copyPlugin, readLibrary } from './library'
import {
  addNodePreflight,
  copyFrameworkDocs,
  copyTemplate,
  isValidName,
  mergeDependencies,
  mergeImports,
  mergeTooling,
  nameFrom,
  readTemplateDesktopPath,
  readTemplatePlugins,
  TargetNotEmptyError,
  writeAgentFiles,
  writeDesktopPath,
} from './project'
import {
  frameworkDocsRoot,
  resolveTemplate,
  sharedDir,
  TEMPLATE_SUMMARY,
  TEMPLATES,
  type Template,
  templateDir,
} from './templates'

/** A command line mistake. The CLI prints it with the help text and exits 2. */
export class UsageError extends Error {
  override name = 'UsageError'
}

/**
 * A new app is a git repository from the start: its `.gitignore` is written with the scaffold, `npm run save` commits it, and the frame's Files and
 * Changes views work on a git worktree (the app's own folder; without one they answer "file request failed"). A folder that already is a repository, or
 * a machine without git, is left alone.
 */
function startRepository(directory: string): void {
  if (existsSync(join(directory, '.git'))) return
  const run = (args: string[]) =>
    spawnSync('git', args, { cwd: directory, stdio: 'ignore', windowsHide: true }).status === 0
  if (!run(['init', '-q'])) return
  if (!run(['add', '-A'])) return
  // A machine without a git identity still gets the first commit: this one is the scaffolder's, and later commits use the person's own identity. The `-c`
  // options are git's own and must precede the command.
  const identity = run(['config', 'user.email'])
    ? []
    : ['-c', 'user.name=acrylblends', '-c', 'user.email=scaffold@acrylblends.invalid']
  run([...identity, 'commit', '-q', '-m', 'Initial commit from acrylblends'])
}

/** What `init` was asked for. Anything left undefined is asked for on a terminal, or defaulted. */
export interface InitOptions {
  directory: string | undefined
  name: string | undefined
  template: Template | undefined
  install: boolean | undefined
  /** In the ACRYL frame with the desktop shell (`add desktop`): the default; `--bare` makes a plain app. */
  desktop: boolean
  /** Print no "Next:" block: `create-acrylblends` runs `init` and prints its own, for the package manager it knows. */
  quietNext: boolean
  yes: boolean
}

/** Parse `init [dir] [--template t] [--agent|--no-agent] [--name n] [--install] [--bare] [-y]`. `--agent` means `--template agent`, `--no-agent` means `--template blank`. */
export function parseInitOptions(argv: readonly string[]): InitOptions {
  let parsed: ReturnType<typeof parse>
  try {
    parsed = parse(argv)
  } catch (error) {
    throw new UsageError((error as Error).message)
  }
  const { values, positionals } = parsed
  if (positionals.length > 1) throw new UsageError('init takes at most one directory')
  if (values.bare === true && values.desktop === true)
    throw new UsageError('use --bare or --desktop, not both')
  if (values.agent && values['no-agent'])
    throw new UsageError('use --agent or --no-agent, not both')
  const named = values.template === undefined ? undefined : resolveTemplate(values.template)
  if (values.template !== undefined && named === undefined)
    throw new UsageError(`unknown template "${values.template}" (${TEMPLATES.join(', ')})`)
  const alias: Template | undefined = values.agent
    ? 'agent'
    : values['no-agent']
      ? 'blank'
      : undefined
  if (named !== undefined && alias !== undefined && named !== alias)
    throw new UsageError(
      `--template ${values.template} contradicts --${alias === 'agent' ? 'agent' : 'no-agent'}`,
    )
  return {
    directory: positionals[0],
    name: values.name,
    template: named ?? alias,
    install: values.install,
    // The app is made in the ACRYL frame (chat, agents, Settings, the window) unless --bare: the frame is the product, a plain app is the exception.
    desktop: values.bare !== true,
    quietNext: values['no-next'] === true,
    yes: values.yes === true,
  }
}

const parse = (argv: readonly string[]) =>
  parseArgs({
    args: [...argv],
    allowPositionals: true,
    strict: true,
    options: {
      name: { type: 'string' },
      template: { type: 'string' },
      agent: { type: 'boolean' },
      'no-agent': { type: 'boolean' },
      install: { type: 'boolean' },
      desktop: { type: 'boolean' },
      bare: { type: 'boolean' },
      'no-next': { type: 'boolean' },
      yes: { type: 'boolean', short: 'y' },
    },
  })

const yes = (answer: string) => ['y', 'yes'].includes(answer.trim().toLowerCase())

async function askTemplate(ask: (question: string) => Promise<string>): Promise<Template> {
  const answer = (
    await ask(
      `Templates:\n${TEMPLATES.map((name) => `  ${name.padEnd(7)} ${TEMPLATE_SUMMARY[name]}`).join('\n')}\nTemplate [blank]: `,
    )
  )
    .trim()
    .toLowerCase()
  if (answer === '') return 'blank'
  const chosen = resolveTemplate(answer)
  if (chosen !== undefined) return chosen
  throw new UsageError(`unknown template "${answer}" (${TEMPLATES.join(', ')})`)
}

/** Scaffold a Cordis app. Returns the exit code: 0 done, 1 refused or failed. Never overwrites anything. */
export async function init(options: InitOptions, io: Io): Promise<number> {
  const relative = options.directory ?? '.'
  const directory = resolve(io.cwd, relative)
  const ask = options.yes ? undefined : io.ask

  let name = options.name ?? nameFrom(directory)
  if (options.name === undefined && ask)
    name = (await ask(`Project name (${name}): `)).trim() || name
  if (!isValidName(name)) {
    throw new UsageError(
      `"${name}" is not a valid project name (lower case letters, digits and dashes, starting with a letter)`,
    )
  }
  const template = options.template ?? (ask ? await askTemplate(ask) : 'blank')
  const install =
    options.install ?? (ask ? yes(await ask('Install dependencies with npm now? (y/N): ')) : false)

  let files: string[]
  try {
    files = copyTemplate(templateDir(template), directory, name)
    files.push(...writeAgentFiles(sharedDir(), templateDir(template), directory, name))
    files.push(...copyFrameworkDocs(frameworkDocsRoot(), directory))
  } catch (error) {
    if (!(error instanceof TargetNotEmptyError)) throw error
    io.stderr.write(`error: ${error.message}\n`)
    return 1
  }
  const own = closure(readTemplatePlugins(templateDir(template)), readLibrary())
  const plugins = options.desktop
    ? closure([...own.map((plugin) => plugin.name), 'desktop'], readLibrary())
    : own
  // What only the desktop shell brought (and needs), named apart so the list does not read as if the web app had asked for it.
  const forDesktop = plugins.filter((plugin) => !own.some((owned) => owned.name === plugin.name))
  for (const plugin of plugins) {
    copyPlugin(plugin, directory)
    if (plugin.imports) mergeImports(directory, plugin.imports, 'plugins')
    mergeDependencies(directory, plugin.dependencies)
    mergeTooling(directory, plugin)
  }
  addNodePreflight(directory)
  // The ACRYL frame (docs/plans/ide-port.md, slice 6): a template with a frame row (`src/frame.ts`) gets the app's own DSH profile and overlay, so
  // `npm run dev` opens it inside the frame with its page at /app. A desktop app installs the frame's published packages (frame/packages.json);
  // ACRYLBLENDS_FRAME_PACKAGES overrides them (a checkout's build, or `none`), and an app with neither stays on the framework alone and says so.
  // The ACRYL frame's layer needs two rows for the app itself: its routes row (src/frame.ts), and the one composition row that runs the app's own plugins
  // beside the host through composeInto (frame/app-plugins.mjs), with the services they provide isolated through the Loader's entry option. appFrameRows is
  // the one home for those rows, their isolate rule and the generated file; `upgrade` writes the same ones for an app made before the frame.
  const frame = appFrameRows(directory)
  if (frame.appPlugins !== undefined) {
    mkdirSync(join(directory, 'frame'), { recursive: true })
    writeFileSync(join(directory, APP_PLUGINS_FILE), frame.appPlugins)
  }
  const frameRow = frame.rows
  if (frameRow.length > 0) {
    const specs = frameProfileForInit(options.desktop)
    if (specs === undefined) {
      const why = options.desktop
        ? 'ACRYLBLENDS_FRAME_PACKAGES is none'
        : 'init --desktop puts it inside the ACRYL frame'
      io.stdout.write(`note: this app runs on the framework alone; ${why}\n`)
    } else {
      const wrote = applyIdeProfile(directory, frameProfileInput(specs, name, frameRow))
      io.stdout.write(`frame: wrote ${wrote.written.join(', ') || 'nothing (already right)'}\n`)
    }
  }
  const desktopPath = options.desktop ? readTemplateDesktopPath(templateDir(template)) : undefined
  if (desktopPath !== undefined) writeDesktopPath(directory, desktopPath)
  io.stdout.write(
    `created ${name} (${template}) in ${directory}: ${files.length} files, plugins ${own.map((plugin) => plugin.name).join(', ')}${forDesktop.length > 0 ? `; the desktop shell adds ${forDesktop.map((plugin) => plugin.name).join(', ')}, which it needs` : ''}\n`,
  )

  // The scaffold is the repository's first commit, so the frame's Changes view starts from what the person (or their agent) changed afterwards.
  startRepository(directory)
  if (install && (await io.install(directory)) !== 0) {
    io.stderr.write('error: npm install failed; run it yourself in the new directory\n')
    return 1
  }
  const steps = [
    relative === '.' ? '' : `  cd ${relative}\n`,
    install ? '' : '  npm install\n',
    '  npm run dev\n  npm test\n',
  ]
  if (!options.quietNext) io.stdout.write(`\nNext:\n${steps.join('')}`)
  return 0
}
