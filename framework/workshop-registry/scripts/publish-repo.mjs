#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
// Give a registry entry its own repository in the acrylblends organization:   node scripts/publish-repo.mjs <site checkout> <entry id> [--org acrylblends] [--dry-run]
// The repository is named <NN>-<name>, as 01-system-monitor is: NN is the category's place in the site's taxonomy
// (src/lib/content.ts of the site checkout, System = 01), <name> the entry id without its login. Its content is the entry folder as it is in
// registry/blends/<entry id>/, with the registry's `gitignore` restored as `.gitignore`, in one first commit. Needs `gh`, signed in with an account that may create
// repositories in the organization; the push goes over HTTPS as that account. A repository that already has commits is left alone; an empty one is filled.
import { cpSync, existsSync, mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    org: { type: 'string', default: 'acrylblends' },
    'dry-run': { type: 'boolean', default: false },
  },
})
const [siteArg, id] = positionals
if (!siteArg || !id) {
  console.error(
    'usage: node scripts/publish-repo.mjs <site checkout> <entry id> [--org acrylblends] [--dry-run]',
  )
  process.exit(2)
}
const site = resolve(siteArg)
const entry = join(site, 'registry', 'blends', id)
if (!existsSync(join(entry, 'blend.yaml'))) {
  console.error(`no entry at ${entry}`)
  process.exit(1)
}

const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
const content = readFileSync(join(site, 'src', 'lib', 'content.ts'), 'utf8')
const raw = content.slice(
  content.indexOf('categoriesRaw'),
  content.indexOf('];', content.indexOf('categoriesRaw')),
)
const categorySlugs = [...raw.matchAll(/\{\s*name:\s*"([^"]+)"/g)].map((m) => slugify(m[1]))

const yaml = readFileSync(join(entry, 'blend.yaml'), 'utf8')
const field = (key) => yaml.match(new RegExp(`^\\s+${key}:\\s*"?([^"\\n]+?)"?\\s*$`, 'm'))?.[1]
const category = field('category')
const description = field('description') ?? ''
const index = categorySlugs.indexOf(category)
if (index < 0) {
  console.error(
    `blend.yaml category "${category}" is not a category of the site (${categorySlugs.length} known)`,
  )
  process.exit(1)
}
const repo = `${String(index + 1).padStart(2, '0')}-${id.slice(id.indexOf('.') + 1)}`
const full = `${values.org}/${repo}`

const gh = (...args) =>
  execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
let state = 'missing'
try {
  state = JSON.parse(gh('repo', 'view', full, '--json', 'isEmpty')).isEmpty ? 'empty' : 'filled'
} catch {}
if (state === 'filled') {
  console.log(`${full} exists, left alone`)
  process.exit(0)
}
if (values['dry-run']) {
  console.log(`would create ${full} from ${entry}`)
  process.exit(0)
}

const work = mkdtempSync(join(tmpdir(), 'blueprint-repo-'))
try {
  cpSync(entry, work, { recursive: true })
  if (existsSync(join(work, 'gitignore')) && !existsSync(join(work, '.gitignore')))
    renameSync(join(work, 'gitignore'), join(work, '.gitignore'))
  const git = (...args) =>
    execFileSync('git', args, { cwd: work, stdio: ['ignore', 'pipe', 'pipe'] })
  git('init', '-q', '-b', 'main')
  git('add', '-A')
  git('commit', '-q', '-m', `${repo}: ${description}`.slice(0, 200))
  if (state === 'missing')
    gh(
      'repo',
      'create',
      full,
      '--public',
      '--description',
      description.slice(0, 350),
      '--homepage',
      'https://acrylblends.github.io/blends',
    )
  // Over HTTPS with gh's own sign-in, so the push goes as the account gh uses, whatever key ssh would offer.
  git(
    '-c',
    'credential.helper=',
    '-c',
    'credential.helper=!gh auth git-credential',
    'push',
    '-q',
    `https://github.com/${full}.git`,
    'HEAD:refs/heads/main',
  )
  console.log(`created https://github.com/${full}`)
} finally {
  rmSync(work, { recursive: true, force: true })
}
