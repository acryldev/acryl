#!/usr/bin/env node
// Builds the legacy layout fixtures `acrylblends upgrade` recognises: for every published acrylblends release that shipped templates, the scaffold files of
// each template, deduplicated by content hash, written verbatim under packages/cli/legacy/ plus a layouts.json index.
//
//   node scripts/build-legacy-layouts.mjs            (write the fixtures and the index)
//   node scripts/build-legacy-layouts.mjs --check    (compare with what the tags produce; write nothing)
//
// The releases are the git tags `v*` whose packages/cli/package.json version is published on npm; the templates and the files the frame layout replaces are
// derived from the current templates (the module src/frame.ts imports, its routes; src/app.ts when it exports composeInto), never from a hand list.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const templatesRoot = join(root, 'packages', 'cli', 'templates')
const legacyRoot = join(root, 'packages', 'cli', 'legacy')
const check = process.argv.includes('--check')
const log = (message) => console.log(`build-legacy-layouts: ${message}`)
const fail = (message) => {
  throw new Error(`build-legacy-layouts: ${message}`)
}

/** Every template the current scaffolder has. */
const templates = readdirSync(templatesRoot)
  .filter((name) => existsSync(join(templatesRoot, name, 'template.json')))
  .sort()

/**
 * The files the frame layout brings up to date for a template, as of the current templates: the route module `src/frame.ts` imports (or `src/routes.ts` for
 * a template without a frame row), plus `src/app.ts` when it exports `composeInto` (the composition root the app-plugins row calls).
 */
function scaffoldFiles(template) {
  const dir = join(templatesRoot, template, 'src')
  const frame = existsSync(join(dir, 'frame.ts')) ? readFileSync(join(dir, 'frame.ts'), 'utf8') : ''
  const route =
    [...frame.matchAll(/from '\.\/([^']+\.ts)'/gu)]
      .map((match) => `src/${match[1]}`)
      .find((file) => file !== 'src/app.ts' && existsSync(join(templatesRoot, template, file))) ??
    (existsSync(join(dir, 'routes.ts')) ? 'src/routes.ts' : undefined)
  if (route === undefined) fail(`the ${template} template has no route module`)
  const app = join(dir, 'app.ts')
  const files = [route]
  if (existsSync(app) && readFileSync(app, 'utf8').includes('export async function composeInto'))
    files.push('src/app.ts')
  return files.sort()
}

/** The published versions of the CLI: the tags are release commits, and a tag that never reached npm cannot have made an app in someone's hands. */
function publishedVersions() {
  let listed
  try {
    listed = execFileSync('npm', ['view', 'acrylblends', 'versions', '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    // The check is the gate's guard that every published release is recorded: offline a local run says what it did not check, and CI never skips it.
    if (check && !process.env.CI) {
      log(
        'SKIPPED: no network, so the fixtures were not compared with the published releases (npm view acrylblends failed)',
      )
      process.exit(0)
    }
    throw error
  }
  return new Set(JSON.parse(listed))
}

/**
 * Published versions whose record is the committed fixtures, not a tag: their tags are not in this repository's history (an older lineage, or a name
 * placeholder), so a clean clone cannot regenerate them. Each is listed in packages/cli/legacy/frozen.json with why; whatever layouts.json holds for one
 * (and its fixture files) is carried over as committed, on every machine, whether or not a local clone happens to have its tag.
 */
const FROZEN_FILE = join(legacyRoot, 'frozen.json')
const frozenText = existsSync(FROZEN_FILE) ? readFileSync(FROZEN_FILE, 'utf8') : undefined
if (frozenText === undefined) fail(`${relative(root, FROZEN_FILE)} is missing`)
const frozen = new Map(Object.entries(JSON.parse(frozenText).releases ?? {}))

/** A frozen release's layouts as committed: its layouts.json entry and the fixture files it names. */
function frozenRelease(version) {
  const indexFile = join(legacyRoot, 'layouts.json')
  const committed = existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, 'utf8')) : undefined
  const entry = committed?.releases.find((release) => release.version === version)
  if (entry === undefined) return undefined
  const layouts = {}
  for (const [template, hash] of Object.entries(entry.layouts)) {
    const files = {}
    for (const file of committed.templates[template]?.[hash] ?? []) {
      const path = join(legacyRoot, template, hash, file)
      if (!existsSync(path))
        fail(
          `the frozen release ${version} names ${template}/${hash}/${file}, which is not committed`,
        )
      files[file] = readFileSync(path, 'utf8')
    }
    layouts[template] = files
  }
  return { version, layouts }
}

/** Every release with templates: version, and for each template the scaffold file contents (or undefined when that release had no such template). */
function releases() {
  const published = publishedVersions()
  for (const version of frozen.keys())
    if (!published.has(version))
      fail(
        `${relative(root, FROZEN_FILE)} names ${version}, which npm does not list for acrylblends`,
      )
  const tags = execFileSync('git', ['tag', '--list', 'v*'], { cwd: root, encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean)
  // Every published release is either regenerated from its tag or frozen: a checkout without the tags (a shallow clone), or a new release nobody
  // recorded, fails here instead of passing on fewer releases.
  const untagged = [...published].filter(
    (version) => !tags.includes(`v${version}`) && !frozen.has(version),
  )
  if (untagged.length > 0)
    fail(
      `no tag for the published release${untagged.length === 1 ? '' : 's'} ${untagged.join(', ')}: fetch the tags (git fetch --tags) and run again; a release whose tag is not in this repository's history goes in ${relative(root, FROZEN_FILE)} with why`,
    )
  const out = []
  for (const version of frozen.keys()) {
    const release = frozenRelease(version)
    if (release !== undefined) out.push(release)
  }
  for (const tag of tags) {
    const version = tag.slice(1)
    if (!published.has(version) || frozen.has(version)) continue
    let manifest
    try {
      manifest = execFileSync('git', ['show', `${tag}:packages/cli/package.json`], {
        cwd: root,
        encoding: 'utf8',
      })
    } catch {
      continue // A tag from before the CLI package existed (the desktop releases).
    }
    if (JSON.parse(manifest).version !== version) fail(`${tag} carries a different version`)
    const layouts = {}
    for (const template of templates) {
      const files = {}
      let complete = true
      for (const file of scaffoldFiles(template)) {
        try {
          files[file] = execFileSync(
            'git',
            ['show', `${tag}:packages/cli/templates/${template}/${file}`],
            // A file the tag does not have is an expected answer here (the template is incomplete in that release), so git's message is not shown.
            { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
          )
        } catch {
          complete = false
          break
        }
      }
      if (complete) layouts[template] = files
    }
    if (Object.keys(layouts).length > 0) out.push({ version, layouts })
  }
  return out
}

/** A layout's identity: the files and their bytes, so two releases that shipped the same scaffold share one fixture. */
function layoutHash(files) {
  const hash = createHash('sha256')
  for (const file of Object.keys(files).sort()) hash.update(`${file}\0${files[file]}\0`)
  return hash.digest('hex').slice(0, 12)
}

/** Semver order, so the index reads like the release history. */
function compareVersions(a, b) {
  const pa = a.split(/[.-]/u).map((part) => (Number.isNaN(Number(part)) ? part : Number(part)))
  const pb = b.split(/[.-]/u).map((part) => (Number.isNaN(Number(part)) ? part : Number(part)))
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x < y) return -1
    if (x > y) return 1
  }
  return 0
}

const all = releases().sort((a, b) => compareVersions(a.version, b.version))
if (all.length === 0) fail('no published release with templates was found')
const index = { generatedBy: 'scripts/build-legacy-layouts.mjs', releases: [], templates: {} }
for (const template of templates) index.templates[template] = {}
/** Every fixture's bytes, keyed by its path inside `legacy/`: the same map the writer writes and the checker compares. */
const fixtures = new Map()
for (const release of all) {
  const layouts = {}
  for (const [template, files] of Object.entries(release.layouts)) {
    const hash = layoutHash(files)
    layouts[template] = hash
    const paths = Object.keys(files).sort()
    const known = index.templates[template][hash]
    if (known !== undefined && JSON.stringify(known) !== JSON.stringify(paths))
      fail(`${template} ${hash} has two file lists`)
    index.templates[template][hash] = paths
    for (const file of paths) fixtures.set(`${template}/${hash}/${file}`, files[file])
  }
  index.releases.push({ version: release.version, layouts })
}
const versions = index.releases.map((release) => release.version)
const readme = `# The scaffolds published acrylblends releases shipped

Generated by \`scripts/build-legacy-layouts.mjs\`; do not edit by hand. Each folder is a template, each hash under it one distinct scaffold (deduplicated by
content hash across releases), and \`layouts.json\` maps every published release that shipped templates (${versions[0]} through ${versions.at(-1)}, ${String(versions.length)} releases)
to the layouts it shipped.

\`acrylblends upgrade\` compares an app's scaffold files with these bytes: a file the app has not edited is brought up to date, an edited one is refused (or
replaced with --force after a backup). Releases before 0.7.8 wrote src/main.ts importing './plugins/...', which cannot start; their layouts are kept so the
upgrade can say so precisely instead of writing a frame such a release's app cannot run.

\`frozen.json\` lists the published versions whose tag is not in this repository's history, with why: their record is what is committed here, since no
clone can regenerate them. Every other published version must have its tag, or \`verify:legacy-layouts\` fails.
`
const indexText = `${JSON.stringify(index, null, 2)}\n`
if (check) {
  const problems = []
  const onDisk = new Map()
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) walk(path)
      else onDisk.set(relative(legacyRoot, path).split(sep).join('/'), readFileSync(path, 'utf8'))
    }
  }
  if (existsSync(legacyRoot)) walk(legacyRoot)
  onDisk.delete('layouts.json')
  onDisk.delete('README.md')
  onDisk.delete('frozen.json')
  for (const [file, text] of onDisk)
    if (!fixtures.has(file)) problems.push(`unexpected file ${file}`)
    else if (fixtures.get(file) !== text) problems.push(`different bytes ${file}`)
  for (const file of fixtures.keys()) if (!onDisk.has(file)) problems.push(`missing file ${file}`)
  if (!existsSync(join(legacyRoot, 'layouts.json'))) problems.push('layouts.json is missing')
  else if (readFileSync(join(legacyRoot, 'layouts.json'), 'utf8') !== indexText)
    problems.push('layouts.json is stale')
  if (!existsSync(join(legacyRoot, 'README.md'))) problems.push('README.md is missing')
  else if (readFileSync(join(legacyRoot, 'README.md'), 'utf8') !== readme)
    problems.push('README.md is stale')
  if (problems.length > 0) {
    for (const problem of problems) console.error(`build-legacy-layouts: ${problem}`)
    process.exit(1)
  }
  log(
    `the fixtures match every published release (${String(all.length)} releases, ${String(fixtures.size)} files)`,
  )
} else {
  rmSync(legacyRoot, { recursive: true, force: true })
  for (const [file, text] of fixtures) {
    const target = join(legacyRoot, file)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, text)
  }
  writeFileSync(join(legacyRoot, 'layouts.json'), indexText)
  writeFileSync(join(legacyRoot, 'README.md'), readme)
  writeFileSync(FROZEN_FILE, frozenText)
  log(
    `wrote ${String(all.length)} releases and ${String(new Set(Object.values(index.templates).flatMap(Object.keys)).size)} distinct layouts from ${join('packages', 'cli', 'legacy')}`,
  )
}
