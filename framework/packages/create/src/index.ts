import { spawn, spawnSync } from 'node:child_process'
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { findSecrets } from '@acryldev/app-persistence'
import { isFramedByPackages } from '@acryldev/blends/cli'
import { CLASS, CREATE, PACKAGE, TEMPLATE_MANIFEST } from './names'
import {
  openPublicRegistry,
  openRegistry,
  ownLock,
  ownManifest,
  pickEntry,
  REGISTRY_ID,
  type RegistryEntry,
  type RegistryReading,
  renameApp,
  starterName,
} from './registry'
import {
  type Fetchers,
  fetchTemplate,
  LIFECYCLE,
  parseRegistrySource,
  parseSource,
  readManifest,
  realFetchers,
  removeTree,
  SOURCE_FORMS,
  SourceError,
  writeTemplate,
} from './source'
import { packageManagerInvocation } from './spawn'

export { CLASS, CREATE, PACKAGE, TEMPLATE_MANIFEST }

/**
 * The templates: the same list as acrylblends init (the framework package makes every one of them; @acryldev/create-blends delegates). A test compares this list and its summaries with the
 * framework package's, so they cannot drift.
 */
export const TEMPLATES = ['blank', 'nodejs', 'notes', 'chat', 'todo', 'agent'] as const
export type Template = (typeof TEMPLATES)[number]
export const TEMPLATE_SUMMARY: Record<Template, string> = {
  blank: 'the router, a server and one route: the smallest app',
  nodejs: 'a web app with a page and a client component',
  notes: 'a multi-user notes app on the db port (sign-up, log-in, sessions)',
  chat: 'a chat app that streams an answer over server-sent events',
  todo: 'a to-do list on the router and state',
  agent: 'the blank app with an offline agent that builds plugins into the running app',
}
/** Names that were templates once and still work. */
export const TEMPLATE_ALIASES: Record<string, Template> = { 'acryl-app': 'agent' }
const TEMPLATE_LIST = TEMPLATES.map((name) => `  ${name.padEnd(7)} ${TEMPLATE_SUMMARY[name]}`).join(
  '\n',
)
export const PACKAGE_MANAGERS = ['npm', 'pnpm', 'yarn', 'bun'] as const
export type PackageManager = (typeof PACKAGE_MANAGERS)[number]

/** The version of this package. */
export const VERSION: string = (
  createRequire(import.meta.url)('../package.json') as { version: string }
).version

export const HELP = `${CREATE} ${VERSION} - create an ${CLASS} app

Usage:
  npx acryl new [name] [starter]            (the same through npm create ${PACKAGE}@latest [name] [starter])

  npx acryl new shop                        the Blank app in the ACRYL frame, installed and started
  npx acryl new shop notes                  the same from a starter (${TEMPLATES.join(', ')})

The app is made, installed and started with the chat, the panels and Settings; nothing is asked when a name is given. Next time: cd shop && npm run dev.
Turn a step off:
  --no-start        make and install it, do not start it
  --no-install      make it only
  --bare            the app without the frame

A source makes the app from someone else's template (it is downloaded and unpacked, nothing in it runs unless --install):
  github:owner/repo[#ref]    a GitHub repository, as a tarball (no clone)
  @scope/name[@version]      an npm package (npm pack --ignore-scripts)
  ./template.tgz             a packed template on disk
  ./folder                   a template folder on disk
A template is a folder with an ${TEMPLATE_MANIFEST} (name, description, plugins).

A starter from the registry is pulled by its id:
  --from <id | source>   a registry id such as acrylblends.notes-desktop, or any of the sources above
  --registry <source>    read the starters from this registry instead of the public one (github:owner/repo, an https:// address, or a folder)
Only starters made for ${CLASS} (runtime: ${PACKAGE}) are apps this command can make; an ACRYL app starter is refused with a line saying so.

Other options:
  --template <name>   the same as the word after the name (npm needs a -- before options when you use npm create)
  --install           install a source's dependencies (the lifecycle scripts it will run are listed first); a template always installs
  --desktop           the frame (already the default for a template and a registry starter); a starter from another source gets it only with this
  --bare              no frame, for a registry starter too
  --pm <manager>      ${PACKAGE_MANAGERS.join(', ')} (default: the one that ran this command, else npm)
  -y, --yes           ask nothing, and use the name my-app when none is given
  -h, --help          show this help

Templates (the same list as acrylblends init):
${TEMPLATE_LIST}
  -v, --version       show the version
`

/** A command line mistake. The command prints it with the help text and exits 2. */
export class UsageError extends Error {
  override name = 'UsageError'
}

export interface Io {
  stdout: { write(text: string): unknown }
  stderr: { write(text: string): unknown }
  cwd: string
  env: Record<string, string | undefined>
  /** Ask one question; `undefined` when there is no terminal to ask on. */
  ask: ((question: string) => Promise<string>) | undefined
  /** Run a program, showing its output; resolves to the exit code. */
  run(command: string, args: string[], cwd: string): Promise<number>
  /** How a template source is fetched; the real network and npm by default. */
  fetchers?: Fetchers
}

export function processIo(): Io {
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY)
  return {
    stdout: process.stdout,
    stderr: process.stderr,
    cwd: process.cwd(),
    env: process.env,
    ask: interactive
      ? async (question) => {
          const rl = createInterface({ input: process.stdin, output: process.stdout })
          try {
            return await rl.question(question)
          } finally {
            rl.close()
          }
        }
      : undefined,
    run: (command, args, cwd) =>
      new Promise((done) => {
        const invocation = packageManagerInvocation(command, args)
        const child = spawn(invocation.file, invocation.args, { cwd, stdio: 'inherit' })
        child.on('error', () => done(1))
        child.on('exit', (code) => done(code ?? 1))
      }),
  }
}

export interface CreateOptions {
  directory: string | undefined
  template: Template | undefined
  install: boolean
  /**
   * Put the app inside the ACRYL frame, as `acrylblends init --desktop` does. On for a template and a registry blueprint, on for another source only with
   * `--desktop`, off with `--bare`.
   */
  desktop: boolean
  /** Start the app when it is created and installed (`<pm> run dev`), only when there is a terminal to show it in. Off with `--no-start`. */
  start: boolean
  pm: PackageManager | undefined
  yes: boolean
  /** `github:owner/repo[#ref]`, `@scope/name`, a packed `.tgz`, a folder, or a registry id: a template from outside this package. */
  source: string | undefined
  /** Where registry ids are read from; the public registry by default. */
  registry: string | undefined
}

export function isTemplate(value: string): value is Template {
  return (TEMPLATES as readonly string[]).includes(value)
}

/** The template a name means: itself, or what an old name stands for. */
export function resolveTemplate(value: string): Template | undefined {
  return isTemplate(value) ? value : TEMPLATE_ALIASES[value]
}

export function parseCreateOptions(argv: readonly string[]): CreateOptions {
  let parsed: ReturnType<typeof parse>
  try {
    parsed = parse(argv)
  } catch (error) {
    throw new UsageError((error as Error).message)
  }
  const { values, positionals } = parsed
  if (positionals.length > 2)
    throw new UsageError('takes a directory and at most one template source')
  // A bare name that is a built-in template means --template: `create my-app notes`. Only github:, @scope/ and .tgz are sources.
  const bare = positionals[1] !== undefined ? resolveTemplate(positionals[1]) : undefined
  if (positionals[1] !== undefined && values.template !== undefined)
    throw new UsageError('give a template (or a template source) or --template, not both')
  const named = values.template === undefined ? undefined : resolveTemplate(values.template)
  if (values.template !== undefined && named === undefined)
    throw new UsageError(`unknown template "${values.template}" (${TEMPLATES.join(', ')})`)
  if (values.pm !== undefined && !(PACKAGE_MANAGERS as readonly string[]).includes(values.pm))
    throw new UsageError(`unknown package manager "${values.pm}" (${PACKAGE_MANAGERS.join(', ')})`)
  const positionalSource = bare === undefined ? positionals[1] : undefined
  if (values.from !== undefined && positionals[1] !== undefined)
    throw new UsageError(
      'give --from or a template (or a template source) after the directory, not both',
    )
  if (values.from !== undefined && values.template !== undefined)
    throw new UsageError('give --from or --template, not both')
  const source = values.from ?? positionalSource
  if (values.bare === true && values.desktop === true)
    throw new UsageError('give --bare or --desktop, not both')
  if (values['no-install'] === true && values.install === true)
    throw new UsageError('give --no-install or --install, not both')
  if (values.registry !== undefined && !(source !== undefined && REGISTRY_ID.test(source)))
    throw new UsageError('--registry goes with a registry id: --from <id> --registry <source>')
  return {
    directory: positionals[0],
    template: bare ?? named,
    // A template is the framework's own: it installs and opens in the frame unless told not to. A source is someone else's: nothing of it runs unless --install.
    install: values.install === true || (source === undefined && values['no-install'] !== true),
    // The frame (chat, agents, Settings) is the default for a template and for a blueprint from the registry, whose apps are made for it; a starter from
    // another source gets it when asked (--desktop), since it may not be built for it. --bare keeps either plain.
    desktop:
      values.bare !== true &&
      (values.desktop === true || source === undefined || REGISTRY_ID.test(source)),
    start: values['no-start'] !== true,
    pm: values.pm as PackageManager | undefined,
    yes: values.yes === true,
    source,
    registry: values.registry,
  }
}

const parse = (argv: readonly string[]) =>
  parseArgs({
    args: [...argv],
    allowPositionals: true,
    strict: true,
    options: {
      template: { type: 'string' },
      from: { type: 'string' },
      registry: { type: 'string' },
      install: { type: 'boolean' },
      'no-install': { type: 'boolean' },
      desktop: { type: 'boolean' },
      bare: { type: 'boolean' },
      'no-start': { type: 'boolean' },
      pm: { type: 'string' },
      yes: { type: 'boolean', short: 'y' },
    },
  })

/** A valid package name from a directory name: lower case letters, digits and dashes. */
export function nameFrom(directory: string): string {
  const name = basename(resolve(directory))
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^[^a-z]+/, '')
    .replace(/-+$/g, '')
  return name === '' ? 'acryl-app' : name
}

function walkUp(from: string, test: (dir: string) => string | undefined): string {
  let dir = from
  for (;;) {
    const found = test(dir)
    if (found) return found
    const parent = dirname(dir)
    if (parent === dir) throw new Error(`${CREATE} cannot find its files`)
    dir = parent
  }
}
const here = dirname(fileURLToPath(import.meta.url))
/** The framework docs: the copy `prepack` puts in the package, or `docs/framework` of the repository. */
const docsRoot = () =>
  walkUp(here, (d) =>
    existsSync(join(d, 'docs', 'framework', 'README.md'))
      ? join(d, 'docs', 'framework')
      : undefined,
  )

/**
 * The range a created app asks for: the framework version this package was released with, so a new app depends on the release that made it (and gets what that release's
 * commands can do), never an older one. A caret range, so it also takes the newer patch releases.
 */
export function frameworkRange(): string {
  const file = createRequire(import.meta.url).resolve(`${PACKAGE}/package.json`)
  return `^${(JSON.parse(readFileSync(file, 'utf8')) as { version: string }).version}`
}

export function replacePlaceholders(text: string, name: string): string {
  return text
    .replaceAll('__APP_NAME__', name)
    .replaceAll('__PACKAGE__', PACKAGE)
    .replaceAll('__CLASS__', CLASS)
    .replaceAll('__RANGE__', frameworkRange())
}

function copyDocs(target: string): void {
  const filter = (path: string) => !/(upstream\.json|UPSTREAM\.md)$/.test(path)
  mkdirSync(join(target, 'docs'), { recursive: true })
  cpSync(docsRoot(), join(target, 'docs', 'framework'), { recursive: true, filter })
}

const isEmpty = (directory: string) => !existsSync(directory) || readdirSync(directory).length === 0

/** The `acrylblends` command of the installed framework package, which creates every template. */
function acrylblendsBin(): string {
  const pkgFile = createRequire(import.meta.url).resolve(`${PACKAGE}/package.json`)
  const pkg = JSON.parse(readFileSync(pkgFile, 'utf8')) as { bin?: string | Record<string, string> }
  // The package is @acryldev/blends but its command is still `acrylblends` (spec 051 T038).
  const bin =
    typeof pkg.bin === 'string'
      ? pkg.bin
      : (pkg.bin?.acrylblends ?? Object.values(pkg.bin ?? {})[0])
  if (!bin) throw new Error(`${PACKAGE} has no command to create an app with`)
  return join(dirname(pkgFile), bin)
}

/** The lifecycle scripts a template defines and the line that says when they run. */
const describeScripts = (scripts: Record<string, string>) =>
  Object.entries(scripts)
    .map(([key, value]) => `    ${key}: ${value}`)
    .join('\n')

/** Files whose text is checked for secrets: the template's own, not the framework docs copied in. */
function textFiles(root: string): { path: string; text: string }[] {
  const found: { path: string; text: string }[] = []
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (
        entry.name === 'node_modules' ||
        entry.name === '.git' ||
        (prefix === '' && entry.name === 'docs')
      )
        continue
      if (entry.isDirectory()) walk(join(dir, entry.name), `${prefix}${entry.name}/`)
      else {
        const buffer = readFileSync(join(dir, entry.name))
        if (!buffer.subarray(0, 8000).includes(0))
          found.push({ path: `${prefix}${entry.name}`, text: buffer.toString('utf8') })
      }
    }
  }
  walk(root, '')
  return found
}

/**
 * A new app is a git repository from the start, as `acrylblends init` makes it: the frame's versions, Files and Changes work on it, and its first
 * version is the app as created. A folder that already is a repository, or a machine without git, is left alone.
 */
export function startRepository(directory: string): void {
  if (existsSync(join(directory, '.git'))) return
  const run = (args: string[]) =>
    spawnSync('git', args, { cwd: directory, stdio: 'ignore', windowsHide: true }).status === 0
  if (!run(['init', '-q'])) return
  if (!run(['add', '-A'])) return
  // A machine without a git identity still gets the first commit: this one is the scaffolder's, and later commits use the person's own identity.
  const identity = run(['config', 'user.email'])
    ? []
    : ['-c', 'user.name=acrylblends', '-c', 'user.email=scaffold@acryldev.invalid']
  run([...identity, 'commit', '-q', '-m', 'Initial commit from acrylblends'])
}

/** An app with the extensions row (what plugin-share installs through) and no plugin-share row: a starter older than sharing. */
export function lacksPluginShare(directory: string): boolean {
  const file = join(directory, 'blend.yaml')
  if (!existsSync(file)) return false
  const names = [...readFileSync(file, 'utf8').matchAll(/^ *name: ?(\S+)\r?$/gmu)].map(
    (match) => match[1],
  )
  return names.includes('extensions') && !names.includes('plugin-share')
}

/** The registry `--registry` names. */
function openNamedRegistry(name: string, cwd: string, reading: RegistryReading) {
  const source = parseRegistrySource(name, cwd)
  if (!source) throw new UsageError(`unknown registry "${name}" (${SOURCE_FORMS})`)
  return openRegistry(source, name, reading)
}

/**
 * Create an app from a template source (`github:`, `@scope/name`, a packed tarball). The source is fetched and unpacked into a scratch folder, checked
 * (manifest, secrets), and only then copied to the target; nothing in it is installed or run unless `--install`, which lists the scripts first.
 */
async function createFromSource(
  options: CreateOptions,
  target: string,
  directory: string,
  io: Io,
): Promise<number> {
  if (!isEmpty(target)) {
    io.stderr.write(`error: ${target} is not empty; nothing was changed\n`)
    return 1
  }
  const scratch = mkdtempSync(join(tmpdir(), 'acryl-create-blends-'))
  try {
    const name = nameFrom(target)
    const fetchers = io.fetchers ?? realFetchers
    let entry: RegistryEntry | undefined
    if (REGISTRY_ID.test(options.source!)) {
      // A registry id: read the registry's index, pick the entry (only an app for this runtime), and take its folder as the template.
      const reading = { scratch, fetchers }
      const registry =
        options.registry === undefined
          ? await openPublicRegistry(reading)
          : await openNamedRegistry(options.registry, io.cwd, reading)
      entry = pickEntry(registry.entries, options.source!)
      await registry.takeEntry(entry, join(scratch, 'source'))
    } else {
      const source = parseSource(options.source!, io.cwd)
      if (!source)
        throw new UsageError(`unknown template source "${options.source}" (${SOURCE_FORMS})`)
      await fetchTemplate(source, join(scratch, 'source'), join(scratch, 'download'), fetchers)
    }
    const manifest = readManifest(join(scratch, 'source'))
    const staged = join(scratch, 'app')
    const { files, lifecycle } = writeTemplate(
      join(scratch, 'source'),
      staged,
      (text) => replacePlaceholders(text, name),
      frameworkRange(),
      name,
    )
    // Any starter with a manifest, from a registry or a repository (`github:owner/repo#tag`, a community Blend): the app is its new owner's, private,
    // with its own id and no licence claim; the starter's licence text stays beside it as STARTER-LICENSE, since its terms ask for the notice to be kept.
    for (const file of ['LICENSE', 'LICENSE.md', 'LICENSE.txt'])
      if (existsSync(join(staged, 'blend.yaml')) && existsSync(join(staged, file)))
        renameSync(join(staged, file), join(staged, `STARTER-${file}`))
    if (existsSync(join(staged, 'blend.yaml'))) {
      const starterText = readFileSync(join(staged, 'blend.yaml'), 'utf8')
      // The starter was an app with its own name in its page, its README and its agents' instructions: they now say this app's. The staged package.json
      // already carries the new name, so the starter's is read from the source.
      const sourcePackage = join(scratch, 'source', 'package.json')
      const starter = starterName(
        starterText,
        existsSync(sourcePackage) ? readFileSync(sourcePackage, 'utf8') : undefined,
      )
      if (starter !== undefined) renameApp(staged, starter, name)
      const manifestText = ownManifest(starterText, name)
      writeFileSync(join(staged, 'blend.yaml'), manifestText)
      if (existsSync(join(staged, 'blend.lock.json')))
        writeFileSync(
          join(staged, 'blend.lock.json'),
          ownLock(readFileSync(join(staged, 'blend.lock.json'), 'utf8'), manifestText, name),
        )
    }
    if (!existsSync(join(staged, 'AGENTS.md')))
      writeFileSync(
        join(staged, 'AGENTS.md'),
        `# ${name}\n\nAn ${CLASS} app made from the template "${manifest.name}": ${manifest.description}\n\nThe framework's API is in \`docs/framework/\` (start at \`docs/framework/README.md\`).\n`,
      )
    if (!existsSync(join(staged, 'CLAUDE.md')))
      copyFileSync(join(staged, 'AGENTS.md'), join(staged, 'CLAUDE.md'))
    const found = findSecrets(textFiles(staged))
    if (found.length > 0) {
      io.stderr.write(
        `error: the template holds what looks like a secret, so nothing was created:\n${found.map((f) => `  ${f.path}:${f.line} (${f.kind})`).join('\n')}\n`,
      )
      return 1
    }
    copyDocs(staged)
    cpSync(staged, target, { recursive: true })
    // In the frame: the framework's own commands do it, as for an app made before the frame. `add desktop` brings the window; `upgrade` brings the starter's
    // library plugins to this release (its data then lives under ~/.acryl) and writes the frame around the starter's own frame row. Before the first
    // commit, so the app's first version is the app as made.
    // A starter that is in the frame already by its packages (it declares the desktop shell and mounts the frame) is left as it is.
    if (options.desktop && !isFramedByPackages(target)) {
      const framework = (args: string[]) =>
        io.run(process.execPath, [acrylblendsBin(), ...args, '--dir', target], io.cwd)
      // The upgrade runs on the starter as it was published, before anything here edits src/app.ts: it recognizes a released scaffold only unedited.
      // A starter made before sharing has no plugin-share row, so pull, list and publish would be refused in the new app: it gets the plugin last, mounted.
      // A shared app is in the frame already (it carries plugins/desktop-shell): `upgrade` brings its desktop to this release instead.
      if (
        (!existsSync(join(target, 'plugins', 'desktop-shell')) &&
          (await framework(['add', 'desktop-shell'])) !== 0) ||
        (await framework(['upgrade'])) !== 0 ||
        (lacksPluginShare(target) && (await framework(['add', 'plugin-share'])) !== 0)
      ) {
        io.stderr.write(
          `error: ${directory} was made, but putting it in the ACRYL frame failed (see above); it runs on its own with ${'`npm start`'}\n`,
        )
        startRepository(target)
        return 1
      }
    }
    startRepository(target)
    io.stdout.write(
      `created ${name} from ${entry ? `${entry.id} ${entry.version}` : manifest.name} (${manifest.description}) in ${target}: ${files.length} files, ${CLASS} docs in docs/framework\n`,
    )
    if (manifest.plugins.length > 0)
      io.stdout.write(
        `it needs these plugins: ${manifest.plugins.join(', ')}; add them with: npx ${PACKAGE} add ${manifest.plugins.join(' ')}\n`,
      )
    const pm: PackageManager =
      options.pm ??
      ((PACKAGE_MANAGERS as readonly string[]).find((m) =>
        (io.env.npm_config_user_agent ?? '').startsWith(`${m}/`),
      ) as PackageManager | undefined) ??
      'npm'
    const hasScripts = Object.keys(lifecycle).length > 0
    if (options.install) {
      const pkg = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8')) as {
        dependencies?: object
        devDependencies?: object
      }
      io.stdout.write(
        `running ${pm} install in ${directory}. This installs: ${[...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})].join(', ') || 'nothing'}` +
          `${hasScripts ? `\nand runs the template's own lifecycle scripts:\n${describeScripts(lifecycle)}` : ''}\n` +
          `(the dependencies' install scripts run too unless your ${pm} is set to ignore them)\n`,
      )
      if ((await io.run(pm, ['install'], target)) !== 0) {
        io.stderr.write(`error: ${pm} install failed; run it yourself in ${directory}\n`)
        return 1
      }
    } else if (hasScripts) {
      io.stdout.write(
        `nothing was installed or run. The template defines ${LIFECYCLE.filter((k) => lifecycle[k]).join(', ')}, which ${pm} install would run:\n${describeScripts(lifecycle)}\nread them first, or pass --install to run them.\n`,
      )
    }
    io.stdout.write(
      `\nNext:\n  cd ${directory}\n${options.install ? '' : `  ${pm} install\n`}${
        options.desktop
          ? `  ${pm} run dev        in the ACRYL frame, in the browser\n  ${pm} run desktop    in the ACRYL frame, in its own window\n  ${pm} start          the app on its own\n`
          : `  ${existsSync(join(target, 'README.md')) ? 'see README.md or the package.json scripts' : 'see the package.json scripts'}\n`
      }`,
    )
    return 0
  } catch (error) {
    if (error instanceof SourceError) {
      io.stderr.write(`error: ${error.message}\nnothing was changed\n`)
      return 1
    }
    throw error
  } finally {
    removeTree(scratch)
  }
}

/** Create the app. Returns the exit code: 0 done, 1 refused or failed, 2 a usage error. Never calls `process.exit`. */
export async function runCreate(argv: readonly string[], io: Io = processIo()): Promise<number> {
  try {
    if (argv.includes('-h') || argv.includes('--help')) {
      io.stdout.write(HELP)
      return 0
    }
    if (argv.includes('-v') || argv.includes('--version')) {
      io.stdout.write(`${VERSION}\n`)
      return 0
    }
    const options = parseCreateOptions(argv)
    // A name on the command line means no questions at all; without one, the only question is the app's name.
    const askedName = options.directory === undefined && !options.yes && io.ask !== undefined
    const directory =
      options.directory ??
      (askedName
        ? (await io.ask!('What is your app called? (my-app): ')).trim() || 'my-app'
        : 'my-app')
    const target = resolve(io.cwd, directory)
    if (options.source !== undefined) return await createFromSource(options, target, directory, io)
    // The Blank app is what `acryl new my-app` makes; a starter is a word after the name.
    const template: Template = options.template ?? 'blank'
    if (!isEmpty(target)) {
      io.stderr.write(`error: ${target} is not empty; nothing was changed\n`)
      return 1
    }
    const name = nameFrom(target)
    // Every template is a Cordis app, made by the framework package's own `init` (blend.yaml, plugins/, AGENTS.md, CLAUDE.md, the skill, the docs).
    const code = await io.run(
      process.execPath,
      [
        acrylblendsBin(),
        'init',
        target,
        '--template',
        template,
        '--name',
        name,
        '--yes',
        '--no-next',
        // init frames the app by default: the plain app is asked for by name.
        ...(options.desktop ? ['--desktop'] : ['--bare']),
      ],
      io.cwd,
    )
    if (code !== 0) return 1
    const pm: PackageManager =
      options.pm ??
      ((PACKAGE_MANAGERS as readonly string[]).find((m) =>
        (io.env.npm_config_user_agent ?? '').startsWith(`${m}/`),
      ) as PackageManager | undefined) ??
      'npm'
    if (options.install) {
      if ((await io.run(pm, ['install'], target)) !== 0) {
        io.stderr.write(`error: ${pm} install failed; run it yourself in ${directory}\n`)
        return 1
      }
    }
    const start = `${pm} run dev`
    // The app opens by itself when it was made in the frame, installed, and there is a terminal to run it in (a script or CI never starts a server).
    if (options.start && options.desktop && options.install && io.ask !== undefined) {
      io.stdout.write(
        `\n${name} is ready. Starting it (Ctrl+C stops it). Next time: cd ${directory} && ${start}\n\n`,
      )
      await io.run(pm, ['run', 'dev'], target)
      return 0
    }
    io.stdout.write(
      `\nNext:\n  cd ${directory}\n${options.install ? '' : `  ${pm} install\n`}  ${start}\n`,
    )
    return 0
  } catch (error) {
    if (error instanceof UsageError) {
      io.stderr.write(`error: ${error.message}\n\n${HELP}`)
      return 2
    }
    io.stderr.write(`error: ${(error as Error).message}\n`)
    return 1
  }
}
