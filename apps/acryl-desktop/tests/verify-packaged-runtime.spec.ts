import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AdmZip from 'adm-zip'
import {
  afterPack,
  REQUIRED_PACKAGED_RUNTIME_ENTRIES,
  REQUIRED_MACOS_UNIVERSAL_ENTRIES,
  REQUIRED_UNPACKED_PACKAGE_SPECIFIERS,
  REQUIRED_UNPACKED_RUNTIME_ENTRIES,
  REQUIRED_WINDOWS_X64_NODE_PTY_ENTRIES,
  resolvePackagedAsarPath,
  resolvePackagedUnpackedRoot,
  smokePackagedDiagnosticWorker,
  verifyUnpackedArchiveMirror,
  verifyPackagedDependencyClosure,
  verifyPackagedRuntime,
  type ArchiveLister,
  type FileProbe,
  type PackageResolver,
  type PackagedRuntimeContext,
  type PackagedDiagnosticWorkerLauncher,
} from '../scripts/verify-packaged-runtime.ts'
import { FORBIDDEN_MACOS_UNIVERSAL_ENTRIES } from '../scripts/mac-universal.ts'

function context(
  appOutDir: string,
  electronPlatformName: string,
  arch?: number,
): PackagedRuntimeContext {
  return {
    appOutDir,
    electronPlatformName,
    ...(arch === undefined ? {} : { arch }),
    packager: { appInfo: { productFilename: 'ACRYL' } },
  }
}

function completeArchiveEntries(separator = '/'): string[] {
  return REQUIRED_PACKAGED_RUNTIME_ENTRIES.map(entry => `${separator}${entry.replaceAll('/', separator)}`)
}

function completePackageResolver(unpackedRoot: string): PackageResolver {
  return specifier => join(unpackedRoot, 'resolved', `${specifier.replaceAll('/', '-')}.js`)
}

const syntheticTrees: string[] = []

afterEach(() => {
  for (const root of syntheticTrees.splice(0)) rmSync(root, { recursive: true, force: true })
})

/** Write one packaged manifest at its physical location inside a synthetic tree. */
function writePackageManifest(
  unpackedRoot: string,
  relativeDir: string,
  manifest: Record<string, unknown>,
): void {
  const dir = join(unpackedRoot, relativeDir)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ version: '0.0.0-test', ...manifest })}\n`)
}

/** Build a synthetic app.asar.unpacked tree with an application manifest. */
function syntheticUnpackedRoot(rootDependencies: readonly string[] = []): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-packaged-closure-'))
  syntheticTrees.push(root)
  const unpackedRoot = join(root, 'resources', 'app.asar.unpacked')
  writePackageManifest(unpackedRoot, '.', {
    name: 'acryl-desktop',
    dependencies: Object.fromEntries(rootDependencies.map(name => [name, '1.0.0'])),
  })
  return unpackedRoot
}

describe('packaged desktop runtime verification', () => {
  it('fails the diagnostic Worker smoke when its archive omits the crash dump', async () => {
    const unpackedRoot = resolvePackagedUnpackedRoot(context('/build', 'win32'))
    const launch = vi.fn<PackagedDiagnosticWorkerLauncher>(async (_workerPath, workerData) => {
      const outDir = join(workerData.userDataDir, 'diagnostics')
      mkdirSync(outDir)
      const output = join(outDir, 'diagnostics-smoke.zip')
      const zip = new AdmZip()
      zip.addFile('system-info.txt', Buffer.from('no dump\n'))
      zip.writeZip(output)
      return output
    })

    await expect(smokePackagedDiagnosticWorker(unpackedRoot, launch))
      .rejects.toThrow('packaged diagnostic worker omitted crash-dumps/pending/packaged-smoke.dmp')
  })

  it.each(['darwin', 'win32'])(
    'targets the physical diagnostic Worker in the %s unpacked layout and removes smoke files',
    async (platform) => {
      const unpackedRoot = resolvePackagedUnpackedRoot(context('/build', platform))
      let smokeRoot: string | undefined
      const launch = vi.fn<PackagedDiagnosticWorkerLauncher>(async (workerPath, workerData) => {
        smokeRoot = join(workerData.logsDir, '..')
        expect(workerPath).toBe(join(unpackedRoot, 'lib', 'diagnostic-export-worker.js'))
        expect(readFileSync(join(workerData.logsDir, 'dsh-2000-01-01.log'), 'utf8'))
          .toBe('packaged worker smoke\n')
        expect(workerData.appVersion).toBe('packaged-smoke')
        expect(workerData.maxEvidenceBytes).toBe(1024)
        const crashDump = readFileSync(join(workerData.crashDumpsDir, 'pending', 'packaged-smoke.dmp'))
        expect(crashDump.toString('utf8')).toBe('packaged crash dump smoke\n')
        const outDir = join(workerData.userDataDir, 'diagnostics')
        mkdirSync(outDir)
        const output = join(outDir, 'diagnostics-smoke.zip')
        const zip = new AdmZip()
        zip.addFile('crash-dumps/pending/packaged-smoke.dmp', crashDump)
        zip.writeZip(output)
        return output
      })

      await smokePackagedDiagnosticWorker(unpackedRoot, launch)

      expect(launch).toHaveBeenCalledOnce()
      expect(smokeRoot).toBeDefined()
      expect(existsSync(smokeRoot as string)).toBe(false)
    },
  )

  it('runs the static package gate before the diagnostic Worker smoke', async () => {
    const runtimeContext = context('/build', 'win32')
    const calls: string[] = []

    await afterPack(
      runtimeContext,
      () => { calls.push('static') },
      async (unpackedRoot) => { calls.push(unpackedRoot) },
    )

    expect(calls).toEqual(['static', resolvePackagedUnpackedRoot(runtimeContext)])
  })

  it('tracks the ConPTY-only native surface shipped by node-pty 1.2', () => {
    expect(REQUIRED_WINDOWS_X64_NODE_PTY_ENTRIES).toEqual([
      'node_modules/node-pty/prebuilds/win32-x64/conpty.node',
      'node_modules/node-pty/prebuilds/win32-x64/conpty_console_list.node',
      'node_modules/node-pty/prebuilds/win32-x64/conpty/OpenConsole.exe',
      'node_modules/node-pty/prebuilds/win32-x64/conpty/conpty.dll',
    ])
  })

  it.each([
    [
      'darwin',
      join('/build', 'ACRYL.app', 'Contents', 'Resources', 'app.asar'),
    ],
    [
      'win32',
      join('/build', 'resources', 'app.asar'),
    ],
  ])('inspects the %s app.asar path', (platform, expectedPath) => {
    const list = vi.fn<ArchiveLister>(() => completeArchiveEntries(platform === 'win32' ? '\\' : '/'))

    const exists = vi.fn<FileProbe>(() => true)
    const unpackedRoot = `${expectedPath}.unpacked`
    const resolvePackage = vi.fn<PackageResolver>(completePackageResolver(unpackedRoot))

    verifyPackagedRuntime(context('/build', platform), list, exists, resolvePackage)

    expect(resolvePackagedAsarPath(context('/build', platform))).toBe(expectedPath)
    expect(list).toHaveBeenCalledOnce()
    expect(list).toHaveBeenCalledWith(expectedPath, { isPack: false })
    expect(resolvePackagedUnpackedRoot(context('/build', platform))).toBe(unpackedRoot)
    expect(exists).toHaveBeenCalledTimes(
      REQUIRED_UNPACKED_RUNTIME_ENTRIES.length
        + (platform === 'win32' ? REQUIRED_WINDOWS_X64_NODE_PTY_ENTRIES.length : 0)
        + completeArchiveEntries().length,
    )
    expect(resolvePackage.mock.calls.map(([specifier]) => specifier))
      .toEqual(REQUIRED_UNPACKED_PACKAGE_SPECIFIERS)
  })

  it('rejects an unsupported platform instead of guessing an archive layout', () => {
    expect(() => resolvePackagedAsarPath(context('/build', 'mas')))
      .toThrow('unsupported Electron afterPack platform "mas"')
  })

  it('requires both CPU variants from a universal macOS runtime', () => {
    const runtimeContext = context('/build', 'darwin', 4)
    const unpackedRoot = resolvePackagedUnpackedRoot(runtimeContext)
    const missing = 'node_modules/@vscode/ripgrep-darwin-x64/bin/rg'

    expect(() => verifyPackagedRuntime(
      runtimeContext,
      () => completeArchiveEntries(),
      filename => filename !== join(unpackedRoot, missing),
      completePackageResolver(unpackedRoot),
    )).toThrow(`missing required physical entries: ${missing}`)

    const exists = vi.fn<FileProbe>(filename => !FORBIDDEN_MACOS_UNIVERSAL_ENTRIES
      .some(entry => filename === join(unpackedRoot, entry)))
    verifyPackagedRuntime(
      runtimeContext,
      () => completeArchiveEntries(),
      exists,
      completePackageResolver(unpackedRoot),
    )
    expect(exists).toHaveBeenCalledTimes(
      REQUIRED_UNPACKED_RUNTIME_ENTRIES.length
        + REQUIRED_MACOS_UNIVERSAL_ENTRIES.length
        + FORBIDDEN_MACOS_UNIVERSAL_ENTRIES.length
        + completeArchiveEntries().length,
    )
  })

  it('rejects any ASAR-declared unpacked dependency missing from the physical tree', () => {
    const unpackedRoot = join('/build', 'resources', 'app.asar.unpacked')
    const missing = 'node_modules/yaml/dist/index.js'

    expect(() => verifyUnpackedArchiveMirror(
      new Set(['lib/main.js', missing, 'node_modules/zod/index.js']),
      unpackedRoot,
      filename => filename !== join(unpackedRoot, missing),
    )).toThrow(`missing ASAR-declared physical entries: ${missing}`)
  })

  it('does not reject target-foreign native payload the pruner deliberately removed', () => {
    const unpackedRoot = join('/build', 'resources', 'app.asar.unpacked')
    // win32-x64 and darwin-x64 payloads are foreign to a darwin arm64 thin build.
    const entries = new Set([
      'lib/main.js',
      'node_modules/@org/plugin/dist.js',
      'node_modules/@img/sharp-win32-x64/index.cjs',
      'node_modules/@img/sharp-darwin-x64/index.cjs',
    ])

    expect(() => verifyUnpackedArchiveMirror(
      entries,
      unpackedRoot,
      filename => filename === join(unpackedRoot, 'lib/main.js')
        || filename === join(unpackedRoot, 'node_modules/@org/plugin/dist.js')
        || filename === join(unpackedRoot, 'node_modules/@img/sharp-darwin-arm64/index.cjs'),
      'darwin',
      'arm64',
    )).not.toThrow()
  })

  it('rejects a host-architecture node-pty build from a universal app', () => {
    const runtimeContext = context('/build', 'darwin', 4)
    const unpackedRoot = resolvePackagedUnpackedRoot(runtimeContext)
    const forbidden = FORBIDDEN_MACOS_UNIVERSAL_ENTRIES[0]

    expect(() => verifyPackagedRuntime(
      runtimeContext,
      () => completeArchiveEntries(),
      filename => filename === join(unpackedRoot, forbidden)
        || !FORBIDDEN_MACOS_UNIVERSAL_ENTRIES
          .some(entry => filename === join(unpackedRoot, entry)),
      completePackageResolver(unpackedRoot),
    )).toThrow(`contains host-architecture build output: ${forbidden}`)
  })

  it.each([
    'lib/client.js',
    'lib/desktop-runtime-environment.js',
    'lib/profile-service.js',
    'lib/diagnostics.js',
    'lib/diagnostic-export-worker.js',
    'lib/pnpm.js',
    'lib/update-download.js',
    'lib/windows-agent-presets.js',
  ])('fails loud when required runtime entry %s is absent', (missing) => {
    const entries = completeArchiveEntries().filter(entry => entry !== `/${missing}`)

    expect(() => verifyPackagedRuntime(context('/build', 'win32'), () => entries, () => true))
      .toThrow(`missing required ASAR entries: ${missing}`)
  })

  it.each([
    'package.json',
    'build/app-icon-mac.png',
    'build/tray-iconTemplate.png',
    'lib/terminal.js',
    'lib/diagnostics.js',
    'lib/diagnostic-export-worker.js',
    'lib/update-download.js',
    'lib/windows-agent-presets.js',
    'node_modules/@deepseek-ai/dsh/lib/bin.js',
    'node_modules/pnpm/bin/pnpm.mjs',
    'node_modules/node-pty/prebuilds/win32-x64/conpty.node',
  ])('fails loud when physical runtime entry %s is absent from app.asar.unpacked', (missing) => {
    const runtimeContext = context('/build', 'win32')
    const unpackedRoot = resolvePackagedUnpackedRoot(runtimeContext)
    const missingPath = join(unpackedRoot, missing)

    expect(() => verifyPackagedRuntime(
      runtimeContext,
      () => completeArchiveEntries(),
      filename => filename !== missingPath,
      completePackageResolver(unpackedRoot),
    )).toThrow(`missing required physical entries: ${missing}`)
  })

  it('requires the physical Cordis preset and its bundled skills', () => {
    const runtimeContext = context('/build', 'win32')
    const unpackedRoot = resolvePackagedUnpackedRoot(runtimeContext)
    const requiredPresetEntries = [
      'node_modules/@deepseek-ai/dsh-agent-presets/presets/cordis/agent.cordis.yml',
      'node_modules/@deepseek-ai/dsh-agent-presets/presets/cordis/skills/cordis-plugin-development/SKILL.md',
      'node_modules/@deepseek-ai/dsh-agent-presets/presets/cordis/skills/editing-cordis-compositions/SKILL.md',
    ]

    for (const missing of requiredPresetEntries) {
      expect(() => verifyPackagedRuntime(
        runtimeContext,
        () => completeArchiveEntries(),
        filename => filename !== join(unpackedRoot, missing),
        completePackageResolver(unpackedRoot),
      )).toThrow(`missing required physical entries: ${missing}`)
    }
  })

  it('fails loud when a required package export cannot resolve from app.asar.unpacked', () => {
    const runtimeContext = context('/build', 'win32')
    const unpackedRoot = resolvePackagedUnpackedRoot(runtimeContext)
    const resolvePackage = vi.fn<PackageResolver>((specifier) => {
      if (specifier === 'acryl-desktop/profiles') {
        throw new Error('missing export')
      }
      return completePackageResolver(unpackedRoot)(specifier)
    })

    expect(() => verifyPackagedRuntime(
      runtimeContext,
      () => completeArchiveEntries(),
      () => true,
      resolvePackage,
    )).toThrow(
      `packaged runtime at ${unpackedRoot} cannot resolve required package export acryl-desktop/profiles`,
    )
  })

  it('fails loud when schemastery is absent from app.asar.unpacked', () => {
    const runtimeContext = context('/build', 'win32')
    const unpackedRoot = resolvePackagedUnpackedRoot(runtimeContext)
    const specifier = '@deepseek-ai/schemastery/package.json'
    const resolvePackage = vi.fn<PackageResolver>((requested) => {
      if (requested === specifier) throw new Error('missing package')
      return completePackageResolver(unpackedRoot)(requested)
    })

    expect(() => verifyPackagedRuntime(
      runtimeContext,
      () => completeArchiveEntries(),
      () => true,
      resolvePackage,
    )).toThrow(
      `packaged runtime at ${unpackedRoot} cannot resolve required package export ${specifier}`,
    )
  })

  it('fails loud when the packaged tree drops a peer-only package the app ships', () => {
    // dsh-app-boot imports @deepseek-ai/dsh-home-paths under a peer edge only, so
    // Electron Builder collects it solely because the application declares it.
    const unpackedRoot = syntheticUnpackedRoot([
      '@deepseek-ai/dsh-app-boot',
      '@deepseek-ai/dsh-home-paths',
    ])
    writePackageManifest(unpackedRoot, 'node_modules/@deepseek-ai/dsh-app-boot', {
      name: '@deepseek-ai/dsh-app-boot',
      peerDependencies: { '@deepseek-ai/dsh-home-paths': '^0.1.5-alpha.1' },
    })

    expect(() => verifyPackagedDependencyClosure(unpackedRoot)).toThrow(
      `packaged runtime at ${unpackedRoot} is missing declared dependencies: acryl-desktop -> @deepseek-ai/dsh-home-paths, @deepseek-ai/dsh-app-boot -> @deepseek-ai/dsh-home-paths`,
    )
  })

  it('accepts a packaged tree whose declared dependencies and peers all resolve', () => {
    const unpackedRoot = syntheticUnpackedRoot(['@deepseek-ai/dsh-app-boot', '@deepseek-ai/dsh-home-paths'])
    writePackageManifest(unpackedRoot, 'node_modules/@deepseek-ai/dsh-app-boot', {
      name: '@deepseek-ai/dsh-app-boot',
      dependencies: { '@deepseek-ai/dsh-home-paths': '0.1.5-alpha.1' },
    })
    writePackageManifest(unpackedRoot, 'node_modules/@deepseek-ai/dsh-home-paths', {
      name: '@deepseek-ai/dsh-home-paths',
    })

    expect(() => verifyPackagedDependencyClosure(unpackedRoot)).not.toThrow()
  })

  it('reports a required peer the application manifest never ships instead of failing the packager', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const unpackedRoot = syntheticUnpackedRoot(['dsh-community-market'])
    writePackageManifest(unpackedRoot, 'node_modules/dsh-community-market', {
      name: 'dsh-community-market',
      peerDependencies: { '@deepseek-ai/dsh-client-store': '0.1.5-alpha.1' },
    })

    const report = verifyPackagedDependencyClosure(unpackedRoot)

    expect(report.unshipablePeerEdges).toEqual([
      'dsh-community-market -> @deepseek-ai/dsh-client-store',
    ])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(
      'dsh-community-market -> @deepseek-ai/dsh-client-store',
    ))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('acryl-desktop/package.json'))
    warn.mockRestore()
  })

  it('ignores optional dependencies and optional peers the packager omits', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const unpackedRoot = syntheticUnpackedRoot(['@deepseek-ai/dsh-tool-pwsh'])
    writePackageManifest(unpackedRoot, 'node_modules/@deepseek-ai/dsh-tool-pwsh', {
      name: '@deepseek-ai/dsh-tool-pwsh',
      optionalDependencies: { '@deepseek-ai/dsh-pwsh-local': '0.1.5-alpha.1' },
      peerDependencies: { typescript: '^6.0.0' },
      peerDependenciesMeta: { typescript: { optional: true } },
    })

    const report = verifyPackagedDependencyClosure(unpackedRoot)

    expect(report.optionalAbsences).toEqual([
      '@deepseek-ai/dsh-tool-pwsh -> @deepseek-ai/dsh-pwsh-local',
      '@deepseek-ai/dsh-tool-pwsh -> typescript',
    ])
    expect(report.unshipablePeerEdges).toEqual([])
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('skips target-foreign native payload the packager prunes', () => {
    const unpackedRoot = syntheticUnpackedRoot(['@img/sharp-darwin-arm64', '@img/sharp-linux-x64'])
    writePackageManifest(unpackedRoot, 'node_modules/@img/sharp-linux-x64', { name: '@img/sharp-linux-x64' })

    expect(() => verifyPackagedDependencyClosure(unpackedRoot, undefined, 'linux', 'x64')).not.toThrow()
    expect(() => verifyPackagedDependencyClosure(unpackedRoot, undefined, 'darwin', 'arm64'))
      .toThrow('missing declared dependencies: acryl-desktop -> @img/sharp-darwin-arm64')
  })

  it('resolves a nested node_modules override before the shared root copy', () => {
    const unpackedRoot = syntheticUnpackedRoot(['@scope/host'])
    writePackageManifest(unpackedRoot, 'node_modules/@scope/host', {
      name: '@scope/host',
      dependencies: { '@scope/dep': '2.0.0' },
    })
    writePackageManifest(unpackedRoot, 'node_modules/@scope/host/node_modules/@scope/dep', {
      name: '@scope/dep',
    })

    expect(() => verifyPackagedDependencyClosure(unpackedRoot)).not.toThrow()
  })

  it('gates the packaged closure before signing', () => {
    const runtimeContext = context(mkdtempSync(join(tmpdir(), 'dsh-packaged-closure-gate-')), 'linux')
    syntheticTrees.push(runtimeContext.appOutDir)
    const unpackedRoot = resolvePackagedUnpackedRoot(runtimeContext)
    const archiveEntries = completeArchiveEntries().map(entry => entry.replace(/^\/+/, ''))
    for (const entry of new Set([...REQUIRED_UNPACKED_RUNTIME_ENTRIES, ...archiveEntries])) {
      // Empty JSON keeps every packaged manifest readable for the closure pass.
      const file = join(unpackedRoot, entry)
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, '{}\n')
    }
    writePackageManifest(unpackedRoot, '.', { name: 'acryl-desktop', dependencies: { '@scope/boot': '1.0.0' } })
    writePackageManifest(unpackedRoot, 'node_modules/@scope/boot', { name: '@scope/boot' })

    expect(() => verifyPackagedRuntime(
      runtimeContext,
      () => completeArchiveEntries(),
      existsSync,
      completePackageResolver(unpackedRoot),
    )).not.toThrow()

    rmSync(join(unpackedRoot, 'node_modules/@scope/boot'), { recursive: true, force: true })
    expect(() => verifyPackagedRuntime(
      runtimeContext,
      () => completeArchiveEntries(),
      existsSync,
      completePackageResolver(unpackedRoot),
    )).toThrow('missing declared dependencies: acryl-desktop -> @scope/boot')
  })

  it('fails loud when a required package export escapes app.asar.unpacked', () => {
    const runtimeContext = context('/build', 'win32')
    const unpackedRoot = resolvePackagedUnpackedRoot(runtimeContext)
    const escapedPath = join('/workspace', 'node_modules', '@deepseek-ai', 'dsh-base', 'lib', 'index.js')
    const resolvePackage = vi.fn<PackageResolver>((specifier) => {
      if (specifier === '@deepseek-ai/dsh-base/package.json') return escapedPath
      return completePackageResolver(unpackedRoot)(specifier)
    })

    expect(() => verifyPackagedRuntime(
      runtimeContext,
      () => completeArchiveEntries(),
      () => true,
      resolvePackage,
    )).toThrow(
      `required package export @deepseek-ai/dsh-base/package.json resolved outside ${unpackedRoot}: ${escapedPath}`,
    )
  })
})
