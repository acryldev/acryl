/**
 * An app as one file, `.acrylblend` (specs/049-framework-architecture/app-storage.md in ACRYL: "Export uses git bundle"): a git bundle of the app's source
 * with its whole history, every branch and tag, plus two refs of its own. `refs/acrylblend/worktree` holds the files not yet saved as a version (a commit
 * on top of HEAD, made only when they differ), so nothing the person sees is left behind. `refs/acrylblend/data` holds the app's data when the person
 * ticks it (a root commit of `data/`: its settings and storages, see `leftOutOfData`). Keys never leave the machine in an archive: the engine's
 * credentials file and the `.env` files it reads keys from are left out of both the unsaved files and the data.
 *
 * The data names the app's own folder in places (the workspace's project list, its settings): an export writes a marker there and an import the new app's
 * folder, so an imported app never points at the app it came from. Chats are not carried yet: the engine files each one under the absolute folder it ran
 * in, inside its compressed session log, and moving them is the engine's to offer.
 *
 * The source repository is never written by an export: the snapshot commits are made in a scratch repository in the app's cache that borrows the source's
 * objects (git's alternates), and the bundle is written from there. An import makes a fresh repository in an empty source folder; the data comes through a
 * second scratch repository, so its objects never enter the person's history.
 *
 * One tool, the git the product ships (or the one on PATH outside a product), on every OS.
 */
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { basename, extname, join } from 'node:path'
import { parseDocument, visit } from 'yaml'
import { AppInstanceError } from './index.ts'

export const ARCHIVE_EXTENSION = '.acrylblend'
export const WORKTREE_REF = 'refs/acrylblend/worktree'
export const DATA_REF = 'refs/acrylblend/data'

/**
 * Where the engine reads keys from (`@deepseek-ai/dsh-credentials-local`): its credentials file in its home, and a `.env` in its home and in the folder it
 * runs in. Never in an archive, whatever the app's own ignore rules say.
 */
export const KEY_FILES = ['**/.credentials.yaml*', '**/.env', '**/.env.*'] as const

const isKeyFile = (name: string): boolean =>
  name.startsWith('.credentials.yaml') || name === '.env' || name.startsWith('.env.')

/**
 * Whether a path of `data/` (relative, `/`-separated) stays out of an archive: the logs, what belongs to one run (the run lock, the frame's tokenized
 * address, lock files), the composition the launcher writes again on every boot (`acrylblends-frame`, naming this computer's folders), the key files,
 * and the chats with the frame's map of them (see the module comment).
 */
export function leftOutOfData(path: string): boolean {
  const name = path.split('/').at(-1) ?? ''
  const top = path.split('/')[0] ?? ''
  return (
    top === 'logs' ||
    top === 'sessions' ||
    path.startsWith('node_modules/acrylblends-frame/') ||
    ['instance.json', 'frame-url.json', 'frame/branch-chats.json'].includes(path) ||
    name.endsWith('.lock') ||
    isKeyFile(name)
  )
}

/** Where the data named the app's own folder, as written in an archive: the folder as it is, and as a JSON string holds it. */
export const SOURCE_MARK = '{{acrylblends:source}}'
export const SOURCE_MARK_JSON = '{{acrylblends:source-json}}'

/** A file read as text when it is one (UTF-8, no NUL, not huge); undefined for anything else, which is copied as it is. */
function asText(file: string): string | undefined {
  if (lstatSync(file).size > 16 * 1024 * 1024) return undefined
  const bytes = readFileSync(file)
  if (bytes.includes(0)) return undefined
  const text = bytes.toString('utf8')
  return Buffer.from(text, 'utf8').equals(bytes) ? text : undefined
}

type Pairs = readonly (readonly [string, string])[]

const replaceAll = (text: string, pairs: Pairs): string =>
  pairs.reduce((current, [from, to]) => current.split(from).join(to), text)

/**
 * `text` with each `[from, to]` replaced. A YAML file is changed in its string values, not its text: a writer folds a long value over lines, which no
 * text search finds, and a value written back is quoted as YAML needs whatever the folder's name holds. YAML that does not parse is changed as text.
 */
function relocate(file: string, text: string, pairs: Pairs): string {
  if (['.yaml', '.yml'].includes(extname(file))) {
    const document = parseDocument(text)
    if (document.errors.length === 0) {
      let changed = false
      visit(document, {
        Scalar(_, node) {
          if (typeof node.value !== 'string') return
          const next = replaceAll(node.value, pairs)
          if (next === node.value) return
          node.value = next
          changed = true
        },
      })
      return changed ? document.toString({ lineWidth: 0 }) : text
    }
  }
  return replaceAll(text, pairs)
}

/** Replace each `[from, to]` in every text file under `dir`. */
function rewriteText(dir: string, pairs: Pairs): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) rewriteText(path, pairs)
    else if (entry.isFile()) {
      const text = asText(path)
      if (text === undefined) continue
      const next = relocate(path, text, pairs)
      if (next !== text) writeFileSync(path, next)
    }
  }
}

/** The ways the data may name `source`: as given and as the OS resolves it, raw and JSON-escaped, the longest first. */
function sourceSpellings(source: string, mark: string, markJson: string): [string, string][] {
  let real = source
  try {
    real = realpathSync(source)
  } catch {
    // Not there (yet): named as given.
  }
  const pairs: [string, string][] = []
  for (const path of new Set([real, source])) {
    const json = JSON.stringify(path).slice(1, -1)
    if (json !== path) pairs.push([json, markJson])
    pairs.push([path, mark])
  }
  return pairs.sort((a, b) => b[0].length - a[0].length)
}

/** Copy `data` into `into` as an archive carries it: without what stays out, with the app's folder written as the marker. Links are not followed. */
function stageData(data: string, into: string, source: string): void {
  const copy = (from: string, to: string, prefix: string): void => {
    mkdirSync(to, { recursive: true })
    for (const entry of readdirSync(from, { withFileTypes: true })) {
      const rel = `${prefix}${entry.name}`
      if (leftOutOfData(rel)) continue
      if (entry.isDirectory()) copy(join(from, entry.name), join(to, entry.name), `${rel}/`)
      else if (entry.isFile())
        writeFileSync(join(to, entry.name), readFileSync(join(from, entry.name)))
    }
  }
  copy(data, into, '')
  rewriteText(into, sourceSpellings(source, SOURCE_MARK, SOURCE_MARK_JSON))
}

/** The name a synthetic commit of an export carries: it is the product's, never the person's. */
const SNAPSHOT_IDENTITY = {
  GIT_AUTHOR_NAME: 'ACRYL Blends',
  GIT_AUTHOR_EMAIL: 'export@acrylblends.invalid',
  GIT_COMMITTER_NAME: 'ACRYL Blends',
  GIT_COMMITTER_EMAIL: 'export@acrylblends.invalid',
}

/** The environment of a git call: the process's, without any `GIT_` variable it inherited (a repository or index of someone else's), never prompting. */
function gitEnv(extra: Readonly<Record<string, string>> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(process.env))
    if (!key.startsWith('GIT_')) env[key] = value
  return { ...env, GIT_TERMINAL_PROMPT: '0', ...extra }
}

/** Run git, returning its trimmed stdout; a failure says which command and what git said. */
function runGit(
  git: string,
  args: readonly string[],
  options: { cwd?: string; env?: Readonly<Record<string, string>> } = {},
): string {
  try {
    return execFileSync(git, args, {
      cwd: options.cwd,
      env: gitEnv(options.env),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    }).trim()
  } catch (cause) {
    const stderr = String((cause as { stderr?: unknown }).stderr ?? '').trim()
    throw new AppInstanceError(
      `git ${args[0] ?? ''} failed${stderr === '' ? '' : `: ${stderr.split('\n').at(-1) ?? ''}`}`,
    )
  }
}

/** A scratch folder in the app's cache, removed whatever happens. */
function withScratch<T>(cache: string, use: (dir: string) => T): T {
  mkdirSync(cache, { recursive: true })
  const dir = mkdtempSync(join(cache, 'archive-'))
  try {
    return use(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** The tree of a commit made in a scratch index must hold files only: a nested repository would arrive as an empty pointer. */
function refuseNestedRepositories(git: string, gitDir: string, tree: string, what: string): void {
  const nested = runGit(git, ['--git-dir', gitDir, 'ls-tree', '-r', tree])
    .split('\n')
    .filter((line) => line.startsWith('160000 '))
    .map((line) => line.split('\t')[1])
  if (nested.length > 0)
    throw new AppInstanceError(
      `${what} holds another git repository (${nested.slice(0, 3).join(', ')}); an archive cannot carry it`,
    )
}

/**
 * Write app `source` (and, when `data` is given, its data) to `file` as one `.acrylblend`. The file is written beside its final name first and renamed
 * over it, so a failed export never leaves a half file under the name the person chose.
 */
export function exportArchive(options: {
  readonly git: string
  readonly source: string
  readonly data?: string
  readonly cache: string
  readonly file: string
}): void {
  const { git, source, file } = options
  const sourceGit = join(source, '.git')
  if (!existsSync(sourceGit)) throw new AppInstanceError(`${source} is not a git repository`)
  withScratch(options.cache, (scratch) => {
    // A bare repository that reads the source's objects in place: the snapshot objects and refs land here, never in the person's repository.
    const repo = join(scratch, 'export.git')
    runGit(git, ['init', '-q', '--bare', repo])
    writeFileSync(join(repo, 'objects', 'info', 'alternates'), `${join(sourceGit, 'objects')}\n`)
    runGit(git, ['--git-dir', repo, 'fetch', '-q', '--no-tags', sourceGit, '+refs/*:refs/*'])
    const branch = (() => {
      try {
        return runGit(git, ['--git-dir', sourceGit, 'symbolic-ref', '-q', 'HEAD'])
      } catch {
        return undefined
      }
    })()
    const head = runGit(git, ['--git-dir', sourceGit, 'rev-parse', '--verify', 'HEAD'])
    if (branch === undefined)
      runGit(git, ['--git-dir', repo, 'update-ref', '--no-deref', 'HEAD', head])
    else runGit(git, ['--git-dir', repo, 'symbolic-ref', 'HEAD', branch])

    // The files as the person sees them, through the source's own ignore rules.
    const worktreeIndex = join(scratch, 'worktree.index')
    const inWorktree = { GIT_DIR: repo, GIT_WORK_TREE: source, GIT_INDEX_FILE: worktreeIndex }
    runGit(git, ['read-tree', head], { cwd: source, env: inWorktree })
    runGit(git, ['add', '-A', '--', '.', ...KEY_FILES.map((path) => `:(exclude,glob)${path}`)], {
      cwd: source,
      env: inWorktree,
    })
    const tree = runGit(git, ['write-tree'], { cwd: source, env: inWorktree })
    if (tree !== runGit(git, ['--git-dir', repo, 'rev-parse', `${head}^{tree}`])) {
      refuseNestedRepositories(git, repo, tree, 'the app')
      const commit = runGit(
        git,
        [
          '--git-dir',
          repo,
          'commit-tree',
          tree,
          '-p',
          head,
          '-m',
          'The files not yet saved as a version',
        ],
        { env: SNAPSHOT_IDENTITY },
      )
      runGit(git, ['--git-dir', repo, 'update-ref', WORKTREE_REF, commit])
    }

    if (options.data !== undefined && existsSync(options.data)) {
      const staged = join(scratch, 'data')
      stageData(options.data, staged, source)
      const inData = {
        GIT_DIR: repo,
        GIT_WORK_TREE: staged,
        GIT_INDEX_FILE: join(scratch, 'data.index'),
      }
      // Every staged file, ignored or not: data has no ignore rules of its own, and the person's global ones are about code.
      runGit(git, ['add', '-A', '--force', '--', '.'], { cwd: staged, env: inData })
      const dataTree = runGit(git, ['write-tree'], { cwd: staged, env: inData })
      refuseNestedRepositories(git, repo, dataTree, "the app's data")
      const commit = runGit(
        git,
        ['--git-dir', repo, 'commit-tree', dataTree, '-m', "The app's data"],
        {
          env: SNAPSHOT_IDENTITY,
        },
      )
      runGit(git, ['--git-dir', repo, 'update-ref', DATA_REF, commit])
    }

    const part = `${file}.part`
    rmSync(part, { force: true })
    runGit(git, ['--git-dir', repo, 'bundle', 'create', '-q', part, '--all'])
    renameSync(part, file)
  })
}

/** The name an imported app gets: the archive's file name without its extension (`My notes.acrylblend` is "My notes"). */
export function archiveName(file: string): string {
  const name = basename(file)
  return (
    extname(name) === ARCHIVE_EXTENSION ? name.slice(0, -ARCHIVE_EXTENSION.length) : name
  ).trim()
}

/** The refs a bundle carries and the commit each names, `HEAD` included when it has one. */
function bundleHeads(git: string, gitDir: string, file: string): Map<string, string> {
  const heads = new Map<string, string>()
  for (const line of runGit(git, ['--git-dir', gitDir, 'bundle', 'list-heads', file]).split('\n')) {
    const [hash, ref] = line.trim().split(/\s+/u)
    if (hash !== undefined && ref !== undefined) heads.set(ref, hash)
  }
  return heads
}

/**
 * Open `file` into an app's empty `source` folder (a fresh repository with every branch and tag, its HEAD on the archive's branch, the unsaved files back
 * as unsaved changes) and, when the archive carries data, into `data`. A file that is not an archive stops before anything is written to the source.
 */
export function importArchive(options: {
  readonly git: string
  readonly file: string
  readonly source: string
  readonly data: string
  readonly cache: string
}): void {
  const { git, file, source } = options
  if (!existsSync(file)) throw new AppInstanceError(`${file} does not exist`)
  withScratch(options.cache, (scratch) => {
    // Read and checked in a scratch repository first: a bundle git cannot verify never touches the source.
    const probe = join(scratch, 'probe.git')
    runGit(git, ['init', '-q', '--bare', probe])
    try {
      runGit(git, ['--git-dir', probe, 'bundle', 'verify', '-q', file])
    } catch {
      throw new AppInstanceError(`${basename(file)} is not an ${ARCHIVE_EXTENSION} archive`)
    }
    const heads = bundleHeads(git, probe, file)
    const branches = [...heads.keys()].filter((ref) => ref.startsWith('refs/heads/'))
    if (branches.length === 0)
      throw new AppInstanceError(`${basename(file)} holds no branch of an app`)

    runGit(git, ['init', '-q', source])
    const sourceGit = join(source, '.git')
    // The app's own repository behaves the same on every OS (app-storage.md).
    runGit(git, ['--git-dir', sourceGit, 'config', 'core.autocrlf', 'false'])
    runGit(git, ['--git-dir', sourceGit, 'config', 'core.longpaths', 'true'])
    const refspecs = ['+refs/heads/*:refs/heads/*', '+refs/tags/*:refs/tags/*']
    if (heads.has(WORKTREE_REF)) refspecs.push(`+${WORKTREE_REF}:${WORKTREE_REF}`)
    runGit(git, ['--git-dir', sourceGit, 'fetch', '-q', '--update-head-ok', file, ...refspecs])

    // HEAD on the branch the archive's HEAD named; a detached or missing HEAD takes main, else the first branch.
    const atHead = branches.filter((ref) => heads.get(ref) === heads.get('HEAD'))
    const preferMain = (refs: readonly string[]) =>
      refs.find((ref) => ref === 'refs/heads/main') ?? refs[0]
    const branch = preferMain(atHead) ?? preferMain(branches) ?? 'refs/heads/main'
    runGit(git, ['--git-dir', sourceGit, 'symbolic-ref', 'HEAD', branch])
    runGit(git, ['reset', '-q', '--hard'], { cwd: source })
    if (heads.has(WORKTREE_REF)) {
      // The snapshot's files into the working tree, then the index back to HEAD: they are unsaved changes again, as they were.
      runGit(git, ['read-tree', '-u', '--reset', WORKTREE_REF], { cwd: source })
      runGit(git, ['reset', '-q'], { cwd: source })
      runGit(git, ['--git-dir', sourceGit, 'update-ref', '-d', WORKTREE_REF])
    }

    if (heads.has(DATA_REF)) {
      const dataRepo = join(scratch, 'data.git')
      runGit(git, ['init', '-q', '--bare', dataRepo])
      runGit(git, ['--git-dir', dataRepo, 'fetch', '-q', file, `+${DATA_REF}:${DATA_REF}`])
      mkdirSync(options.data, { recursive: true })
      runGit(git, ['read-tree', '-u', '--reset', DATA_REF], {
        cwd: options.data,
        env: {
          GIT_DIR: dataRepo,
          GIT_WORK_TREE: options.data,
          GIT_INDEX_FILE: join(scratch, 'data.index'),
        },
      })
      // The data names this app's own folder, never the one it was exported from.
      const json = JSON.stringify(source).slice(1, -1)
      rewriteText(options.data, [
        [SOURCE_MARK_JSON, json],
        [SOURCE_MARK, source],
      ])
    }
  })
}
