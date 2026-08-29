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

export async function syncReleaseReadme(root, tag) {
  const version = versionFromTag(tag)
  const readmePaths = ['README.md', 'README.en.md']
  const assetBase = `${repository}/releases/download/${tag}`

  for (const relativePath of readmePaths) {
    const path = resolve(root, relativePath)
    let text = await readFile(path, 'utf8')
    text = replaceRequired(text, /Download v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?/, `Download ${tag}`, relativePath)
    text = replaceRequired(text, /## (?:Download|Install) ACRYL v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?/, `## Install ACRYL ${tag}`, relativePath)
    text = text.replaceAll(/https:\/\/github\.com\/acryldev\/acryl\/releases\/tag\/v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?/g, `${repository}/releases/tag/${tag}`)
    text = text.replaceAll(/https:\/\/github\.com\/acryldev\/acryl\/releases\/download\/v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?/g, assetBase)
    text = text.replaceAll(/ACRYL-\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?-arm64\.dmg/g, `ACRYL-${version}-arm64.dmg`)
    text = text.replaceAll(/ACRYL-\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?-x64-Setup\.exe/g, `ACRYL-${version}-x64-Setup.exe`)
    text = text.replaceAll(/ACRYL-\d+\.\d+\.\d+(?:-(?!arm64\.dmg)[0-9A-Za-z.]+)?\.dmg/g, `ACRYL-${version}.dmg`)
    text = text.replaceAll(/dsh-plugin-desktop_\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?_amd64\.deb/g, `dsh-plugin-desktop_${version}_amd64.deb`)
    text = text.replaceAll(/dsh-plugin-desktop_\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?_arm64\.deb/g, `dsh-plugin-desktop_${version}_arm64.deb`)
    await writeFile(path, text)
  }

  const zhPath = resolve(root, 'README.zh.md')
  let zh = await readFile(zhPath, 'utf8')
  zh = replaceRequired(zh, /ACRYL v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)? GitHub Release/, `ACRYL ${tag} GitHub Release`, 'README.zh.md')
  zh = zh.replaceAll(/https:\/\/github\.com\/acryldev\/acryl\/releases\/tag\/v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?/g, `${repository}/releases/tag/${tag}`)
  zh = zh.replaceAll(/https:\/\/github\.com\/acryldev\/acryl\/releases\/download\/v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?/g, assetBase)
  zh = zh.replaceAll(/ACRYL-\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?-arm64\.dmg/g, `ACRYL-${version}-arm64.dmg`)
  zh = zh.replaceAll(/ACRYL-\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?-x64-Setup\.exe/g, `ACRYL-${version}-x64-Setup.exe`)
  zh = zh.replaceAll(/ACRYL-\d+\.\d+\.\d+(?:-(?!arm64\.dmg)[0-9A-Za-z.]+)?\.dmg/g, `ACRYL-${version}.dmg`)
  zh = zh.replaceAll(/dsh-plugin-desktop_\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?_amd64\.deb/g, `dsh-plugin-desktop_${version}_amd64.deb`)
  zh = zh.replaceAll(/dsh-plugin-desktop_\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?_arm64\.deb/g, `dsh-plugin-desktop_${version}_arm64.deb`)
  await writeFile(zhPath, zh)

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
