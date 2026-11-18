/**
 * Templates from outside this package: `github:owner/repo[#ref]`, a scoped npm package (`@scope/name[@version]`) or a packed tarball on disk.
 * A source is only ever downloaded and unpacked: no git clone (hooks), no lifecycle script (`npm pack --ignore-scripts`), nothing of it is run.
 */
import { spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { PACKAGE, TEMPLATE_MANIFEST } from './names'

export type Source =
  | { kind: 'github'; owner: string; repo: string; ref: string | undefined }
  | { kind: 'npm'; spec: string }
  | { kind: 'tarball'; path: string }
  | { kind: 'folder'; path: string }

/** Where a registry can be read from: any source, or a static host that serves its `index.json` and each entry's archive under `base` (which ends in `/`). */
export type RegistrySource = Source | { kind: 'hosted'; base: string }

/** What a template says about itself in `acryl.template.json`. */
export interface Manifest {
  name: string
  description: string
  /** Library plugins the template needs, added with `acrylblends add`. */
  plugins: string[]
}

/** A source that cannot be used; the message says why and is shown as it is. */
export class SourceError extends Error {
  override name = 'SourceError'
}

export const SOURCE_FORMS = `github:owner/repo[#ref] (or the https://github.com/owner/repo address), @scope/name[@version], a packed .tgz file, or a folder (./path)`

/** How much a source may hold, and what its refusal calls it. */
interface Limits {
  readonly what: string
  readonly files: number
  readonly bytes: number
}

/**
 * A template is copied whole into the person's new app, so it is held to the size of an app's source. 64 MB, the registry's own limit for an entry: a game is
 * a whole app with its models, textures and sounds (the largest, acrylblends.action-rpg, is about 52 MB).
 */
export const TEMPLATE_LIMITS: Limits = { what: 'template', files: 5000, bytes: 64 * 1024 * 1024 }

/**
 * A registry is read for its index and one entry, and grows with every entry it publishes (100 blueprints are about 33,000 files and 200 MB), so its bound
 * only stops a runaway download; the entry taken from it is a template and is held to the template's limits.
 */
const REGISTRY_LIMITS: Limits = { what: 'registry', files: 200_000, bytes: 2 * 1024 * 1024 * 1024 }

/** Recognise a source argument, or return `undefined` when it is not one (so the caller can report a usage error). */
export function parseSource(text: string, cwd: string): Source | undefined {
  const github = /^github:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:#([A-Za-z0-9_./-]+))?$/.exec(text)
  if (github) return { kind: 'github', owner: github[1]!, repo: github[2]!, ref: github[3] }
  // A GitHub address as it is pasted from the browser: https://github.com/owner/repo, with .git or /tree/<ref> after it.
  const pasted =
    /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:\/tree\/([A-Za-z0-9_./-]+))?\/?$/.exec(
      text,
    )
  if (pasted) return { kind: 'github', owner: pasted[1]!, repo: pasted[2]!, ref: pasted[3] }
  if (text.startsWith('github:')) throw new SourceError(`"${text}" is not github:owner/repo[#ref]`)
  if (/^@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*(@[A-Za-z0-9._-]+)?$/.test(text))
    return { kind: 'npm', spec: text }
  if (text.startsWith('@')) throw new SourceError(`"${text}" is not @scope/name[@version]`)
  if (/\.(tgz|tar\.gz)$/.test(text)) {
    const path = resolve(cwd, text)
    if (!existsSync(path)) throw new SourceError(`${path} does not exist`)
    return { kind: 'tarball', path }
  }
  // A folder is only a source when it is written as a path, so a template name is never taken for one.
  if (/^(\.{1,2}[\\/]|[\\/]|[A-Za-z]:[\\/])/.test(text)) {
    const path = resolve(cwd, text)
    if (!existsSync(path) || !lstatSync(path).isDirectory())
      throw new SourceError(`${path} is not a folder`)
    return { kind: 'folder', path }
  }
  return undefined
}

/**
 * A registry, as `--registry` names it: a source, an https address, or a folder written as a bare path (`my-registry`, `run/registry`). A registry is never a template
 * name, so a path that is an existing folder is taken as one without the `./` a template source needs.
 */
export function parseRegistrySource(text: string, cwd: string): RegistrySource | undefined {
  const source = parseSource(text, cwd)
  if (source !== undefined) return source
  if (text.startsWith('https://')) return { kind: 'hosted', base: text.replace(/\/*$/, '/') }
  const path = resolve(cwd, text)
  return existsSync(path) && lstatSync(path).isDirectory() ? { kind: 'folder', path } : undefined
}

/** How the bytes of a source are obtained; real by default, replaced in tests. */
export interface Fetchers {
  /** The body at a URL (a GitHub tarball); `headers` carry the person's GitHub token for a private repository. */
  download(url: string, headers?: Readonly<Record<string, string>>): Promise<Uint8Array>
  /** The person's GitHub token (GITHUB_TOKEN, GH_TOKEN, else `gh auth token`), asked for only when a repository is not public. */
  githubToken?(): string | undefined
  /** `npm pack <spec> --ignore-scripts` into `dest`; the path of the tarball. */
  pack(spec: string, dest: string): string
}

export const realFetchers: Fetchers = {
  async download(url, headers) {
    const response = await fetch(url, {
      redirect: 'follow',
      ...(headers === undefined ? {} : { headers }),
    }).catch((cause: unknown) => {
      throw new SourceError(
        `could not reach ${url}: ${cause instanceof Error ? cause.message : String(cause)}`,
      )
    })
    if (!response.ok) throw new SourceError(`${url} answered ${response.status}`)
    return new Uint8Array(await response.arrayBuffer())
  },
  githubToken() {
    const env = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN
    if (env !== undefined && env !== '') return env
    const result = spawnSync('gh', ['auth', 'token'], { encoding: 'utf8', shell: false })
    const token = result.status === 0 ? result.stdout.trim() : ''
    return token === '' ? undefined : token
  },
  pack(spec, dest) {
    const result = spawnSync(
      'npm',
      ['pack', spec, '--ignore-scripts', '--json', '--pack-destination', dest],
      {
        encoding: 'utf8',
        shell: false,
        env: { ...process.env, npm_config_ignore_scripts: 'true' },
      },
    )
    if (result.status !== 0)
      throw new SourceError(
        `npm could not pack ${spec}: ${(result.stderr || result.stdout).trim().split('\n').at(-1)}`,
      )
    const file = (JSON.parse(result.stdout) as { filename: string }[])[0]?.filename
    if (!file) throw new SourceError(`npm packed nothing for ${spec}`)
    return join(dest, file)
  },
}

/**
 * Windows' own tar (bsdtar, in every Windows 10 and 11). A bare `tar` there can be Git's GNU tar, first on PATH when Git's Unix tools are
 * installed, which reads `C:\...` as host `C` and fails on every archive.
 */
export function tarCommand(
  platform: NodeJS.Platform = process.platform,
  systemRoot = process.env.SystemRoot,
): string {
  return platform === 'win32' ? join(systemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar'
}

/** Unpack a tarball into `dir`, dropping its single top folder; refuses links, paths that leave the folder, and archives over `limits`. */
function extract(tarball: string, dir: string, limits: Limits): void {
  const tar = tarCommand()
  const list = spawnSync(tar, ['-tzf', tarball], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  })
  if (list.status !== 0) throw new SourceError(`${tarball} is not a readable tar.gz archive`)
  const entries = list.stdout.split('\n').filter(Boolean)
  if (entries.length > limits.files)
    throw new SourceError(`the ${limits.what} has more than ${limits.files} files`)
  for (const entry of entries)
    if (entry.startsWith('/') || entry.split('/').includes('..'))
      throw new SourceError(`the archive holds a path that leaves its folder: ${entry}`)
  mkdirSync(dir, { recursive: true })
  const run = spawnSync(tar, ['-xzf', tarball, '-C', dir, '--strip-components=1'], {
    encoding: 'utf8',
  })
  if (run.status !== 0) throw new SourceError(`could not unpack ${tarball}: ${run.stderr.trim()}`)
  checkTree(dir, limits)
}

/** Refuse a tree that holds a link, or is larger than `limits`; the same check for an unpacked archive and a copied folder. */
function checkTree(dir: string, limits: Limits): void {
  let bytes = 0
  let count = 0
  const walk = (folder: string) => {
    for (const entry of readdirSync(folder)) {
      const path = join(folder, entry)
      const info = lstatSync(path)
      if (info.isSymbolicLink())
        throw new SourceError(
          `the ${limits.what} holds a symbolic link (${path.slice(dir.length + 1)}); links are not allowed`,
        )
      if (info.isDirectory()) walk(path)
      else {
        bytes += info.size
        count += 1
      }
    }
  }
  walk(dir)
  if (count > limits.files)
    throw new SourceError(`the ${limits.what} has more than ${limits.files} files`)
  if (bytes > limits.bytes)
    throw new SourceError(`the ${limits.what} is larger than ${limits.bytes / 1024 / 1024} MB`)
}

/** Download or pack a template and unpack it into `dir` (which must not exist yet). Nothing in it is run. */
export const fetchTemplate = (source: Source, dir: string, scratch: string, fetchers: Fetchers) =>
  fetchSource(source, dir, scratch, fetchers, TEMPLATE_LIMITS)

/** Download or copy a registry into `dir` (which must not exist yet), to read its index and take one entry from it. Nothing in it is run. */
export const fetchRegistry = (source: Source, dir: string, scratch: string, fetchers: Fetchers) =>
  fetchSource(source, dir, scratch, fetchers, REGISTRY_LIMITS)

async function fetchSource(
  source: Source,
  dir: string,
  scratch: string,
  fetchers: Fetchers,
  limits: Limits,
): Promise<void> {
  mkdirSync(scratch, { recursive: true })
  if (source.kind === 'folder') {
    cpSync(source.path, dir, {
      recursive: true,
      filter: (path) => !/[\\/](\.git|node_modules)([\\/]|$)/.test(path.slice(source.path.length)),
    })
    checkTree(dir, limits)
    return
  }
  let tarball: string
  if (source.kind === 'tarball') tarball = source.path
  else if (source.kind === 'npm') tarball = fetchers.pack(source.spec, scratch)
  else {
    tarball = join(scratch, 'source.tar.gz')
    writeFileSync(tarball, await downloadGithub(source, fetchers))
  }
  extract(tarball, dir, limits)
}

/**
 * A GitHub repository's tarball: anonymously first, then, when GitHub says there is none (a private repository looks absent), with the person's
 * own GitHub login, so the owner and the people invited to a privately shared app can make an app from it.
 */
async function downloadGithub(
  source: { readonly owner: string; readonly repo: string; readonly ref?: string | undefined },
  fetchers: Fetchers,
): Promise<Uint8Array> {
  const name = `github:${source.owner}/${source.repo}`
  try {
    return await fetchers.download(
      `https://codeload.github.com/${source.owner}/${source.repo}/tar.gz/${source.ref ?? 'HEAD'}`,
    )
  } catch (cause) {
    if (!(cause instanceof SourceError && / answered 404$/u.test(cause.message))) throw cause
    const token = fetchers.githubToken?.()
    if (token === undefined)
      throw new SourceError(
        `${name} was not found: it does not exist, or it is private. For a private one you were invited to, sign in to GitHub first (gh auth login, or set GITHUB_TOKEN) and run this again`,
      )
    try {
      return await fetchers.download(
        `https://api.github.com/repos/${source.owner}/${source.repo}/tarball${source.ref === undefined ? '' : `/${source.ref}`}`,
        { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      )
    } catch (signedIn) {
      if (signedIn instanceof SourceError && / answered 404$/u.test(signedIn.message))
        throw new SourceError(
          `${name} was not found, and your GitHub account has no access to it: check the name, or ask its owner to invite you`,
        )
      throw signedIn
    }
  }
}

/** Read and check `acryl.template.json`; a source without it is not a template. */
export function readManifest(dir: string): Manifest {
  const file = join(dir, TEMPLATE_MANIFEST)
  if (!existsSync(file))
    throw new SourceError(
      `this source has no ${TEMPLATE_MANIFEST}, so it is not a template: add one with a name and a description (see the create-acrylblends guide)`,
    )
  let data: unknown
  try {
    data = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    throw new SourceError(`${TEMPLATE_MANIFEST} is not valid JSON`)
  }
  const m = data as Record<string, unknown>
  if (typeof m.name !== 'string' || m.name.trim() === '')
    throw new SourceError(`${TEMPLATE_MANIFEST} needs a "name"`)
  if (typeof m.description !== 'string')
    throw new SourceError(`${TEMPLATE_MANIFEST} needs a "description"`)
  const plugins = m.plugins ?? []
  if (
    !Array.isArray(plugins) ||
    plugins.some((p) => typeof p !== 'string' || !/^[a-z][a-z0-9-]*$/.test(p))
  )
    throw new SourceError(
      `"plugins" in ${TEMPLATE_MANIFEST} is a list of plugin names such as "desktop"`,
    )
  return { name: m.name, description: m.description, plugins: plugins as string[] }
}

const SKIP = new Set(['.git', 'node_modules', TEMPLATE_MANIFEST])
const GIT_ATTRIBUTES =
  '# Every checkout has the same line endings, on every OS.\n* text=auto eol=lf\n'
/** Lifecycle scripts npm runs on `npm install` in the app's own folder. */
export const LIFECYCLE = [
  'preinstall',
  'install',
  'postinstall',
  'prepublish',
  'preprepare',
  'prepare',
  'postprepare',
]

const isText = (buffer: Buffer) => !buffer.subarray(0, 8000).includes(0)

/**
 * Copy the unpacked template into `target`, replacing the placeholders of the built-in templates, naming the app, and pointing a dependency on the framework at
 * the release this package carries. Returns the files written (relative paths) and the lifecycle scripts the app's package.json defines.
 */
export function writeTemplate(
  from: string,
  target: string,
  stamp: (text: string) => string,
  range: string,
  name: string,
): { files: string[]; lifecycle: Record<string, string> } {
  const files: string[] = []
  const walk = (src: string, dst: string, prefix: string) => {
    mkdirSync(dst, { recursive: true })
    for (const entry of readdirSync(src, { withFileTypes: true })) {
      if (SKIP.has(entry.name)) continue
      const outName = prefix === '' && entry.name === 'gitignore' ? '.gitignore' : entry.name
      if (entry.isDirectory())
        walk(join(src, entry.name), join(dst, outName), `${prefix}${entry.name}/`)
      else {
        const buffer = readFileSync(join(src, entry.name))
        writeFileSync(join(dst, outName), isText(buffer) ? stamp(buffer.toString('utf8')) : buffer)
        files.push(`${prefix}${outName}`)
      }
    }
  }
  walk(from, target, '')
  // An app's plugins are identified by every byte, so a CRLF checkout would make them different plugins. An entry made before make-entry wrote this file
  // has none; one that has its own keeps it.
  if (!existsSync(join(target, '.gitattributes'))) {
    writeFileSync(join(target, '.gitattributes'), GIT_ATTRIBUTES)
    files.push('.gitattributes')
  }
  const lifecycle: Record<string, string> = {}
  const pkgFile = join(target, 'package.json')
  if (existsSync(pkgFile)) {
    const pkg = JSON.parse(readFileSync(pkgFile, 'utf8')) as {
      name?: string
      scripts?: Record<string, string>
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    pkg.name = name
    for (const group of [pkg.dependencies, pkg.devDependencies])
      if (group?.[PACKAGE] !== undefined) group[PACKAGE] = range
    writeFileSync(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`)
    for (const script of LIFECYCLE)
      if (typeof pkg.scripts?.[script] === 'string') lifecycle[script] = pkg.scripts[script]
  }
  return { files, lifecycle }
}

/** Remove a folder tree quietly. */
export const removeTree = (path: string) => rmSync(path, { recursive: true, force: true })
export { cpSync }
