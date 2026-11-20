// The programs ACRYL apps need, for a person who never installed any (spec 051 Phase 4, workshop 2026-11-20): Node.js 22.19 or later (with npm
// and npx) and GitHub's `gh`. When the computer has none, or too old a Node, they are fetched once from their makers' own releases (nodejs.org,
// github.com/cli/cli), checked against the SHA-256 list published beside them, and unpacked into `<home>/tools/`. Every app the launcher starts
// then finds them first on PATH. A computer that already has them downloads nothing. Home is a parameter, as in model-key.js.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'

export const TOOLS_FOLDER = 'tools'
/** The oldest Node.js ACRYL apps run on (acrylblends checks the same at create). */
export const NODE_MINIMUM = Object.freeze([22, 19])
/** The Node.js line fetched when the computer has none: its newest release. */
const NODE_LINE = 24

/** `22.19.0` or `v24.1.0` is new enough; anything else (or nothing) is not. */
export function nodeIsNewEnough(version) {
  const match = /^v?(\d+)\.(\d+)/u.exec(String(version ?? '').trim())
  if (match === null) return false
  const major = Number(match[1])
  const minor = Number(match[2])
  return major > NODE_MINIMUM[0] || (major === NODE_MINIMUM[0] && minor >= NODE_MINIMUM[1])
}

const exe = (name, platform) => (platform === 'win32' ? `${name}.exe` : name)

/** Where each tool's programs are, once fetched: Node's folder holds node.exe on Windows and bin/node elsewhere; gh's always bin/gh. */
export function toolDirs(home, platform = process.platform) {
  const node = join(home, TOOLS_FOLDER, 'node')
  return {
    node: platform === 'win32' ? node : join(node, 'bin'),
    gh: join(home, TOOLS_FOLDER, 'gh', 'bin'),
  }
}

/** The environment with the fetched tools first on PATH (only those that are there). Windows names the variable `Path`; its spelling is kept. */
export function toolsEnv(home, env, platform = process.platform) {
  const dirs = Object.values(toolDirs(home, platform)).filter(dir => existsSync(dir))
  if (dirs.length === 0) return { ...env }
  const key = Object.keys(env).find(name => name.toUpperCase() === 'PATH') ?? 'PATH'
  const sep = platform === 'win32' ? ';' : delimiter
  const have = (env[key] ?? '').split(sep).filter(dir => dir !== '' && !dirs.includes(dir))
  return { ...env, [key]: [...dirs, ...have].join(sep) }
}

/** The first line `program --version` prints in this environment, or undefined when it does not run. */
export function versionOf(program, env, platform = process.platform) {
  const result = spawnSync(program, ['--version'], { env, encoding: 'utf8', windowsHide: true, shell: platform === 'win32', timeout: 20_000 })
  return result.status === 0 ? String(result.stdout).trim().split(/\r?\n/u)[0] : undefined
}

async function bytes(url, fetchImpl) {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(300_000), headers: { 'User-Agent': 'acryl-launcher' } })
  if (!response.ok) throw new Error(`${url} answered HTTP ${String(response.status)}`)
  return Buffer.from(await response.arrayBuffer())
}

/** The SHA-256 a published `SHASUMS256.txt` / `checksums.txt` lists for `file`. */
export function listedSum(sums, file) {
  for (const line of String(sums).split(/\r?\n/u)) {
    const [sum, name] = line.trim().split(/\s+\*?/u)
    if (name === file && /^[0-9a-f]{64}$/u.test(sum ?? '')) return sum
  }
  return undefined
}

/** Download `url`, refuse it unless its SHA-256 is the one listed, unpack it with the system tar, and move `pick(unpacked)` to `target`. */
async function install({ url, file, sums, target, pick, fetchImpl }) {
  const expected = listedSum(sums, file)
  if (expected === undefined) throw new Error(`no checksum is published for ${file}`)
  const data = await bytes(url, fetchImpl)
  const actual = createHash('sha256').update(data).digest('hex')
  if (actual !== expected) throw new Error(`${file} does not match its published checksum: nothing was installed`)
  const work = `${target}.${String(process.pid)}.part`
  rmSync(work, { recursive: true, force: true })
  mkdirSync(work, { recursive: true })
  const archive = join(work, file)
  writeFileSync(archive, data)
  // tar unpacks .tar.gz everywhere and .zip on macOS and Windows 10+ (bsdtar); Linux gets .tar.gz only.
  const unpacked = spawnSync('tar', ['-xf', archive, '-C', work], { windowsHide: true, encoding: 'utf8' })
  if (unpacked.status !== 0) throw new Error(`could not unpack ${file}: ${String(unpacked.stderr || unpacked.error?.message || '').trim()}`)
  rmSync(archive, { force: true })
  const folder = pick(work)
  if (folder === undefined) throw new Error(`${file} did not hold what was expected`)
  rmSync(target, { recursive: true, force: true })
  renameSync(folder, target)
  rmSync(work, { recursive: true, force: true })
}

const NODE_PLATFORM = { darwin: 'darwin', linux: 'linux', win32: 'win' }
const NODE_ARCH = { arm64: 'arm64', x64: 'x64' }

/** Fetch Node.js (newest of its line) into `<home>/tools/node` unless it is there. Returns the folder that holds the node program. */
export async function installNode(home, { platform = process.platform, arch = process.arch, fetchImpl = fetch } = {}) {
  const dirs = toolDirs(home, platform)
  if (existsSync(join(dirs.node, exe('node', platform)))) return dirs.node
  const os = NODE_PLATFORM[platform]
  const cpu = NODE_ARCH[arch]
  if (os === undefined || cpu === undefined) throw new Error(`no Node.js build for ${platform} ${arch}`)
  const index = JSON.parse((await bytes('https://nodejs.org/dist/index.json', fetchImpl)).toString('utf8'))
  const release = index.find(entry => typeof entry.version === 'string' && entry.version.startsWith(`v${String(NODE_LINE)}.`))
  if (release === undefined) throw new Error(`nodejs.org lists no Node.js ${String(NODE_LINE)} release`)
  const base = `https://nodejs.org/dist/${release.version}/`
  const name = `node-${release.version}-${os}-${cpu}`
  const file = platform === 'win32' ? `${name}.zip` : `${name}.tar.gz`
  const sums = (await bytes(`${base}SHASUMS256.txt`, fetchImpl)).toString('utf8')
  mkdirSync(join(home, TOOLS_FOLDER), { recursive: true })
  await install({ url: base + file, file, sums, target: join(home, TOOLS_FOLDER, 'node'), pick: work => (existsSync(join(work, name)) ? join(work, name) : undefined), fetchImpl })
  return dirs.node
}

const GH_PLATFORM = { darwin: 'macOS', linux: 'linux', win32: 'windows' }
const GH_ARCH = { arm64: 'arm64', x64: 'amd64' }

/** The folder under `work` whose bin/ holds gh (the archives differ: a named top folder on macOS and Linux, none on Windows). */
function ghFolder(work, platform) {
  const has = dir => existsSync(join(dir, 'bin', exe('gh', platform)))
  if (has(work)) return work
  for (const name of readdirSync(work)) if (has(join(work, name))) return join(work, name)
  return undefined
}

/** Fetch GitHub's `gh` (its latest release) into `<home>/tools/gh` unless it is there. Returns the folder that holds the gh program. */
export async function installGh(home, { platform = process.platform, arch = process.arch, fetchImpl = fetch } = {}) {
  const dirs = toolDirs(home, platform)
  if (existsSync(join(dirs.gh, exe('gh', platform)))) return dirs.gh
  const os = GH_PLATFORM[platform]
  const cpu = GH_ARCH[arch]
  if (os === undefined || cpu === undefined) throw new Error(`no gh build for ${platform} ${arch}`)
  const latest = JSON.parse((await bytes('https://api.github.com/repos/cli/cli/releases/latest', fetchImpl)).toString('utf8'))
  const version = String(latest.tag_name ?? '').replace(/^v/u, '')
  if (!/^\d+\.\d+\.\d+$/u.test(version)) throw new Error('github.com/cli/cli gave no release version')
  const file = `gh_${version}_${os}_${cpu}.${platform === 'linux' ? 'tar.gz' : 'zip'}`
  const base = `https://github.com/cli/cli/releases/download/v${version}/`
  const sums = (await bytes(`${base}gh_${version}_checksums.txt`, fetchImpl)).toString('utf8')
  mkdirSync(join(home, TOOLS_FOLDER), { recursive: true })
  await install({ url: base + file, file, sums, target: join(home, TOOLS_FOLDER, 'gh'), pick: work => ghFolder(work, platform), fetchImpl })
  return dirs.gh
}

/**
 * Make sure apps started with `toolsEnv(home, env)` find a new enough Node.js (with npm) and gh: fetch whichever is missing. Returns what
 * was fetched; throws with the reason when a needed tool could not be had (the computer's own tools are never changed).
 */
export async function prepareTools(home, env, options = {}) {
  const platform = options.platform ?? process.platform
  const fetched = []
  const withTools = () => toolsEnv(home, env, platform)
  if (!nodeIsNewEnough(versionOf('node', withTools(), platform)) || versionOf('npm', withTools(), platform) === undefined) {
    await installNode(home, options)
    fetched.push('node')
  }
  if (versionOf('gh', withTools(), platform) === undefined) {
    await installGh(home, options)
    fetched.push('gh')
  }
  return fetched
}
