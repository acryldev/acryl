#!/usr/bin/env node
/**
 * The engine of a Windows or Linux product (specs/049-framework-architecture/app-storage.md in ACRYL, "one OS app per Blend"): the folder `make-blend-app.mjs`
 * links one Blend app from. It is Electron's own build for the OS, with the product's payload in `resources/app` and the payload's native packages swapped
 * for the target's.
 *
 *   node scripts/pack-blank-engine.mjs --payload <Resources/app of a packed product> --platform win32|linux [--arch x64] --electron <version> [--out <dir>] [--cache <dir>]
 *
 * The payload is what `pack-blank-mac.mjs` ships in `ACRYL Blends.app/Contents/Resources/app`: its JavaScript is the same on every OS, its native packages
 * are the Mac's (`...-darwin-arm64`). Each of those names a sibling for the target in some installed package's `optionalDependencies` (sharp, koffi, ripgrep,
 * the DSH addons); the sibling's tarball comes from the registry with `npm pack`, which does not check the OS, and replaces the Mac's. A package the
 * registry has no build of for the target (LibreOffice's kit on Linux) is left out, and the script says so. Electron's zip is checked against the
 * release's SHASUMS256.txt. Nothing here runs the product: `verify-engine-natives.mjs` does, on the target.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'

const args = process.argv.slice(2)
const option = (name, fallback) => {
  const at = args.indexOf(name)
  return at === -1 ? fallback : args[at + 1]
}
const payload = option('--payload')
const platform = option('--platform')
const arch = option('--arch', 'x64')
if (payload === undefined || !['win32', 'linux'].includes(platform ?? '') || arch !== 'x64')
  throw new Error(
    'usage: pack-blank-engine.mjs --payload <Resources/app> --platform win32|linux [--arch x64] --electron <version> [--out <dir>] [--cache <dir>]',
  )
const out = resolve(option('--out', join('dist', `engine-${platform}-${arch}`)))
const cache = resolve(option('--cache', join('dist', 'engine-cache')))
const log = (line) => console.log(`pack-blank-engine: ${line}`)
mkdirSync(cache, { recursive: true })

const manifest = JSON.parse(readFileSync(join(payload, 'package.json'), 'utf8'))
// A packed product's manifest drops devDependencies, so the version comes from the caller (the packed app reports it: `process.versions.electron`).
const electron = option('--electron', manifest.devDependencies?.electron)
if (typeof electron !== 'string') throw new Error('--electron <version>: the payload names none')

async function download(url, file) {
  if (existsSync(file)) return
  const answer = await fetch(url)
  if (!answer.ok) throw new Error(`${url}: ${String(answer.status)}`)
  writeFileSync(`${file}.part`, Buffer.from(await answer.arrayBuffer()))
  renameSync(`${file}.part`, file)
}

// 1. Electron's build for the target, checked.
const zipName = `electron-v${electron}-${platform}-${arch}.zip`
const release = `https://github.com/electron/electron/releases/download/v${electron}`
const zip = join(cache, zipName)
await download(`${release}/${zipName}`, zip)
await download(`${release}/SHASUMS256.txt`, join(cache, `electron-v${electron}-SHASUMS256.txt`))
const wanted = readFileSync(join(cache, `electron-v${electron}-SHASUMS256.txt`), 'utf8')
  .split('\n')
  .map((line) => line.trim().split(/\s+\*?/u))
  .find(([, file]) => file === zipName)?.[0]
const sum = createHash('sha256').update(readFileSync(zip)).digest('hex')
if (sum !== wanted) {
  rmSync(zip, { force: true })
  throw new Error(`${zipName}: checksum ${sum}, expected ${String(wanted)}`)
}
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
try {
  execFileSync('unzip', ['-q', zip, '-d', out])
} catch {
  execFileSync('tar', ['-xf', zip, '-C', out])
}
rmSync(join(out, 'resources', 'default_app.asar'), { force: true })
log(`electron ${electron} for ${platform}-${arch}, checksum ${sum.slice(0, 12)}`)

// 2. The payload, without the Mac's native packages.
const modules = join(payload, 'node_modules')
const foreign = (name) => /(^|[-/])(darwin|mac)([-.]|$)/u.test(name)
const app = join(out, 'resources', 'app')
cpSync(payload, app, {
  recursive: true,
  dereference: true,
  filter: (path) => !path.startsWith(modules) || !foreign(path.slice(modules.length + 1)),
})

// 3. The target's siblings of those packages, from the packages that name them.
const installed = []
for (const entry of readdirSync(modules)) {
  if (entry.startsWith('.')) continue
  if (entry.startsWith('@'))
    for (const scoped of readdirSync(join(modules, entry))) installed.push(`${entry}/${scoped}`)
  else installed.push(entry)
}
const optional = new Map()
for (const name of installed) {
  try {
    const own = JSON.parse(readFileSync(join(modules, name, 'package.json'), 'utf8'))
    for (const [dependency, range] of Object.entries(own.optionalDependencies ?? {}))
      optional.set(dependency, String(range))
  } catch {
    // A folder without a manifest holds no package.
  }
}
const token = platform === 'win32' ? 'win32-x64' : 'linux-x64'
const wantedNames = []
for (const name of Object.keys(manifest.dependencies ?? {}).filter(foreign)) {
  const stem = name.replace(/darwin-(arm64|x64)/u, '')
  const siblings = [...optional.keys()].filter(
    (candidate) =>
      candidate.startsWith(stem) &&
      candidate.slice(stem.length).startsWith(token) &&
      !candidate.endsWith('-musl'),
  )
  if (siblings.length === 0) log(`${name}: no build for ${token}, left out`)
  for (const sibling of siblings) wantedNames.push(sibling)
}
// A package only the target has (DSH's Windows process helper) is in the payload already when the Mac's npm installed it; nothing to add for it.
for (const name of new Set(wantedNames)) {
  const version = optional.get(name)
  const spec = `${name}@${version}`
  const tarballs = join(cache, 'packages')
  mkdirSync(tarballs, { recursive: true })
  const packed = execFileSync('npm', ['pack', spec, '--pack-destination', tarballs, '--silent'], {
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .at(-1)
  const target = join(app, 'node_modules', name)
  rmSync(target, { recursive: true, force: true })
  mkdirSync(target, { recursive: true })
  execFileSync('tar', ['-xzf', join(tarballs, packed), '-C', target, '--strip-components=1'])
  log(`${spec} from the registry`)
}

// 4. The executable under the product's name.
const exe = platform === 'win32' ? 'ACRYL-Blends.exe' : 'acryl-blends'
renameSync(join(out, platform === 'win32' ? 'electron.exe' : 'electron'), join(out, exe))
log(`done: ${out} (executable ${exe})`)
