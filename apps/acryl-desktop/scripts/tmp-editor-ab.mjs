/**
 * TEMPORARY A/B harness (delete after use).
 *
 * Boots the real desktop profile headlessly with `acryl-dsh-editor-plugin`
 * installed as a profile bundle, mirroring what the Desktop market install
 * does: an extracted package under `<profile>/node_modules/<name>` plus a
 * `dsh.profile.bundles` entry whose `dsh.bundle.patch` inserts the
 * `dsh-editor` row.
 *
 * Usage: node scripts/tmp-editor-ab.mjs <extracted-package-dir> <label>
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { boot } from '@deepseek-ai/dsh-app-boot'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import {
  createLaunchEnvironmentSnapshot,
  DSH_LAUNCH_ENVIRONMENT_KEY,
} from '@deepseek-ai/dsh-launch-environment'
import { installDesktopPnpmRuntime } from '../lib/desktop-runtime-environment.js'
import { installProfilePackageResolver } from '../lib/module-resolution.js'
import { prepareDesktopProfile } from '../lib/profile.js'
import { DesktopProfileService } from '../lib/profile-service.js'

const PLUGIN_NAME = 'acryl-dsh-editor-plugin'
const BIN_NAME = 'acryl-desktop-editor-ab'
const pluginDir = process.argv[2]
const label = process.argv[3] ?? pluginDir
const home = mkdtempSync(join(tmpdir(), 'dsh-editor-ab-'))
let ctx
let releasePackageResolver

function report(ok, stage, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} [${label}] ${stage}${detail === '' ? '' : ` :: ${detail}`}`)
}

try {
  writeFileSync(join(home, 'settings.yaml'), [
    'dsh-desktop:',
    '  mode: advanced',
    'agent-presets:',
    '  default: minimal',
    '',
  ].join('\n'))

  // Materialize the profile once so the install step has a directory to write
  // into, exactly as the Desktop's recoverable install does.
  const materialized = prepareDesktopProfile('1', home, process.platform)
  const manifestPath = join(materialized.profile.dir, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.dsh.profile.bundles = [...manifest.dsh.profile.bundles, PLUGIN_NAME]
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  const installedDir = join(materialized.profile.dir, 'node_modules', PLUGIN_NAME)
  mkdirSync(join(materialized.profile.dir, 'node_modules'), { recursive: true })
  cpSync(pluginDir, installedDir, { recursive: true })
  report(true, 'installed', `${readFileSync(join(installedDir, 'package.json'), 'utf8').match(/"version": "([^"]+)"/)?.[1]}`)

  const prepared = prepareDesktopProfile('1', home, process.platform)
  const layer = prepared.profile.layers.find(entry => entry.packageName === PLUGIN_NAME)
  report(layer !== undefined, 'bundle layer resolved', layer?.patchPath ?? 'layer missing')
  const rowInserted = JSON.stringify(prepared.patches).includes('"id":"dsh-editor"')
    || JSON.stringify(prepared.patches).includes('"id": "dsh-editor"')
  report(rowInserted, 'cordis.patch.yml row composed into boot patches')

  const packageRoot = new URL('../', import.meta.url)
  const pnpmBinPath = fileURLToPath(new URL('node_modules/pnpm/bin/pnpm.mjs', packageRoot))
  const electronVersion = JSON.parse(
    readFileSync(new URL('node_modules/electron/package.json', packageRoot), 'utf8'),
  ).version
  const pnpmRuntime = installDesktopPnpmRuntime({
    platform: process.platform,
    appExecutable: process.execPath,
    pnpmBinPath,
    electronVersion,
    stateDir: join(home, 'runtime-commands'),
    environment: process.env,
  })
  releasePackageResolver = installProfilePackageResolver(prepared.bareModuleBaseUrl)

  let mountedSpec
  let nativeThemeSource = 'system'
  const runtime = {
    platform: process.platform,
    locale: 'en',
    updates: { isPackaged: false },
    schedule(spec) {
      mountedSpec = spec
      return async () => {}
    },
    async mountScheduled() {
      nativeThemeSource = mountedSpec?.readThemeSource() ?? 'system'
    },
    show() {},
    registerTrayItem: () => ({ refresh: () => {}, dispose: () => {} }),
    openTerminal() {},
    setLocalePreference() {},
    setThemeSource(source) { nativeThemeSource = source },
    async requestRestart() {},
    prepareToQuit() {},
  }

  ctx = await boot(
    BIN_NAME,
    prepared.rootConfig,
    prepared.patches,
    async (host) => {
      host.provide(DSH_LAUNCH_ENVIRONMENT_KEY, createLaunchEnvironmentSnapshot([]))
      host.provide('desktopRuntime', runtime)
      host.provide('desktopPluginLifecycleBootstrap', {
        profileName: 'desktop',
        statePath: join(home, 'plugin-lifecycle', 'state.json'),
      })
      host.provide('desktopPnpmBootstrap', {
        activeProfileName: 'desktop',
        activeProfileDir: prepared.profile.dir,
        homeDir: prepared.homeDir,
        appExecutable: process.execPath,
        pnpmBinPath,
        electronVersion,
        nodeBinDir: pnpmRuntime.nodeBinDir,
        nodeShimPath: pnpmRuntime.nodeShimPath,
        clearEnvironmentPath: pnpmRuntime.clearEnvironmentPath,
        dshBootstrapPath: fileURLToPath(new URL('../lib/desktop-cli.js', import.meta.url)),
        installRecoveryStatePath: join(home, 'plugin-install-recovery', 'state.json'),
        generationId: 'editor-ab',
        externalMarketInstallEnabled: prepared.market.effective === 'dsh-market',
      })
      await host.plugin(DesktopProfileService, {
        current: { name: 'desktop', dir: prepared.profile.dir },
        list: () => [{
          name: 'desktop',
          dir: prepared.profile.dir,
          exists: true,
          bundles: prepared.profile.layers.map(entry => entry.packageName),
          webCapable: true,
        }],
        persistSelection: () => {},
        requestRestart: () => {},
      })
      provideCmdline(host, { args: ['--host', '127.0.0.1', '--port', '0'], exit: () => {} })
    },
    prepared.bareModuleBaseUrl,
  )
  await runtime.mountScheduled()
  report(true, 'profile booted', `webServer port ${String(ctx.webServer.port)}, theme ${nativeThemeSource}`)

  const base = `http://127.0.0.1:${String(ctx.webServer.port)}`
  const launchUrl = new URL(ctx.connection.authenticatedUrl(base))
  launchUrl.searchParams.set('dsh-desktop-mode', 'advanced')
  const launch = await fetch(launchUrl, { redirect: 'manual' })
  const setCookie = launch.headers.getSetCookie?.()[0] ?? launch.headers.get('set-cookie')
  const cookie = (setCookie ?? '').split(';')[0] ?? ''
  report(launch.status === 303 && cookie !== '', 'launch token exchanged', `HTTP ${String(launch.status)}`)
  const rootResponse = await fetch(new URL('/', base), { headers: { cookie } })
  report(rootResponse.status === 200, 'renderer root served', `HTTP ${String(rootResponse.status)}`)
  const html = await rootResponse.text()
  const graph = JSON.parse(
    /(?:window\.__DSH_BOOT__|globalThis\["__DSH_BOOT__"\]) = (\{.*?\})<\/script>/u.exec(html)?.[1] ?? '{}',
  )
  const ids = new Set((graph.entries ?? []).map(entry => entry.id))

  // The client module loader materializes each boot row by package name and
  // then asserts the served bundle registered that same id (BootModuleRow.id
  // is documented as "Entry name == package name (module-table key)").
  const editorRow = (graph.entries ?? []).find(entry => entry.id === PLUGIN_NAME)
  report(editorRow !== undefined, 'plugin client row uses the package name as its boot id')
  const editorBatch = (graph.batches ?? []).find(batch => (batch.entries ?? []).includes(PLUGIN_NAME))
  report(editorBatch !== undefined, 'plugin client row is part of a served batch')
  if (editorBatch !== undefined) {
    const bundleResponse = await fetch(new URL(editorBatch.url, base), { headers: { cookie } })
    const bundleText = await bundleResponse.text()
    const registered = new Set()
    for (const match of bundleText.matchAll(/__ModuleLoader__\.load\(\{(?:[^}]*?)id:\s*["']([^"']+)["']/gu)) {
      registered.add(match[1])
    }
    const expected = editorBatch.entries ?? []
    const missing = expected.filter(id => !registered.has(id))
    report(
      missing.length === 0,
      'every batch entry registers its own id in the served bundle',
      `HTTP ${String(bundleResponse.status)} ${String(expected.length)} entries, missing=${JSON.stringify(missing)}`,
    )
  }

  // A mounted /editor channel answers the Host/Origin + browser-auth fence
  // (401/403) before it ever dispatches; an unmounted path is a plain 404.
  const rpcResponse = await fetch(`${base}/editor/fs.init`, { method: 'POST', body: '{}' })
  report(
    rpcResponse.status !== 404,
    '/editor RPC channel mounted on webServer',
    `HTTP ${String(rpcResponse.status)} ${JSON.stringify((await rpcResponse.text()).slice(0, 80))}`,
  )
  const control = await fetch(`${base}/not-a-channel/fs.init`, { method: 'POST', body: '{}' })
  report(
    control.status !== 401,
    'control: unregistered path never reaches the channel fence',
    `HTTP ${String(control.status)}`,
  )
  console.log(`   client graph has ${String(ids.size)} client entries; editor client present: ${String(ids.has('dsh-editor'))}`)
} catch (cause) {
  report(false, 'boot', cause instanceof Error ? cause.message.split('\n').slice(0, 8).join('\n   ') : String(cause))
  process.exitCode = 1
} finally {
  await ctx?.fiber.dispose()
  releasePackageResolver?.()
  rmSync(home, { recursive: true, force: true })
}
