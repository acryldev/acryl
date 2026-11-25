/**
 * `acrylblends update`: bring the newer release of the Blend an app was made from (`blend.yaml` metadata id and version) into the app, keeping the
 * person's own changes. `upgrade` is a different thing: it brings the library plugins and the frame up to this CLI's version.
 *
 * The app is a git repository whose first commit is the Blend as it was made (@acryldev/create-blends). The newer release is made the same way, with the same
 * name, in a scratch folder; its files become a commit on top of the commit the app was made from, and that commit is merged into the app. A file only
 * the Blend changed takes the Blend's change, a file only the person changed keeps theirs, and both changes in different places of one file are both kept.
 * When both changed the same lines nothing is changed: the merge is undone and the files are named. Uncommitted work is committed first, so nothing is lost.
 * `refs/acrylblends/blend` remembers the Blend's last release in the app, the base of the next update.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { UsageError } from './init'
import type { Io } from './io'
import { packageManagerInvocation } from './spawn'
import { VERSION } from './version'

/** The public registry's index, as its site serves it (@acryldev/create-blends reads the same one). */
export const REGISTRY_INDEX = 'https://acrylblends.github.io/registry/index.json'
/** The commit of the Blend's release the app last took: the base the next update merges from. */
export const BLEND_REF = 'refs/acrylblends/blend'
const LOCKFILES = new Set(['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock'])
/**
 * While an update merges and installs, the app's files are half new: new code can import a package npm has not installed yet. A running app's frame
 * (@acryldev/blends-frame `applied-live.ts`, UPDATE_HOLD there) holds its reload while this file names a live process, and reloads once when it is gone.
 */
export const UPDATE_HOLD = join('.acrylblends', 'updating.json')

export interface UpdateOptions {
  readonly directory: string | undefined
  /** Say whether there is a newer release and stop. */
  readonly check: boolean
}

export function parseUpdateOptions(argv: readonly string[]): UpdateOptions {
  const { values, positionals } = parseArgs({
    args: [...argv],
    options: { dir: { type: 'string' }, check: { type: 'boolean' } },
    allowPositionals: true,
  })
  if (positionals.length > 0)
    throw new UsageError(`update takes no arguments (got ${positionals.join(' ')}); use --dir`)
  return { directory: values.dir, check: values.check === true }
}

/** The Blend an app was made from: `metadata.id` and `metadata.version` of its blend.yaml. */
export function blendOfApp(yaml: string): { id: string; version: string } | undefined {
  const metadata = /^metadata:\n((?:[ \t]+.*\n?)*)/mu.exec(yaml)?.[1] ?? ''
  const field = (key: string): string | undefined =>
    new RegExp(`^[ \\t]+${key}:[ \\t]*["']?([^"'\\s#]+)`, 'mu').exec(metadata)?.[1]
  const id = field('id')
  const version = field('version')
  return id === undefined || version === undefined ? undefined : { id, version }
}

/**
 * Where an app's updates come from: the source create recorded in package.json `acryl.from` (`acrylblends.notes#0.3.1`, a registry Blend at a version, or
 * `github:ana/notes#v0.2.0`, a shared repository at a tag), else the app's own id and version (an app made before `from` existed, or a Blend
 * itself). `current` is the version the app is on.
 */
export interface UpdateSource {
  readonly source: string
  readonly current: string
}

export function sourceOfApp(yaml: string, packageJson?: string): UpdateSource | undefined {
  const blend = blendOfApp(yaml)
  if (blend === undefined) return undefined
  const metadata = /^metadata:\n((?:[ \t]+.*\n?)*)/mu.exec(yaml)?.[1] ?? ''
  // package.json `acryl.from` (create-blends 1.7.16 and newer), else blend.yaml `metadata.from` (1.7.13 to 1.7.15).
  const from =
    fromOfPackage(packageJson) ?? /^[ \t]+from:[ \t]*["']?([^"'\s]+)/mu.exec(metadata)?.[1]
  if (from === undefined) return { source: blend.id, current: blend.version }
  const [source = blend.id, release] = from.split('#')
  return { source, current: release === undefined ? blend.version : release.replace(/^v/u, '') }
}

function fromOfPackage(text: string | undefined): string | undefined {
  if (text === undefined) return undefined
  try {
    const from = (JSON.parse(text) as { acryl?: { from?: unknown } }).acryl?.from
    return typeof from === 'string' && from.trim() !== '' ? from.trim() : undefined
  } catch {
    return undefined
  }
}

/** The newest `vX.Y.Z` (or `X.Y.Z`) tag among `git ls-remote --tags` lines, as tagged. */
export function newestTag(lsRemote: string): string | undefined {
  const tags = lsRemote
    .split('\n')
    .map((line) => /refs\/tags\/(v?\d+\.\d+\.\d+)$/u.exec(line.trim())?.[1])
    .filter((tag): tag is string => tag !== undefined)
  return tags.reduce<string | undefined>(
    (best, tag) =>
      best === undefined || isNewerVersion(tag.replace(/^v/u, ''), best.replace(/^v/u, ''))
        ? tag
        : best,
    undefined,
  )
}

/** `0.2.0` is newer than `0.1.9`; anything that is not three numbers is never newer. */
export function isNewerVersion(candidate: string, current: string): boolean {
  const parse = (text: string) => /^(\d+)\.(\d+)\.(\d+)$/u.exec(text)?.slice(1).map(Number)
  const a = parse(candidate)
  const b = parse(current)
  if (a === undefined || b === undefined) return false
  for (let index = 0; index < 3; index += 1)
    if (a[index] !== b[index]) return (a[index] ?? 0) > (b[index] ?? 0)
  return false
}

/** What the update needs outside the app folder. Tests pass their own. */
export interface UpdateWorld {
  /** The newest release of `source` (a registry id: its version; `github:owner/repo`: its newest version tag), or undefined when there is none. */
  latest(source: string): Promise<string | undefined>
  /** Make `source` at `release` as a new app named `name` inside `folder` (git repository, no install); resolves to the exit code. */
  make(source: string, name: string, folder: string, release: string): Promise<number>
}

export function registryWorld(io: Io): UpdateWorld {
  return {
    async latest(id) {
      if (id.startsWith('github:')) {
        const run = spawnSync(
          'git',
          ['ls-remote', '--tags', '--refs', `https://github.com/${id.slice('github:'.length)}.git`],
          {
            encoding: 'utf8',
            windowsHide: true,
            timeout: 30_000,
            env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
          },
        )
        if (run.status !== 0)
          throw new Error(
            `${id} could not be read: ${(run.stderr ?? '').trim() || 'git ls-remote failed'}`,
          )
        return newestTag(run.stdout ?? '')
      }
      const answer = await fetch(REGISTRY_INDEX, { signal: AbortSignal.timeout(20_000) })
      if (!answer.ok) throw new Error(`the registry answered ${answer.status} (${REGISTRY_INDEX})`)
      const index = (await answer.json()) as { entries?: { id?: string; version?: string }[] }
      return index.entries?.find((entry) => entry.id === id)?.version
    },
    make: (id, name, folder, release) =>
      new Promise((done) => {
        const { file, args } = packageManagerInvocation('npm', [
          'exec',
          '--yes',
          // The create of this CLI's own release: an older @latest would not record acryl.from, and the merge would drop it.
          `@acryldev/create-blends@${VERSION}`,
          '--',
          name,
          '--from',
          id.startsWith('github:') ? `${id}#${release}` : id,
          '--no-install',
        ])
        const run = spawnSync(file, args, {
          cwd: folder,
          stdio: ['ignore', 'pipe', 'pipe'],
          encoding: 'utf8',
          windowsHide: true,
        })
        io.stdout.write(run.stdout ?? '')
        io.stderr.write(run.stderr ?? '')
        done(run.status ?? 1)
      }),
  }
}

export async function update(
  options: UpdateOptions,
  io: Io,
  world: UpdateWorld = registryWorld(io),
): Promise<number> {
  const app = resolve(io.cwd, options.directory ?? '.')
  const say = (line: string) => io.stdout.write(`${line}\n`)
  const manifest = join(app, 'blend.yaml')
  if (!existsSync(manifest))
    throw new Error(
      `${app} has no blend.yaml: it was not made from a Blend, so there is nothing to update from`,
    )
  const packagePath = join(app, 'package.json')
  const origin = sourceOfApp(
    readFileSync(manifest, 'utf8'),
    existsSync(packagePath) ? readFileSync(packagePath, 'utf8') : undefined,
  )
  if (origin === undefined) throw new Error(`${manifest} names no metadata id and version`)
  const fromRepository = origin.source.startsWith('github:')
  // `blend` names the source in every line below and in the merge commits.
  const blend = { id: origin.source, version: origin.current }
  say(
    `${basename(app)} was made from ${blend.id} ${blend.version}. Asking ${fromRepository ? 'the repository' : 'the registry'} for its latest release...`,
  )
  const newest = await world.latest(blend.id)
  if (newest === undefined) {
    say(
      fromRepository
        ? `${blend.id} has no release tags (vX.Y.Z), so there is nothing to update from it yet.`
        : `${blend.id} is not a Blend in the registry, so there is nothing to update from it.`,
    )
    return 0
  }
  const latest = newest.replace(/^v/u, '')
  if (!isNewerVersion(latest, blend.version)) {
    say(`${blend.id} ${blend.version} is the latest release: nothing to update.`)
    return 0
  }
  say(`${blend.id} ${latest} is available.`)
  if (options.check) return 0

  const git = (args: readonly string[], cwd = app) => {
    const run = spawnSync('git', [...identity(cwd), ...args], {
      cwd,
      encoding: 'utf8',
      windowsHide: true,
    })
    return { ok: run.status === 0, out: (run.stdout ?? '').trim(), err: (run.stderr ?? '').trim() }
  }
  if (!git(['rev-parse', '--is-inside-work-tree']).ok)
    throw new Error(`${app} is not a git repository: the update merges into the app's history`)
  if (git(['rev-parse', '-q', '--verify', 'MERGE_HEAD']).ok)
    throw new Error('a merge is in progress in this app: finish or abort it first')
  const base =
    git(['rev-parse', '-q', '--verify', `${BLEND_REF}^{commit}`]).out ||
    git(['rev-list', '--max-parents=0', 'HEAD']).out.split('\n').at(-1)
  if (!base) throw new Error('the app has no commits to update from')

  if (git(['status', '--porcelain']).out !== '') {
    say('Committing your uncommitted changes first, so the update cannot lose them...')
    if (
      !git(['add', '-A']).ok ||
      !git(['commit', '-q', '-m', `Your changes before updating to ${blend.id} ${latest}`]).ok
    )
      throw new Error(
        'your uncommitted changes could not be committed: commit them yourself, then update again',
      )
  }

  // Where the app was before the update: an install that fails takes it back there, so a failed update never leaves new code without its packages.
  const before = git(['rev-parse', 'HEAD']).out
  const blendBefore = git(['rev-parse', '-q', '--verify', BLEND_REF]).out
  const hold = join(app, UPDATE_HOLD)
  mkdirSync(dirname(hold), { recursive: true })
  writeFileSync(hold, `${JSON.stringify({ pid: process.pid, since: Date.now(), to: latest })}\n`)
  try {
    const scratch = mkdtempSync(join(tmpdir(), 'acrylblends-update-'))
    try {
      say(
        `Getting ${blend.id} ${newest} (@acryldev/create-blends@${VERSION}, as the app was made)...`,
      )
      const name = basename(app)
      if ((await world.make(blend.id, name, scratch, newest)) !== 0)
        throw new Error(`${blend.id} ${latest} could not be made; the app is unchanged`)
      const made = join(scratch, name)
      const fetched = git(['fetch', '-q', '--no-tags', made, 'HEAD'])
      if (!fetched.ok) throw new Error(`the new release could not be read: ${fetched.err}`)
      const tree = git(['rev-parse', 'FETCH_HEAD^{tree}']).out
      const release = git([
        'commit-tree',
        tree,
        '-p',
        base,
        '-m',
        `${blend.id} ${latest} from ${fromRepository ? 'its repository' : 'the registry'}`,
      ]).out
      if (!release) throw new Error('the new release could not be recorded in the app')

      say(`Merging ${blend.id} ${latest} into ${name} (your changes are kept)...`)
      const merged = git(['merge', '--no-edit', '-m', `Update ${blend.id} to ${latest}`, release])
      // A lockfile differs between any two installs: the release's is taken and the npm install below makes it this app's again.
      const conflicts = git(['diff', '--name-only', '--diff-filter=U'])
        .out.split('\n')
        .filter(Boolean)
      const onlyLocks =
        conflicts.length > 0 && conflicts.every((file) => LOCKFILES.has(basename(file)))
      if (
        !merged.ok &&
        onlyLocks &&
        conflicts.every(
          (file) => git(['checkout', '--theirs', '--', file]).ok && git(['add', '--', file]).ok,
        ) &&
        git(['commit', '-q', '--no-edit']).ok
      ) {
        say(`Took ${conflicts.join(', ')} from the release (npm install brings it up to date).`)
      } else if (!merged.ok) {
        const both = conflicts.join('\n')
        git(['merge', '--abort'])
        throw new Error(
          both === ''
            ? `the merge failed: ${merged.err || merged.out}; the app is unchanged`
            : `you and ${blend.id} ${latest} both changed the same lines of: ${both.split('\n').join(', ')}. Nothing was changed; ask the agent to bring in ${blend.id} ${latest} by hand, or undo your change there and update again`,
        )
      }
      git(['update-ref', BLEND_REF, release])
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }

    if (existsSync(join(app, 'node_modules'))) {
      say('Installing its dependencies (npm install)...')
      if ((await io.install(app)) !== 0) {
        say(`npm install failed: taking ${basename(app)} back to ${blend.id} ${blend.version}...`)
        git(['reset', '-q', '--hard', before])
        if (blendBefore) git(['update-ref', BLEND_REF, blendBefore])
        else git(['update-ref', '-d', BLEND_REF])
        const restored = (await io.install(app)) === 0
        throw new Error(
          restored
            ? `npm install failed for ${blend.id} ${latest}; the app is back at ${blend.version}, as before the update`
            : `npm install failed for ${blend.id} ${latest}; the app's files are back at ${blend.version}, but its packages could not be installed again: run npm install in the app folder`,
        )
      }
    }
  } finally {
    rmSync(hold, { force: true })
  }
  say(`Updated to ${blend.id} ${latest}.`)
  return 0
}

/** A machine without a git identity still gets the update's commits, as it got the first one (init's startRepository). */
function identity(cwd: string): string[] {
  return spawnSync('git', ['config', 'user.email'], { cwd, windowsHide: true }).status === 0
    ? []
    : ['-c', 'user.name=acrylblends', '-c', 'user.email=scaffold@acryldev.invalid']
}
