#!/usr/bin/env node
// Turn your app into an entry of this registry:   node scripts/make-entry.mjs <your app folder> <login>.<name> [--description "..."] [--license MIT] [--category <slug>] [--out <registry folder>]
// `--category` is the `category` written to blend.yaml (default `workshop`). `--out` is the folder whose `blends/` receives the entry (default: this registry); point it at `registry/` of the
// acrylblends.github.io checkout to publish there. The taxonomy placement (category and subcategory shown on the site) is not in blend.yaml: it is src/lib/registry-placement.ts in that checkout.
// Copies the app to blends/<login>.<name>/ without what an entry does not carry (node_modules, dist, data, .git, the framework docs, the agent's scratch), makes its blend.yaml public
// and licensed under that id, and writes acryl.template.json, which marks the entry as an app for acrylblends. Then: commit, push to your fork, open a pull request.
// An app's blend.lock.json (every version the frame saves has one) must match the app: a stale snapshot is refused in one line before anything is copied. In
// the entry the lock is kept true: its origin takes the new id, version and blend.yaml digest, so the entry verifies against its own lock and another app can
// apply it (npm run snapshot apply <entry>).
// An entry works the same on every OS or it is not made: a name Windows refuses, a case collision or a carriage return is refused (plugin-portability.mjs), and the
// entry carries a .gitattributes that keeps its line endings LF in every checkout.
import { createHash } from 'node:crypto'
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { folderFiles, portabilityIssues } from './plugin-portability.mjs'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    description: { type: 'string' },
    license: { type: 'string' },
    category: { type: 'string' },
    out: { type: 'string' },
  },
})
const [source, id] = positionals
const root =
  values.out === undefined
    ? resolve(dirname(fileURLToPath(import.meta.url)), '..')
    : resolve(values.out)
if (!source || !id || !/^[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/u.test(id)) {
  console.error(
    'usage: node scripts/make-entry.mjs <your app folder> <login>.<name> [--description "..."] [--license MIT] [--category <slug>] [--out <registry folder>]   (lower case; <login> is your GitHub login)',
  )
  process.exit(2)
}
const app = resolve(source)
if (!existsSync(join(app, 'blend.yaml')) || !existsSync(join(app, 'package.json'))) {
  console.error(`${app} is not an acrylblends app (no blend.yaml and package.json)`)
  process.exit(1)
}
const stale = staleSnapshot(app)
if (stale) {
  console.error(
    `${stale} changed since the last capture; run npm run snapshot capture (or Save point in the frame) and try again`,
  )
  process.exit(1)
}
const target = join(root, 'blends', id)
if (existsSync(target)) {
  console.error(`${target} exists already; change that entry by editing it, or choose another name`)
  process.exit(1)
}
const MAX_ISSUES_SHOWN = 20
const GIT_ATTRIBUTES =
  '# Every checkout has the same line endings, on every OS.\n* text=auto eol=lf\n'
const SKIP =
  /(^|[\\/])(node_modules|dist|data|\.git|\.acrylblends|\.acryl|docs[\\/]framework)([\\/]|$)/u
mkdirSync(dirname(target), { recursive: true })
cpSync(app, target, {
  recursive: true,
  filter: (path) => {
    const rel = path.slice(app.length)
    if (SKIP.test(rel)) return false
    if (lstatSync(path).isSymbolicLink()) {
      console.error(`skipped a link: ${rel}`)
      return false
    }
    return true
  },
})
const issues = portabilityIssues(folderFiles(target))
if (issues.length > 0) {
  rmSync(target, { recursive: true, force: true })
  console.error(
    `${issues.length} thing(s) in this app would not work on every OS, so no entry was made:`,
  )
  for (const { path, reason } of issues.slice(0, MAX_ISSUES_SHOWN))
    console.error(`  ${path}: ${reason}`)
  if (issues.length > MAX_ISSUES_SHOWN)
    console.error(`  and ${issues.length - MAX_ISSUES_SHOWN} more`)
  if (issues.some(({ rule }) => rule === 'carriage-return'))
    console.error(
      'For the line endings: add the line "* text=auto eol=lf" to .gitattributes, then run git add --renormalize . and commit.',
    )
  process.exit(1)
}
if (!existsSync(join(target, '.gitattributes')))
  writeFileSync(join(target, '.gitattributes'), GIT_ATTRIBUTES)
if (existsSync(join(target, '.gitignore')))
  renameSync(join(target, '.gitignore'), join(target, 'gitignore'))
const manifestFile = join(target, 'blend.yaml')
const lockFile = join(target, 'blend.lock.json')
const text = readFileSync(manifestFile, 'utf8')
const meta = /^metadata:\n(?:[ \t]+.*\n|[ \t]*\n)*/mu.exec(text)
if (!meta) {
  rmSync(target, { recursive: true, force: true })
  console.error('blend.yaml has no metadata block')
  process.exit(1)
}
const name = (/^\s+name:\s*(.+)$/mu.exec(meta[0])?.[1] ?? id).replaceAll('"', '').trim()
const description = values.description ?? `${name}, an acrylblends app made at the workshop.`
writeFileSync(
  manifestFile,
  text.replace(
    meta[0],
    [
      'metadata:',
      `  id: ${id}`,
      `  name: ${JSON.stringify(name)}`,
      '  version: 0.1.0',
      `  category: ${values.category ?? 'workshop'}`,
      `  description: ${JSON.stringify(description)}`,
      `  license: ${values.license ?? 'MIT'}`,
      '  visibility: public',
      '',
    ].join('\n'),
  ),
)
if (existsSync(lockFile)) {
  const lock = JSON.parse(readFileSync(lockFile, 'utf8'))
  if (
    lock !== null &&
    typeof lock === 'object' &&
    lock.origin !== null &&
    typeof lock.origin === 'object'
  ) {
    lock.origin = {
      ...lock.origin,
      id,
      version: '0.1.0',
      digest: createHash('sha256').update(readFileSync(manifestFile, 'utf8')).digest('hex'),
    }
    writeFileSync(lockFile, `${JSON.stringify(lock, null, 2)}\n`)
  }
}
writeFileSync(
  join(target, 'acryl.template.json'),
  `${JSON.stringify({ name, description, plugins: [] }, null, 2)}\n`,
)
console.log(
  values.out === undefined
    ? `made blends/${id}/. Next:  git add blends/${id} && git commit -m "add ${id}" && git push, then open a pull request.`
    : `made ${target}`,
)

/**
 * What in the app no longer matches its blend.lock.json (blend.yaml, or a plugin folder the lock names), or undefined when it matches or the app has no lock.
 * The digests are blends-core's (`manifestDigest`, `digestFolder`), computed here with node:crypto so a fork needs no install to run this script.
 */
function staleSnapshot(appRoot) {
  const lockFile = join(appRoot, 'blend.lock.json')
  if (!existsSync(lockFile)) return undefined
  let lock
  try {
    lock = JSON.parse(readFileSync(lockFile, 'utf8'))
  } catch {
    return 'blend.lock.json'
  }
  const manifest = createHash('sha256')
    .update(readFileSync(join(appRoot, 'blend.yaml')))
    .digest('hex')
  if (typeof lock?.origin?.digest === 'string' && lock.origin.digest !== manifest)
    return 'blend.yaml'
  for (const module of Array.isArray(lock?.modules) ? lock.modules : []) {
    if (
      module?.origin !== 'local' ||
      typeof module.source !== 'string' ||
      typeof module.digest !== 'string'
    )
      continue
    if (!/^(plugins|src\/plugins|extensions)\/[a-z0-9][a-z0-9._-]*$/u.test(module.source))
      return 'blend.lock.json'
    const folder = join(appRoot, module.source)
    if (!existsSync(folder) || `sha256:${digestFolder(folder)}` !== module.digest)
      return module.source
  }
  return undefined
}

/** blends-core's digestFolder: sha256 over each file's `/`-separated path and bytes, in code-unit order, skipping dependencies, git and ACRYL's staging. */
function digestFolder(dir) {
  const files = []
  const walk = (at, prefix) => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      if (
        ['node_modules', '.git', 'acryl-source.json'].includes(entry.name) ||
        entry.name.startsWith('acryl-v-')
      )
        continue
      const path = join(at, entry.name)
      if (entry.isDirectory()) walk(path, `${prefix}${entry.name}/`)
      else files.push([`${prefix}${entry.name}`, path])
    }
  }
  walk(dir, '')
  files.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
  const hash = createHash('sha256')
  for (const [relative, path] of files)
    hash.update(relative).update('\0').update(readFileSync(path)).update('\0')
  return hash.digest('hex')
}
