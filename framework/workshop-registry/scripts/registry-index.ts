#!/usr/bin/env bun
// registry-index <registry folder> [--check] [--only <id>]
// What the registry's CI runs. It is @acryl/blends-core's index tool (validate every starter under blends/<id>/blend.yaml, refuse a private, unlicensed, misplaced or repeated one,
// write index.json) plus one thing the format does not carry: the runtime an entry is for.
//   - An entry with an `acryl.template.json` is a whole app for acrylblends (`runtime: acrylblends`): `npm create acrylblends@latest my-app -- --from <id>` makes it. It is checked
//     further: the template manifest, a package.json without install scripts, src/, no links, no node_modules or .git, size limits, and nothing that looks like a key.
//   - Every other entry is a starter for the ACRYL app (`runtime: acryl`).
// This copy is the workshop registry's: the limits are tighter (REGISTRY_LIMITS="file=1048576,total=8388608,files=1500" by default), and `--only <id>` reports only that entry's problems and writes nothing (what the pull request check runs).
// With --check nothing is written and a stale index fails. BLENDS_CORE points at blends-core's src (CI checks it out into .acryl/).
import { existsSync, lstatSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const core = process.env.BLENDS_CORE ?? join(here, '..', '.acryl', 'runtime', 'blends-core', 'src')
const { buildRegistryIndex } = (await import(join(core, 'registry.ts'))) as {
  buildRegistryIndex(sources: { path: string; manifestText: string }[]): {
    index: { formatVersion: number; entries: Record<string, unknown>[] }
    problems: { path: string; message: string }[]
  }
}

const { pluginFiles } = (await import(join(core, 'plugin-identity', 'folder-digest.ts'))) as {
  pluginFiles(dir: string): unknown[]
}
const { portabilityIssues } = (await import(
  join(core, 'plugin-identity', 'plugin-portability.ts')
)) as {
  portabilityIssues(files: unknown[]): { path: string; reason: string }[]
}

const MARKER = 'acryl.template.json'
const limitOf = (name: string, fallback: number) => {
  const found = new RegExp(`(?:^|,)${name}=(\\d+)`).exec(process.env.REGISTRY_LIMITS ?? '')
  return found ? Number(found[1]) : fallback
}
const LIMITS = {
  files: limitOf('files', 1500),
  bytes: limitOf('total', 8 * 1024 * 1024),
  file: limitOf('file', 1024 * 1024),
}
const LIFECYCLE = [
  'preinstall',
  'install',
  'postinstall',
  'prepublish',
  'preprepare',
  'prepare',
  'postprepare',
]
const SECRETS: [RegExp, string][] = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'a private key'],
  [/\bsk-[A-Za-z0-9_-]{24,}/, 'an API key (sk-...)'],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/, 'a GitHub token'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'an AWS access key'],
  [/\bnpm_[A-Za-z0-9]{30,}/, 'an npm token'],
]

/** Everything wrong with an app entry; empty when it is a sound starter for acrylblends. */
function checkApp(dir: string): string[] {
  const problems: string[] = []
  let files = 0
  let bytes = 0
  const walk = (folder: string) => {
    for (const name of readdirSync(folder)) {
      const path = join(folder, name)
      const info = lstatSync(path)
      const rel = path.slice(dir.length + 1)
      if (info.isSymbolicLink()) problems.push(`${rel} is a link; links are not allowed`)
      else if (info.isDirectory()) {
        if (name === 'node_modules' || name === '.git')
          problems.push(`${rel} must not be in an entry`)
        else walk(path)
      } else {
        files += 1
        bytes += info.size
        if (info.size > LIMITS.file)
          problems.push(
            `${rel} is ${Math.round(info.size / 1024)} KB; a file may be at most ${LIMITS.file / 1024} KB`,
          )
        if (info.size < 1024 * 1024 && !/\.(png|jpe?g|gif|ico|woff2?|tgz|gz|zip)$/i.test(name)) {
          const text = readFileSync(path, 'utf8')
          for (const [pattern, what] of SECRETS)
            if (pattern.test(text)) problems.push(`${rel} looks like it holds ${what}`)
        }
      }
    }
  }
  walk(dir)
  if (files > LIMITS.files) problems.push(`has ${files} files; the limit is ${LIMITS.files}`)
  if (bytes > LIMITS.bytes)
    problems.push(
      `is ${Math.round(bytes / 1024 / 1024)} MB; the limit is ${LIMITS.bytes / 1024 / 1024} MB`,
    )
  try {
    const manifest = JSON.parse(readFileSync(join(dir, MARKER), 'utf8')) as Record<string, unknown>
    if (typeof manifest.name !== 'string' || manifest.name.trim() === '')
      problems.push(`${MARKER} needs a "name"`)
    if (typeof manifest.description !== 'string') problems.push(`${MARKER} needs a "description"`)
    const plugins = manifest.plugins ?? []
    if (
      !Array.isArray(plugins) ||
      plugins.some((p) => typeof p !== 'string' || !/^[a-z][a-z0-9-]*$/.test(p))
    )
      problems.push(`"plugins" in ${MARKER} is a list of plugin names`)
  } catch {
    problems.push(`${MARKER} is not valid JSON`)
  }
  if (!existsSync(join(dir, 'package.json'))) problems.push('has no package.json')
  else {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
        scripts?: Record<string, string>
      }
      for (const script of LIFECYCLE)
        if (typeof pkg.scripts?.[script] === 'string')
          problems.push(
            `package.json defines the install script "${script}"; a registry entry may not`,
          )
    } catch {
      problems.push('package.json is not valid JSON')
    }
  }
  if (!existsSync(join(dir, 'src'))) problems.push('has no src/ folder')
  return problems
}

/** Why an entry would not work the same on every OS: the format's own rules, for an app or a starter alike. */
function checkPortable(dir: string): string[] {
  try {
    return portabilityIssues(pluginFiles(dir)).map(({ path, reason }) => `${path}: ${reason}`)
  } catch (cause) {
    return [`could not be read: ${cause instanceof Error ? cause.message : String(cause)}`]
  }
}

export function indexText(root: string): { text: string; problems: string[] } {
  const blends = join(root, 'blends')
  const folders = existsSync(blends)
    ? readdirSync(blends, { withFileTypes: true }).filter(
        (e) => e.isDirectory() && existsSync(join(blends, e.name, 'blend.yaml')),
      )
    : []
  const { index, problems } = buildRegistryIndex(
    folders.map((e) => ({
      path: `blends/${e.name}`,
      manifestText: readFileSync(join(blends, e.name, 'blend.yaml'), 'utf8'),
    })),
  )
  const out = problems.map((p) => `${p.path}: ${p.message}`)
  const entries = index.entries.map((entry) => {
    const dir = join(root, String(entry.path))
    out.push(...checkPortable(dir).map((message) => `${String(entry.path)}: ${message}`))
    if (!existsSync(join(dir, MARKER))) return { ...entry, runtime: 'acryl' }
    const apps = checkApp(dir)
    out.push(...apps.map((message) => `${String(entry.path)}: ${message}`))
    return { ...entry, runtime: 'acrylblends' }
  })
  return { text: `${JSON.stringify({ ...index, entries }, null, 2)}\n`, problems: out }
}

const argv = process.argv.slice(2)
const only0 = argv.indexOf('--only')
const positional = argv.filter(
  (arg, at) => !arg.startsWith('--') && !(only0 >= 0 && at === only0 + 1),
)
if (positional.length !== 1) {
  console.log('usage: bun scripts/registry-index.ts <registry folder> [--check]')
  process.exit(2)
}
const root = resolve(positional[0] as string)
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : undefined
const { text, problems: all } = indexText(root)
const problems =
  only === undefined ? all : all.filter((problem) => problem.startsWith(`blends/${only}:`))
for (const problem of problems) console.log(`refused ${problem}`)
if (only !== undefined) {
  if (!existsSync(join(root, 'blends', only)))
    console.log(`${only} is not in the registry (an entry that was removed passes)`)
  process.exit(problems.length > 0 ? 1 : 0)
}
const file = join(root, 'index.json')
if (argv.includes('--check')) {
  if ((existsSync(file) ? readFileSync(file, 'utf8') : '') !== text) {
    console.log(`${file} is stale: run bun scripts/registry-index.ts ${positional[0]}`)
    process.exit(1)
  }
} else {
  writeFileSync(file, text)
  console.log(`wrote ${file}`)
}
process.exit(problems.length > 0 ? 1 : 0)
