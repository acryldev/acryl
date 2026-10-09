import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repository = 'https://github.com/acryldev/acryl'

function versionFromTag(tag) {
  if (!/^v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(tag)) {
    throw new Error(`Expected a semver Git tag such as v0.1.0, received ${tag}`)
  }
  return tag.slice(1)
}

function replaceRequired(text, pattern, replacement, path) {
  if (!pattern.test(text)) throw new Error(`Release README marker not found in ${path}`)
  return text.replace(pattern, replacement)
}

function gitBlobHash(path, cwd) {
  return execFileSync('git', ['hash-object', path], { cwd, encoding: 'utf8' }).trim()
}

const VERSION = String.raw`\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?`

/** The installer platforms the Desktop build publishes, with Linux named for the Debian architectures (`amd64`, `arm64`), not for Node's (`x64`). */
const DESKTOP_PLATFORMS = Object.freeze(['mac-arm64', 'mac-x64', 'win-x64', 'linux-amd64', 'linux-arm64'])
const DESKTOP_EXTENSION = Object.freeze({ mac: 'dmg', win: 'exe', linux: 'deb' })

/**
 * The installer file names a release publishes (`build.*.artifactName` in apps/acryl-desktop/package.json): `acryl-desktop-<platform>-v<version>.<ext>`, so a
 * downloaded file says which release it came from.
 * @param {string} tag Release tag such as `v0.2.2`.
 */
export function desktopAssetNames(tag) {
  return DESKTOP_PLATFORMS.map(platform => `acryl-desktop-${platform}-${tag}.${DESKTOP_EXTENSION[platform.split('-')[0]]}`)
}

/**
 * Point every release link in a README at the release `tag`. The CLI and Web archives and the Desktop installers are all assets of the one `v<version>` release
 * (up to 0.2.1 the installers sat in a separate `desktop-v<version>` release; those links are migrated), and older spellings of the installer names (versioned, or
 * `dsh-plugin-desktop_...`) become the versioned ones, `acryl-desktop-<platform>-v<version>.<ext>`.
 * @param {string} text README text.
 * @param {string} tag Release tag such as `v0.2.1`.
 */
export function rewriteReleaseLinks(text, tag) {
  const assetBase = `${repository}/releases/download/${tag}`
  const next = text
    .replaceAll(new RegExp(`${repository.replaceAll('/', '\\/')}\\/releases\\/tag\\/(?:desktop-)?v${VERSION}`, 'g'), `${repository}/releases/tag/${tag}`)
    .replaceAll(new RegExp(`${repository.replaceAll('/', '\\/')}\\/releases\\/download\\/(?:desktop-)?v${VERSION}`, 'g'), assetBase)
    // Installer names: older versioned and misnamed spellings become the constant names the Desktop release publishes.
    .replaceAll(/ACRYL-\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?-arm64\.dmg/g, 'acryl-desktop-mac-arm64.dmg')
    .replaceAll(/ACRYL-\d+\.\d+\.\d+(?:-(?!arm64\.dmg)[0-9A-Za-z.]+)?\.dmg/g, 'acryl-desktop-mac-x64.dmg')
    .replaceAll(/ACRYL-\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?-x64-Setup\.exe/g, 'acryl-desktop-win-x64.exe')
    .replaceAll(/(?:dsh-plugin-desktop|acryl-desktop)_\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?_amd64\.deb/g, 'acryl-desktop-linux-amd64.deb')
    .replaceAll(/(?:dsh-plugin-desktop|acryl-desktop)_\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?_arm64\.deb/g, 'acryl-desktop-linux-arm64.deb')
    .replaceAll('acryl-desktop-linux-x64.deb', 'acryl-desktop-linux-amd64.deb')
  // Every installer name, whatever spelling it had (constant or with an older version), becomes this release's.
  return next.replaceAll(
    new RegExp(`acryl-desktop-(${DESKTOP_PLATFORMS.join('|')})(?:-v${VERSION})?\\.(dmg|exe|deb)`, 'g'),
    (_all, platform, extension) => `acryl-desktop-${platform}-${tag}.${extension}`,
  )
}

export async function syncReleaseReadme(root, tag) {
  versionFromTag(tag)
  const readmePaths = ['README.md', 'README.en.md']

  for (const relativePath of readmePaths) {
    const path = resolve(root, relativePath)
    let text = await readFile(path, 'utf8')
    text = replaceRequired(text, /Download v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?/, `Download ${tag}`, relativePath)
    text = replaceRequired(text, /## (?:Download|Install) ACRYL v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?/, `## Install ACRYL ${tag}`, relativePath)
    await writeFile(path, rewriteReleaseLinks(text, tag))
  }

  const zhPath = resolve(root, 'README.zh.md')
  let zh = await readFile(zhPath, 'utf8')
  zh = replaceRequired(zh, /ACRYL v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)? GitHub Release/, `ACRYL ${tag} GitHub Release`, 'README.zh.md')
  await writeFile(zhPath, rewriteReleaseLinks(zh, tag))

  const readmeHash = gitBlobHash('README.md', root)
  const englishHash = gitBlobHash('README.en.md', root)
  const metadataPath = resolve(root, 'README.i18n.yaml')
  let metadata = await readFile(metadataPath, 'utf8')
  metadata = replaceRequired(metadata, /README\.md: [0-9a-f]+/, `README.md: ${readmeHash}`, 'README.i18n.yaml')
  metadata = replaceRequired(metadata, /README\.en\.md: [0-9a-f]+/, `README.en.md: ${englishHash}`, 'README.i18n.yaml')
  await writeFile(metadataPath, metadata)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const tag = process.argv[2]
  if (tag === undefined) throw new Error('Usage: node scripts/sync-release-readme.mjs <tag>')
  await syncReleaseReadme(resolve(dirname(fileURLToPath(import.meta.url)), '..'), tag)
}
