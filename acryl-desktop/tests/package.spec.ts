import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

const packageRoot = new URL('../', import.meta.url)
const workspaceRoot = new URL('../', packageRoot)
const canvasRoot = new URL('acryl-development-canvas/', workspaceRoot)
const canvasManifest = JSON.parse(readFileSync(new URL('package.json', canvasRoot), 'utf8')) as {
  name?: unknown
  exports?: Record<string, unknown>
  dsh?: { bundle?: { patch?: unknown }; client?: unknown }
}
const manifest = JSON.parse(readFileSync(new URL('package.json', packageRoot), 'utf8')) as {
  name?: unknown
  version?: unknown
  bin?: Record<string, unknown>
  exports?: Record<string, unknown>
  files?: unknown
  scripts?: Record<string, unknown>
  dsh?: { bundle?: { patch?: unknown }; client?: unknown }
  build?: {
    productName?: unknown
    appId?: unknown
    asarUnpack?: unknown
    afterPack?: unknown
    electronFuses?: unknown
    toolsets?: Record<string, unknown>
    files?: unknown
    mac?: {
      artifactName?: unknown
      extendInfo?: unknown
      hardenedRuntime?: unknown
      icon?: unknown
      mergeASARs?: unknown
      notarize?: unknown
      signIgnore?: unknown
      target?: unknown
      x64ArchFiles?: unknown
    }
    win?: { icon?: unknown; target?: unknown; artifactName?: unknown }
    nsis?: Record<string, unknown>
    portable?: Record<string, unknown>
    linux?: { artifactName?: unknown; icon?: unknown }
  }
  dependencies?: Record<string, unknown>
  optionalDependencies?: Record<string, unknown>
  devDependencies?: Record<string, unknown>
  peerDependencies?: Record<string, unknown>
}
const workspaceManifest = JSON.parse(readFileSync(new URL('package.json', workspaceRoot), 'utf8')) as {
  packageManager?: unknown
  version?: unknown
  scripts?: Record<string, unknown>
}
const pnpmWorkspace = readFileSync(new URL('pnpm-workspace.yaml', workspaceRoot), 'utf8')

function expectPatchedDependency(name: string, path: string): void {
  expect(pnpmWorkspace).toContain(`  '${name}': ${path.slice(2)}`)
}
const ciWorkflow = readFileSync(new URL('.github/workflows/ci.yml', workspaceRoot), 'utf8')
const releaseWorkflow = readFileSync(
  new URL('.github/workflows/release.yml', workspaceRoot),
  'utf8',
)

describe('published package surface', () => {
  it('runs owned-workspace typechecks and tests through PNPM filters', () => {
    expect(workspaceManifest.packageManager).toBe('pnpm@11.7.0')
    expect(workspaceManifest.scripts?.typecheck)
      .toBe('pnpm --filter acryl-control run typecheck && pnpm --filter acryl-tui run typecheck && pnpm --filter acryl-development-canvas run typecheck && pnpm --filter acryl-desktop run typecheck && pnpm --filter dsh-community-market run typecheck')
    expect(workspaceManifest.scripts?.test)
      .toBe('pnpm --filter acryl-control run test && pnpm --filter acryl-tui run test && pnpm --filter acryl-development-canvas run test && pnpm --filter acryl-desktop run test && pnpm --filter dsh-community-market run test')
    expect(pnpmWorkspace).toContain("  - '!deepseek-harness/**'")
    expect(pnpmWorkspace).toContain('node-pty: true')
  })

  it('registers both npm launcher names', () => {
    expect(manifest.name).toBe('acryl-desktop')
    expect(manifest.bin).toEqual({
      'acryl-desktop': 'lib/bin.js',
      'dsh-desktop': 'lib/bin.js',
    })
  })

  it('exposes the Host plugin and desktop-owned client face', () => {
    expect(manifest.exports).toHaveProperty('./client')
    expect(manifest.exports).toHaveProperty('./windows-pwsh-sandbox', {
      types: './lib/types/windows-pwsh-sandbox.d.ts',
      default: './lib/windows-pwsh-sandbox.js',
    })
    expect(manifest.exports).toHaveProperty('./windows-agent-presets', {
      types: './lib/types/windows-agent-presets.d.ts',
      default: './lib/windows-agent-presets.js',
    })
    expect(manifest.exports).toHaveProperty('./terminal', {
      types: './lib/types/terminal.d.ts',
      default: './lib/terminal.js',
    })
    expect(manifest.exports).not.toHaveProperty('./development-canvas')
    expect(canvasManifest).toMatchObject({
      name: 'acryl-development-canvas',
      exports: {
        '.': { types: './lib/types/index.d.ts', default: './lib/index.js' },
        './client': { types: './lib/types/client/index.d.ts', default: './lib/client.js' },
      },
      dsh: {
        bundle: { patch: './cordis.patch.yml' },
        client: { platform: 'web' },
      },
    })
    expect(manifest.exports).toHaveProperty('./hello-world', {
      types: './lib/types/hello-world.d.ts',
      default: './lib/hello-world.js',
    })
    expect(manifest.exports).toHaveProperty('./pnpm', {
      types: './lib/types/pnpm.d.ts',
      default: './lib/pnpm.js',
    })
    expect(manifest.exports).toHaveProperty('./profile-service', {
      types: './lib/types/profile-service.d.ts',
      default: './lib/profile-service.js',
    })
    expect(manifest.exports).toHaveProperty('./profiles', {
      types: './lib/types/profiles.d.ts',
      default: './lib/profiles.js',
    })
    expect(manifest.exports).toHaveProperty('./diagnostics', {
      types: './lib/types/diagnostics.d.ts',
      default: './lib/diagnostics.js',
    })
    expect(manifest.exports).toHaveProperty('./updates', {
      types: './lib/types/updates.d.ts',
      default: './lib/updates.js',
    })
    expect(manifest.exports).toHaveProperty('./notifications', {
      types: './lib/types/notifications.d.ts',
      default: './lib/notifications.js',
    })
    expect(manifest.exports).not.toHaveProperty('./windows-acl-runner')
    expect(manifest.exports).not.toHaveProperty('./desktop-cli')
    expect(manifest.exports).not.toHaveProperty('./desktop-runtime-environment')
    expect(manifest.exports).not.toHaveProperty('./desktop-terminal')
    expect(manifest.exports).not.toHaveProperty('./update-checker')
    expect(manifest.exports).not.toHaveProperty('./update-download')
    expect(manifest.exports).toHaveProperty('./package.json')
    expect(manifest.dsh?.bundle).toEqual({ patch: './cordis.patch.yml' })
    expect(manifest.dsh?.client).toEqual({
      platform: 'web',
      inject: [
        '@deepseek-ai/dsh-api-remotes',
        '@deepseek-ai/dsh-client-connection',
        '@deepseek-ai/dsh-client-locale',
        '@deepseek-ai/dsh-client-runtime',
        '@deepseek-ai/dsh-client-ui-settings',
        '@deepseek-ai/dsh-client-ui-theme',
      ],
    })
    expect(readFileSync(new URL('cordis.patch.yml', packageRoot), 'utf8')).toContain('name: acryl-desktop')
    expect(readFileSync(new URL('cordis.patch.yml', packageRoot), 'utf8')).not.toContain('name: dsh-community-market')
    expect(readFileSync(new URL('cordis.patch.yml', packageRoot), 'utf8')).toContain('name: acryl-desktop/terminal')
    expect(readFileSync(new URL('cordis.patch.yml', packageRoot), 'utf8')).not.toContain('development-canvas')
    expect(readFileSync(new URL('cordis.patch.yml', canvasRoot), 'utf8'))
      .toContain('name: acryl-development-canvas')
    expect(readFileSync(new URL('cordis.patch.yml', packageRoot), 'utf8')).toContain('name: acryl-desktop/hello-world')
    expect(readFileSync(new URL('cordis.patch.yml', packageRoot), 'utf8')).toContain('name: acryl-desktop/pnpm')
    expect(readFileSync(new URL('cordis.patch.yml', packageRoot), 'utf8')).toContain('name: acryl-desktop/profiles')
    expect(readFileSync(new URL('cordis.patch.yml', packageRoot), 'utf8')).toContain('name: acryl-desktop/diagnostics')
    expect(readFileSync(new URL('cordis.patch.yml', packageRoot), 'utf8')).toContain('name: acryl-desktop/notifications')
    expect(readFileSync(new URL('cordis.patch.yml', packageRoot), 'utf8')).toContain('name: acryl-desktop/updates')
  })

  it('pins standalone Canvas and both selectable Market providers in the published runtime', () => {
    expect(manifest.dependencies).toMatchObject({
      'dsh-community-market': 'workspace:*',
      'acryl-development-canvas': 'workspace:*',
      dshmarket: '1.17.1',
    })
    expect(manifest.optionalDependencies ?? {}).not.toHaveProperty('dshmarket')
  })

  it('patches app boot to accept an empty patch layer', () => {
    const patchPath = './patches/dsh-app-boot@0.1.1-rc.2.patch'
    expectPatchedDependency('@deepseek-ai/dsh-app-boot@0.1.1-rc.2', patchPath)
    const marker = 'if (parsed === void 0 || parsed === null) return [];'
    const patch = readFileSync(new URL(patchPath, workspaceRoot), 'utf8')
    const installedBoot = readFileSync(new URL(
      'node_modules/@deepseek-ai/dsh-app-boot/lib/index.js',
      packageRoot,
    ), 'utf8')
    expect(patch).toContain(marker)
    expect(installedBoot).toContain(marker)
  })

  it('patches the browse panel with the Windows native-picker icon bridge', () => {
    const patchPath = './patches/dsh-client-ui-directory-picker-browse@0.1.1-rc.2.patch'
    expectPatchedDependency('@deepseek-ai/dsh-client-ui-directory-picker-browse@0.1.1-rc.2', patchPath)
    const patch = readFileSync(new URL(patchPath, workspaceRoot), 'utf8')
    const installedClient = readFileSync(new URL(
      'node_modules/@deepseek-ai/dsh-client-ui-directory-picker-browse/lib/client.js',
      packageRoot,
    ), 'utf8')
    for (const marker of [
      '__DSH_DESKTOP_PICK_DIRECTORY__',
      '__DSH_DESKTOP_VALIDATE_DIRECTORY__',
      'openDirectory(path)',
      'openDirectory(targetPath)',
      'IconFolderOpen16',
      'nativePickerButton',
      'browser.nativePicker',
      'border:1px solid var(--dsw-alias-border-l2)',
      'background:var(--dsw-alias-bg-layer-2)',
    ]) {
      expect(patch).toContain(marker)
      expect(installedClient).toContain(marker)
    }
  })

  it('marks the upstream Workspace browser as the desktop folder-drop target', () => {
    const patchPath = './patches/dsh-client-ui-workspace@0.1.1-rc.2.patch'
    expectPatchedDependency('@deepseek-ai/dsh-client-ui-workspace@0.1.1-rc.2', patchPath)
    const patch = readFileSync(new URL(patchPath, workspaceRoot), 'utf8')
    const installedClient = readFileSync(new URL(
      'node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js',
      packageRoot,
    ), 'utf8')
    expect(patch).toContain('data-dsh-workspace-drop-target')
    expect(installedClient).toContain('data-dsh-workspace-drop-target')
  })

  it('keeps API selection available after overriding a provider base URL', () => {
    const patchPath = './patches/dsh-client-ui-settings-models@0.1.1-rc.2.patch'
    expectPatchedDependency('@deepseek-ai/dsh-client-ui-settings-models@0.1.1-rc.2', patchPath)
    const patch = readFileSync(new URL(patchPath, workspaceRoot), 'utf8')
    const installedClient = readFileSync(new URL(
      'node_modules/@deepseek-ai/dsh-client-ui-settings-models/lib/client.js',
      packageRoot,
    ), 'utf8')
    for (const marker of [
      'const baseURLOverridden = schema.hasPath(draft, ["baseURL"])',
      'const canCustomizeApi = ownsIdentity || baseURLOverridden',
      'canCustomizeApi ? (0, react_jsx_runtime.jsxs)("div"',
    ]) {
      expect(patch).toContain(marker)
      expect(installedClient).toContain(marker)
    }
  })

  it('localizes Trajectory toolbar labels in Simplified Chinese', () => {
    const patchPath = './patches/dsh-client-ui-trajectory@0.1.1-rc.2.patch'
    expectPatchedDependency('@deepseek-ai/dsh-client-ui-trajectory@0.1.1-rc.2', patchPath)
    const patch = readFileSync(new URL(patchPath, workspaceRoot), 'utf8')
    const installedClient = readFileSync(new URL(
      'node_modules/@deepseek-ai/dsh-client-ui-trajectory/lib/client.js',
      packageRoot,
    ), 'utf8')
    for (const marker of [
      '"toolbar.duration": "耗时"',
      '"toolbar.useActualDuration": "使用实际耗时"',
      '"toolbar.useEqualWidth": "使用等宽操作"',
      '"toolbar.turns": "轮次"',
      '"toolbar.expandTurns": "展开轮次"',
      '"toolbar.collapseTurns": "折叠轮次"',
      '"toolbar.calls": "调用"',
      '"toolbar.expandCalls": "展开调用"',
      '"toolbar.collapseCalls": "折叠调用"',
      '"toolbar.thinking": "思考"',
      'children: [trajectoryLabel("toolbar.thinking")',
      'currentTrajectoryT = t',
    ]) {
      expect(patch).toContain(marker)
      expect(installedClient).toContain(marker)
    }
  })

  it('keeps Desktop boot from opening an external browser and uses Electron Node mode for explicit helpers', () => {
    const patchPath = './patches/dsh-web-app@0.1.1-rc.2.patch'
    expectPatchedDependency('@deepseek-ai/dsh-web-app@0.1.1-rc.2', patchPath)
    const patch = readFileSync(new URL(patchPath, workspaceRoot), 'utf8')
    const installedWebApp = readFileSync(new URL(
      'node_modules/@deepseek-ai/dsh-web-app/lib/index.js',
      packageRoot,
    ), 'utf8')
    const installedWebPatch = readFileSync(new URL(
      'node_modules/@deepseek-ai/dsh-web-app/cordis.patch.yml',
      packageRoot,
    ), 'utf8')
    const desktopPatch = readFileSync(new URL('cordis.patch.yml', packageRoot), 'utf8')
    for (const marker of [
      'ELECTRON_RUN_AS_NODE: "1"',
      "name.toUpperCase() === 'ELECTRON_RUN_AS_NODE'",
    ]) {
      expect(patch).toContain(marker)
      expect(installedWebApp).toContain(marker)
    }
    expect(patch).toContain('openBrowser: false')
    expect(installedWebPatch).toContain('openBrowser: false')
    expect(installedWebPatch).not.toContain('openBrowser: !!js ctx.webStartup.openBrowser')
    expect(desktopPatch).toMatch(/- id: web-runtime\n  config:\n    openBrowser: false/)
  })

  it.runIf(process.platform === 'win32')(
    'launches the browser opener helper through Electron Node mode',
    () => {
      const require = createRequire(new URL('package.json', packageRoot))
      const electronPath = require('electron') as string
      const webAppEntry = require.resolve('@deepseek-ai/dsh-web-app')
      const root = mkdtempSync(join(tmpdir(), 'dsh-browser-opener-'))
      const fakePowerShellDir = join(root, 'System32', 'WindowsPowerShell', 'v1.0')
      const fakePowerShell = join(fakePowerShellDir, 'powershell.exe')
      const main = join(root, 'main.mjs')
      const environment = { ...process.env }
      for (const name of Object.keys(environment)) {
        if (name.toUpperCase() === 'SYSTEMROOT' || name.toUpperCase() === 'WINDIR') delete environment[name]
      }
      environment.SYSTEMROOT = root

      try {
        mkdirSync(fakePowerShellDir, { recursive: true })
        copyFileSync(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'cmd.exe'), fakePowerShell)
        writeFileSync(main, [
          `import { internals } from ${JSON.stringify(pathToFileURL(webAppEntry).href)}`,
          `await internals.openBrowser('http://127.0.0.1:9/')`,
          `process.stdout.write('OPEN_OK')`,
          `process.exit(0)`,
          '',
        ].join('\n'))

        const stdout = execFileSync(electronPath, [main], {
          encoding: 'utf8',
          env: environment,
          timeout: 30_000,
          windowsHide: true,
        })
        expect(stdout).toContain('OPEN_OK')
        expect(stdout).not.toContain('Unable to find Electron app')
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    },
    45_000,
  )

  it('builds public Host plugins and their private native bootstraps', () => {
    const config = readFileSync(new URL('tsdown.config.ts', packageRoot), 'utf8')

    expect(config).toContain("'windows-pwsh-sandbox': 'src/windows-pwsh-sandbox.ts'")
    expect(config).toContain("'windows-agent-presets': 'src/windows-agent-presets.ts'")
    expect(config).toContain("'windows-acl-runner': 'src/windows-acl-runner.ts'")
    expect(config).toContain("'desktop-cli': 'src/desktop-cli.ts'")
    expect(config).toContain("'desktop-runtime-environment': 'src/desktop-runtime-environment.ts'")
    expect(config).toContain("'desktop-terminal': 'src/desktop-terminal.ts'")
    expect(config).toContain("'profile-manager': 'src/profile-manager.ts'")
    expect(config).toContain("'profile-service': 'src/profile-service.ts'")
    expect(config).toContain("pnpm: 'src/pnpm.ts'")
    expect(config).toContain("profiles: 'src/profiles.ts'")
    expect(config).toContain("diagnostics: 'src/diagnostics.ts'")
    expect(config).toContain("notifications: 'src/notifications.ts'")
    expect(config).toContain("'diagnostic-export-worker': 'src/diagnostic-export-worker.ts'")
    expect(config).toContain("entry: { preload: 'src/preload.ts' }")
    expect(config).toContain("entryFileNames: 'preload.cjs'")
    expect(config).toContain("terminal: 'src/terminal.ts'")
    expect(config).toContain("'hello-world': 'src/hello-world.ts'")
    expect(config).not.toContain("'development-canvas': 'src/development-canvas.ts'")
    const canvasConfig = readFileSync(new URL('tsdown.config.ts', canvasRoot), 'utf8')
    expect(canvasConfig).toContain("entry: { index: 'src/index.ts' }")
    expect(canvasConfig).toContain("entry: { client: 'src/client/index.ts' }")
    expect(config).toContain("'update-download': 'src/update-download.ts'")
    expect(config).toContain("updates: 'src/updates.ts'")
  })

  it('installs Host command PATHs after the launch snapshot and before profile boot', () => {
    const main = readFileSync(new URL('src/main.ts', packageRoot), 'utf8')
    const recover = main.indexOf('await resolveDesktopShellEnvironment')
    const applyRecovered = main.indexOf('Object.entries(shellEnvironmentResolution.updates)')
    const snapshot = main.indexOf('const environment = loadLayeredEnv')
    const install = main.indexOf('const pnpmRuntime = installDesktopPnpmRuntime')
    const prepare = main.indexOf('const prepared = prepareDesktopProfile')
    const installDsh = main.indexOf('const dshRuntime = process.platform === \'win32\'')
    const ownPnpm = main.indexOf('const releasePnpmRuntime = generation.own(')
    const ownDsh = main.indexOf('const releaseDshRuntime = generation.own(')
    const boot = main.indexOf('const ctx = await boot')

    expect(recover).toBeGreaterThanOrEqual(0)
    expect(applyRecovered).toBeGreaterThan(recover)
    expect(snapshot).toBeGreaterThan(applyRecovered)
    expect(install).toBeGreaterThan(snapshot)
    expect(ownPnpm).toBeGreaterThan(install)
    expect(prepare).toBeGreaterThan(install)
    expect(installDsh).toBeGreaterThan(prepare)
    expect(ownDsh).toBeGreaterThan(installDsh)
    expect(boot).toBeGreaterThan(prepare)
    expect(boot).toBeGreaterThan(installDsh)
    expect(main).toContain("'acryl-desktop: packaged pnpm runtime PATH'")
    expect(main).toContain("'acryl-desktop: packaged dsh runtime PATH'")
    expect(main).toContain("args: ['--host', '127.0.0.1', '--port', String(prepared.port)]")
    expect(main).not.toContain("'--port', '0'")
    expect(main).toContain("import { DesktopStartupGeneration } from './startup-generation.ts'")
    expect(main).toContain('async () => { await generation.release() }')
    expect(main).not.toContain('disposePnpmRuntime')
    expect(main).not.toContain('disposeDshRuntime')
  })

  it('injects profile creation into the generation-scoped Host service without selecting it', () => {
    const main = readFileSync(new URL('src/main.ts', packageRoot), 'utf8')
    const profileImport = main.indexOf('createDesktopWebProfile,')
    const profileService = main.indexOf('await hostCtx.plugin(DesktopProfileService, {')
    const create = main.indexOf('create: name => createDesktopWebProfile(homeDir, name),', profileService)
    const list = main.indexOf('list: () => listDesktopProfiles(homeDir),', profileService)
    const persist = main.indexOf('persistSelection: name => { selectDesktopProfile(selectionStatePath, homeDir, name) },', profileService)
    const restart = main.indexOf('requestRestart: () => runtime.requestRestart(),', profileService)

    expect(profileImport).toBeGreaterThanOrEqual(0)
    expect(profileService).toBeGreaterThan(profileImport)
    expect(create).toBeGreaterThan(profileService)
    expect(list).toBeGreaterThan(create)
    expect(persist).toBeGreaterThan(list)
    expect(restart).toBeGreaterThan(persist)
  })

  it('wires local crash evidence before Electron becomes ready', () => {
    const main = readFileSync(new URL('src/main.ts', packageRoot), 'utf8')
    const startCrashReporter = main.indexOf('startDesktopCrashReporting(crashReporter')
    const beginRun = main.indexOf('beginDesktopRun(')
    const childLogging = main.indexOf('installDesktopChildProcessLogging(app')
    const exitCoordinator = main.indexOf('createDesktopExitCoordinator(')
    const ready = main.indexOf('await app.whenReady()')
    const markClean = main.indexOf('desktopRun?.markClean()')
    const nativeExit = main.indexOf('app.exit(code)')

    expect(startCrashReporter).toBeGreaterThanOrEqual(0)
    expect(beginRun).toBeGreaterThan(startCrashReporter)
    expect(childLogging).toBeGreaterThan(beginRun)
    expect(exitCoordinator).toBeGreaterThan(childLogging)
    expect(nativeExit).toBeGreaterThan(exitCoordinator)
    expect(markClean).toBeGreaterThan(nativeExit)
    expect(ready).toBeGreaterThan(markClean)
  })

  it('claims plugin install recovery before profile composition and gates health in Electron main', () => {
    const main = readFileSync(new URL('src/main.ts', packageRoot), 'utf8')
    const fixedStatePath = main.indexOf("desktopInstallRecoveryStatePath(app.getPath('userData'))")
    const beginProfile = main.indexOf('profileStartup = beginDesktopProfileStartup(')
    const stateCommit = main.indexOf('const stateCommit = new DesktopStartupStateCommit({')
    const claim = main.indexOf('const recoveryClaim = await installRecovery.claim()')
    const observeClaim = main.indexOf('stateCommit.observeInstallRecoveryClaim(recoveryClaim)')
    const prepare = main.indexOf('const prepared = prepareDesktopProfile(')
    const monitor = main.indexOf('const rendererBoot = runtime.beginRendererBootMonitoring({')
    const commitHealthy = main.indexOf('commitHealthy: async () => {', monitor)
    const awaitRenderer = main.indexOf('const [, rendererVerdict] = await Promise.all([')
    const mount = main.indexOf('runtime.mountScheduled(),', awaitRenderer)
    const commitStateHealthy = main.indexOf('await stateCommit.commitHealthy()', commitHealthy)

    expect(fixedStatePath).toBeGreaterThanOrEqual(0)
    expect(main).toContain("import { DesktopStartupStateCommit } from './startup-state-commit.ts'")
    expect(main).not.toContain("desktopInstallRecoveryStatePath(app.getPath('userData'), process.env)")
    expect(main).not.toContain('process.env[DESKTOP_INSTALL_RECOVERY_STATE_ENV]')
    expect(beginProfile).toBeGreaterThan(fixedStatePath)
    expect(stateCommit).toBeGreaterThan(beginProfile)
    expect(claim).toBeGreaterThan(stateCommit)
    expect(observeClaim).toBeGreaterThan(claim)
    expect(prepare).toBeGreaterThan(claim)
    expect(main).toContain('installRecoveryStatePath,\n      generationId,')
    expect(monitor).toBeGreaterThan(prepare)
    expect(commitHealthy).toBeGreaterThan(monitor)
    expect(commitStateHealthy).toBeGreaterThan(commitHealthy)
    expect(awaitRenderer).toBeGreaterThan(commitStateHealthy)
    expect(mount).toBeGreaterThan(awaitRenderer)
    expect(main).not.toContain('verifyingInstall')
    expect(main).not.toContain('verifiedInstallToClear')
    expect(main).not.toContain('await installRecovery.markHealthy(')
    expect(main).not.toContain('markDesktopProfileHealthy(')
  })

  it('wires lifecycle evidence through key startup stages and terminal outcomes', () => {
    const main = readFileSync(new URL('src/main.ts', packageRoot), 'utf8')
    const createRecorder = main.indexOf('const lifecycleRecorder = createDesktopLifecycleRecorder({')
    const startRun = main.indexOf('lifecycleRecorder.startStartup(startupStage)')
    const finishRenderer = main.indexOf('lifecycleRecorder.finishRendererBoot(')
    const rendererStage = main.indexOf("startupStage = 'renderer-startup'")
    const startRenderer = main.indexOf('lifecycleRecorder.startRendererBoot()')
    const awaitRenderer = main.indexOf('const [, rendererVerdict] = await Promise.all([')
    const healthStage = main.indexOf("startupStage = 'health-commit'")
    const completeStartup = main.indexOf('lifecycleRecorder.completeStartup(startupStage, rendererReport)')
    const catchFailure = main.indexOf('} catch (cause) {')
    const failPendingRenderer = main.indexOf('lifecycleRecorder.failRendererBootIfPending(')
    const catchFailStartup = main.indexOf('lifecycleRecorder.failStartup(', failPendingRenderer)

    expect(main).toContain("import { createDesktopLifecycleRecorder } from './lifecycle-events.ts'")
    expect(createRecorder).toBeGreaterThanOrEqual(0)
    expect(startRun).toBeGreaterThan(createRecorder)
    for (const stage of [
      'shell-environment',
      'runtime-bootstrap',
      'profile-selection',
      'install-recovery',
      'profile-composition',
      'host-boot',
      'renderer-startup',
      'health-commit',
    ]) {
      expect(main).toContain(`startupStage = '${stage}'`)
    }
    expect(main).toContain('lifecycleRecorder.transitionStartupStage(startupStage)')
    expect(finishRenderer).toBeGreaterThan(createRecorder)
    expect(startRenderer).toBeGreaterThan(rendererStage)
    expect(startRenderer).toBeLessThan(awaitRenderer)
    expect(healthStage).toBeGreaterThan(startRenderer)
    expect(healthStage).toBeLessThan(awaitRenderer)
    expect(completeStartup).toBeGreaterThan(awaitRenderer)
    expect(failPendingRenderer).toBeGreaterThan(catchFailure)
    expect(catchFailStartup).toBeGreaterThan(failPendingRenderer)
    expect(main).toContain('lifecycleRendererFailureReason(runtime.rendererBootFailureReason)')
    expect(main).toContain('lifecycleStartupFailureReason(cause, runtime)')
  })

  it('routes protected and ordinary startup failures through the native recovery window', () => {
    const main = readFileSync(new URL('src/main.ts', packageRoot), 'utf8')
    const windows = [...main.matchAll(/await openStartupRecoveryWindow\(/gu)]
      .map(match => match.index)
    const prompt = main.indexOf("if (recoveryClaim.action === 'prompt')")
    const prepare = main.indexOf('const prepared = prepareDesktopProfile(')
    const commitFailure = main.indexOf('await startupStateCommit.commitFailure({')

    expect(windows).toHaveLength(3)
    expect(windows[0]).toBeGreaterThan(prompt)
    expect(windows[0]).toBeLessThan(prepare)
    expect(commitFailure).toBeGreaterThan(prepare)
    expect(windows[1]).toBeGreaterThan(prepare)
    expect(windows[1]).toBeLessThan(commitFailure)
    expect(windows[2]).toBeGreaterThan(commitFailure)
    expect(main).not.toContain('await installRecovery.restore(')
    expect(main).not.toContain('await installRecovery.recordFailure(')
    expect(main).not.toContain('markDesktopProfileFailed(')
    expect(main).toContain('quiesceForRecovery: () => generation.quiesceForRecovery()')
    expect(main).toContain('failureCommit.reopenLastKnownGood !== undefined')
    expect(main).toContain('failureStage: startupStage')
    expect(main).toContain("startupStage = 'profile-composition'")
    expect(main).toContain("startupStage = 'host-boot'")
    expect(main).toContain("startupStage = 'renderer-startup'")
    expect(main).toContain("return report.status === 'failed'")
    expect(main).not.toContain("return report.status === 'failed' && verifyingInstall !== undefined")
    expect(main).toContain('void run().catch(async (cause: unknown) => { await handleFatalLauncherFailure(cause) })')
    expect(main).toContain('await installRecovery.markRollbackNotified(')
  })

  it('uses the upstream child-environment scrub around login-shell recovery', () => {
    const shellEnvironment = readFileSync(new URL('src/shell-environment.ts', packageRoot), 'utf8')

    expect(shellEnvironment).toContain('scrubbedParentEnv')
    expect(shellEnvironment).toContain('SENSITIVE_ENV_PATTERN')
    expect(shellEnvironment).toContain('DSH_ENV_PREFIX')
    expect(shellEnvironment).toContain('DESKTOP_SHELL_ENVIRONMENT_KEYS')
  })

  it('fixes the installed application identity', () => {
    expect(manifest.version).toBe(workspaceManifest.version)
    expect(manifest.build?.productName).toBe('ACRYL')
    expect(manifest.build?.appId).toBe('dev.acryl.desktop')
    expect(manifest.build?.asarUnpack).toEqual([
      'package.json',
      'cordis.patch.yml',
      'build/**',
      'lib/**',
      'node_modules/**',
    ])
    expect(manifest.build?.electronFuses).toEqual({ runAsNode: true })
    expect(manifest.build?.toolsets).toEqual({ nsis: '1.2.1' })
    expect(manifest.files).toEqual(expect.arrayContaining([
      'build/app-icon.png',
      'build/app-icon-mac.png',
      'build/tray-icon.svg',
      'build/tray-icon*.png',
      'docs/**',
    ]))
    expect(manifest.build?.files).toEqual([
      'build/app-icon.png',
      'build/app-icon-mac.png',
      'build/tray-icon.svg',
      'build/tray-icon*.png',
      'cordis.patch.yml',
      'lib/**',
      'package.json',
      '!node_modules/node-pty/build/**',
    ])
    expect(manifest.build?.mac?.icon).toBe('build/app-icon-mac.png')
    expect(manifest.build?.mac?.artifactName).toBe('acryl-desktop-mac-${arch}.${ext}')
    expect(manifest.build?.mac?.mergeASARs).toBe(false)
    expect(manifest.build?.mac?.signIgnore).toEqual(['\\.(?:pak|dat|wasm)$'])
    expect(manifest.build?.win?.icon).toBe('build/app-icon.png')
    expect(manifest.build?.win?.target).toEqual([{
      target: 'nsis',
      arch: ['x64'],
    }])
    expect(manifest.build?.win?.artifactName).toBe('acryl-desktop-win-${arch}.${ext}')
    expect(manifest.build?.nsis).toEqual({
      license: 'THIRD_PARTY_NOTICES.md',
      oneClick: false,
      perMachine: false,
      allowElevation: true,
      allowToChangeInstallationDirectory: true,
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      differentialPackage: true,
      shortcutName: 'ACRYL',
      useZip: false,
      artifactName: 'acryl-desktop-win-${arch}.${ext}',
    })
    expect(manifest.build?.linux?.icon).toBe('build/app-icon.png')
    expect(manifest.build?.linux?.artifactName).toBe('acryl-desktop-linux-${arch}.${ext}')
  })

  it('separates unsigned smoke packaging from the signed macOS release', () => {
    const packageDir = readFileSync(new URL('scripts/package-dir.mjs', packageRoot), 'utf8')

    expect(manifest.scripts?.build).toContain('node scripts/generate-acryl-brand.mjs')
    expect(manifest.scripts?.build).toContain('node scripts/generate-mac-app-icon.mjs')
    expect(manifest.scripts?.['build:canvas']).toBe('pnpm --filter acryl-development-canvas run build')
    expect(manifest.scripts?.dev)
      .toBe('pnpm run build:canvas && pnpm run build && pnpm run verify:loader && node scripts/launch-dev.mjs')
    expect(manifest.scripts?.check).toContain('pnpm run build:canvas')
    expect(manifest.scripts?.['package:dir'])
      .toBe('pnpm run build:canvas && pnpm run build && node scripts/package-dir.mjs')
    expect(packageDir).toContain("CSC_IDENTITY_AUTO_DISCOVERY: 'false'")
    expect(manifest.scripts?.['dist:mac']).toBe('node scripts/release-mac.ts')
    expect(manifest.scripts?.['dist:mac-smoke']).toBe('node scripts/package-mac.ts')
    expect(manifest.scripts?.['dist:win']).toBe('node scripts/package-win.ts')
    expect(manifest.scripts?.['dist:win-portable']).toBe('node scripts/package-win-portable.ts')
    expect(manifest.scripts?.['check:win-package']).toContain('pnpm --filter dsh-community-market run build')
    expect(manifest.scripts?.['check:win-package']).toContain('pnpm run build')
    expect(manifest.scripts?.['check:win-package']).toContain('pnpm run typecheck')
    expect(manifest.scripts?.['check:win-package']).toContain('tests/package-win.spec.ts')
    expect(manifest.scripts?.['check:win-package']).toContain('tests/verify-win-portable.spec.ts')
    expect(manifest.scripts?.['check:win-package']).toContain('tests/update-checker.spec.ts')
    expect(manifest.scripts?.['check:win-package']).toContain('tests/update-download.spec.ts')
    expect(manifest.scripts?.['check:win-package']).toContain('tests/windows-volume-diagnostics.spec.ts')
    expect(manifest.scripts?.['check:win-package']).toContain('pnpm run verify:closure')
    expect(manifest.scripts?.['check:mac-package']).toContain('pnpm --filter dsh-community-market run build')
    expect(manifest.scripts?.['check:mac-package']).toContain('pnpm run build')
    expect(manifest.scripts?.['check:mac-package']).toContain('pnpm run typecheck')
    expect(manifest.scripts?.['check:mac-package']).toContain('tests/package-mac.spec.ts')
    expect(manifest.scripts?.['check:mac-package']).toContain('tests/verify-mac-smoke.spec.ts')
    expect(manifest.scripts?.['check:mac-package']).toContain('tests/mac-universal.spec.ts')
    expect(manifest.scripts?.['check:mac-package']).toContain('pnpm run verify:closure')
    expect(manifest.scripts?.['verify:cli']).toBe('node scripts/verify-cli-runtime.mjs')
    expect(manifest.scripts?.check).toContain('pnpm run verify:cli')
    expect(workspaceManifest.scripts?.['dist:mac'])
      .toBe('pnpm --filter dsh-community-market run build && pnpm --filter acryl-desktop run dist:mac')
    expect(workspaceManifest.scripts?.['dist:mac-smoke'])
      .toBe('pnpm --filter dsh-community-market run build && pnpm --filter acryl-desktop run dist:mac-smoke')
    expect(workspaceManifest.scripts?.['dist:win'])
      .toBe('pnpm --filter dsh-community-market run build && pnpm --filter acryl-desktop run dist:win')
    expect(workspaceManifest.scripts?.['dist:win-portable'])
      .toBe('pnpm --filter dsh-community-market run build && pnpm --filter acryl-desktop run dist:win-portable')
    expect(manifest.build?.afterPack).toBe('./scripts/verify-packaged-runtime.ts')
    expect(manifest.build?.mac).toEqual(expect.objectContaining({
      extendInfo: {
        CFBundleAllowMixedLocalizations: true,
        CFBundleDevelopmentRegion: 'en',
        CFBundleLocalizations: ['en', 'zh_CN'],
      },
      hardenedRuntime: true,
      mergeASARs: false,
      notarize: true,
      signIgnore: ['\\.(?:pak|dat|wasm)$'],
      target: ['dir'],
      x64ArchFiles: expect.stringContaining('node-pty/prebuilds/darwin-*'),
    }))
    expect(manifest.build?.files).toContain('!node_modules/node-pty/build/**')
    expect(manifest.devDependencies?.['@electron/asar']).toBe('3.4.1')
  })

  it('keeps platform packaging behind tag or manual release runs', () => {
    expect(ciWorkflow).not.toContain('windows-latest')
    expect(ciWorkflow).not.toContain('macos-latest')
    expect(releaseWorkflow).toContain("tags: ['v*']")
    expect(releaseWorkflow).toContain('workflow_dispatch:')

    // Five per-architecture desktop matrix jobs (not one universal build).
    expect(releaseWorkflow).toContain('os: macos-latest')
    expect(releaseWorkflow).toContain('os: macos-14')
    expect(releaseWorkflow).toContain('os: windows-latest')
    expect(releaseWorkflow).toContain('os: ubuntu-24.04-arm')

    // Every desktop matrix job verifies the same gates CI requires before
    // packaging, and never rebuilds native modules from source in the archive.
    expect(releaseWorkflow).toContain('corepack pnpm run check:layout')
    expect(releaseWorkflow).toContain('corepack pnpm run typecheck')
    expect(releaseWorkflow).toContain('corepack pnpm run test')
    expect(releaseWorkflow).toContain('corepack pnpm --filter acryl-desktop run verify:closure')
    expect(releaseWorkflow).toContain('--config.npmRebuild=false')

    // Five portable CLI archive targets and a publish job gated on both matrices.
    for (const target of [
      'darwin-arm64',
      'darwin-x64',
      'linux-arm64',
      'linux-x64',
      'windows-x64',
    ]) {
      expect(releaseWorkflow).toContain(`target: ${target}`)
    }
    expect(releaseWorkflow).toContain('needs: [build, cli]')
  })

  it('runs one fast, conventional CI gate on main and pull requests', () => {
    expect(ciWorkflow).toContain('branches: [main]')
    expect(ciWorkflow).toContain('pull_request:')
    expect(ciWorkflow).toContain('push:')
    expect(ciWorkflow).toContain('runs-on: ubuntu-latest')
    expect(ciWorkflow).toContain('corepack pnpm install --frozen-lockfile')
    expect(ciWorkflow).toContain('corepack pnpm run check:layout')
    expect(ciWorkflow).toContain('corepack pnpm run typecheck')
    expect(ciWorkflow).toContain('corepack pnpm run test')
    expect(ciWorkflow).toContain('corepack pnpm run build')
  })

  it('keeps the supplied ACRYL theme logos and generated native tray assets', () => {
    const workspaceBlack = readFileSync(new URL('acryl-logo.png', workspaceRoot))
    const workspaceWhite = readFileSync(new URL('acryl-logo-white.png', workspaceRoot))
    expect(readFileSync(new URL('build/acryl-logo.png', packageRoot))).toEqual(workspaceBlack)
    expect(readFileSync(new URL('build/acryl-logo-white.png', packageRoot))).toEqual(workspaceWhite)
    for (const filename of [
      'tray-iconTemplate.png',
      'tray-iconTemplate@2x.png',
      'tray-icon-blue.png',
      'tray-icon-blue@1.25x.png',
      'tray-icon-blue@1.5x.png',
      'tray-icon-blue@2x.png',
    ]) {
      expect(readFileSync(new URL(`build/${filename}`, packageRoot)).byteLength).toBeGreaterThan(0)
    }
  })

  it('keeps the fixed ACRYL application icon', () => {
    const digest = createHash('sha256')
      .update(readFileSync(new URL('build/app-icon.png', packageRoot)))
      .digest('hex')

    expect(digest).toBe('eadf27f60deca0c8a8d49ebb65a4d8ed860ffc0d5ca7df23008946045b8d2fda')
  })

  it('generates a centered macOS icon with at least a 100-pixel visual inset', async () => {
    const source = await sharp(readFileSync(new URL('build/app-icon.png', packageRoot))).metadata()
    const icon = sharp(readFileSync(new URL('build/app-icon-mac.png', packageRoot)))
    const metadata = await icon.metadata()
    const { info } = await icon
      .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 0 })
      .toBuffer({ resolveWithObject: true })
    expect(info.trimOffsetLeft).toBeDefined()
    expect(info.trimOffsetTop).toBeDefined()
    const leftInset = -(info.trimOffsetLeft ?? Number.NaN)
    const topInset = -(info.trimOffsetTop ?? Number.NaN)
    const rightInset = 1024 - leftInset - info.width
    const bottomInset = 1024 - topInset - info.height

    expect(metadata).toEqual(expect.objectContaining({
      format: 'png',
      width: 1024,
      height: 1024,
      space: 'rgb16',
      depth: 'ushort',
      bitsPerSample: 16,
      channels: 4,
      hasAlpha: true,
    }))
    expect(metadata.icc).toEqual(source.icc)
    expect(Math.min(leftInset, topInset, rightInset, bottomInset)).toBeGreaterThanOrEqual(100)
    expect(Math.abs(leftInset - rightInset)).toBeLessThanOrEqual(1)
    expect(Math.abs(topInset - bottomInset)).toBeLessThanOrEqual(1)
  })

  it('keeps Electron out of production dependencies consumed by electron-builder', () => {
    expect(manifest.dependencies).not.toHaveProperty('electron')
    expect(manifest.peerDependencies?.electron).toBe('43.4.0')
    expect(manifest.devDependencies?.electron).toBe('43.4.0')
    expect(manifest.dependencies?.pnpm).toBe('11.7.0')
  })

  it('packages the native-compiled Koffi Windows runtime', () => {
    const lockfile = readFileSync(new URL('pnpm-lock.yaml', workspaceRoot), 'utf8')

    expect(manifest.dependencies?.koffi).toBe('3.1.5')
    expect(pnpmWorkspace).toContain('  koffi: 3.1.5')
    expect(lockfile).toContain('koffi@3.1.5:')
    expect(lockfile).toContain('@koromix/koffi-win32-x64@3.1.5')
    expect(lockfile).not.toContain('koffi@3.1.4:')
    expect(lockfile).not.toContain('@koromix/koffi-win32-x64@3.1.4')
  })

  it('resolves electron-builder through the pinned app-builder-lib keychain patch', () => {
    const lockfile = readFileSync(new URL('pnpm-lock.yaml', workspaceRoot), 'utf8')
    const patch = readFileSync(new URL('patches/app-builder-lib@26.15.7.patch', workspaceRoot), 'utf8')
    const workspaceRequire = createRequire(new URL('package.json', packageRoot))
    const electronBuilderManifest = workspaceRequire.resolve('electron-builder/package.json')
    const electronBuilderRequire = createRequire(electronBuilderManifest)
    const appBuilderManifest = electronBuilderRequire.resolve('app-builder-lib/package.json')
    const installedCodeSign = readFileSync(join(dirname(appBuilderManifest), 'out/codeSign/macCodeSign.js'), 'utf8')
    const installedNsisInstaller = readFileSync(join(dirname(appBuilderManifest), 'templates/nsis/installer.nsi'), 'utf8')
    const installedNsisPortable = readFileSync(join(dirname(appBuilderManifest), 'templates/nsis/portable.nsi'), 'utf8')

    expect(pnpmWorkspace).toContain('  app-builder-lib@26.15.7: patches/app-builder-lib@26.15.7.patch')
    expect(manifest.devDependencies?.['electron-builder']).toBe('26.15.7')
    expect(lockfile).toContain('app-builder-lib@26.15.7(patch_hash=')
    expect(patch).toContain('importCerts(keychainFile, certPaths, cscPasswords, keychainPassword)')
    expect(patch).toContain('"-k", keychainPassword, keychainFile')
    expect(patch).toContain('ManifestLongPathAware true')
    expect(manifest.build?.toolsets?.nsis).toBe('1.2.1')
    expect(installedCodeSign).toContain('importCerts(keychainFile, certPaths, cscPasswords, keychainPassword)')
    expect(installedCodeSign).toContain('"-k", keychainPassword, keychainFile')
    expect(installedNsisInstaller).toContain('ManifestLongPathAware true')
    expect(installedNsisPortable).toContain('ManifestLongPathAware true')
  })

  it('starts restricted Windows shells with a hidden console show state', () => {
    const patchPath = './patches/dsh-sandbox-windows-acl@0.1.1-rc.2.patch'
    const lockfile = readFileSync(new URL('pnpm-lock.yaml', workspaceRoot), 'utf8')
    const patch = readFileSync(new URL('patches/dsh-sandbox-windows-acl@0.1.1-rc.2.patch', workspaceRoot), 'utf8')
    const workspaceRequire = createRequire(new URL('package.json', packageRoot))
    const sandboxManifest = workspaceRequire.resolve('@deepseek-ai/dsh-sandbox-windows-acl/package.json')
    const sandboxLocalManifest = workspaceRequire.resolve('@deepseek-ai/dsh-sandbox-local/package.json')
    const sandboxLocalRequire = createRequire(sandboxLocalManifest)
    const sandboxLib = join(dirname(sandboxManifest), 'lib')
    const runtimeChunks = readdirSync(sandboxLib).filter(name => /^types-.*\.js$/u.test(name))

    expectPatchedDependency('@deepseek-ai/dsh-sandbox-windows-acl@0.1.1-rc.2', patchPath)
    expect(sandboxLocalRequire.resolve('@deepseek-ai/dsh-sandbox-windows-acl/package.json'))
      .toBe(sandboxManifest)
    expect(lockfile).toContain('@deepseek-ai/dsh-sandbox-windows-acl@0.1.1-rc.2(patch_hash=')
    expect(patch.match(/^\+\s*dwFlags: 257,\r?$/gmu)).toHaveLength(2)
    expect(patch.match(/^\+\s*wShowWindow: 0,\r?$/gmu)).toHaveLength(2)
    expect(runtimeChunks).toHaveLength(1)
    const installedRuntime = readFileSync(join(sandboxLib, runtimeChunks[0] as string), 'utf8')
    expect(installedRuntime.match(/dwFlags: 257,/gu)).toHaveLength(2)
    expect(installedRuntime.match(/wShowWindow: 0,/gu)).toHaveLength(2)
    expect(installedRuntime).toContain('api.createProcessAsUserW(token, null, commandLine, null, null, 1, 0, null')
    expect(installedRuntime).toContain('api.createProcessAsUserW(token, null, commandLine, null, null, 1, 4, null')
    expect(installedRuntime).not.toContain('134217728')
  })
})
