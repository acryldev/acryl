#!/usr/bin/env node
/**
 * The Blank app as a macOS product (M10 T002): scaffold a Blank app with the desktop shell, install it, make the workspace links real files, mark it as a
 * product, and package it with electron-builder as an unsigned DMG. First run only, for this Mac's CPU.
 *
 *   node scripts/pack-blank-mac.mjs [--out <dir>] [--arch arm64|x64]
 *   node scripts/pack-blank-mac.mjs --from acrylblends.small-crm [--product "Small CRM"]     a registry blueprint as its own product
 *   node scripts/pack-blank-mac.mjs --from ../my-blend --product "My Blend" --tag-prefix my-blend-v  a product of a repository that releases several
 *   npx @acryldev/blends pack --from . --product "ACRYL ADE"     the same from a Blend's own repository, with the published packages
 *
 * The DMG carries the app itself: the frame and the Blank app it builds in, with Electron's own Node, so it needs no Node, npm or git. The bundle is
 * read-only; on the first start the packaged app makes the person's first app from it in the product's own folder of the OS per-user data folder
 * (plugins/desktop-shell/product.ts, plugins/instance/storage.ts).
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  appendFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { desktopEntry, launcherScript, tarballName } from './lib/arch-linux.mjs'
import { createSource, repositoryOnlyIn } from './lib/create-source.mjs'
import { DEB_DEPENDS, debPackageName } from './lib/deb.mjs'
import { osVersion, withManifestVersion } from './lib/os-version.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
/**
 * Where this packer runs: ACRYL's checkout (framework/scripts, root = framework), which makes the app with the checkout's own CLI and frame packages, or the
 * published @acryldev/blends (its pack/ folder, root = the package, `acrylblends pack`), which makes it with the published ones: a Blend's own repository
 * releases its product without ACRYL's source.
 */
const checkout = existsSync(join(root, 'packages', 'cli', 'bin', 'acrylblends.js'))
const scratch = checkout ? join(root, 'dist') : join(tmpdir(), 'acryl-pack')
const args = process.argv.slice(2)
const option = (name, fallback) => {
  const at = args.indexOf(name)
  return at === -1 ? fallback : args[at + 1]
}
/**
 * The product is built on the OS it is for (each release runner builds its own): a DMG on macOS, an NSIS installer on Windows, a Debian package on
 * Linux. Native packages (node-pty, sharp) are installed for this machine, so building for another OS would ship the wrong ones.
 */
const PLATFORMS = { darwin: 'mac', win32: 'win', linux: 'linux' }
const platform = PLATFORMS[process.platform]
if (platform === undefined) throw new Error(`pack-blank-mac: no product for ${process.platform}`)
const win = process.platform === 'win32'
const arch = option('--arch', process.arch)
/** npm on Windows is a .cmd, which Node starts only through a shell, and a shell would read a range's `>` as a redirection: run npm's own script. */
const NPM_CLI = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
const npm = (npmArgs, options) =>
  win
    ? spawnSync(process.execPath, [NPM_CLI, ...npmArgs], options)
    : spawnSync('npm', npmArgs, options)
/**
 * A blueprint from the registry instead of Blank (`--from acrylblends.small-crm`): the product is that app, made as `npm create @acryldev/blends --from` makes it
 * (in the frame), under its own name (`--product`, else the first heading of its README).
 */
const from = option('--from', undefined)
/**
 * Where the product's newer builds are published: the Blend's GitHub repository (its `origin`), whose release workflow uploads this packer's files. A
 * repository that releases several products (acryldev/acryl) passes `--tag-prefix`, so the updater takes this product's newest tag, not the repository's latest.
 */
const tagPrefix = option('--tag-prefix', undefined)
if (tagPrefix !== undefined && !/^[\w.-]+$/u.test(tagPrefix))
  throw new Error(
    `pack-blank-mac: --tag-prefix ${tagPrefix} is not a tag prefix (letters, digits, . _ -)`,
  )
function releaseSource() {
  try {
    const remote = execFileSync('git', ['-C', from, 'remote', 'get-url', 'origin'], {
      encoding: 'utf8',
    }).trim()
    const repo = /github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?$/u.exec(remote)?.[1]
    return repo === undefined
      ? {}
      : { releases: { repo, file: FILE_NAME, ...(tagPrefix === undefined ? {} : { tagPrefix }) } }
  } catch {
    return {} // not a checkout, or no origin: the product has no update source
  }
}

/** Which build this product is (product.json `build`): the Blend folder's commit when it is a checkout, else the moment of packing. A started app compares it with the build its copy was made from. */
const productBuild = () => {
  try {
    if (from !== undefined && existsSync(from))
      return execFileSync('git', ['-C', from, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {}
  return new Date().toISOString()
}
// A folder (`--from ./05-acryl-ade`, a Blend's own checkout in its release workflow) is named by its folder, a registry id by its last part.
const slug =
  from === undefined
    ? 'blank'
    : /^[./\\]|^[a-z]:/iu.test(from)
      ? basename(resolve(from)).replace(/^\d+-/u, '')
      : from.replace(/^[^.]+\./u, '')
const out = resolve(
  option('--out', join(checkout ? scratch : join(process.cwd(), 'dist'), `${slug}-${platform}`)),
)
const work = join(scratch, `${slug}-${platform}-work`)
// Every git this script starts (create's first commit, the frame's) runs without git's background maintenance: a detached `git maintenance run --auto`
// writes into .git (objects/maintenance.lock) while step 6 copies it, and the copy fails with ENOENT (macOS runner, ACRYL ADE v0.1.1).
const gitConfigAt = Number(process.env.GIT_CONFIG_COUNT ?? 0)
Object.assign(process.env, {
  GIT_CONFIG_COUNT: String(gitConfigAt + 2),
  [`GIT_CONFIG_KEY_${gitConfigAt}`]: 'maintenance.auto',
  [`GIT_CONFIG_VALUE_${gitConfigAt}`]: 'false',
  [`GIT_CONFIG_KEY_${gitConfigAt + 1}`]: 'gc.auto',
  [`GIT_CONFIG_VALUE_${gitConfigAt + 1}`]: '0',
})
const app = join(work, from === undefined ? 'app' : slug)
const log = (line) => console.log(`pack-blank-mac: ${line}`)

/**
 * The git GitHub Desktop ships (desktop/dugite-native), pinned by version and checksum. Downloaded once into dist/git-download (kept between packs),
 * checked, unpacked into the work folder, and made to run from wherever the app is installed.
 */
const GIT = {
  version: '2.56.0',
  release: 'v2.56.0-2',
  build: 'a44aeca',
  sha256: {
    arm64: '1110de343de11cc6f469b782b60f36217b9199b5e06875dd65baa26dd60563c7',
    x64: '52cc663281e1ec2f1d76ba781193ca4847e62dbbf767f6c99ec9ec5b978a7659',
  },
}

async function download(url, file) {
  if (existsSync(file)) return
  const answer = await fetch(url)
  if (!answer.ok) throw new Error(`${url}: ${String(answer.status)}`)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(`${file}.part`, Buffer.from(await answer.arrayBuffer()))
  renameSync(`${file}.part`, file)
}

async function productGit(cpu) {
  const name = `dugite-native-v${GIT.version}-${GIT.build}-macOS-${cpu}.tar.gz`
  const cache = join(scratch, 'git-download')
  const archive = join(cache, name)
  await download(
    `https://github.com/desktop/dugite-native/releases/download/${GIT.release}/${name}`,
    archive,
  )
  const sum = createHash('sha256').update(readFileSync(archive)).digest('hex')
  if (sum !== GIT.sha256[cpu]) {
    rmSync(archive, { force: true })
    throw new Error(`${name}: checksum ${sum}, expected ${String(GIT.sha256[cpu])}`)
  }
  const copying = join(cache, `git-v${GIT.version}-COPYING`)
  await download(`https://raw.githubusercontent.com/git/git/v${GIT.version}/COPYING`, copying)

  const dir = join(work, 'git')
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  execFileSync('tar', ['-xzf', archive, '-C', dir])
  // Git Credential Manager (a .NET program with its own runtime and UI toolkit) is 115 of the 150 MB, so it is left out; git, its helpers and git-lfs
  // stay. A push signs in through the helper the person's own git configuration names (`gh auth setup-git` writes one).
  const core = join(dir, 'libexec', 'git-core')
  for (const file of readdirSync(core))
    if (
      /\.(dll|dylib|json|pdb)$/u.test(file) ||
      file.startsWith('git-credential-manager') ||
      file === 'createdump' ||
      file === 'NOTICE' ||
      (statSync(join(core, file)).isDirectory() &&
        /^(cs|de|es|fr|it|ja|ko|pl|pt-BR|ru|tr|zh-Hans|zh-Hant)$/u.test(file))
    )
      rmSync(join(core, file), { recursive: true, force: true })
  rmSync(join(dir, 'bin', 'scalar'), { force: true })
  // dugite-native's git finds its helpers and templates only through the environment. The wrapper sets them from where it lies, for git's own process
  // tree only: a shell or an agent that runs `git` gets this one with nothing else changed.
  writeFileSync(
    join(dir, 'bin', 'git'),
    [
      '#!/bin/sh',
      `# The git that ships with ACRYL Blends (Git ${GIT.version}, desktop/dugite-native ${GIT.release}, GPL-2.0: see COPYING.txt and SOURCE.txt beside bin/).`,
      'here=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)',
      'GIT_EXEC_PATH="$here/libexec/git-core"',
      'GIT_TEMPLATE_DIR="$here/share/git-core/templates"',
      'export GIT_EXEC_PATH GIT_TEMPLATE_DIR',
      'exec "$here/libexec/git-core/git" "$@"',
      '',
    ].join('\n'),
    { mode: 0o755 },
  )
  cpSync(copying, join(dir, 'COPYING.txt'))
  writeFileSync(join(dir, 'SOURCE.txt'), gitSourceOffer())
  const size = Number(execFileSync('du', ['-sk', dir], { encoding: 'utf8' }).split('\t')[0]) * 1024
  log(
    `git ${GIT.version} for ${cpu}: ${String(Math.round(size / 1024 / 1024))} MB unpacked (Credential Manager left out)`,
  )
  return dir
}

function gitSourceOffer() {
  return [
    `Git ${GIT.version}, as included in ACRYL Blends`,
    '',
    'This app includes Git, which is free software under the GNU General Public License, version 2 (the full text is in COPYING.txt beside this',
    'file). It is the build GitHub Desktop ships, unchanged apart from leaving out Git Credential Manager and the scalar command.',
    '',
    'The complete corresponding source code:',
    `  Git:               https://github.com/git/git/tree/v${GIT.version}`,
    `  The build scripts: https://github.com/desktop/dugite-native/tree/${GIT.release}`,
    '',
    'For at least three years from the day you received this app, the publisher of ACRYL Blends will also send a complete machine-readable copy of',
    'that source code, for no more than the cost of making and sending it, to anyone who asks at https://github.com/acryldev/acryl/issues.',
    '',
  ].join('\n')
}

if (
  checkout &&
  (!existsSync(join(root, '..', 'plugins', 'blends-frame', 'lib')) ||
    !existsSync(join(root, 'packages', 'cli', 'dist')))
)
  throw new Error('the checkout is not built: run `corepack pnpm run build` first')

// A build that exists is not a build that is current: a merge or an edit leaves the output of the last build in place, and the bundle would ship it
// (the frame and the scaffolder run from `lib` and `dist`, not from `src`). The newest source file of each built package must be older than its output.
const newestFile = (folder) => {
  let newest = 0
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue
    const path = join(folder, entry.name)
    newest = Math.max(newest, entry.isDirectory() ? newestFile(path) : statSync(path).mtimeMs)
  }
  return newest
}
const stale = []
for (const [pkg, out] of [
  ['../plugins/blends-frame', 'lib'],
  ['packages/cli', 'dist'],
]) {
  const src = join(root, pkg, 'src')
  if (checkout && existsSync(src) && newestFile(src) > newestFile(join(root, pkg, out)))
    stale.push(`${pkg} (${out} is older than src)`)
}
if (stale.length > 0)
  throw new Error(
    `the checkout's build is out of date: ${stale.join(', ')}. Run \`corepack pnpm run build\` first`,
  )

// 1. A Blank app with the desktop shell, made by this checkout's CLI, exactly as a person would make one.
rmSync(work, { recursive: true, force: true })
mkdirSync(work, { recursive: true })
const cliVersion = JSON.parse(
  readFileSync(join(root, checkout ? 'packages/cli/package.json' : 'package.json'), 'utf8'),
).version
// The checkout's own frame packages (file: links) for a checkout; the published ones, as create picks them, otherwise.
const frameEnv = checkout
  ? {
      ACRYLBLENDS_FRAME_PACKAGES: (
        await import(pathToFileURL(join(root, 'scripts/lib/ide-specs.mjs')).href)
      ).frameSpecsEnv(root, { dshVersion: '0.2.0-rc.2', frameworkVersion: `^${cliVersion}` }),
    }
  : {}
const initOptions = { stdio: 'inherit', env: { ...process.env, ...frameEnv } }
const init =
  from === undefined
    ? spawnSync(
        process.execPath,
        [
          join(root, checkout ? 'packages/cli/bin/acrylblends.js' : 'bin/acrylblends.js'),
          'init',
          app,
          '--name',
          'acryl-blends-blank',
          '--template',
          'blank',
          '--desktop',
          '--yes',
          '--no-next',
        ],
        initOptions,
      )
    : // The registry blueprint, put in the frame by create itself (add desktop, upgrade); installed in step 2 like Blank.
      // A folder goes to create as an absolute path (lib/create-source.mjs says why).
      checkout
      ? spawnSync(
          process.execPath,
          [
            join(root, 'packages/create/bin/create-acrylblends.js'),
            app,
            '--from',
            createSource(from),
            '--yes',
          ],
          initOptions,
        )
      : // create is its own package, released together with this CLI.
        npm(
          [
            'exec',
            '--yes',
            `--package=@acryldev/create-blends@${cliVersion}`,
            '--',
            'create-blends',
            app,
            '--from',
            createSource(from),
            '--yes',
          ],
          initOptions,
        )
if (init.status !== 0) throw new Error(`init failed (${String(init.status)})`)
log(`scaffolded ${app}`)
// The manifest the person's app starts from, before the packaging below declares every installed package in it.
const scaffoldManifest = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'))

// 2. Its packages, as npm installs them.
const install = npm(['install', '--no-audit', '--no-fund', '--loglevel=error'], {
  cwd: app,
  stdio: 'inherit',
})
if (install.status !== 0) throw new Error(`npm install failed (${String(install.status)})`)
// The app's own step before its window opens (ACRYL ADE swaps the frame's root row for its workbench there). A product never runs `npm run desktop`,
// so the step runs here, once, and the bundle ships what it made.
if (scaffoldManifest.scripts?.predesktop !== undefined) {
  const before = npm(['run', 'predesktop', '--loglevel=error'], { cwd: app, stdio: 'inherit' })
  if (before.status !== 0) throw new Error(`npm run predesktop failed (${String(before.status)})`)
  log("ran the app's predesktop step")
}

// 3. npm links the workspace packages (file: specs) instead of copying them, and those links point at this checkout: a bundle must carry the files.
const materialize = (path) => {
  const target = realpathSync(path)
  rmSync(path, { recursive: true, force: true })
  cpSync(target, path, { recursive: true, dereference: true })
}
const modules = join(app, 'node_modules')
const materialized = []
for (const entry of readdirSync(modules)) {
  if (entry === '.bin') continue
  const path = join(modules, entry)
  const stat = lstatSync(path)
  if (stat.isSymbolicLink()) {
    materialize(path)
    materialized.push(entry)
    log(`materialized ${entry}`)
  } else if (stat.isDirectory() && entry.startsWith('@')) {
    for (const scoped of readdirSync(path)) {
      const scopedPath = join(path, scoped)
      if (!lstatSync(scopedPath).isSymbolicLink()) continue
      materialize(scopedPath)
      materialized.push(`${entry}/${scoped}`)
      log(`materialized ${entry}/${scoped}`)
    }
  }
}

// 3b. Packages installed from npm can miss dependencies the monorepo satisfied by hoisting, and a linked package's own dependencies came from the checkout;
// a bundle carries none of that, and the packager keeps only packages the app declares: install whatever any installed package requires and the app does
// not have, into package.json, until nothing is missing (optionals are left
// out: they are platform builds, and npm refuses the ones for another CPU).
const packagesIn = (dir) => {
  const found = []
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.')) continue
    const path = join(dir, entry)
    if (!lstatSync(path).isDirectory()) continue
    if (entry.startsWith('@')) {
      for (const scoped of readdirSync(path)) {
        const scopedPath = join(path, scoped)
        if (lstatSync(scopedPath).isDirectory())
          found.push({ name: `${entry}/${scoped}`, path: scopedPath })
      }
    } else found.push({ name: entry, path })
  }
  return found
}
for (let round = 1; round <= 4; round += 1) {
  const missing = new Map()
  for (const pkg of packagesIn(modules)) {
    const manifestPath = join(pkg.path, 'package.json')
    if (!existsSync(manifestPath)) continue
    const own = JSON.parse(readFileSync(manifestPath, 'utf8'))
    for (const [dependency, range] of Object.entries({
      ...own.dependencies,
      ...own.peerDependencies,
    })) {
      const wantedRange = String(range)
      if (wantedRange.startsWith('workspace:')) continue
      if (missing.has(dependency)) continue
      if (existsSync(join(modules, dependency))) continue
      missing.set(dependency, wantedRange)
    }
  }
  if (missing.size === 0) break
  const specs = [...missing].map(([dependency, range]) => `${dependency}@${range}`)
  log(`round ${String(round)}: installing ${String(specs.length)} dependencies the app was missing`)
  const extra = npm(
    ['install', '--save-exact', '--no-audit', '--no-fund', '--loglevel=error', ...specs],
    { cwd: app, stdio: 'inherit' },
  )
  if (extra.status !== 0)
    throw new Error(`installing missing dependencies failed (${String(extra.status)})`)
}

// 3c. The packager keeps only what the app declares, and a dependency that arrived transitively (an optional one, say) is still needed at run time: every
// installed package is declared, so the bundle carries exactly the tree that runs here.
const declared = {}
// A package the app overrides (frame/packages.json `omit`: the LibreOffice engines as an empty placeholder) is declared with the override's own spec:
// npm refuses a direct dependency that differs from its override (EOVERRIDE), which stopped every pack of acrylblends 1.5.19 apps.
const overrides = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8')).overrides ?? {}
for (const pkg of packagesIn(modules)) {
  const manifestPath = join(pkg.path, 'package.json')
  if (!existsSync(manifestPath)) continue
  const own = JSON.parse(readFileSync(manifestPath, 'utf8'))
  // electron is the runtime the packager brings, not a package of the app: it stays in devDependencies.
  if (pkg.name === 'electron') continue
  if (typeof overrides[pkg.name] === 'string') declared[pkg.name] = overrides[pkg.name]
  else if (typeof own.version === 'string') declared[pkg.name] = own.version
}
const before = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'))
const merged = { ...before.dependencies, ...declared }
JSON.parse(JSON.stringify(before)) // the manifest is rewritten below with the product fields; dependencies travel with it
writeFileSync(
  join(app, 'package.json'),
  `${JSON.stringify({ ...before, dependencies: merged }, null, 2)}\n`,
)
log(`declared ${String(Object.keys(declared).length)} installed packages`)

// 4. The product marker, and what Electron needs to find its main process and the packager its identity.
// The product is ACRYL Blends; Blank is only the starting app a person's first app is made from. The name is the installed app's, the DMG's and the root
// folder's in the OS data folder, so every app the person makes (AccountingApp, CRMApp, ...) lives beside the others under one product.
const readmeTitle = () => {
  const readme = join(app, 'README.md')
  const heading = existsSync(readme) ? /^# (.+)$/mu.exec(readFileSync(readme, 'utf8')) : null
  return heading?.[1]?.trim()
}
const PRODUCT =
  from === undefined ? 'ACRYL Blends' : (option('--product', undefined) ?? readmeTitle() ?? slug)
/** The app's own name in the product: Blank for ACRYL Blends, the product itself for a blueprint. */
const APP_NAME = from === undefined ? 'Blank' : PRODUCT
const DESCRIPTION =
  from === undefined
    ? 'The ACRYL Blends frame around an empty app: make it yours from the chat.'
    : `${PRODUCT}, an ACRYL Blends app (${from}), in the frame: change it from the chat.`
const FILE_NAME =
  from === undefined ? 'ACRYL-Blends-Blank' : PRODUCT.replace(/[^A-Za-z0-9]+/gu, '-')
/** The program's name on Linux: acryl-control-center. */
const EXE = FILE_NAME.toLowerCase()
// Seal the bundle ad hoc, after the builder has laid it out and before the DMG is made. With no signing step the main program keeps Electron's linker
// signature (identifier `Electron`, no sealed resources, Info.plist not bound), so the bundle was not sealed and `codesign --verify --deep --strict` failed.
// An ad hoc seal makes every file of the bundle part of the signature: an app that writes into its own bundle shows at once. No hardened runtime: the
// person's native modules (node-pty, sharp) are not signed by us and a hardened process refuses to load them. A Developer ID signature and notarization
// replace this seal at release (app-storage.md).
writeFileSync(
  join(work, 'seal-bundle.cjs'),
  `const { spawnSync } = require('node:child_process')
const { join } = require('node:path')
exports.default = async (context) => {
  const bundle = join(context.appOutDir, context.packager.appInfo.productFilename + '.app')
  const sealed = spawnSync('codesign', ['--force', '--deep', '--sign', '-', bundle], { stdio: 'inherit' })
  if (sealed.status !== 0) throw new Error('codesign failed for ' + bundle)
  const checked = spawnSync('codesign', ['--verify', '--deep', '--strict', bundle], { stdio: 'inherit' })
  if (checked.status !== 0) throw new Error('the sealed bundle does not verify: ' + bundle)
}
`,
)
const manifest = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'))
// The installed app's icon (Dock, Finder, About, the installer) is the one its window wears (plugins/desktop-shell/brand.ts iconFile): the app's own
// assets/icon.png, else the ACRYL Blends logo. Left unset, every product showed Electron's default icon.
// The app's desktop shell: its own copy in plugins/desktop-shell, or the @acryldev/desktop-shell package it depends on (spec 051 T011).
const { findDesktopShell } = await import(
  pathToFileURL(join(root, checkout ? 'packages/cli/src/desktop-shell.ts' : 'dist/index.js')).href
)
const shell = findDesktopShell(app)
if (shell === undefined)
  throw new Error(
    `pack-blank-mac: ${app} has no desktop shell (plugins/desktop-shell, or the @acryldev/desktop-shell package)`,
  )
// The app's own icon, else ACRYL Blends' (the published desktop-shell carries it in lib/assets, its source in assets). Without one, electron-builder
// silently used Electron's own icon on every OS.
const appIcon = [
  join(app, 'assets', 'icon.png'),
  join(shell.root, 'lib', 'assets', 'acrylblends-logo.png'),
  join(shell.root, 'assets', 'acrylblends-logo.png'),
].find((file) => existsSync(file))
if (appIcon === undefined)
  throw new Error(
    `no icon: neither ${join(app, 'assets', 'icon.png')} nor ACRYL Blends' logo in ${shell.root}`,
  )
manifest.main = shell.main
manifest.productName = PRODUCT
manifest.description = DESCRIPTION
manifest.build = {
  appId: `dev.acrylblends.${slug}`,
  productName: PRODUCT,
  asar: false,
  npmRebuild: false,
  files: ['**/*', '!dist/**', '!**/.acrylblends/**', '!**/*.map'],
  directories: { output: 'dist' },
  mac: {
    target: [{ target: 'dmg', arch: [arch] }],
    // No signing by the builder (it passes --timestamp, which an ad hoc signature refuses); `afterPack` below seals the bundle instead.
    identity: null,
    category: 'public.app-category.developer-tools',
    icon: appIcon,
  },
  dmg: { title: PRODUCT },
  win: { target: [{ target: 'nsis', arch: [arch] }], icon: appIcon },
  // Per user, no administrator: the installer asks where, and the app's home is the person's own data folder (plugins/instance/storage.ts).
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
  },
  linux: {
    target: [{ target: 'deb', arch: [arch] }],
    category: 'Development',
    icon: appIcon,
    maintainer: 'ACRYL Blends <build@acryldev.dev>',
    // One name for the program on every Linux: the .deb's, the tarball's launcher and the PKGBUILD's (acryl-control-center).
    executableName: EXE,
  },
  // The .deb is named after the product (acryl-control-center), not after package.json's `name` (`blend` for every Blend), and depends on the sound library
  // Electron loads at start (lib/deb.mjs).
  deb: { packageName: debPackageName(EXE), depends: DEB_DEPENDS },
  ...(platform === 'mac' ? { afterPack: join(work, 'seal-bundle.cjs') } : {}),
}
// A Debian package names its maintainer and the app's home page; electron-builder reads both from the manifest.
manifest.author ??= { name: 'ACRYL Blends', email: 'build@acryldev.dev' }
manifest.homepage ??= 'https://acrylblends.github.io'
// The version the OS shows in Installed apps and the About window: the Blend's own when the person raised it past package.json's (lib/os-version.mjs).
// The packer has no dependencies; the app's own yaml (the frame's) reads blend.yaml.
const blendVersion = await (async () => {
  try {
    const { parse } = await import(
      pathToFileURL(createRequire(join(app, 'package.json')).resolve('yaml')).href
    )
    const version = parse(readFileSync(join(app, 'blend.yaml'), 'utf8'))?.metadata?.version
    return typeof version === 'string' ? version : undefined
  } catch {
    return undefined
  }
})()
manifest.version = osVersion(manifest.version, blendVersion)
// The frame's top bar reads blend.yaml: the packed copy names the same version as About and Installed apps (a release sets only package.json's).
if (blendVersion !== manifest.version && existsSync(join(app, 'blend.yaml'))) {
  writeFileSync(
    join(app, 'blend.yaml'),
    withManifestVersion(readFileSync(join(app, 'blend.yaml'), 'utf8'), manifest.version),
  )
}
log(
  `version ${manifest.version}${blendVersion === undefined ? '' : ` (package.json and the Blend's ${blendVersion})`}`,
)
// 4a. The product's own git (app-storage.md, "Git on a clean machine"): a clean Mac has only the shim that asks to install the Command Line Tools, and
// versions, export, the terminals and the agents all run `git`. It lies beside the app in Resources/git, and the desktop shell puts it first on the
// frame host's PATH (plugins/desktop-shell/git.ts).
// shortcut: git ships with the macOS product only; Windows and Linux use the machine's git (dugite-native has builds for both, add them when the desktop
// shell's git.ts finds a Windows git.exe).
if (platform === 'mac')
  manifest.build.extraResources = [{ from: await productGit(arch), to: 'git' }]
else log(`no bundled git on ${platform}: the app uses the git on the machine`)
writeFileSync(join(app, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
// The product's root in the OS per-user data folder is named after it; the first app the person gets is called Blank until they name it. The Program is
// what stays in the bundle and is served from there (plugins/instance/bundle.ts): the packages, the generated host and its composition, and every
// framework plugin the library copied in (plugins/library.lock.json). A new app's source gets everything else: the person's part.
const libraryPlugins = Object.keys(
  JSON.parse(readFileSync(join(app, 'plugins', 'library.lock.json'), 'utf8')).plugins ?? {},
)
const program = [
  'node_modules/',
  'app/',
  'frame/',
  'scripts/',
  'cordis.yml',
  'cordis.patch.yml',
  ...libraryPlugins.map((name) => `plugins/${name}/`),
]
writeFileSync(
  join(app, 'product.json'),
  // A product made from a Blend (--from) is that finished app under its own name; only Blank's first app is the person's to name.
  `${JSON.stringify({ product: PRODUCT, appName: APP_NAME, program, ...(from === undefined ? {} : { named: true, build: productBuild(), ...releaseSource() }) }, null, 2)}\n`,
)
log(`the Program: ${program.join(', ')}`)

// 4b. The packager drops or rewrites files the app owns: `.git` and `.gitignore` never enter a bundle (electron-builder excludes those names), and the
// manifest it ships is filtered (the scripts go). Each travels under a plain carrier name and a new app's source gets it back as itself
// (plugins/desktop-shell/product.ts). The product's own build-time files stay out of the repository's status through its local exclude, never the app's tracked
// .gitignore.
cpSync(join(app, '.gitignore'), join(app, 'gitignore-product'))
// `.gitattributes` pins the line endings of the app's files (a plugin written on Windows must digest the same on a Mac): the template commits it, the builder drops it by name.
if (existsSync(join(app, '.gitattributes')))
  cpSync(join(app, '.gitattributes'), join(app, 'gitattributes-product'))
// The source's manifest lists no framework package as its own: the bundle provides every package the scaffold declared, so they are peers, at the
// version installed here (never a build machine's file: path). Its scripts name Program files and a product runs no npm, so they stay with the bundle.
// What the person installs later is theirs: `dependencies` in their source.
const installedVersion = (name) =>
  JSON.parse(readFileSync(join(app, 'node_modules', name, 'package.json'), 'utf8')).version
const {
  scripts: _scripts,
  dependencies: scaffoldDependencies = {},
  devDependencies: _devDependencies,
  ...ownFields
} = scaffoldManifest
const sourceManifest = {
  ...ownFields,
  peerDependencies: Object.fromEntries(
    Object.keys(scaffoldDependencies)
      .sort()
      .map((name) => [name, installedVersion(name)]),
  ),
}
writeFileSync(join(app, 'package-product.json'), `${JSON.stringify(sourceManifest, null, 2)}\n`)
const exclude = join(app, '.git', 'info', 'exclude')
const excluded = existsSync(exclude) ? readFileSync(exclude, 'utf8') : ''
const productNames = [
  'product.json',
  'gitignore-product',
  'gitattributes-product',
  'package-product.json',
  'template-git/',
]
const missingNames = productNames.filter(
  (name) =>
    !excluded
      .split('\n')
      .map((line) => line.trim())
      .includes(name),
)
if (missingNames.length > 0) {
  mkdirSync(join(app, '.git', 'info'), { recursive: true })
  appendFileSync(
    exclude,
    `${excluded === '' || excluded.endsWith('\n') ? '' : '\n'}${missingNames.join('\n')}\n`,
  )
}
// The repository a new app starts with records the person's part only: the source's manifest, and none of the Program (which a source never holds,
// so it would show as deleted). The bundle's own files are left as they are; the commit is made in the index. The identity is the product's, not
// whatever the build machine configures.
const gitIdentity = [
  '-c',
  'user.name=ACRYL Blends',
  '-c',
  'user.email=build@acryldev.dev',
  '-c',
  'commit.gpgsign=false',
]
execFileSync(
  'git',
  [
    'rm',
    '-r',
    '-q',
    '--cached',
    '--ignore-unmatch',
    '--',
    ...program.map((path) => path.replace(/\/$/u, '')),
    ...repositoryOnlyIn(app),
  ],
  { cwd: app, stdio: 'inherit' },
)
const manifestBlob = execFileSync('git', ['hash-object', '-w', 'package-product.json'], {
  cwd: app,
  encoding: 'utf8',
}).trim()
execFileSync('git', ['update-index', '--cacheinfo', `100644,${manifestBlob},package.json`], {
  cwd: app,
  stdio: 'inherit',
})
// The product version written into blend.yaml above belongs to the first commit, else a new app opens with it as an unsaved change.
if (existsSync(join(app, 'blend.yaml')))
  execFileSync('git', ['add', '--', 'blend.yaml'], { cwd: app, stdio: 'inherit' })
execFileSync(
  'git',
  [
    ...gitIdentity,
    'commit',
    '-q',
    '-m',
    "product: the person's part of the app; the framework is served from the product's bundle",
  ],
  { cwd: app, stdio: 'inherit' },
)
// The Blend repository's own files (its release workflow) are not the person's app: out of the folder and out of the first commit's tree.
const repositoryOnly = repositoryOnlyIn(app)
for (const path of repositoryOnly) rmSync(join(app, path), { recursive: true, force: true })
if (repositoryOnly.length > 0) log(`left out the repository's own ${repositoryOnly.join(', ')}`)
// The scaffold's repository travels as `template-git` (the packager drops `.git`), with that commit in it.
if (existsSync(join(app, '.git')))
  rmSync(join(app, 'template-git'), { recursive: true, force: true })
// shortcut: the filter keeps Node on its JavaScript copy; its native copy (Node 24.22 on macOS runners) fails here with ENOENT on template-git/objects.
if (existsSync(join(app, '.git')))
  cpSync(join(app, '.git'), join(app, 'template-git'), { recursive: true, filter: () => true })

// 5. Package it. The builder is not a dependency of this repo yet; a checkout of ACRYL has one, and npx fetches one otherwise.
const builder = process.env.ELECTRON_BUILDER
const KIND = { mac: 'dmg', win: 'nsis', linux: 'deb' }[platform]
const EXTENSION = { mac: '.dmg', win: '.exe', linux: '.deb' }[platform]
const targetArgs = [`--${platform}`, KIND, `--${arch}`, '--publish', 'never']
log(`packaging with ${builder ?? 'npx electron-builder@26.15.7'}`)
const pack =
  builder !== undefined
    ? spawnSync(process.execPath, [builder, ...targetArgs], {
        cwd: app,
        stdio: 'inherit',
        env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' },
      })
    : npm(
        [
          'exec',
          '--yes',
          '--package=electron-builder@26.15.7',
          '--',
          'electron-builder',
          ...targetArgs,
        ],
        {
          cwd: app,
          stdio: 'inherit',
          env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' },
        },
      )
if (pack.status !== 0) throw new Error(`electron-builder failed (${String(pack.status)})`)

// 6. The installer, under the name the person is given.
const produced = readdirSync(join(app, 'dist')).filter((file) => file.endsWith(EXTENSION))
if (produced.length === 0) throw new Error(`electron-builder wrote no ${EXTENSION}`)
mkdirSync(out, { recursive: true })
for (const file of readdirSync(out))
  if (file.endsWith(EXTENSION)) rmSync(join(out, file), { force: true })
const target = join(out, `${FILE_NAME}-${platform}-${arch}${EXTENSION}`)
cpSync(join(app, 'dist', produced[0]), target)
// 7. On Linux also a portable tarball (Arch Linux, Omarchy, any distribution without dpkg): the app folder the builder laid out for the .deb, under
// lib/, with a launcher, a menu entry and the icon (lib/arch-linux.mjs). `acrylblends pkgbuild` makes the PKGBUILD that installs it.
if (platform === 'linux') {
  const unpacked = readdirSync(join(app, 'dist')).find((name) => /^linux.*-unpacked$/u.test(name))
  if (unpacked === undefined)
    throw new Error('electron-builder left no linux-unpacked folder for the tarball')
  const portable = join(work, 'portable', EXE)
  rmSync(join(work, 'portable'), { recursive: true, force: true })
  mkdirSync(portable, { recursive: true })
  execFileSync('cp', ['-a', join(app, 'dist', unpacked), join(portable, 'lib')])
  writeFileSync(join(portable, EXE), launcherScript(EXE), { mode: 0o755 })
  writeFileSync(
    join(portable, `${EXE}.desktop`),
    desktopEntry({ exe: EXE, product: PRODUCT, description: DESCRIPTION }),
  )
  cpSync(appIcon, join(portable, `${EXE}.png`))
  // The app's licence, which the PKGBUILD installs where Arch looks for it (/usr/share/licenses).
  if (existsSync(join(app, 'LICENSE'))) cpSync(join(app, 'LICENSE'), join(portable, 'LICENSE'))
  const tarball = join(out, tarballName(FILE_NAME, arch))
  rmSync(tarball, { force: true })
  execFileSync('tar', ['-czf', tarball, '-C', join(work, 'portable'), EXE])
  log(`portable: ${tarball} (${String(Math.round(statSync(tarball).size / 1024 / 1024))} MB)`)
}
log(`done: ${target} (${String(Math.round(statSync(target).size / 1024 / 1024))} MB)`)
