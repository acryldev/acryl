#!/usr/bin/env node
// One step of the release checklist: bring both sites up to this repository. For each of acrylblends.github.io (the framework site) and acryl.dev, in a scratch clone:
//   - copy docs/framework over the site's src/docs/framework (the sites never edit it), and on both sites docs/plans/site-assets over public/docs-assets (the pictures the docs use, served as /docs-assets/...);
//   - on the framework site, add every release of docs/release-notes/ the site does not have yet (the entry and the list item), newest first;
//   - apply the site's patches from docs/plans/site-patches/<site>/ (`git am`), skipping any whose subject the site already has: they carry the hand-written pages the sync does not;
//   - on the framework site, regenerate the registry's acrylblends starters from this repository's templates and rewrite registry/index.json (scripts/make-registry-starters.mjs, then the site's own scripts/registry-index.ts on blends-core at the pin its workflow names);
//   - build the site (so a broken page fails here, not on the live site);
//   - commit, and with --push push to main (the Pages workflows deploy) and wait for them.
// Without --push it stops after the build and says what it would push.
//
//   node scripts/sync-sites.mjs [--push] [--only framework|acryl] [--work <folder>] [--no-build]
import { spawnSync } from 'node:child_process'
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
import { parseArgs } from 'node:util'
import { addReleases, missingImages } from './lib/sites.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { values } = parseArgs({
  options: {
    push: { type: 'boolean' },
    only: { type: 'string' },
    work: { type: 'string' },
    'no-build': { type: 'boolean' },
  },
})
const log = (message) => console.log(`sync-sites: ${message}`)
const SITES = [
  {
    id: 'framework',
    patches: 'acrylblends.github.io',
    repo: 'acrylblends/acrylblends.github.io',
    releaseNotes: true,
    starters: true,
    live: 'https://acrylblends.github.io/',
    workflow: 'Deploy to GitHub Pages',
  },
  {
    id: 'acryl',
    patches: 'acryl.dev',
    repo: 'acryldev/acryldev.github.io',
    releaseNotes: false,
    starters: false,
    live: 'https://acryl.dev/',
    workflow: 'Deploy acryl.dev',
  },
].filter((site) => values.only === undefined || site.id === values.only)
if (SITES.length === 0) {
  console.error(
    'usage: node scripts/sync-sites.mjs [--push] [--only framework|acryl] [--work <folder>] [--no-build]',
  )
  process.exit(2)
}

const run = (command, args, cwd, options = {}) => {
  const r = spawnSync(command, args, { cwd, encoding: 'utf8', ...options })
  if (r.status !== 0)
    throw new Error(`${command} ${args.join(' ')} failed in ${cwd}:\n${r.stdout}${r.stderr}`)
  return r.stdout
}
/** blends-core at the commit the registry workflow pins, in a sparse clone of ACRYL's source (it is not on npm yet): the format library the registry index is written with. */
function blendsCore(workflow) {
  const pin = /repository: acryldev\/acryl\n\s+ref: ([0-9a-f]{40})/u.exec(workflow)?.[1]
  if (pin === undefined)
    throw new Error('registry.yml names no blends-core commit to read the index with')
  const dir = join(work, 'acryl-blends-core')
  if (!existsSync(join(dir, 'runtime', 'blends-core', 'node_modules'))) {
    rmSync(dir, { recursive: true, force: true })
    run(
      'git',
      [
        ...credential,
        'clone',
        '-q',
        '--depth',
        '1',
        '--filter=blob:none',
        '--sparse',
        'https://github.com/acryldev/acryl.git',
        dir,
      ],
      work,
    )
    run('git', ['sparse-checkout', 'set', 'runtime/blends-core'], dir)
    run('git', [...credential, 'fetch', '-q', '--depth', '1', 'origin', pin], dir)
    run('git', ['checkout', '-q', pin], dir)
    run('bun', ['install', '--production'], join(dir, 'runtime', 'blends-core'))
  }
  return join(dir, 'runtime', 'blends-core', 'src')
}

/** The registry's acrylblends starters are this repository's templates: made again, and the index written again, so the registry offers what `acrylblends init` makes today. */
function refreshStarters(dir) {
  if (spawnSync('bun', ['--version'], { encoding: 'utf8' }).status !== 0)
    throw new Error(
      'bun is needed to write the registry index (the format library is TypeScript for bun)',
    )
  const core = blendsCore(readFileSync(join(dir, '.github', 'workflows', 'registry.yml'), 'utf8'))
  run(
    process.execPath,
    [join(root, 'scripts', 'make-registry-starters.mjs'), join(dir, 'registry')],
    root,
  )
  run('bun', ['scripts/registry-index.ts', 'registry'], dir, {
    env: { ...process.env, BLENDS_CORE: core },
  })
  run('bun', ['scripts/registry-index.ts', 'registry', '--check'], dir, {
    env: { ...process.env, BLENDS_CORE: core },
  })
  log('framework: registry starters made again and index.json written')
}

const credential = ['-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential']
const work =
  values.work === undefined ? mkdtempSync(join(tmpdir(), 'sync-sites-')) : resolve(values.work)
mkdirSync(work, { recursive: true })

const notes = Object.fromEntries(
  readdirSync(join(root, 'docs', 'release-notes'))
    .filter((name) => /^\d+\.\d+\.\d+\.md$/u.test(name))
    .map((name) => [
      name.slice(0, -3),
      readFileSync(join(root, 'docs', 'release-notes', name), 'utf8'),
    ]),
)
const version = JSON.parse(
  readFileSync(join(root, 'packages', 'cli', 'package.json'), 'utf8'),
).version

try {
  for (const site of SITES) {
    const dir = join(work, site.id)
    rmSync(dir, { recursive: true, force: true })
    run(
      'git',
      [...credential, 'clone', '-q', '--depth', '40', `https://github.com/${site.repo}.git`, dir],
      work,
    )
    const target = join(dir, 'src', 'docs', 'framework')
    rmSync(target, { recursive: true, force: true })
    mkdirSync(target, { recursive: true })
    cpSync(join(root, 'docs', 'framework'), target, {
      recursive: true,
      filter: (path) => !/(upstream\.json|UPSTREAM\.md)$/u.test(path),
    })
    // Pictures the docs use (docs/plans/site-assets/<folder>/...): served by each site as /docs-assets/<folder>/..., root-absolute, so a page needs no sync step of its own.
    const assets = join(root, 'docs', 'plans', 'site-assets')
    if (existsSync(assets)) {
      cpSync(assets, join(dir, 'public', 'docs-assets'), { recursive: true })
      log(`${site.id}: pictures copied to public/docs-assets`)
    }
    // A page that shows a picture the site does not have would publish a broken image: stop here, before anything is built or pushed.
    const absent = missingImages(target, join(dir, 'public'))
    if (absent.length > 0)
      throw new Error(
        `sync-sites: ${absent.length} picture(s) the docs show are not on the ${site.id} site (docs/plans/site-assets/<folder>/ is served as /docs-assets/<folder>/):\n${absent.map((one) => `  ${one.page}: ${one.image}`).join('\n')}`,
      )
    log(`${site.id}: every picture the docs show is on the site`)
    if (site.releaseNotes) {
      const docFile = join(dir, 'src', 'lib', 'doc-content.ts')
      const contentFile = join(dir, 'src', 'lib', 'content.ts')
      const result = addReleases(
        readFileSync(docFile, 'utf8'),
        readFileSync(contentFile, 'utf8'),
        notes,
      )
      writeFileSync(docFile, result.docContent)
      writeFileSync(contentFile, result.content)
      log(
        `${site.id}: release notes added: ${result.added.length === 0 ? 'none (nothing newer than the site has)' : result.added.join(', ')}`,
      )
      if (result.gaps.length > 0)
        log(`${site.id}: older release notes the site lacks, not added: ${result.gaps.join(', ')}`)
    }
    // The site's own patches (the hand-written pages), applied in order; one the site already has (same subject) is skipped.
    const patchDir = join(root, 'docs', 'plans', 'site-patches', site.patches)
    if (existsSync(patchDir)) {
      const subjects = run('git', ['log', '--format=%s'], dir).split('\n')
      for (const file of readdirSync(patchDir)
        .filter((name) => name.endsWith('.patch'))
        .sort()) {
        const patch = join(patchDir, file)
        const subject = /^Subject: (?:\[PATCH[^\]]*\] )?(.*)$/mu
          .exec(readFileSync(patch, 'utf8'))?.[1]
          ?.trim()
        if (
          subject !== undefined &&
          subjects.some((line) => line.startsWith(subject.slice(0, 60)))
        ) {
          log(`${site.id}: patch ${file} is already applied`)
          continue
        }
        // The docs sync above is uncommitted work: commit it first so `git am` has a clean tree.
        if (run('git', ['status', '--porcelain'], dir).trim() !== '') {
          run('git', ['add', '-A'], dir)
          run(
            'git',
            [
              '-c',
              'user.name=sync-sites',
              '-c',
              'user.email=sync-sites@acrylblends.invalid',
              'commit',
              '-q',
              '-m',
              `docs: framework docs, release notes and registry starters re-synced (${version})`,
            ],
            dir,
          )
        }
        run(
          'git',
          [
            '-c',
            'user.name=sync-sites',
            '-c',
            'user.email=sync-sites@acrylblends.invalid',
            'am',
            '--3way',
            patch,
          ],
          dir,
        )
        log(`${site.id}: applied ${file}`)
      }
    }
    if (site.starters) refreshStarters(dir)
    if (values['no-build'] !== true) {
      const bun = spawnSync('bun', ['--version'], { encoding: 'utf8' }).status === 0
      const pnpm = existsSync(join(dir, 'pnpm-lock.yaml'))
      if (pnpm) {
        run('pnpm', ['install', '--frozen-lockfile'], dir)
        run('pnpm', ['run', 'build'], dir)
      } else if (bun) {
        run('bun', ['install', '--frozen-lockfile'], dir)
        run('bun', ['run', 'build'], dir)
      } else {
        run('npm', ['install', '--no-audit', '--no-fund'], dir)
        run('npm', ['run', 'build'], dir)
      }
      rmSync(join(dir, 'node_modules'), { recursive: true, force: true })
      rmSync(join(dir, 'dist'), { recursive: true, force: true })
      log(`${site.id}: built`)
    }
    // What there is to push: uncommitted work (committed here) and the commits already made (the docs sync before a patch, the patches).
    const dirty = run('git', ['status', '--porcelain'], dir).trim()
    if (dirty !== '') {
      run('git', ['add', '-A'], dir)
      run(
        'git',
        [
          'commit',
          '-q',
          '-m',
          `docs: framework docs, release notes and registry starters re-synced (${version})`,
        ],
        dir,
      )
    }
    const ahead = Number(run('git', ['rev-list', '--count', 'origin/main..HEAD'], dir).trim())
    if (ahead === 0) {
      log(`${site.id}: already up to date`)
      continue
    }
    if (values.push !== true) {
      log(`${site.id}: ${ahead} commit(s) to push; not pushed (use --push). Clone kept in ${dir}`)
      continue
    }
    run('git', [...credential, 'push', '-q', 'origin', 'HEAD:main'], dir)
    log(`${site.id}: pushed; waiting for the ${site.workflow} workflow`)
    const id = (() => {
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const out = run(
          'gh',
          [
            'run',
            'list',
            '-R',
            site.repo,
            '--workflow',
            site.workflow,
            '--limit',
            '1',
            '--json',
            'databaseId,headSha',
          ],
          dir,
        )
        const [latest] = JSON.parse(out)
        const head = run('git', ['rev-parse', 'HEAD'], dir).trim()
        if (latest?.headSha === head) return latest.databaseId
        spawnSync('sleep', ['5'])
      }
      return undefined
    })()
    if (id !== undefined) {
      run('gh', ['run', 'watch', String(id), '-R', site.repo, '--exit-status'], dir, {
        stdio: 'ignore',
      })
      log(`${site.id}: deployed (${site.live})`)
    } else
      log(
        `${site.id}: pushed, but its workflow did not start in a minute: check ${site.repo}/actions`,
      )
    const page = await fetch(site.live)
    log(`${site.id}: ${site.live} answers ${page.status}`)
    if (!page.ok) throw new Error(`${site.live} answered ${page.status}`)
  }
} finally {
  if (values.work === undefined && values.push === true)
    rmSync(work, { recursive: true, force: true })
}
