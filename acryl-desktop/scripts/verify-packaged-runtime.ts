/** Fail-loud verification of the runtime entries sealed into Electron's app.asar. */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'
import { Worker } from 'node:worker_threads'
import { listPackage } from '@electron/asar'
import AdmZip from 'adm-zip'
import {
  nativePathIsForeign,
  prunePackagedNative,
  type NativeArch,
  type NativePlatform,
} from './prune-packaged-native.ts'
import {
  FORBIDDEN_MACOS_UNIVERSAL_ENTRIES,
  MACOS_UNIVERSAL_NATIVE_ENTRIES,
} from './mac-universal.ts'

/** AfterPack fields consumed without importing Electron Builder's incomplete declaration graph. */
export interface PackagedRuntimeContext {
  /** Completed platform application directory. */
  readonly appOutDir: string
  /** Electron Builder target architecture (`4` is its stable universal enum value). */
  readonly arch?: number
  /** Electron target platform selected by the packager. */
  readonly electronPlatformName: string
  /** Product metadata used to locate the macOS application bundle. */
  readonly packager: {
    readonly appInfo: {
      readonly productFilename: string
    }
  }
}

/** Exact archive entries required by the desktop launcher on every supported platform. */
export const REQUIRED_PACKAGED_RUNTIME_ENTRIES = [
  'package.json',
  'lib/main.js',
  'lib/client.js',
  'lib/native-ui/profile-create.html',
  'lib/native-ui/recovery.html',
  'lib/profile.js',
  'lib/profile-manager.js',
  'lib/profile-service.js',
  'lib/pnpm.js',
  'lib/profiles.js',
  'lib/diagnostics.js',
  'lib/diagnostic-export-worker.js',
  'lib/desktop-cli.js',
  'lib/desktop-runtime-environment.js',
  'lib/desktop-terminal.js',
  'lib/terminal.js',
  'lib/update-checker.js',
  'lib/update-download.js',
  'lib/updates.js',
  'lib/windows-agent-presets.js',
  'lib/windows-acl-runner.js',
  'node_modules/@deepseek-ai/dsh/lib/bin.js',
  'node_modules/@deepseek-ai/dsh-web-frontend/dist/index.html',
  'node_modules/@deepseek-ai/dsh-app-boot/lib/index.js',
  'node_modules/pnpm/bin/pnpm.mjs',
] as const

/** Physical entries required because profile fallback symlinks cannot target ASAR paths. */
export const REQUIRED_UNPACKED_RUNTIME_ENTRIES = [
  'package.json',
  'cordis.patch.yml',
  'build/app-icon.png',
  'build/app-icon-mac.png',
  'build/tray-iconTemplate.png',
  'build/tray-icon-blue.png',
  'lib/main.js',
  'lib/client.js',
  'lib/native-ui/profile-create.html',
  'lib/native-ui/recovery.html',
  'lib/index.js',
  'lib/profile.js',
  'lib/profile-manager.js',
  'lib/profile-service.js',
  'lib/pnpm.js',
  'lib/profiles.js',
  'lib/diagnostics.js',
  'lib/diagnostic-export-worker.js',
  'lib/terminal.js',
  'lib/update-download.js',
  'lib/updates.js',
  'lib/windows-agent-presets.js',
  'lib/windows-pwsh-sandbox.js',
  'node_modules/@deepseek-ai/dsh/package.json',
  // The preset payload lives in the agent-presets package; it moved out of the
  // dsh package itself when the DSH pin advanced past 0.1.1-rc.2.
  'node_modules/@deepseek-ai/dsh-agent-presets/presets/cordis/agent.cordis.yml',
  'node_modules/@deepseek-ai/dsh-agent-presets/presets/cordis/skills/cordis-plugin-development/SKILL.md',
  'node_modules/@deepseek-ai/dsh-agent-presets/presets/cordis/skills/editing-cordis-compositions/SKILL.md',
  'node_modules/@deepseek-ai/dsh/lib/bin.js',
  'node_modules/@deepseek-ai/dsh-app-boot/lib/index.js',
  'node_modules/@deepseek-ai/dsh-web-frontend/dist/index.html',
  'node_modules/pnpm/bin/pnpm.mjs',
] as const

/** Prebuilt Node-API modules required when the Windows package skips native source rebuilds. */
export const REQUIRED_WINDOWS_X64_NODE_PTY_ENTRIES = [
  'node_modules/node-pty/prebuilds/win32-x64/conpty.node',
  'node_modules/node-pty/prebuilds/win32-x64/conpty_console_list.node',
  'node_modules/node-pty/prebuilds/win32-x64/conpty/OpenConsole.exe',
  'node_modules/node-pty/prebuilds/win32-x64/conpty/conpty.dll',
] as const

/** CPU-specific runtime assets that must coexist in a universal macOS application. */
export const REQUIRED_MACOS_UNIVERSAL_ENTRIES = [
  ...MACOS_UNIVERSAL_NATIVE_ENTRIES.map(entry => entry.path),
] as const

/** Package exports that profile fallback links must resolve from the physical application tree. */
export const REQUIRED_UNPACKED_PACKAGE_SPECIFIERS = [
  'acryl-desktop',
  'acryl-desktop/profile',
  'acryl-desktop/client',
  'acryl-desktop/terminal',
  'acryl-desktop/pnpm',
  'acryl-desktop/profile-service',
  'acryl-desktop/profiles',
  'acryl-desktop/diagnostics',
  'acryl-desktop/notifications',
  'acryl-desktop/updates',
  'acryl-desktop/windows-agent-presets',
  'acryl-desktop/windows-pwsh-sandbox',
  'acryl-desktop/package.json',
  '@deepseek-ai/dsh-base/package.json',
  '@deepseek-ai/schemastery/package.json',
  '@deepseek-ai/dsh-web-app/package.json',
] as const

/** Injectable archive listing seam used by focused tests. */
export type ArchiveLister = (archivePath: string, options: { isPack: boolean }) => readonly string[]

/** Injectable physical-file probe used by focused tests. */
export type FileProbe = (filename: string) => boolean

/** Injectable Node package resolver used by focused tests. */
export type PackageResolver = (specifier: string) => string

/** Inputs understood by the bundled diagnostics Worker. */
export interface PackagedDiagnosticWorkerData {
  readonly logsDir: string
  readonly userDataDir: string
  readonly appVersion: string
  readonly maxEvidenceBytes: number
  readonly crashDumpsDir: string
}

/** Injectable packaged Worker launcher used by focused tests. */
export type PackagedDiagnosticWorkerLauncher = (
  workerPath: string,
  workerData: PackagedDiagnosticWorkerData,
) => Promise<string>

/** Injectable smoke seam used to verify afterPack ordering. */
export type PackagedDiagnosticWorkerSmoke = (unpackedRoot: string) => Promise<void>

/** Result posted by the bundled diagnostics Worker. */
type PackagedDiagnosticWorkerResult =
  | { readonly ok: true, readonly path: string }
  | { readonly ok: false, readonly error: string }

const PACKAGED_DIAGNOSTIC_WORKER_TIMEOUT_MS = 30_000

/** Start the physical packaged diagnostics Worker and wait for its terminal result. */
async function launchPackagedDiagnosticWorker(
  workerPath: string,
  workerData: PackagedDiagnosticWorkerData,
): Promise<string> {
  return await new Promise((resolve, reject) => {
    const worker = new Worker(workerPath, {
      name: 'dsh-packaged-diagnostic-smoke',
      workerData,
      resourceLimits: { maxOldGenerationSizeMb: 256 },
    })
    let settled = false
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      void worker.terminate()
      reject(new Error(
        `acryl-desktop: packaged diagnostic worker timed out after ${String(PACKAGED_DIAGNOSTIC_WORKER_TIMEOUT_MS)}ms`,
      ))
    }, PACKAGED_DIAGNOSTIC_WORKER_TIMEOUT_MS)
    const settle = (complete: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      void worker.terminate()
      complete()
    }
    worker.once('message', (result: PackagedDiagnosticWorkerResult) => {
      if (result.ok) settle(() => resolve(result.path))
      else settle(() => reject(new Error(result.error)))
    })
    worker.once('error', cause => settle(() => reject(cause)))
    worker.once('exit', (code) => {
      settle(() => reject(new Error(
        `acryl-desktop: packaged diagnostic worker exited with code ${String(code)}`,
      )))
    })
  })
}

/** Exercise the physical Worker emitted beside app.asar with a minimal archive. */
export async function smokePackagedDiagnosticWorker(
  unpackedRoot: string,
  launch: PackagedDiagnosticWorkerLauncher = launchPackagedDiagnosticWorker,
): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'dsh-packaged-diagnostics-'))
  const logsDir = join(root, 'logs')
  const userDataDir = join(root, 'user-data')
  const crashDumpsDir = join(root, 'Crashpad')
  mkdirSync(logsDir)
  mkdirSync(userDataDir)
  mkdirSync(join(crashDumpsDir, 'pending'), { recursive: true })
  writeFileSync(join(logsDir, 'dsh-2000-01-01.log'), 'packaged worker smoke\n')
  writeFileSync(join(crashDumpsDir, 'pending', 'packaged-smoke.dmp'), 'packaged crash dump smoke\n')
  try {
    const output = await launch(
      join(unpackedRoot, 'lib', 'diagnostic-export-worker.js'),
      { logsDir, userDataDir, appVersion: 'packaged-smoke', maxEvidenceBytes: 1024, crashDumpsDir },
    )
    if (!existsSync(output)) {
      throw new Error(`acryl-desktop: packaged diagnostic worker produced no archive at ${output}`)
    }
    const crashEntry = 'crash-dumps/pending/packaged-smoke.dmp'
    if (new AdmZip(output).getEntry(crashEntry) === null) {
      throw new Error(`acryl-desktop: packaged diagnostic worker omitted ${crashEntry}`)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

/**
 * Resolve the platform-specific archive produced by Electron Builder.
 * @param context - completed application directory and target platform.
 * @returns absolute path to the packaged app.asar.
 */
export function resolvePackagedAsarPath(context: PackagedRuntimeContext): string {
  if (context.electronPlatformName === 'darwin') {
    return join(
      context.appOutDir,
      `${context.packager.appInfo.productFilename}.app`,
      'Contents',
      'Resources',
      'app.asar',
    )
  }
  if (context.electronPlatformName === 'win32' || context.electronPlatformName === 'linux') {
    return join(context.appOutDir, 'resources', 'app.asar')
  }
  throw new Error(
    `acryl-desktop: unsupported Electron afterPack platform ${JSON.stringify(context.electronPlatformName)}`,
  )
}

/**
 * Resolve the physical dependency tree emitted beside app.asar.
 * @param context - completed application directory and target platform.
 * @returns absolute path to app.asar.unpacked.
 */
export function resolvePackagedUnpackedRoot(context: PackagedRuntimeContext): string {
  return `${resolvePackagedAsarPath(context)}.unpacked`
}

/** Normalize the host-specific separators emitted by the ASAR reader. */
function normalizeArchiveEntry(entry: string): string {
  return entry.replaceAll('\\', '/').replace(/^\/+/, '').replace(/\/+$/, '')
}

/**
 * Inspect one archive and reject an incomplete packaged runtime.
 * @param archivePath - resolved app.asar path.
 * @param list - ASAR listing implementation.
 * @returns The normalized archive entry set for physical mirror verification.
 */
export function verifyPackagedAsar(
  archivePath: string,
  list: ArchiveLister = listPackage,
): ReadonlySet<string> {
  let entries: readonly string[]
  try {
    entries = list(archivePath, { isPack: false })
  } catch (cause) {
    throw new Error(
      `acryl-desktop: failed to inspect packaged runtime at ${archivePath}`,
      { cause },
    )
  }

  const present = new Set(entries.map(normalizeArchiveEntry))
  const missing = REQUIRED_PACKAGED_RUNTIME_ENTRIES.filter(entry => !present.has(entry))
  if (missing.length > 0) {
    throw new Error(
      `acryl-desktop: packaged runtime at ${archivePath} is missing required ASAR entries: ${missing.join(', ')}`,
    )
  }
  return present
}

/**
 * Require every ASAR header entry to have a physical counterpart.
 *
 * The Desktop packaging contract unpacks every included application file so
 * profile fallback links and Node ESM resolution never target virtual paths.
 * Checking the complete header closes the gap left by a curated entry list:
 * a collector regression cannot silently omit transitive packages such as
 * yaml, zod, or typebox from app.asar.unpacked.
 */
export function verifyUnpackedArchiveMirror(
  archiveEntries: ReadonlySet<string>,
  unpackedRoot: string,
  exists: FileProbe = existsSync,
  targetPlatform?: NativePlatform,
  targetArch?: NativeArch,
): void {
  const missing = [...archiveEntries]
    .filter(entry => entry.length > 0 && !exists(join(unpackedRoot, entry)))
    // Target-foreign native payloads are deliberately pruned from the unpacked
    // tree, so their absence is expected — not a collector regression. Skip them.
    .filter(entry =>
      targetPlatform === undefined
      || targetArch === undefined
      || !nativePathIsForeign(entry, targetPlatform, targetArch))
  if (missing.length > 0) {
    throw new Error(
      `acryl-desktop: unpacked runtime at ${unpackedRoot} is missing ASAR-declared physical entries: ${missing.join(', ')}`,
    )
  }
}

/**
 * Verify package exports resolve through the physical tree instead of the build workspace.
 * @param unpackedRoot - absolute path to app.asar.unpacked.
 * @param resolvePackage - package resolver anchored at the physical root manifest.
 * @returns Nothing; failure rejects missing exports and paths outside app.asar.unpacked.
 */
export function verifyUnpackedPackageResolution(
  unpackedRoot: string,
  resolvePackage: PackageResolver = createRequire(join(unpackedRoot, 'package.json')).resolve,
): void {
  for (const specifier of REQUIRED_UNPACKED_PACKAGE_SPECIFIERS) {
    let resolvedPath: string
    try {
      resolvedPath = resolvePackage(specifier)
    } catch (cause) {
      throw new Error(
        `acryl-desktop: packaged runtime at ${unpackedRoot} cannot resolve required package export ${specifier}`,
        { cause },
      )
    }

    const relativePath = relative(unpackedRoot, resolvedPath)
    if (
      !isAbsolute(resolvedPath)
      || relativePath === '..'
      || relativePath.startsWith(`..${sep}`)
      || isAbsolute(relativePath)
    ) {
      throw new Error(
        `acryl-desktop: required package export ${specifier} resolved outside ${unpackedRoot}: ${resolvedPath}`,
      )
    }
  }
}

/** Injectable directory lister used by focused tests. */
export type DirectoryLister = (path: string) => readonly string[]

/** Injectable JSON manifest reader used by focused tests. */
export type ManifestReader = (path: string) => unknown

/** Derived packaged dependency closure of the physical application tree. */
export interface PackagedClosureReport {
  /** Number of package roots discovered inside app.asar.unpacked. */
  readonly packageCount: number
  /** Number of declared dependency edges considered. */
  readonly edgeCount: number
  /** Required peer edges whose target the application manifest never ships. */
  readonly unshipablePeerEdges: readonly string[]
  /** Declared optional edges the packager legitimately omitted. */
  readonly optionalAbsences: readonly string[]
}

/** Declared dependency tables read from one packaged manifest. */
interface DeclaredDependencyTables {
  readonly name: string
  readonly dependencies: readonly string[]
  readonly requiredPeers: readonly string[]
  readonly optionalEdges: readonly string[]
}

/** Read a directory listing, treating an absent or unreadable path as empty. */
function listDirectoryNames(path: string): readonly string[] {
  try {
    return readdirSync(path)
  } catch {
    return []
  }
}

/** Read one manifest as unknown JSON; packaged manifests are boundary data. */
function readJsonManifest(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'))
}

/** Collect the declared package names of one dependency table. */
function declaredNames(table: unknown): readonly string[] {
  if (typeof table !== 'object' || table === null) return []
  return Object.keys(table)
}

/** Narrow one parsed manifest to its declared fields. */
function readRecord(manifest: unknown): Record<string, unknown> {
  return typeof manifest === 'object' && manifest !== null
    ? manifest as Record<string, unknown>
    : {}
}

/** Read the declared dependency tables of one manifest as boundary-validated data. */
function readDeclaredTables(manifest: unknown, fallbackName: string): DeclaredDependencyTables {
  const record = readRecord(manifest)
  const peerMetaRecord = readRecord(record.peerDependenciesMeta)
  const peers = declaredNames(record.peerDependencies)
  const optionalPeers = peers.filter((peer) => {
    const entry = peerMetaRecord[peer]
    return typeof entry === 'object' && entry !== null
      && (entry as Record<string, unknown>).optional === true
  })
  const requiredPeers = peers.filter(peer => !optionalPeers.includes(peer))
  return {
    name: typeof record.name === 'string' ? record.name : fallbackName,
    dependencies: declaredNames(record.dependencies),
    requiredPeers,
    optionalEdges: [
      ...declaredNames(record.optionalDependencies),
      ...optionalPeers,
    ],
  }
}

/**
 * Discover every package root physically present in the unpacked tree.
 *
 * pnpm's isolated linker is flattened by the packager, so the shipped tree is
 * an ordinary nested node_modules layout: scoped directories, plus per-package
 * overrides for version conflicts.
 */
function collectPackagedPackageDirs(
  nodeModulesDir: string,
  list: DirectoryLister,
  exists: FileProbe,
  found: Set<string>,
): void {
  for (const entry of list(nodeModulesDir)) {
    if (entry === '.bin' || entry === '.pnpm') continue
    const candidate = join(nodeModulesDir, entry)
    if (entry.startsWith('@')) {
      collectPackagedPackageDirs(candidate, list, exists, found)
      continue
    }
    if (!exists(join(candidate, 'package.json'))) continue
    found.add(candidate)
    collectPackagedPackageDirs(join(candidate, 'node_modules'), list, exists, found)
  }
}

/** Resolve one declared dependency the way Node resolves it from the owning package. */
function packagedDependencyResolves(
  fromDir: string,
  specifier: string,
  packages: ReadonlySet<string>,
): boolean {
  for (let dir = fromDir; ;) {
    if (packages.has(join(dir, 'node_modules', specifier))) return true
    const parent = dirname(dir)
    if (parent === dir) return false
    dir = parent
  }
}

/**
 * Derive the dependency closure of the sealed application from its own manifests.
 *
 * Curated entry lists only prove that named files survived packaging. This check
 * derives the requirement from the artifact instead: every package the packager
 * shipped must find each dependency it declares, including non-optional peers,
 * which Electron Builder never collects on its own. A first-party package whose
 * only consumer-side obligation is a peer edge (dsh-app-boot's peer on
 * dsh-home-paths, for example) therefore fails the gate here instead of crashing
 * the Electron main process on first launch.
 *
 * A declared peer is fatal only when the application manifest itself ships that
 * package. Electron Builder collects the root manifest's declared production
 * closure, so a package the root declares but the tree lacks is by definition a
 * collector regression. A required peer the root never declares cannot be
 * collected at all; that is a defect in the source tree's own closure, reported
 * as `unshipablePeerEdges` for the packager log until the root declares it.
 *
 * Target-foreign native payloads are skipped for the same reason the payload
 * pruner removes them: the desktop manifest declares every platform's prebuild
 * package, and only the packaged target's copy is expected to survive.
 *
 * @param unpackedRoot - absolute path to app.asar.unpacked.
 * @param exists - physical-file probe.
 * @param targetPlatform - packaged Electron platform, when known.
 * @param targetArch - packaged CPU target, when known.
 * @param list - directory listing implementation.
 * @param readManifest - manifest reader for packaged package.json files.
 * @returns Counts of packages, edges, and the declared edges left unsatisfied.
 */
export function verifyPackagedDependencyClosure(
  unpackedRoot: string,
  exists: FileProbe = existsSync,
  targetPlatform?: NativePlatform,
  targetArch?: NativeArch,
  list: DirectoryLister = listDirectoryNames,
  readManifest: ManifestReader = readJsonManifest,
): PackagedClosureReport {
  const nodeModulesDir = join(unpackedRoot, 'node_modules')
  const packageDirs = new Set<string>()
  collectPackagedPackageDirs(nodeModulesDir, list, exists, packageDirs)
  // The required physical entries above already prove the application manifest
  // is present, so an unreadable one here means a synthetic tree under test.
  let applicationManifest: Record<string, unknown> = {}
  try {
    applicationManifest = readRecord(readManifest(join(unpackedRoot, 'package.json')))
  } catch {
    applicationManifest = {}
  }
  const shipped = new Set([
    ...declaredNames(applicationManifest.dependencies),
    ...declaredNames(applicationManifest.optionalDependencies),
  ])

  const missing: string[] = []
  const unshipablePeerEdges: string[] = []
  const optionalAbsences: string[] = []
  let edgeCount = 0
  // The application manifest itself owns the production closure Electron Builder
  // collects, so its own declared dependencies are verified alongside the rest.
  const manifests: Array<{ readonly dir: string; readonly manifest: unknown }> = [
    { dir: unpackedRoot, manifest: applicationManifest },
    ...[...packageDirs].sort().map(packageDir => ({
      dir: packageDir,
      manifest: readManifest(join(packageDir, 'package.json')),
    })),
  ]
  for (const { dir: packageDir, manifest } of manifests) {
    let tables: DeclaredDependencyTables
    try {
      tables = readDeclaredTables(manifest, packageDir)
    } catch (cause) {
      throw new Error(
        `acryl-desktop: packaged runtime at ${unpackedRoot} has an unreadable manifest at ${join(packageDir, 'package.json')}`,
        { cause },
      )
    }
    const edges = [
      ...tables.dependencies.map(specifier => ({ specifier, kind: 'dependency' as const })),
      ...tables.requiredPeers.map(specifier => ({ specifier, kind: 'peer' as const })),
      ...tables.optionalEdges.map(specifier => ({ specifier, kind: 'optional' as const })),
    ]
    for (const edge of edges) {
      // Electron itself is the application binary, never a packaged module.
      if (edge.specifier === 'electron') continue
      if (
        targetPlatform !== undefined
        && targetArch !== undefined
        && nativePathIsForeign(edge.specifier, targetPlatform, targetArch)
      ) continue
      edgeCount += 1
      if (packagedDependencyResolves(packageDir, edge.specifier, packageDirs)) continue
      const description = `${tables.name} -> ${edge.specifier}`
      if (edge.kind === 'optional') optionalAbsences.push(description)
      else if (edge.kind === 'peer' && !shipped.has(edge.specifier)) unshipablePeerEdges.push(description)
      else missing.push(description)
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `acryl-desktop: packaged runtime at ${unpackedRoot} is missing declared dependencies: ${missing.join(', ')}`,
    )
  }
  if (unshipablePeerEdges.length > 0) {
    console.warn(
      `acryl-desktop: packaged runtime at ${unpackedRoot} cannot satisfy required peer edges the application manifest does not ship: ${unshipablePeerEdges.join(', ')}. Declare these packages in acryl-desktop/package.json so Electron Builder collects them.`,
    )
  }
  return { packageCount: packageDirs.size, edgeCount, unshipablePeerEdges, optionalAbsences }
}

/** Map an Electron Builder architecture enum to the pruner's NativeArch. */
function archToNativeArch(arch: number | undefined): NativeArch | undefined {
  if (arch === 4) return 'universal'
  if (arch === 3) return 'arm64'
  if (arch === 1) return 'x64'
  return undefined
}

/**
 * Verify Electron Builder's completed application before signing begins.
 *
 * The archive, mirror, export, and derived closure checks each answer a
 * different question, so all four run before signing: which sealed entries
 * exist, whether the unpacked mirror matches, whether the launcher's own
 * exports resolve, and whether the shipped packages can satisfy the
 * dependencies they declare.
 *
 * @param context - Electron Builder's afterPack context.
 * @param list - ASAR listing implementation.
 * @param exists - physical-file probe for the unpacked CLI dependency tree.
 * @param resolvePackage - package resolver anchored at the physical root manifest.
 * @returns Nothing; failure rejects the package before signing.
 */
export function verifyPackagedRuntime(
  context: PackagedRuntimeContext,
  list: ArchiveLister = listPackage,
  exists: FileProbe = existsSync,
  resolvePackage?: PackageResolver,
): void {
  const archiveEntries = verifyPackagedAsar(resolvePackagedAsarPath(context), list)
  const unpackedRoot = resolvePackagedUnpackedRoot(context)
  const requiredPhysicalEntries = context.electronPlatformName === 'win32'
    ? [...REQUIRED_UNPACKED_RUNTIME_ENTRIES, ...REQUIRED_WINDOWS_X64_NODE_PTY_ENTRIES]
    : context.electronPlatformName === 'darwin' && context.arch === 4
      ? [...REQUIRED_UNPACKED_RUNTIME_ENTRIES, ...REQUIRED_MACOS_UNIVERSAL_ENTRIES]
      : REQUIRED_UNPACKED_RUNTIME_ENTRIES
  const missing = requiredPhysicalEntries.filter(entry => !exists(join(unpackedRoot, entry)))
  if (missing.length > 0) {
    throw new Error(
      `acryl-desktop: packaged runtime at ${unpackedRoot} is missing required physical entries: ${missing.join(', ')}`,
    )
  }
  if (context.electronPlatformName === 'darwin' && context.arch === 4) {
    const forbidden = FORBIDDEN_MACOS_UNIVERSAL_ENTRIES
      .filter(entry => exists(join(unpackedRoot, entry)))
    if (forbidden.length > 0) {
      throw new Error(
        `acryl-desktop: universal macOS runtime at ${unpackedRoot} contains host-architecture build output: ${forbidden.join(', ')}`,
      )
    }
  }
  verifyUnpackedArchiveMirror(
    archiveEntries,
    unpackedRoot,
    exists,
    context.electronPlatformName as NativePlatform,
    archToNativeArch(context.arch),
  )
  verifyUnpackedPackageResolution(unpackedRoot, resolvePackage)
  verifyPackagedDependencyClosure(
    unpackedRoot,
    exists,
    context.electronPlatformName as NativePlatform,
    archToNativeArch(context.arch),
  )
}

/**
 * Run the static packaged-runtime check as Electron Builder's afterPack hook.
 * @param context - Electron Builder's afterPack context.
 * @returns A promise that rejects before signing when the runtime is incomplete.
 */
export async function afterPack(
  context: PackagedRuntimeContext,
  verify: typeof verifyPackagedRuntime = verifyPackagedRuntime,
  smoke: PackagedDiagnosticWorkerSmoke = smokePackagedDiagnosticWorker,
  prune: typeof prunePackagedNative = prunePackagedNative,
): Promise<void> {
  const unpackedRoot = resolvePackagedUnpackedRoot(context)
  // Unit tests supply a synthetic package path; a real Electron Builder hook
  // always has the unpacked tree at this point, before signing starts.
  if (existsSync(unpackedRoot)) prune(unpackedRoot, context.electronPlatformName, context.arch)
  verify(context)
  await smoke(unpackedRoot)
}

export default afterPack
