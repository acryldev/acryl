/** Headless artifact smoke for profile-local and launcher-owned Cordis plugins. */

import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { boot } from '@deepseek-ai/dsh-app-boot'
import {
  createLaunchEnvironmentSnapshot,
  DSH_LAUNCH_ENVIRONMENT_KEY,
} from '@deepseek-ai/dsh-launch-environment'
import { installDesktopPnpmRuntime } from '../lib/desktop-runtime-environment.js'
import { installProfilePackageResolver } from '../lib/module-resolution.js'
import { prepareDesktopProfile } from '../lib/profile.js'
import { createDesktopWebProfile } from '../lib/profile-manager.js'

const BIN_NAME = 'acryl-desktop-loader-smoke'
const THIRD_PARTY_NAME = 'dsh-desktop-loader-smoke-plugin'
const THIRD_PARTY_DEPENDENCY_NAME = 'dsh-desktop-loader-smoke-dependency'
const RUNNER_ENVIRONMENT_NAMES = new Set([
  'ELECTRON_RUN_AS_NODE',
  'NPM_CONFIG_RUNTIME',
  'NPM_CONFIG_TARGET',
  'NPM_CONFIG_DISTURL',
])
const home = mkdtempSync(join(tmpdir(), 'dsh-desktop-loader-'))
let ctx
let mounted
let mountedSpec
let releasePackageResolver
let pnpmRuntime
const runnerEnvironment = Object.entries(process.env)
  .filter(([key]) => RUNNER_ENVIRONMENT_NAMES.has(key.toUpperCase()))

try {
  for (const [key] of runnerEnvironment) delete process.env[key]
  const launchEnvironment = createLaunchEnvironmentSnapshot([{
    source: 'process',
    values: { ...process.env },
  }])
  const launchPath = launchEnvironment.get('PATH')?.value
  const packageRoot = new URL('../', import.meta.url)
  const pnpmBinPath = fileURLToPath(new URL('node_modules/pnpm/bin/pnpm.mjs', packageRoot))
  const electronVersion = JSON.parse(readFileSync(new URL('node_modules/electron/package.json', packageRoot), 'utf8')).version
  pnpmRuntime = installDesktopPnpmRuntime({
    platform: process.platform,
    appExecutable: process.execPath,
    pnpmBinPath,
    electronVersion,
    stateDir: join(home, 'runtime-commands'),
    environment: process.env,
  })
  createDesktopWebProfile(home, 'web')
  const prepared = prepareDesktopProfile(undefined, home, process.platform, 'web')
  const thirdPartyLink = join(prepared.profile.dir, 'node_modules', THIRD_PARTY_NAME)
  const thirdPartyDir = join(home, 'linked-plugins', THIRD_PARTY_NAME)
  const thirdPartyDependencyDir = join(home, 'profiles', 'node_modules', THIRD_PARTY_DEPENDENCY_NAME)
  mkdirSync(join(prepared.profile.dir, 'node_modules'), { recursive: true })
  mkdirSync(thirdPartyDir, { recursive: true })
  mkdirSync(thirdPartyDependencyDir, { recursive: true })
  writeFileSync(join(thirdPartyDependencyDir, 'package.json'), JSON.stringify({
    name: THIRD_PARTY_DEPENDENCY_NAME,
    version: '0.0.0',
    type: 'module',
    exports: './index.js',
  }) + '\n')
  writeFileSync(join(thirdPartyDependencyDir, 'index.js'), 'export const marker = "profile dependency"\n')
  writeFileSync(join(thirdPartyDir, 'package.json'), JSON.stringify({
    name: THIRD_PARTY_NAME,
    version: '0.0.0',
    type: 'module',
    exports: './index.js',
    dependencies: { [THIRD_PARTY_DEPENDENCY_NAME]: '0.0.0' },
  }) + '\n')
  writeFileSync(join(thirdPartyDir, 'index.js'), [
    "import { delimiter } from 'node:path'",
    `import { marker } from '${THIRD_PARTY_DEPENDENCY_NAME}'`,
    'export function apply(ctx) {',
    "  if (marker !== 'profile dependency') throw new Error('linked plugin did not resolve its profile dependency')",
    `  const expected = ${JSON.stringify(pnpmRuntime.pathDir)}`,
    '  const actual = (process.env.PATH ?? \'\').split(delimiter)[0]',
    '  if (actual !== expected) throw new Error(`third-party plugin received ${actual} instead of packaged pnpm PATH ${expected}`)',
    "  const launchPath = ctx.launchEnvironment?.get('PATH')?.value",
    `  if (launchPath !== ${JSON.stringify(launchPath)}) throw new Error('third-party plugin received a mutated launch-environment PATH snapshot')`,
    `  const runnerNames = new Set(${JSON.stringify([...RUNNER_ENVIRONMENT_NAMES])})`,
    "  const leaked = Object.keys(process.env).filter(key => runnerNames.has(key.toUpperCase()))",
    "  if (leaked.length > 0) throw new Error(`third-party plugin received runner-only environment: ${leaked.join(', ')}`)",
    '}',
    '',
  ].join('\n'))
  symlinkSync(thirdPartyDir, thirdPartyLink, 'junction')
  releasePackageResolver = installProfilePackageResolver(prepared.bareModuleBaseUrl)
  const profileRequire = createRequire(prepared.bareModuleBaseUrl)
  const desktopManifest = fileURLToPath(new URL('../package.json', import.meta.url))
  if (profileRequire.resolve('acryl-desktop/package.json') !== desktopManifest) {
    throw new Error('desktop package manifest did not resolve from the installed launcher')
  }
  const canvasManifest = fileURLToPath(new URL('../../acryl-development-canvas/package.json', import.meta.url))
  if (realpathSync(profileRequire.resolve('acryl-development-canvas/package.json')) !== realpathSync(canvasManifest)) {
    throw new Error('Canvas package manifest did not resolve from the installed launcher')
  }
  await import('acryl-development-canvas')
  const profileDirectoryRequire = createRequire(new URL('.', prepared.bareModuleBaseUrl))
  if (profileDirectoryRequire.resolve('acryl-desktop/package.json') !== desktopManifest) {
    throw new Error('desktop package manifest did not resolve from the profile directory')
  }

  const runtime = {
    platform: 'darwin',
    schedule(spec) {
      mountedSpec = spec
      return async () => { await mounted }
    },
    mountScheduled() {
      if (mountedSpec === undefined) return Promise.reject(new Error('desktop shell was not registered'))
      mounted ??= Promise.resolve()
      return mounted
    },
    show() {},
    async requestRestart() {},
    prepareToQuit() {},
    // Desktop sub-plugins (terminal, diagnostics, profiles, update-lifecycle)
    // contribute tray items through the runtime; the real Electron adapter
    // joins them into one menu. A no-op registration keeps the smoke's full
    // composition active without a native tray.
    registerTrayItem: () => ({ refresh: () => {}, dispose: () => {} }),
    // update-lifecycle reads the update adapter's packaged flag at activation;
    // a non-packaged build keeps the policy disabled (no network calls).
    updates: { isPackaged: false },
  }
  if (process.env.DEBUG_ROOT_CONFIG !== undefined) {
    console.error('rootConfig content:', readFileSync(prepared.rootConfig, 'utf8'))
    console.error('patches count:', prepared.patches.length, JSON.stringify(prepared.patches).slice(0, 3000))
  }
  ctx = await boot(
    BIN_NAME,
    prepared.rootConfig,
    [
      // The launcher composes the profile's bundle layers (dsh-web-app's
      // include tree, desktop/canvas overlays, home patches) via
      // `prepared.patches` (main.ts does the same); the smoke must too, or
      // the boot has no services (`connection` absent -> the shell's
      // `inject(['connection'])` never fires and it never schedules).
      ...prepared.patches,
      // The smoke's `webServer` stub pins the renderer URL assertions below;
      // disable the profile's own desktop-webserver row, or its real
      // `webServer` provision conflicts with the stub at <root>.
      { id: 'desktop-webserver', disabled: true },
      // The smoke asserts a fixed shell mode + renderer URL, so pin the row
      // config explicitly: the profile's own row leaves the plugin default
      // ('advanced'); an id-targeted row replaces only its config.
      { id: 'desktop-shell', config: { mode: 'compatibility' } },
      { insert: [
        { id: 'community-market', name: 'dsh-community-market' },
        { id: 'third-party-smoke', name: THIRD_PARTY_NAME },
      ] },
    ],
    (host) => {
      // Packaged Electron does not expose Node's internal ESM loader.
      host.loader.internal = undefined
      host.provide(DSH_LAUNCH_ENVIRONMENT_KEY, launchEnvironment)
      host.provide('desktopRuntime', runtime)
      host.provide('desktopPluginLifecycleBootstrap', {
        profileName: 'desktop',
        statePath: join(home, 'plugin-lifecycle', 'state.json'),
      })
      host.provide('webServer', {
        host: '127.0.0.1',
        port: 43120,
        register() { return () => {} },
      })
      // `dsh-client-connection`'s own cordis.patch.yml config row spreads
      // `ctx.webRuntime.trustedHosts` (`['app.internal', ...trustedHosts]`);
      // an empty stub previously went unexercised because nothing in this
      // smoke asked for `ctx.connection` — asking now (see
      // `acryl-desktop/src/index.ts`'s authenticatedUrl call) surfaces it.
      host.provide('webRuntime', { trustedHosts: [] })
      host.provide('appExit', () => {})
      // The shared web profile's rows wait on launcher-owned services the
      // real Host provides; mirror minimal, shape-correct stubs so the
      // composition can fully activate in the smoke.
      host.provide('cmdlineArgs', { get: () => [] })
      host.provide('webStartup', 'http://127.0.0.1:43120')
      host.provide('desktopPnpmBootstrap', {
        activeProfileName: 'web',
        activeProfileDir: prepared.profile.dir,
        homeDir: home,
        appExecutable: process.execPath,
        pnpmBinPath,
        electronVersion,
        nodeBinDir: pnpmRuntime.nodeBinDir,
        nodeShimPath: pnpmRuntime.nodeShimPath,
        clearEnvironmentPath: pnpmRuntime.clearEnvironmentPath,
        dshBootstrapPath: '',
        installRecoveryStatePath: '',
        generationId: 'loader-smoke',
        externalMarketInstallEnabled: false,
      })
      host.provide('desktopProfiles', {
        list: async () => [],
        data: () => ({ id: 'web', name: 'web' }),
        create: async () => {},
        select: async () => {},
      })
    },
    prepared.bareModuleBaseUrl,
  )
  if (process.env.DEBUG_VERIFY_LOADER_BOOT !== undefined) {
    console.error('connection service present:', ctx.get('connection') !== undefined)
    for (const entry of ctx.loader.entries()) {
      console.error(entry.options.name, entry.fiber?.state)
    }
  }
  if (process.env.DEBUG_ROOT_CONFIG !== undefined) {
    console.error('rootConfig content:', readFileSync(prepared.rootConfig, 'utf8'))
    console.error('patches count:', prepared.patches.length, JSON.stringify(prepared.patches).slice(0, 2000))
  }
  await runtime.mountScheduled()

  const desktopEntry = ctx.loader.resolve('include:desktop-shell')
  const marketEntry = ctx.loader.resolve('include:community-market')
  const thirdPartyEntry = ctx.loader.resolve('include:third-party-smoke')
  if (desktopEntry?.options.name !== 'acryl-desktop') {
    throw new Error('launcher-owned desktop plugin did not activate through its bare package name')
  }
  if (thirdPartyEntry?.options.name !== THIRD_PARTY_NAME) {
    throw new Error('profile-local third-party plugin did not activate')
  }
  if (marketEntry?.options.name !== 'dsh-community-market') {
    throw new Error('community market Host plugin did not activate through its bare package name')
  }
  if (mountedSpec?.mode !== 'compatibility') {
    throw new Error(`desktop plugin produced an unexpected shell mode: ${String(mountedSpec?.mode)}`)
  }
  // The Connection launch token is a fresh signed value per activation, so
  // this checks the stable parts and that a token is actually present —
  // its absence is exactly the bug that left the renderer 401'd and
  // boot-health timing out (see acryl-desktop/src/index.ts's
  // `ctx.connection.authenticatedUrl` call).
  const mountedUrl = mountedSpec?.url === undefined ? undefined : new URL(mountedSpec.url)
  if (mountedUrl?.origin !== 'http://127.0.0.1:43120'
    || mountedUrl.pathname !== '/'
    || mountedUrl.searchParams.get('dsh-desktop-mode') !== 'compatibility'
    || mountedUrl.searchParams.get('dsh-desktop-platform') !== 'darwin'
    || mountedUrl.searchParams.get('token') === null) {
    throw new Error(`desktop plugin produced an unexpected renderer URL: ${String(mountedSpec?.url)}`)
  }
} finally {
  try {
    await ctx?.fiber.dispose()
  } finally {
    try {
      releasePackageResolver?.()
    } finally {
      try {
        pnpmRuntime?.dispose()
      } finally {
        for (const key of Object.keys(process.env)) {
          if (RUNNER_ENVIRONMENT_NAMES.has(key.toUpperCase())) {
            delete process.env[key]
          }
        }
        for (const [key, value] of runnerEnvironment) process.env[key] = value
        rmSync(home, { recursive: true, force: true })
      }
    }
  }
}
