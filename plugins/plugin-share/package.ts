/**
 * Turning a plugin folder into what other people's apps can pull: a package folder and its release tarball, with the same bytes on every OS. The
 * hub owns the tarball and the contract, blends-core what "portable" and "digest" mean; this module only decides what goes in.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { extname, join } from 'node:path'
import { digestFiles, pluginFiles, portabilityIssues } from '@webboxes/blends-core'
import { packFolder, readTarball, syncServiceContract } from '@webboxes/plugin-hub'

/** The package.json of a standalone plugin package: the host framework is a peer, never a second installed copy. */
export function packageManifest(
  name: string,
  description: string,
  version = '0.1.0',
  release?: PackageRelease,
): Record<string, unknown> {
  return {
    name,
    version,
    description,
    ...(release === undefined
      ? {}
      : {
          license: release.license,
          repository: {
            type: 'git',
            url: `git+https://github.com/${release.owner}/${release.repo}.git`,
          },
        }),
    type: 'module',
    exports: { '.': './index.ts', './package.json': './package.json' },
    // No `files` list: a plugin's plugin.json, data and .js files go with it, and the packer's own skips (node_modules, .git) apply.
    // ACRYL measured it: a host package listed under dependencies brings a second copy of the framework, and its services stop
    // matching after a restart. A peer names the version and installs nothing.
    peerDependencies: { '@deepseek-ai/cordis': '4.0.4' },
    keywords: ['cordis', 'cordis-plugin', 'acrylblends'],
  }
}

/** Where a package is going to be released: written in now, so what is planned is byte for byte what is released. */
export interface PackageRelease {
  readonly owner: string
  readonly repo: string
  readonly license: string
}

export interface PackageOptions {
  /** This version, instead of the one already packaged. */
  readonly version?: string
  readonly release?: PackageRelease
}

export interface PackagedPlugin {
  readonly dir: string
  readonly version: string
  readonly files: readonly string[]
  /** The release file, next to the package folder. */
  readonly tarball: string
  /** The tarball's sha512, as the registry lists it. */
  readonly integrity: string
  /** The sha256 of the plugin's content, which a source can name (`@sha256:<digest>`). */
  readonly digest: string
}

/** Text whose line endings an editor or git on Windows may change: LF in the package, so those endings are not part of the plugin's identity. */
const TEXT = new Set([
  '.ts',
  '.mts',
  '.cts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.jsx',
  '.json',
  '.md',
  '.txt',
  '.css',
  '.html',
  '.yml',
  '.yaml',
  '.svg',
])

function withLineFeeds(dir: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) withLineFeeds(path)
    else if (entry.isFile() && TEXT.has(extname(entry.name).toLowerCase())) {
      const text = readFileSync(path, 'utf8')
      if (text.includes('\r\n')) writeFileSync(path, text.replaceAll('\r\n', '\n'))
    }
  }
}

/** What the hub's share would otherwise add on the way out, changing the bytes after they were planned. */
function markPublic(target: string): void {
  const file = join(target, 'package.json')
  const manifest = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
  writeFileSync(
    file,
    `${JSON.stringify({ ...manifest, acryl: { ...(manifest.acryl as object), visibility: 'public' } }, null, 2)}\n`,
  )
}

function versionIn(target: string): string | undefined {
  try {
    const { version } = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8')) as {
      version?: unknown
    }
    return typeof version === 'string' ? version : undefined
  } catch {
    return undefined
  }
}

/**
 * Package the plugin in `source` as `<packages>/<name>/` and `<packages>/<name>-<version>.tgz`. The person's folder is not touched. A version already
 * packaged stays: a release is made once, and a person bumps it deliberately.
 * @throws when the plugin would not work on every OS or its contract cannot be read; no package is left.
 */
export async function packagePlugin(
  source: string,
  packages: string,
  name: string,
  description: string,
  options: PackageOptions = {},
): Promise<PackagedPlugin> {
  const target = join(packages, name)
  const version = options.version ?? versionIn(target)
  rmSync(target, { recursive: true, force: true })
  mkdirSync(packages, { recursive: true })
  cpSync(source, target, { recursive: true, filter: (path) => !path.includes('node_modules') })
  try {
    writeFileSync(
      join(target, 'package.json'),
      `${JSON.stringify(packageManifest(name, description, version, options.release), null, 2)}\n`,
    )
    if (!existsSync(join(target, 'README.md'))) {
      writeFileSync(
        join(target, 'README.md'),
        `# ${name}\n\n${description}\n\nA Cordis plugin. Once it is released, pull it into an ACRYLBLENDS app while that app runs (\`npm run dev\`): \`npm run acryl -- plugin pull github:<owner>/<repo>\`.\n`,
      )
    }
    withLineFeeds(target)
    const issues = portabilityIssues(pluginFiles(target))
    if (issues.length > 0)
      throw new Error(
        `it would not work on every OS: ${issues.map((issue) => `${issue.path}: ${issue.reason}`).join('; ')}`,
      )
    // The contract other people's apps and the registry read: what the plugin needs and provides, from its code.
    const contract = await syncServiceContract(target)
    if (!contract.ok)
      throw new Error(`its service contract cannot be read: ${contract.errors.join('; ')}`)
    if (options.release !== undefined) markPublic(target)
    const packed = packFolder(target)
    const tarball = join(packages, packed.fileName)
    writeFileSync(tarball, packed.tarball)
    const digest = digestFiles(
      readTarball(packed.tarball).map(({ path, content }) => ({
        path,
        bytes: content,
        kind: 'file' as const,
      })),
    )
    return {
      dir: target,
      version: packed.version,
      files: packed.files,
      tarball,
      integrity: packed.integrity,
      digest,
    }
  } catch (cause) {
    rmSync(target, { recursive: true, force: true })
    throw cause
  }
}
