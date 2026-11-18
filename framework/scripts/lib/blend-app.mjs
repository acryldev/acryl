/**
 * One OS app per Blend, the part that is the same on every OS (specs/049-framework-architecture/app-storage.md in ACRYL): the name a Blend app may have,
 * and the copy of a Windows or Linux engine folder under that name. The copy links every file to the engine's (hard links on one volume: a second app costs
 * the folders and one file, not the engine's size) except the product marker, which is the one file that differs.
 */
import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  cpSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** A name that is a folder name on every OS (plugins/instance/storage.ts `isPortableName`, the same rule) and a file name inside an Info.plist. */
export const NAME = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,62}$/u

/** The bundle id's last part: lower case, letters and digits, dashes between. */
export const slugOf = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '')

/** Where the product marker lies in a Windows or Linux engine folder (electron-builder's `asar: false` layout: `resources/app`). */
export const MARKER = ['resources', 'app', 'product.json']

/** Link `from` into `to`, folder by folder; `skip` gets each file's path under `from`, `/`-separated. Falls back to a copy where a link cannot be made. */
export function linkTree(from, to, skip = () => false, base = '') {
  mkdirSync(to, { recursive: true })
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const path = base === '' ? entry.name : `${base}/${entry.name}`
    const source = join(from, entry.name)
    const target = join(to, entry.name)
    if (skip(path)) continue
    if (entry.isDirectory()) linkTree(source, target, skip, path)
    else if (entry.isSymbolicLink()) symlinkSync(readlinkSync(source), target)
    else {
      try {
        linkSync(source, target)
      } catch {
        copyFileSync(source, target)
      }
    }
  }
}

/**
 * A Windows or Linux Blend app: the engine folder linked under `<out>/<name>`, its executable renamed to the Blend's, the marker rewritten so the product
 * (and with it the root in the OS data folder) is the Blend's. Linux gets a `.desktop` entry beside it.
 * @param engine - the engine folder (an unpacked Electron app with `resources/app`).
 * @param exe - the engine's executable, relative to `engine` (`ACRYL Blends.exe`, `acryl-blends`).
 */
export function makeDirApp({ engine, name, out, exe, platform }) {
  if (!NAME.test(name))
    throw new Error(`"${name}" cannot be an app name: letters, digits, space, - and _`)
  const dir = join(out, name)
  const marker = MARKER.join('/')
  linkTree(engine, dir, (path) => path === marker)
  const product = JSON.parse(readFileSync(join(engine, ...MARKER), 'utf8'))
  writeFileSync(
    join(dir, ...MARKER),
    `${JSON.stringify({ ...product, product: name, appName: name }, null, 2)}\n`,
  )
  const extension = exe.endsWith('.exe') ? '.exe' : ''
  const renamed = `${name}${extension}`
  renameSync(join(dir, exe), join(dir, renamed))
  if (platform === 'linux')
    writeFileSync(
      join(out, `${name}.desktop`),
      [
        '[Desktop Entry]',
        'Type=Application',
        `Name=${name}`,
        // Electron's sandbox needs a setuid helper or user namespaces; Ubuntu 23.10 and later restrict the latter, so the entry says so itself.
        `Exec="${join(dir, renamed)}" --no-sandbox %U`,
        'Terminal=false',
        'Categories=Office;Development;',
        '',
      ].join('\n'),
    )
  return { dir, exe: join(dir, renamed) }
}

/**
 * What a pulled Blend needs that the engine does not carry: a framework plugin its `plugins/library.lock.json` copied in that the Program lacks, and a
 * package its manifest depends on that the engine's `node_modules` lacks (a product runs no npm, so nothing is installed for it).
 * @param program - the product marker's Program paths.
 * @param modules - the engine's `node_modules` folder.
 */
export function seedProblems({ seed, program, modules }) {
  const problems = []
  const lock = join(seed, 'plugins', 'library.lock.json')
  const library = existsSync(lock)
    ? Object.keys(JSON.parse(readFileSync(lock, 'utf8')).plugins ?? {})
    : []
  for (const name of library)
    if (!program.includes(`plugins/${name}/`))
      problems.push(`the framework plugin ${name} is not in the engine`)
  const manifest = JSON.parse(readFileSync(join(seed, 'package.json'), 'utf8'))
  for (const name of Object.keys(manifest.dependencies ?? {}))
    if (!existsSync(join(modules, name, 'package.json')))
      problems.push(`the package ${name} is not in the engine`)
  return problems
}

/** The manifest a product's source has (the Blank product's `package-product.json`): the app's own fields, its packages as peers at the engine's versions, no scripts. */
export function sourceManifest(manifest, modules) {
  const { scripts: _scripts, dependencies = {}, devDependencies: _dev, ...own } = manifest
  const installed = (name) =>
    JSON.parse(readFileSync(join(modules, name, 'package.json'), 'utf8')).version
  return {
    ...own,
    peerDependencies: Object.fromEntries(
      Object.keys(dependencies)
        .sort()
        .map((name) => [name, installed(name)]),
    ),
  }
}

const GIT_IDENTITY = [
  '-c',
  'user.name=ACRYL Blends',
  '-c',
  'user.email=build@acrylblends.dev',
  '-c',
  'commit.gpgsign=false',
]

/** Throw the one message of what `seed` needs that the engine's `resourcesApp` lacks; else the engine's product marker. Run before anything is copied. */
export function assertSeedFits({ seed, resourcesApp }) {
  const product = JSON.parse(readFileSync(join(resourcesApp, 'product.json'), 'utf8'))
  const problems = seedProblems({
    seed,
    program: product.program,
    modules: join(resourcesApp, 'node_modules'),
  })
  if (problems.length > 0)
    throw new Error(`this Blend cannot run on this engine: ${problems.join('; ')}`)
  return product
}

/**
 * Put a Blend into a product (a folder `resourcesApp`, the engine's `resources/app`): its files in `seed/`, its repository as `seed/template-git` with the
 * Program taken out of the commit (a source never holds it), and the marker naming the folder. The product's first app is made from it
 * (plugins/desktop/product.ts). Throws one message listing what the engine lacks for this Blend.
 * @param seed - the pulled Blend's folder (`npm create acrylblends@latest app -- --from <id>`).
 * @param git - the git to run (the product's own, else the one on the PATH).
 */
export function applySeed({ seed, resourcesApp, git = 'git' }) {
  const marker = join(resourcesApp, 'product.json')
  const product = assertSeedFits({ seed, resourcesApp })
  const modules = join(resourcesApp, 'node_modules')
  const dest = join(resourcesApp, 'seed')
  rmSync(dest, { recursive: true, force: true })
  const skip = (path) =>
    ['node_modules', '.git', 'package-lock.json', 'dist', '.acrylblends'].includes(
      path.slice(seed.length + 1).split(/[\\/]/u)[0] ?? '',
    )
  cpSync(seed, dest, { recursive: true, filter: (path) => !skip(path) })
  const carried = `${JSON.stringify(sourceManifest(JSON.parse(readFileSync(join(seed, 'package.json'), 'utf8')), modules), null, 2)}\n`
  writeFileSync(join(dest, 'package-product.json'), carried)
  // The repository: the Blend's own history (or one made now), with a last commit that drops the Program from the index and records the source's manifest.
  const work = mkdtempSync(join(tmpdir(), 'blend-seed-'))
  try {
    cpSync(seed, work, { recursive: true, filter: (path) => !skip(path) || path === seed })
    if (existsSync(join(seed, '.git')))
      cpSync(join(seed, '.git'), join(work, '.git'), { recursive: true })
    const run = (...argv) =>
      execFileSync(git, [...GIT_IDENTITY, ...argv], { cwd: work, encoding: 'utf8' })
    if (!existsSync(join(work, '.git'))) {
      run('init', '-q')
      run('add', '-A')
      run('commit', '-q', '-m', 'the Blend as pulled')
    }
    run(
      'rm',
      '-r',
      '-q',
      '--cached',
      '--ignore-unmatch',
      '--',
      ...product.program.map((path) => path.replace(/\/$/u, '')),
    )
    writeFileSync(join(work, 'package-product.json'), carried)
    const blob = run('hash-object', '-w', 'package-product.json').trim()
    run('update-index', '--add', '--cacheinfo', `100644,${blob},package.json`)
    run(
      'commit',
      '-q',
      '-m',
      "product: the person's part of the app; the framework is served from the product's bundle",
    )
    cpSync(join(work, '.git'), join(dest, 'template-git'), { recursive: true })
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
  writeFileSync(marker, `${JSON.stringify({ ...product, seed: 'seed' }, null, 2)}\n`)
  return dest
}
