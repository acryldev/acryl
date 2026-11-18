#!/usr/bin/env node
// The publish pipeline for the frame's packages (docs/plans/ide-port.md, slice 1's last item): build, the original tests, provenance, `npm pack`, a packed
// contents check, the peer rule, and a fresh app installed from those tarballs that boots the frame. Dry run only: this script never publishes and never
// logs in; publishing is the owner's step once the npm org named in frame/packages.json exists.
//
//   node --import ./scripts/workspace-source.mjs scripts/verify-frame-publish.mjs [--skip-tests] [--only <short>] [--keep]
//
// The package names come from frame/packages.json, one `scope` value plus each folder's short name, so a naming decision is a one-line change there.
import './lib/scratch-home.mjs'
import { spawn, spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FRAME_PACKAGES } from '../packages/cli/src/ide-profile.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const config = JSON.parse(readFileSync(join(root, 'frame', 'packages.json'), 'utf8'))
const scope = config.scope
if (typeof scope !== 'string' || !scope.startsWith('@'))
  fail(
    `frame/packages.json: scope must be an npm scope like "@acrylblends" (got ${JSON.stringify(scope)})`,
  )
const shortOf = Object.fromEntries(
  Object.entries(config.packages).map(([folder, entry]) => [folder, entry.name]),
)
const folders = Object.keys(shortOf)
const published = new Map(folders.map((folder) => [folder, `${scope}/${shortOf[folder]}`]))
const byPublished = new Map([...published].map(([folder, name]) => [name, folder]))
/** Each frame package's source name (what its own package.json says) to the name it publishes under. */
const sourceToPublished = new Map(
  folders.map((folder) => {
    const manifest = JSON.parse(readFileSync(join(root, 'ide', folder, 'package.json'), 'utf8'))
    return [String(manifest.name), published.get(folder)]
  }),
)

/** Each frame package's version, so a workspace range becomes a range of the package it names, not of the one that depends on it. */
const versionOf = new Map(
  folders.map((folder) => {
    const manifest = JSON.parse(readFileSync(join(root, 'ide', folder, 'package.json'), 'utf8'))
    const version = String(manifest.version ?? '0.0.0')
    // The CLI installs the version the file names, so the file and the folder must agree on what is published.
    if (config.packages[folder].version !== version)
      fail(
        `frame/packages.json names ${folder} at ${String(config.packages[folder].version)}, its package.json is ${version}`,
      )
    return [published.get(folder), version]
  }),
)

const argv = process.argv.slice(2)
const skipTests = argv.includes('--skip-tests')
const keep = argv.includes('--keep')
const onlyAt = argv.indexOf('--only')
const only = onlyAt === -1 ? undefined : argv[onlyAt + 1]
const selected = folders.filter((folder) => only === undefined || shortOf[folder] === only)
if (selected.length === 0) fail(`--only ${String(only)} matches no package in frame/packages.json`)

const scratch = mkdtempSync(join(tmpdir(), 'verify-frame-publish-'))
let devProcess = null
let devStopped = false
let devPort = 0
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const log = (message) => console.log(`verify-frame-publish: ${message}`)

function fail(message) {
  throw new Error(`verify-frame-publish: ${message}`)
}

/** Start a package script in its own process group, so a stop takes npm and everything npm started. */
function start(cwd, args, env) {
  const child = spawn(npm, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })
  child.output = ''
  child.stdout.on('data', (chunk) => (child.output += chunk))
  child.stderr.on('data', (chunk) => (child.output += chunk))
  return child
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

/** Stop the child's whole group and say whether its port is free after it. */
async function stop(child, port) {
  if (child === null || child === undefined) return true
  const alive = (pid) => {
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  }
  const signal = (name) => {
    try {
      process.kill(-child.pid, name)
    } catch {
      try {
        child.kill(name)
      } catch {
        // Already gone.
      }
    }
  }
  if (alive(child.pid)) {
    signal('SIGTERM')
    const end = Date.now() + 15_000
    while (Date.now() < end && alive(child.pid)) await sleep(200)
  }
  if (alive(child.pid)) {
    signal('SIGKILL')
    const end = Date.now() + 10_000
    while (Date.now() < end && alive(child.pid)) await sleep(200)
  }
  if (port === undefined) return true
  for (let i = 0; i < 60; i += 1) {
    const answered = await fetch(`http://127.0.0.1:${port}/`).then(
      () => true,
      () => false,
    )
    if (!answered) return true
    await sleep(250)
  }
  return false
}

/** Any process still living in the scratch folder: none may be. */
function leftoverProcesses() {
  const result = spawnSync('ps', ['-axo', 'pid,command'], { encoding: 'utf8' })
  return (result.stdout ?? '')
    .split('\n')
    .filter((line) => line.includes(scratch) && !line.includes('ps -axo'))
    .map((line) => line.trim())
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...options,
    env: { ...process.env, npm_config_loglevel: 'error', ...options.env },
  })
  return {
    status: result.status ?? 1,
    out: `${result.stdout ?? ''}${result.stderr ?? ''}`,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

/** Replace every frame package's source name with its published name in a staged package's built files. */
function rewritePublishedNames(dir) {
  const text = /\.[cm]?[jt]s$|\.d\.ts$|\.ya?ml$/u
  const walk = (folder) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name)
      if (entry.isDirectory()) {
        walk(path)
        continue
      }
      if (!text.test(entry.name)) continue
      let source
      try {
        source = readFileSync(path, 'utf8')
      } catch {
        continue
      }
      let next = source
      for (const [from, to] of sourceToPublished) {
        next = next.replaceAll(
          new RegExp(`(['"])${escapeRegExp(from)}(/[^'"]*)?\\1`, 'gu'),
          (_m, quote, tail) => `${quote}${to}${tail ?? ''}${quote}`,
        )
        // YAML: a scoped name starts with @, which YAML reserves, so the row's name is quoted there.
        next = next.replace(
          new RegExp(`^(\\s*name:\\s*)${escapeRegExp(from)}\\s*$`, 'gmu'),
          (_m, head) => `${head}'${to}'`,
        )
      }
      if (next !== source) writeFileSync(path, next)
    }
  }
  walk(dir)
}

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')

/** The files a `files` entry names, as paths inside the package folder. */
function expand(folder, entry) {
  if (!entry.includes('*')) return [entry]
  const [head, tail] = entry.split('*')
  const base = join(folder, head.replace(/\/$/u, ''))
  if (!existsSync(base)) return []
  const found = []
  const walk = (dir, prefix) => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, name.name)
      const relative = `${prefix}${name.name}`
      if (name.isDirectory()) walk(path, `${relative}/`)
      else if (tail === '' || relative.endsWith(tail.replace(/^\//u, ''))) found.push(relative)
    }
  }
  walk(base, head.endsWith('/') ? head : `${head}/`)
  return found
}

/** The package.json a published tarball carries: the published name, every workspace name mapped, no `workspace:` range left, DSH and the framework as peers only. */
function publishedManifest(folder, key) {
  const manifest = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8'))
  const version = String(manifest.version ?? '0.0.0')
  const rename = (name) => sourceToPublished.get(name) ?? name
  const range = (name, value) => {
    if (typeof value !== 'string' || !value.startsWith('workspace:')) return value
    const target = versionOf.get(rename(name)) ?? version
    if (value === 'workspace:*' || value === 'workspace:^') return `^${target}`
    if (value === 'workspace:~') return `~${target}`
    return value.slice('workspace:'.length)
  }
  const fix = (map = {}) =>
    Object.fromEntries(
      Object.entries(map).map(([name, value]) => [rename(name), range(name, value)]),
    )
  const out = { ...manifest, name: published.get(key), dependencies: fix(manifest.dependencies) }
  if (manifest.peerDependencies !== undefined) out.peerDependencies = fix(manifest.peerDependencies)
  // The frame is built against Cordis 4.0.x, and an app's plugin rows resolve a patch of it (4.0.5 on the current framework). An exact peer would refuse
  // that, so the published peer is the caret over the major line; the check's install proves one copy resolves.
  if (typeof out.peerDependencies?.['@deepseek-ai/cordis'] === 'string')
    out.peerDependencies['@deepseek-ai/cordis'] = '^4.0.4'
  if (manifest.optionalDependencies !== undefined)
    out.optionalDependencies = fix(manifest.optionalDependencies)
  if (manifest.devDependencies !== undefined) out.devDependencies = fix(manifest.devDependencies)
  const leftovers = JSON.stringify(out).match(/workspace:/gu)
  if (leftovers !== null)
    fail(`${folder}: ${String(leftovers.length)} workspace: range(s) survived the rewrite`)
  // The rule is about the services and the framework, not about libraries: @deepseek-ai/schemastery is a validation library a package may depend on,
  // while cordis, the dsh-client-/dsh-api- services and acrylblends itself must be peers so one copy is shared with the host.
  // A service is the framework, Cordis, or one of DSH's client/host/api/boot plugins: those must be one copy with the host. DSH's util libraries
  // (@deepseek-ai/dsh-home-paths and friends) are pure helpers and stay ordinary dependencies, as they are in the source plugins.
  const isService = (name) =>
    name === 'acrylblends' ||
    name === '@deepseek-ai/cordis' ||
    /^@deepseek-ai\/dsh-(client|host|api|boot)-/u.test(name)
  for (const name of Object.keys(out.dependencies ?? {}))
    if (isService(name))
      fail(`${key}: ${name} is a dependency; the framework and DSH services are peers`)
  for (const name of Object.keys(out.peerDependencies ?? {}))
    if (byPublished.has(name) && !out.dependencies?.[name])
      fail(`${key}: ${name} is a peer but every frame package ships together; make it a dependency`)
  for (const name of Object.keys(out.peerDependencies ?? {}))
    if (byPublished.has(name) && !out.dependencies?.[name])
      fail(`${key}: ${name} is a peer but every frame package ships together; make it a dependency`)
  return { manifest: out, version }
}

/**
 * A tarball packed from a staged copy: the published manifest, the files the package names, and nothing else. `--ignore-scripts` because a package's own
 * `prepack` (a full check) belongs to the source folder, which the pipeline already built and tested, not to the staged copy that has no dependencies.
 */
function pack(key) {
  const folder = join(root, 'ide', key)
  const short = shortOf[key]
  const stage = join(scratch, 'stage', short)
  mkdirSync(stage, { recursive: true })
  const { manifest, version } = publishedManifest(folder, key)
  const files = manifest.files ?? ['lib']
  const wanted = new Set(['package.json'])
  for (const entry of files) for (const file of expand(folder, entry)) wanted.add(file)
  for (const file of wanted) {
    if (file === 'package.json') continue
    const from = join(folder, file)
    if (!existsSync(from)) continue
    const to = join(stage, file)
    mkdirSync(dirname(to), { recursive: true })
    cpSync(from, to, { recursive: true })
  }
  writeFileSync(join(stage, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  // The source keeps ACRYL's package names (the port rule); the published artifact carries the configured ones everywhere it names a frame package: the
  // built JavaScript's import specifiers and the package's own cordis.patch.yml row names, which are what DSH imports by.
  rewritePublishedNames(stage)
  const result = run(npm, ['pack', '--json', '--ignore-scripts'], { cwd: stage })
  if (result.status !== 0) fail(`${folder}: npm pack failed:\n${result.out}`)
  let packed
  try {
    packed = JSON.parse(result.stdout).at(-1)
  } catch {
    fail(`${folder}: npm pack printed no JSON:\n${result.out}`)
  }
  if (typeof packed?.filename !== 'string')
    fail(`${folder}: npm pack did not name a tarball:\n${result.out}`)
  const tarball = join(stage, packed.filename)
  const listing = run('tar', ['tzf', tarball])
  if (listing.status !== 0) fail(`${folder}: the tarball cannot be listed:\n${listing.out}`)
  const entries = listing.out
    .split('\n')
    .filter((line) => line.startsWith('package/') && !line.endsWith('/'))
    .map((line) => line.slice('package/'.length))
  // A "files" entry may name a directory ("contracts") or a single file; npm packs a directory as its contents.
  const covered = (file) =>
    entries.includes(file) || entries.some((entry) => entry.startsWith(`${file}/`))
  for (const file of wanted)
    if (!covered(file))
      fail(
        `${folder}: ${file} is named by "files" but is not in the tarball (has ${entries.join(', ')})`,
      )
  if (!entries.includes('package.json')) fail(`${folder}: the tarball has no package.json`)
  const packedManifest = JSON.parse(run('tar', ['xzf', tarball, '-O', 'package/package.json']).out)
  if (packedManifest.name !== published.get(key))
    fail(
      `${folder}: packed name is ${String(packedManifest.name)}, expected ${String(published.get(key))}`,
    )
  if (packedManifest.version !== version)
    fail(`${folder}: packed version is ${String(packedManifest.version)}, expected ${version}`)
  return { tarball, entries, manifest: packedManifest }
}

/** The original tests the port brought, run where the package lives. */
function test(folder) {
  const manifest = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8'))
  const script = manifest.scripts?.test
  if (script === undefined) return 'no test script'
  const result = run(npm, ['test'], { cwd: folder })
  if (result.status !== 0) fail(`${folder}: its tests failed:\n${result.out.slice(-4000)}`)
  return 'tests pass'
}

const packed = []
try {
  log(
    `the frame's packages publish under ${scope} (frame/packages.json): ${selected.length} to pack`,
  )
  for (const folder of selected) {
    const path = join(root, 'ide', folder)
    if (!existsSync(join(path, 'package.json'))) fail(`${folder}: no package.json under ide/`)
    if (!existsSync(join(path, 'lib'))) fail(`${folder}: lib/ is missing; run pnpm run build first`)
    const provenanceFile = join(path, 'provenance.json')
    if (!existsSync(provenanceFile)) fail(`${folder}: no provenance.json; every port carries one`)
    // Three shapes exist: the slices' {source: {repository, commit}, ported, unchanged}, the spike's {"ported from": {repository, "main at the
    // time", ...}, modified}, and a package written here rather than ported, {original: {repository, commit}, written}. Each names where the code
    // came from and at which commit, which is the check.
    const provenance = JSON.parse(readFileSync(provenanceFile, 'utf8'))
    const sourceOf = provenance.source ?? provenance['ported from'] ?? provenance.original
    const commitOf =
      sourceOf?.commit ?? sourceOf?.['main at the time'] ?? sourceOf?.['last commit of the path']
    if (typeof sourceOf?.repository !== 'string' || typeof commitOf !== 'string')
      fail(`${folder}: provenance.json does not name the source repository and commit`)
    const notes = [
      provenance.ported,
      provenance.modified,
      provenance['changes here'],
      provenance.written,
    ]
    if (notes.every((note) => typeof note !== 'string'))
      fail(`${folder}: provenance.json does not say what changed in the port`)
    const tested = skipTests ? 'tests skipped (--skip-tests)' : test(path)
    const result = pack(folder)
    packed.push({ folder, ...result })
    log(
      `${published.get(folder)} ${result.manifest.version}: ${tested}, provenance ok, packed ${String(result.entries.length)} files`,
    )
  }

  if (only !== undefined) {
    log(
      `packed only ${String(only)}; the fresh-install boot needs every frame package, so it is not run`,
    )
    log('OK (dry run: nothing was published, no npm login)')
    process.exit(0)
  }

  // A fresh app the way a person makes one: the CLI's own `init --desktop` with no ACRYLBLENDS_FRAME_PACKAGES, so it writes the frame's published names
  // and versions (frame/packages.json). Every spec it wrote is then pointed at the tarball of that name, and the framework at this checkout's packed
  // acrylblends, so the install is exactly the release: the frame packages and the framework they peer on, nothing from the checkout.
  const app = join(scratch, 'app')
  const home = join(scratch, 'home')
  mkdirSync(home, { recursive: true })
  const cli = join(root, 'packages', 'cli', 'bin', 'acrylblends.js')
  if (!existsSync(cli)) fail('packages/cli/bin/acrylblends.js is missing; run pnpm run build first')
  const frameEnv = {
    HOME: home,
    npm_config_cache: join(scratch, 'npm-cache'),
    ELECTRON_SKIP_BINARY_DOWNLOAD: '1',
  }
  const initEnv = { ...process.env, ...frameEnv }
  delete initEnv.ACRYLBLENDS_FRAME_PACKAGES
  const scaffold = run(
    process.execPath,
    [cli, 'init', app, '--name', 'publish-check', '--template', 'blank', '--desktop', '--yes'],
    { cwd: root, env: initEnv },
  )
  if (scaffold.status !== 0) fail(`the blank app did not scaffold:\n${scaffold.out.slice(-4000)}`)
  if (!existsSync(join(app, 'scripts', 'ide-host.mjs')))
    fail(`init --desktop wrote no frame host:\n${scaffold.out.slice(-2000)}`)
  const manifestFile = join(app, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'))
  const cliVersion = JSON.parse(
    readFileSync(join(root, 'packages', 'cli', 'package.json'), 'utf8'),
  ).version
  if (manifest.dependencies?.acrylblends !== `^${cliVersion}`)
    fail(
      `init --desktop asks for acrylblends ${String(manifest.dependencies?.acrylblends)}, not ^${cliVersion}`,
    )
  if (manifest.dependencies?.['@deepseek-ai/dsh-base'] !== config.dshVersion)
    fail(
      `init --desktop pins DSH ${String(manifest.dependencies?.['@deepseek-ai/dsh-base'])}, not ${String(config.dshVersion)}`,
    )
  const rowNames = FRAME_PACKAGES.filter((entry) => entry.installed !== true).map(
    (entry) => entry.name,
  )
  for (const source of rowNames) {
    const folder = folders.find((candidate) => candidate === source)
    if (folder === undefined) fail(`frame/packages.json does not name the frame row ${source}`)
    const name = published.get(folder)
    if (manifest.dependencies?.[name] !== `^${versionOf.get(name)}`)
      fail(
        `init --desktop asks for ${name} ${String(manifest.dependencies?.[name])}, not ^${versionOf.get(name)}`,
      )
    if (manifest.dependencies?.[source] !== undefined)
      fail(`init --desktop installs ${source} by its source name; a published app installs ${name}`)
  }
  log(
    `init --desktop writes the published frame: ${String(rowNames.length)} rows by their ${scope} names, acrylblends ^${cliVersion}, DSH ${String(config.dshVersion)}`,
  )
  const cliPack = run('pnpm', ['pack', '--pack-destination', join(scratch, 'cli')], {
    cwd: join(root, 'packages', 'cli'),
  })
  if (cliPack.status !== 0) fail(`packing acrylblends failed:\n${cliPack.out.slice(-4000)}`)
  const cliTarball = join(scratch, 'cli', `acrylblends-${cliVersion}.tgz`)
  if (!existsSync(cliTarball))
    fail(`pnpm pack wrote no ${cliTarball}:\n${cliPack.out.slice(-2000)}`)
  // Every frame package as a direct tarball dependency: npm resolves a frame package's own @acrylblends dependencies to these, as it will to the registry's.
  for (const entry of packed)
    manifest.dependencies[published.get(entry.folder)] = `file:${entry.tarball}`
  manifest.dependencies.acrylblends = `file:${cliTarball}`
  writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`)
  const installed = run(npm, ['install', '--no-audit', '--no-fund'], {
    cwd: app,
    env: frameEnv,
  })
  if (installed.status !== 0)
    fail(`npm install from the tarballs failed:\n${installed.out.slice(-4000)}`)
  for (const entry of packed) {
    const folder = join(app, 'node_modules', ...published.get(entry.folder).split('/'))
    if (!existsSync(join(folder, 'package.json')))
      fail(`${published.get(entry.folder)} did not install into the app's node_modules`)
  }
  // One Cordis and one framework for the whole tree: two copies of either split a service registry or a router's private match result in two.
  for (const shared of ['@deepseek-ai/cordis', 'acrylblends']) {
    const copies = copiesOf(join(app, 'node_modules'), shared)
    if (copies.length !== 1)
      fail(`${shared} is installed ${String(copies.length)} times:\n${copies.join('\n')}`)
    log(`one ${shared} in the tree: ${copies[0]}`)
  }
  log('every tarball installs into a fresh app')
  const devScript = JSON.parse(readFileSync(manifestFile, 'utf8')).scripts?.dev
  if (!/scripts\/ide-host\.mjs/u.test(String(devScript)))
    fail(`dev does not boot the host launcher: ${String(devScript)}`)

  const port = await freePort()
  devPort = port
  const env = {
    ACRYLBLENDS_PORT: String(port),
    ACRYLBLENDS_HOME: join(app, '.acrylblends'),
    DSH_HOME: join(scratch, 'dsh'),
    HOME: home,
    npm_config_cache: join(scratch, 'npm-cache'),
  }
  devProcess = start(app, ['run', 'dev'], env)
  const dev = devProcess
  let url
  const deadline = Date.now() + 240_000
  while (Date.now() < deadline) {
    url = /(http:\/\/127\.0\.0\.1:\d+\/?\S*)/u.exec(dev.output)?.[1]
    if (url !== undefined) break
    if (/startup failed|Error:/u.test(dev.output) && /failed/u.test(dev.output)) break
    await sleep(500)
  }
  if (url === undefined) {
    const output = dev.output
    await stop(dev, port)
    fail(`the frame did not boot from the tarballs:\n${output.slice(-4000)}`)
  }
  if (/did not activate|failed to import/u.test(dev.output)) {
    const output = dev.output
    await stop(dev, port)
    fail(`a frame row did not activate from the tarballs:\n${output.slice(0, 4000)}`)
  }
  if (Number(new URL(url).port) !== port)
    fail(`the host did not take ACRYLBLENDS_PORT ${String(port)}: it answered at ${url}`)
  const origin = new URL(url).origin
  const jar = join(scratch, 'cookies.txt')
  const get = (path) => {
    const result = run('curl', [
      '-sL',
      '-b',
      jar,
      '-c',
      jar,
      '-o',
      '-',
      '-w',
      '\n%{http_code}',
      `${origin}${path}`,
    ])
    const at = result.out.lastIndexOf('\n')
    return { status: Number(result.out.slice(at + 1)), body: result.out.slice(0, at) }
  }
  run('curl', ['-sL', '-b', jar, '-c', jar, '-o', '/dev/null', url])
  const page = get('/')
  if (page.status !== 200) fail(`the frame page answered ${String(page.status)} at ${origin}`)
  log(
    `the frame boots from the tarballs: ${origin} answers ${String(page.status)} and renders its rows`,
  )
  const appAtPrefix = ['/app/', '/app']
    .map((path) => ({ path, ...get(path) }))
    .find((answer) => answer.status >= 200 && answer.status < 300 && answer.body.includes('"app"'))
  if (appAtPrefix === undefined)
    fail(`the app does not answer at /app inside the frame from the tarballs (${origin})`)
  log(`the app answers at ${appAtPrefix.path}: ${appAtPrefix.body.slice(0, 80).trim()}`)
  if ((await stop(dev, port)) !== true)
    fail(`port ${String(port)} did not free after the frame was stopped`)
  devStopped = true
  log(
    `all ${String(packed.length)} packages packed; the npm org ${scope.slice(1)} must exist before the owner publishes`,
  )
  log('OK (dry run: nothing was published, no npm login)')
} finally {
  if (!devStopped) await stop(devProcess, devPort > 0 ? devPort : undefined)
  const leftovers = leftoverProcesses()
  for (const line of leftovers) console.error(`verify-frame-publish: leftover process: ${line}`)
  if (leftovers.length > 0) process.exitCode = 1
  const keepIt = keep || process.env.VERIFY_KEEP === '1'
  if (keepIt) console.error(`verify-frame-publish: kept ${scratch}`)
  else rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}

/** Every installed copy of `name` under `modules` (nested node_modules included), as `<version> <path>`. */
function copiesOf(modules, name) {
  const found = []
  const walk = (dir) => {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === '.bin') continue
      if (entry.name.startsWith('@')) {
        for (const scoped of readdirSync(join(dir, entry.name), { withFileTypes: true }))
          if (scoped.isDirectory())
            visit(join(dir, entry.name, scoped.name), `${entry.name}/${scoped.name}`)
      } else visit(join(dir, entry.name), entry.name)
    }
  }
  const visit = (folder, packageName) => {
    if (packageName === name && existsSync(join(folder, 'package.json')))
      found.push(
        `${JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8')).version} ${folder}`,
      )
    walk(join(folder, 'node_modules'))
  }
  walk(modules)
  return found
}

/** A free port on loopback, never 3080 (the owner's app). */
async function freePort() {
  const { createServer } = await import('node:net')
  for (;;) {
    const probe = createServer()
    const port = await new Promise((done) => {
      probe.once('error', () => done(0))
      probe.listen(0, '127.0.0.1', () => done(probe.address().port))
    })
    await new Promise((done) => probe.close(done))
    if (port > 0 && port !== 3080) return port
  }
}
