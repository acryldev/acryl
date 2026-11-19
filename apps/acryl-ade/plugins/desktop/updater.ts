/**
 * Over-the-air update of a packed product (ACRYL Control Center, ACRYL ADE, any Blend packed with pack-blank-mac): the app asks its own GitHub repository for
 * the latest release, offers it when it is newer than the running version, downloads this OS's installer, checks its SHA-256 against the digest GitHub
 * publishes, and hands over to a small installer step after the app quits. Nothing is deleted or reinstalled by hand, and the person's apps and data
 * (under ~/.acryl) are never touched: only the program in /Applications (or the Windows install folder) is replaced.
 *
 * The flow (check, download after a yes, install after a second yes) is DeepSeek Harness's DesktopUpdateCoordinator. Its install step, electron-updater,
 * needs a Developer ID signed app on macOS (Squirrel.Mac refuses an ad hoc seal), so the macOS install is the bundle swap a person would do: wait for the
 * app to quit, mount the DMG, replace the bundle, open it again. On Windows the NSIS installer runs silently over the installed copy and starts the app.
 * On Linux a .deb needs root, so the file is downloaded and shown with the one command that installs it.
 */

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createWriteStream, mkdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { bundleOf } from './brand.ts'

/** Where a product's releases are: product.json `releases`, written by the packer from the Blend's GitHub remote. */
export interface ReleaseSource {
  /** `owner/repo` on GitHub. */
  readonly repo: string
  /** The installer files' name stem (`ACRYL-Control-Center`): an asset is `<file>-<platform>-<arch>.<dmg|exe|deb>`. */
  readonly file: string
}

export interface Release {
  readonly version: string
  readonly page: string
  readonly asset: {
    readonly name: string
    readonly url: string
    readonly size: number
    readonly sha256?: string
  }
}

const PLATFORM = { darwin: 'mac', win32: 'win', linux: 'linux' } as const
const EXTENSION = { mac: '.dmg', win: '.exe', linux: '.deb' } as const

/** The installer this machine takes from a release, or undefined on an OS the packer does not build for. */
export function assetName(
  source: ReleaseSource,
  platform: NodeJS.Platform,
  arch: string,
): string | undefined {
  const kind = PLATFORM[platform as keyof typeof PLATFORM]
  return kind === undefined ? undefined : `${source.file}-${kind}-${arch}${EXTENSION[kind]}`
}

/** `1.2.10` is newer than `1.2.9`; a leading `v` is ignored; a pre-release (`-rc.1`) is never offered. */
export function isNewer(candidate: string, current: string): boolean {
  const parse = (text: string): number[] | undefined => {
    const match = /^v?(\d+)\.(\d+)\.(\d+)$/u.exec(text.trim())
    return match === null ? undefined : match.slice(1).map(Number)
  }
  const a = parse(candidate)
  const b = parse(current)
  if (a === undefined || b === undefined) return false
  for (let index = 0; index < 3; index += 1)
    if (a[index] !== b[index]) return (a[index] ?? 0) > (b[index] ?? 0)
  return false
}

/**
 * The latest published release and this machine's installer in it; undefined when it has none for this machine.
 * @param fetcher - `fetch`, replaceable in tests.
 */
export async function latestRelease(
  source: ReleaseSource,
  platform: NodeJS.Platform,
  arch: string,
  fetcher: typeof fetch = fetch,
): Promise<Release | undefined> {
  const answer = await fetcher(`https://api.github.com/repos/${source.repo}/releases/latest`, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'acrylblends-desktop-updater' },
    signal: AbortSignal.timeout(15_000),
  })
  if (answer.status === 404) return undefined
  if (!answer.ok)
    throw new Error(`GitHub answered ${answer.status} for ${source.repo}'s latest release`)
  const body = (await answer.json()) as {
    tag_name?: string
    html_url?: string
    assets?: {
      name?: string
      browser_download_url?: string
      size?: number
      digest?: string | null
    }[]
  }
  const name = assetName(source, platform, arch)
  const asset = body.assets?.find((entry) => entry.name === name)
  if (
    typeof body.tag_name !== 'string' ||
    asset?.browser_download_url === undefined ||
    name === undefined
  )
    return undefined
  const sha256 =
    typeof asset.digest === 'string' && asset.digest.startsWith('sha256:')
      ? asset.digest.slice('sha256:'.length)
      : undefined
  return {
    version: body.tag_name.replace(/^v/u, ''),
    page: body.html_url ?? `https://github.com/${source.repo}/releases`,
    asset: {
      name,
      url: asset.browser_download_url,
      size: asset.size ?? 0,
      ...(sha256 === undefined ? {} : { sha256 }),
    },
  }
}

/**
 * Download the release's installer into `folder`, reporting progress (0..1), and check its SHA-256 when GitHub published one.
 * @returns The downloaded file.
 */
export async function downloadInstaller(
  release: Release,
  folder: string,
  progress: (fraction: number) => void,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  mkdirSync(folder, { recursive: true })
  const file = join(folder, release.asset.name)
  const answer = await fetcher(release.asset.url, {
    headers: { 'user-agent': 'acrylblends-desktop-updater' },
  })
  if (!answer.ok || answer.body === null)
    throw new Error(`the download of ${release.asset.name} failed (${answer.status})`)
  const total =
    Number(answer.headers.get('content-length') ?? release.asset.size) || release.asset.size
  const hash = createHash('sha256')
  const out = createWriteStream(file)
  let received = 0
  try {
    for await (const chunk of answer.body as unknown as AsyncIterable<Uint8Array>) {
      hash.update(chunk)
      received += chunk.length
      if (!out.write(chunk))
        await new Promise<void>((resolve) => out.once('drain', () => resolve()))
      if (total > 0) progress(Math.min(1, received / total))
    }
  } finally {
    await new Promise<void>((resolve, reject) =>
      out.end((error?: Error | null) => (error ? reject(error) : resolve())),
    )
  }
  const digest = hash.digest('hex')
  if (release.asset.sha256 !== undefined && digest !== release.asset.sha256)
    throw new Error(
      `${release.asset.name} does not match the checksum GitHub published for it: the download is not used`,
    )
  return file
}

/** The macOS installer step: after process `pid` has quit, the bundle is replaced by the one in the DMG and opened again. */
export function macInstallScript(dmg: string, bundle: string, pid: number): string {
  const quote = (text: string): string => `'${text.replaceAll("'", "'\\''")}'`
  return [
    '#!/bin/sh',
    `while kill -0 ${pid} 2>/dev/null; do sleep 0.3; done`,
    `M=$(hdiutil attach -nobrowse -readonly ${quote(dmg)} | tail -1 | awk -F'\\t' '{print $NF}')`,
    `[ -d "$M/${basename(bundle)}" ] || { open ${quote(bundle)}; exit 1; }`,
    `rm -rf ${quote(bundle)} && ditto "$M/${basename(bundle)}" ${quote(bundle)}`,
    'hdiutil detach "$M" -quiet',
    `xattr -dr com.apple.quarantine ${quote(bundle)} 2>/dev/null`,
    `open ${quote(bundle)}`,
    `rm -f ${quote(dmg)}`,
    '',
  ].join('\n')
}

/**
 * Start the installer step for `file`, detached so it outlives this process; the caller quits the app right after. Returns false where an update cannot
 * be installed from the app (Linux: a .deb needs root), so the caller shows the file instead.
 */
export function startInstall(
  file: string,
  platform: NodeJS.Platform,
  executable: string,
  pid: number,
): boolean {
  if (platform === 'darwin') {
    const bundle = bundleOf(executable)
    if (bundle === undefined) return false
    const script = join(dirname(file), 'install-update.sh')
    writeFileSync(script, macInstallScript(file, bundle, pid), { mode: 0o755 })
    spawn('/bin/sh', [script], { detached: true, stdio: 'ignore' }).unref()
    return true
  }
  if (platform === 'win32') {
    // NSIS (electron-builder): /S installs silently over the installed copy, --updated marks it an update, --force-run starts the app when it is done.
    spawn(file, ['/S', '--updated', '--force-run'], { detached: true, stdio: 'ignore' }).unref()
    return true
  }
  return false
}
