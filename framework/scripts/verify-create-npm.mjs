#!/usr/bin/env node
// `npm create acrylblends@latest my-app agent`, end to end from the packed tarballs, on whatever OS this runs on. 1.0.4 and 1.0.5 failed on every Windows machine
// (`node.exe.cmd is not recognized`: create started Node through the package-manager path) and no gate ran the command there; this one does.
//   node scripts/verify-create-npm.mjs
// The two packed tarballs are installed into a scratch folder, the `create-acrylblends` command they provide is run the way npm runs it, and the app it makes must
// exist with its manifest, the agent template's files and a package.json that names the framework. Nothing is fetched from the registry for acrylblends or create.
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

try {
  const packed = join(scratch, 'packed')
  mkdirSync(packed)
  for (const dir of ['cli', 'create'])
    run('pnpm', ['pack', '--pack-destination', packed], join(root, 'packages', dir))
  const tarballs = readdirSync(packed)
    .filter((name) => name.endsWith('.tgz'))
    .map((name) => join(packed, name))
  if (tarballs.length !== 2) fail(`expected two tarballs, found ${tarballs.join(', ')}`)

  // The user's folder: both packages installed, so `create-acrylblends` resolves acrylblends from the tarball and not from the registry.
  const user = join(scratch, 'user')
  mkdirSync(user)
  writeFileSync(join(user, 'package.json'), '{"name":"user","private":true,"version":"0.0.0"}\n')
  run('npm', ['install', '--no-audit', '--no-fund', ...tarballs], user)

  // `npm create acrylblends@latest my-app agent` is `npm exec create-acrylblends my-app agent`: run it that way, from the folder the app goes in.
  run('npm', ['exec', '--no', '--', 'create-acrylblends', 'my-app', 'agent', '--yes'], user)
  const app = join(user, 'my-app')
  for (const file of [
    'package.json',
    'blend.yaml',
    'AGENTS.md',
    join('src', 'app.ts'),
    join('plugins', 'acryl-door', 'src', 'index.ts'),
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
