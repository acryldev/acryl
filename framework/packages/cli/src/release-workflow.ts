/**
 * `acrylblends release-workflow`: the GitHub Actions workflow that turns an app's repository into a download page (spec 052 T061, Share with team).
 * A tag `v<version>` pushed to the repository builds the app's installers on GitHub's runners (a DMG for macOS arm64 and x64, an NSIS .exe for
 * Windows x64, a Debian package and a portable .tar.gz with a PKGBUILD for Linux x64) with `acrylblends pack`, and publishes them as the repository's
 * Latest release: the link a person sends to someone without git or Node. It is ACRYL Control Center's own release workflow (acrylblends/
 * 63-acryl-control-center, proven on every runner below), without its Windows signing (an app has no SignPath project of its own).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { UsageError } from './init'
import type { Io } from './io'
import { VERSION } from './version'

/** Where the workflow is written in an app. */
export const RELEASE_WORKFLOW = join('.github', 'workflows', 'release.yml')

/**
 * The workflow's text for `product` (the name the installers and the release carry), packed with `@acryldev/blends@<blends>`. The name reaches the
 * shell only through the PRODUCT variable, never inside a command line, so a name with quotes or `$` stays a name.
 */
export function releaseWorkflow(product: string, blends: string = VERSION): string {
  if (product.trim() === '') throw new UsageError('the product name is empty')
  const name = JSON.stringify(product.trim())
  return `name: Release

# This app as installers for every computer, made by acrylblends release-workflow (@acryldev/blends ${blends}): a DMG (macOS arm64 and x64), an NSIS
# installer (Windows x64), a Debian package and a portable tarball with a PKGBUILD (Linux x64), each carrying everything the app needs. A tag
# v<version> publishes them as this repository's Latest release: its page is the link to send. Run by hand, it builds them as workflow artifacts only.
on:
  push:
    tags: ['v*']
  workflow_dispatch:

permissions:
  contents: read

env:
  ACRYLBLENDS: '@acryldev/blends@${blends}'
  PRODUCT: ${name}

jobs:
  pack:
    name: pack (\${{ matrix.platform }} \${{ matrix.arch }})
    runs-on: \${{ matrix.os }}
    timeout-minutes: 100
    strategy:
      fail-fast: false
      matrix:
        include:
          - { os: macos-15, platform: mac, arch: arm64 }
          - { os: macos-15-intel, platform: mac, arch: x64 }
          - { os: windows-latest, platform: win, arch: x64 }
          - { os: ubuntu-24.04, platform: linux, arch: x64 }
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
        with:
          path: app
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4
        with:
          node-version: 24
      # A Debian package is built with fakeroot and dpkg; the hosted image has dpkg, not always fakeroot.
      - if: matrix.platform == 'linux'
        run: sudo apt-get update && sudo apt-get install -y fakeroot
      # The installed app's About shows its package version: a release carries its tag's (v1.2.0 -> 1.2.0).
      - name: Version from the tag
        if: github.event_name == 'push'
        working-directory: app
        shell: bash
        run: npm pkg set version="\${GITHUB_REF_NAME#v}"
      - name: Pack
        shell: bash
        run: npx --yes "$ACRYLBLENDS" pack --from app --product "$PRODUCT" --arch \${{ matrix.arch }} --out out
      - uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4
        with:
          name: \${{ matrix.platform }}-\${{ matrix.arch }}
          path: out/*
          if-no-files-found: error

  release:
    needs: pack
    if: github.event_name == 'push'
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093 # v4
        with:
          path: out
          merge-multiple: true
      - name: PKGBUILD for Arch Linux
        run: npx --yes "$ACRYLBLENDS" pkgbuild --dir out --product "$PRODUCT" --version "\${GITHUB_REF_NAME#v}" --repo "$GITHUB_REPOSITORY"
      - name: Publish the release as Latest
        env:
          GH_TOKEN: \${{ github.token }}
        run: |
          if gh release view "$GITHUB_REF_NAME" --repo "$GITHUB_REPOSITORY" >/dev/null 2>&1; then
            gh release upload "$GITHUB_REF_NAME" out/* --repo "$GITHUB_REPOSITORY" --clobber
          else
            gh release create "$GITHUB_REF_NAME" out/* --repo "$GITHUB_REPOSITORY" --latest --title "$PRODUCT $GITHUB_REF_NAME" \\
              --notes "$PRODUCT $GITHUB_REF_NAME, ready to install. First start: on macOS the app is not signed, so right-click it and choose Open; on Windows, if SmartScreen asks, click More info and then Run anyway; on Linux, double-click the .deb to open it in the Software app."
          fi
          gh release edit "$GITHUB_REF_NAME" --repo "$GITHUB_REPOSITORY" --latest >/dev/null
`
}

/** The name an app's `blend.yaml` gives it (`metadata.name`), or undefined. */
export function productOfApp(yaml: string): string | undefined {
  const name = /^ {2}name:\s*(.+?)\s*$/mu.exec(yaml)?.[1]
  return name === undefined ? undefined : name.replace(/^(['"])(.*)\1$/u, '$2').trim() || undefined
}

export interface ReleaseWorkflowOptions {
  readonly directory: string | undefined
  readonly product: string | undefined
  readonly force: boolean
}

export function parseReleaseWorkflowOptions(argv: readonly string[]): ReleaseWorkflowOptions {
  try {
    const { values } = parseArgs({
      args: [...argv],
      options: { dir: { type: 'string' }, product: { type: 'string' }, force: { type: 'boolean' } },
      strict: true,
      allowPositionals: false,
    })
    return { directory: values.dir, product: values.product, force: values.force === true }
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error))
  }
}

/** Write the workflow into the app; an existing one is kept unless `force` (it may be the app's own, changed by its owner). */
export function writeReleaseWorkflow(options: ReleaseWorkflowOptions, io: Io): number {
  const app = resolve(io.cwd, options.directory ?? '.')
  const manifest = join(app, 'blend.yaml')
  const product =
    options.product ??
    (existsSync(manifest) ? productOfApp(readFileSync(manifest, 'utf8')) : undefined)
  if (product === undefined)
    throw new Error(
      `${app} names no product: pass --product "Name" (or give blend.yaml a metadata name)`,
    )
  const file = join(app, RELEASE_WORKFLOW)
  if (existsSync(file) && !options.force) {
    io.stdout.write(`${RELEASE_WORKFLOW} is already there; kept (pass --force to replace it)\n`)
    return 0
  }
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, releaseWorkflow(product))
  io.stdout.write(
    `wrote ${RELEASE_WORKFLOW}: a tag v<version> pushed to GitHub builds ${product}'s installers and publishes them as the Latest release\n`,
  )
  return 0
}
