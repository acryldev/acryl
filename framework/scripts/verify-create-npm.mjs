#!/usr/bin/env node
// `npm create @acryldev/blends@latest my-app agent`, end to end from the packed tarballs, on whatever OS this runs on. 1.0.4 and 1.0.5 failed on every Windows machine
// (`node.exe.cmd is not recognized`: create started Node through the package-manager path) and no gate ran the command there; this one does.
//   node scripts/verify-create-npm.mjs
// The two packed tarballs are installed into a scratch folder, the `create-acrylblends` command they provide is run the way npm runs it, and the app it makes must
// exist with its manifest, the agent template's files and a package.json that names the framework. Nothing is fetched from the registry for acrylblends or create.
// A frame package whose frame/packages.json version is not on npm yet (raised in the source, not published) comes from this checkout's packed tarball, through
// the package manager's own overrides, and the run says which ones did: the gate tests the source and never depends on publish order (spec 051, web 0.2.0).
import './lib/scratch-home.mjs'
import { spawnSync } from 'node:child_process'
import {
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
import { parse, stringify } from 'yaml'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const log = (message) => console.log(`verify-create-npm: ${message}`)
const fail = (message) => {
  throw new Error(`verify-create-npm: ${message}`)
}
const isWindows = process.platform === 'win32'
const scratch = mkdtempSync(join(tmpdir(), 'create-npm-'))
const env = {
  ...process.env,
  npm_config_loglevel: 'error',
  npm_config_cache: join(scratch, 'cache'),
}

/** Run a command; `npm` and `pnpm` are .cmd files on Windows and need the shell. */
function run(command, args, cwd) {
  const r = spawnSync(command, args, {
    cwd,
    env,
    encoding: 'utf8',
    shell: isWindows && /^(npm|pnpm|npx)$/u.test(command),
  })
  if (r.status !== 0) fail(`${command} ${args.join(' ')} failed in ${cwd}:\n${r.stdout}${r.stderr}`)
  return r.stdout
}

/** The frame packages whose version frame/packages.json names is not published: `{ name, short, version }` each. npm's 404 means "not published"; any other failure stops the gate. */
function unpublishedFramePackages() {
  const config = JSON.parse(readFileSync(join(root, 'frame', 'packages.json'), 'utf8'))
  const missing = []
  for (const [key, entry] of Object.entries(config.packages)) {
    const name = key.includes('/') ? key : `${config.scope}/${entry.name}`
    const r = spawnSync('npm', ['view', `${name}@${entry.version}`, 'version', '--json'], {
      env,
      encoding: 'utf8',
      shell: isWindows,
    })
    if (r.status === 0 && r.stdout.trim() !== '') continue
    if (r.status === 0 || /E404|404 Not Found|No match found/u.test(`${r.stdout}${r.stderr}`))
      missing.push({ name, short: name.slice(config.scope.length + 1), version: entry.version })
    else fail(`npm view ${name}@${entry.version} failed:\n${r.stdout}${r.stderr}`)
  }
  return missing
}

/** Pack each unpublished frame package the way its release packs it (verify-frame-publish: published name, workspace ranges made real); tarball paths by package name. */
function packLocally(missing) {
  const out = join(scratch, 'frame')
  for (const { short } of missing)
    run(
      process.execPath,
      [
        '--import',
        './scripts/workspace-source.mjs',
        'scripts/verify-frame-publish.mjs',
        '--only',
        short,
        '--skip-tests',
        '--out',
        out,
      ],
      root,
    )
  return Object.fromEntries(
    missing.map(({ name, version }) => {
      const tarball = join(out, `${name.replace(/^@/u, '').replace('/', '-')}-${version}.tgz`)
      if (!existsSync(tarball)) fail(`verify-frame-publish wrote no ${tarball}`)
      // Forward slashes: a file: spec with C:\ backslashes is not one every package manager reads on Windows.
      return [name, `file:${tarball.replaceAll('\\', '/')}`]
    }),
  )
}

/** Point each name at its tarball wherever the app or a dependency asks for it: npm reads package.json `overrides`, pnpm its workspace file's. */
function overrideIn(app, pm, specs) {
  if (pm === 'npm') {
    const file = join(app, 'package.json')
    const manifest = JSON.parse(readFileSync(file, 'utf8'))
    manifest.overrides = { ...manifest.overrides, ...specs }
    writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`)
  } else if (pm === 'pnpm') {
    const file = join(app, 'pnpm-workspace.yaml')
    const workspace = existsSync(file) ? (parse(readFileSync(file, 'utf8')) ?? {}) : {}
    workspace.overrides = { ...workspace.overrides, ...specs }
    writeFileSync(file, stringify(workspace))
  } else
    fail(
      `unpublished frame packages need npm or pnpm overrides; this run's package manager is ${pm}`,
    )
}

try {
  const missing = unpublishedFramePackages()
  // create's own rule: the package manager that ran this command, else npm.
  const pm =
    ['npm', 'pnpm', 'yarn', 'bun'].find((m) =>
      (env.npm_config_user_agent ?? '').startsWith(`${m}/`),
    ) ?? 'npm'
  const packed = join(scratch, 'packed')
  mkdirSync(packed)
  for (const dir of ['cli', 'create'])
    run('pnpm', ['pack', '--pack-destination', packed], join(root, 'packages', dir))
  const tarballs = readdirSync(packed)
    .filter((name) => name.endsWith('.tgz'))
    .map((name) => join(packed, name))
  if (tarballs.length !== 2) fail(`expected two tarballs, found ${tarballs.join(', ')}`)

  // The user's folder: both packages installed, so ``create-blends` resolves @acryldev/blends from the tarball and not from the registry.
  const user = join(scratch, 'user')
  mkdirSync(user)
  writeFileSync(join(user, 'package.json'), '{"name":"user","private":true,"version":"0.0.0"}\n')
  run('npm', ['install', '--no-audit', '--no-fund', ...tarballs], user)

  // `npm create @acryldev/blends@latest my-app agent` is `npm exec create-blends my-app agent`: run it that way, from the folder the app goes in.
  const app = join(user, 'my-app')
  if (missing.length === 0)
    run('npm', ['exec', '--no', '--', 'create-blends', 'my-app', 'agent', '--yes'], user)
  else {
    // The same command with the install held back, so the unpublished frame versions can be pointed at this checkout first; then create's own install.
    const specs = packLocally(missing)
    run(
      'npm',
      ['exec', '--no', '--', 'create-blends', 'my-app', 'agent', '--yes', '--no-install'],
      user,
    )
    overrideIn(app, pm, specs)
    run(pm, ['install'], app)
    for (const { name, version } of missing) {
      const installed = join(app, 'node_modules', ...name.split('/'), 'package.json')
      const held = existsSync(installed)
        ? JSON.parse(readFileSync(installed, 'utf8')).version
        : undefined
      if (held !== version)
        fail(`${name} installed as ${String(held)}, not this checkout's ${version}`)
    }
    log(
      `not on npm yet, so installed from this checkout's packed tarballs: ${missing.map(({ name, version }) => `${name}@${version}`).join(', ')}`,
    )
  }
  for (const file of [
    'package.json',
    'blend.yaml',
    'AGENTS.md',
    join('src', 'app.ts'),
    join('plugins', 'door', 'src', 'index.ts'),
  ]) {
    if (!existsSync(join(app, file)))
      fail(`the app has no ${file}; it has ${readdirSync(app).join(', ')}`)
  }
  const manifest = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'))
  if (manifest.name !== 'my-app') fail(`the app is named ${manifest.name}, not my-app`)
  log('npm exec create-acrylblends my-app agent made the agent app from the packed tarballs')
  log('OK')
} finally {
  try {
    rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 })
  } catch (cause) {
    log(`could not remove ${scratch}: ${cause.message}`)
  }
}
