import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const API = 'https://api.github.com/repos/acryldev/acryl/releases/tags'

function fail(message) { throw new Error(`acryl desktop: ${message}`) }

export function managedDesktopRoot(env = process.env) {
  if (env.ACRYL_DESKTOP_HOME) return env.ACRYL_DESKTOP_HOME
  if (process.platform === 'win32') return join(env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'Acryl', 'desktop')
  return join(env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'acryl', 'desktop')
}

function installerExt() {
  if (process.platform === 'darwin') return '.dmg'
  if (process.platform === 'linux') return '.deb'
  if (process.platform === 'win32') return '.exe'
  fail(`unsupported platform: ${process.platform}`)
}

function archHint() {
  if (process.arch === 'arm64') return ['arm64', 'aarch64', 'universal']
  return ['x64', 'amd64', 'x86_64']
}

/** Pick the installer asset for the current platform/arch from a desktop release. */
export function selectDesktopInstaller(release, { platform = process.platform, arch = process.arch } = {}) {
  if (!release || !Array.isArray(release.assets)) fail('desktop release is malformed')
  const ext = installerExt()
  const archs = archHint()
  let candidates = release.assets.filter(asset => asset && typeof asset.name === 'string' && asset.name.endsWith(ext))
  // Prefer the arch whose name mentions our arch; else prefer the universal one.
  const prefer = candidates.filter(asset => archs.some(hint => asset.name.includes(hint)))
  const chosen = prefer[0] ?? candidates[0]
  if (!chosen) fail(`release has no ${ext} installer for ${platform}-${arch}`)
  return { name: chosen.name, url: chosen.browser_download_url, size: chosen.size }
}

function downloadUrl(base) {
  return join(base, 'release', 'download')
}

function defaultDownload(url) {
  return fetch(url, { redirect: 'follow' }).then(async res => {
    if (!res.ok) fail(`desktop installer download failed: ${res.status} ${res.statusText}`)
    return Buffer.from(await res.arrayBuffer())
  })
}

/** Download the matching desktop installer into the managed cache and return its path. */
export async function acquireDesktopInstaller({ version, download = defaultDownload, open }) {
  const tag = `desktop-v${version}`
  const response = await fetch(`${API}/${tag}`, { headers: { Accept: 'application/vnd.github+json' } })
  if (!response.ok) fail(`desktop release ${tag} not found (${response.status})`)
  const release = await response.json()
  const installer = selectDesktopInstaller(release)
  const root = managedDesktopRoot()
  const dir = join(root, version)
  mkdirSync(dir, { recursive: true })
  const target = join(dir, installer.name)
  if (!existsSync(target)) {
    const bytes = await download(installer.url)
    writeFileSync(target, Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes))
  }
  if (typeof open === 'function') await open(target)
  return { path: target, version, size: installer.size }
}
