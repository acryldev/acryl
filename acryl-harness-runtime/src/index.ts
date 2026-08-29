export type {
  DurableSessionMessage,
  DurableSessionMessagePort,
  DurableSessionMessageReceipt,
} from './durable-message.ts'
export {
  createAcrylSessionBridge,
  type AcrylSessionBridge,
  type AcrylSessionBridgeOptions,
} from './session-bridge.ts'

import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import {
  DEFAULT_PROFILE_BUNDLES,
  boot,
  composeEntries,
  healProfilesModuleFallback,
  initProfile,
  loadProfile,
  resolveProfileDir,
} from '@deepseek-ai/dsh-app-boot'

const require = createRequire(import.meta.url)
const dshInstallAnchor = require.resolve('@deepseek-ai/dsh/package.json')
const profileRoot = '[]\n'

// The ACRYL repo root (this package sits at `<repo>/acryl-harness-runtime`). The
// shipped agent presets live in the pinned DSH submodule rather than the
// published npm bundle, so point the roster at that source dir.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const shippedPresetsDir = join(repoRoot, 'deepseek-harness', 'packages', 'preset', 'agent-presets', 'presets')
const agentPresetConfig: Record<string, unknown> = {
  default: 'standard',
  roots: existsSync(shippedPresetsDir)
    ? [{ path: shippedPresetsDir, trust: 'system' }]
    : [],
  includeShippedRoot: false,
  includeUserRoot: true,
}

/*
 * Rows the ACRYL runtime composes on top of a base profile. dsh-base alone
 * mounts no persona, no agent-preset service, and no session-stat projection;
 * these are what let a surface open a real coding agent. `hmr` is deliberately
 * NOT forced here: the boot guard below must keep rejecting an HMR-enabled
 * profile in a non-exposed process, and each surface decides its own HMR policy.
 * Values are defaults a surface or user patch layer may override.
 */
const ACRYL_RUNTIME_ROWS: readonly PatchOptions[] = [
  {
    id: 'system-prompt',
    name: '@deepseek-ai/dsh-system-prompt',
    config: {
      persona: 'You are a coding agent powered by the {{model}} model. Your working directory is {{cwd}}.',
    },
  },
  {
    // `system-prompt` is already in dsh-base's include tree, so a plain id-targeted
    // row overrides its config. `agent-presets` and `session-stats` are NOT in the
    // base include set, so they must be `insert`ed — a plain row only overrides an
    // existing entry, it does not create one (that is why they silently never
    // composed before).
    insert: [
      { id: 'agent-presets', name: '@deepseek-ai/dsh-agent-presets', config: agentPresetConfig },
      { id: 'session-stats', name: '@deepseek-ai/dsh-session-stats' },
    ],
  },
]

export interface BootAcrylHarnessProfileOptions {
  readonly profile: string
  readonly prepare?: (ctx: Context) => Promise<void> | void
}

export interface AcrylHarnessRuntime {
  readonly ctx: Context
  readonly profileDirectory: string
  dispose(): Promise<void>
}

/** Boot one normal pinned-Harness ACRYL profile in a single Cordis root. */
export async function bootAcrylHarnessProfile(
  options: BootAcrylHarnessProfileOptions,
): Promise<AcrylHarnessRuntime> {
  if (options.profile.trim() === '') throw new Error('ACRYL Harness profile must not be empty')
  const profileDirectory = resolveProfileDir(options.profile)
  initProfile(profileDirectory, DEFAULT_PROFILE_BUNDLES)
  healProfilesModuleFallback(dshInstallAnchor)
  const profile = loadProfile('acryl', options.profile, dshInstallAnchor)
  const rootConfig = join(profile.dir, 'cordis.yml')
  writeFileSync(rootConfig, profileRoot)
  const patches = structuredClone([
    ...profile.layers.flatMap(layer => layer.patches),
    ...ACRYL_RUNTIME_ROWS,
    ...profile.patches,
  ])
  const hmr = composeEntries([patches]).find(entry => entry.id === 'hmr')
  if (hmr?.disabled !== true && !process.execArgv.includes('--expose-internals')) {
    throw new Error(
      'ACRYL profile enables Cordis HMR and must be launched with Node --expose-internals',
    )
  }
  const ctx = await boot('acryl', rootConfig, patches, options.prepare)
  let disposed = false
  return Object.freeze({
    ctx,
    profileDirectory: profile.dir,
    async dispose() {
      if (disposed) return
      disposed = true
      await ctx.fiber.dispose()
    },
  })
}

export interface BootAcrylWebProfileOptions {
  /** Inner arguments handed to the web-startup provider (e.g. `['--port', '4000']`). Defaults to no flags. */
  readonly cmdlineArgs?: readonly string[]
  /** Host setup run after Loader installation and before any config-tree entry mounts. */
  readonly prepare?: (ctx: Context) => Promise<void> | void
}

export interface AcrylWebRuntime {
  readonly ctx: Context
  /** The canonical bind URL, e.g. `http://127.0.0.1:3080`. */
  readonly url: string
  readonly profileDirectory: string
  dispose(): Promise<void>
}

/**
 * Boot the DSH browser surface (the `web` profile: `dsh-base` + `dsh-web-app`)
 * as one normal ACRYL runtime, so `pnpm acryl-web` serves the same DSH
 * HTTP/WebSocket seam the web surface always uses. The web profile already
 * composes the persona/agent rows ACRYL's terminal surface adds, so no
 * ACRYL_RUNTIME_ROWS are re-inserted (that would duplicate `system-prompt`).
 */
export async function bootAcrylWebProfile(
  options: BootAcrylWebProfileOptions = {},
): Promise<AcrylWebRuntime> {
  const profileName = 'web'
  const profileDirectory = resolveProfileDir(profileName)
  initProfile(profileDirectory, DEFAULT_PROFILE_BUNDLES)
  healProfilesModuleFallback(dshInstallAnchor)
  const profile = loadProfile('web', profileName, dshInstallAnchor)
  const rootConfig = join(profile.dir, 'cordis.yml')
  writeFileSync(rootConfig, profileRoot)
  const patches = structuredClone([...profile.layers.flatMap(layer => layer.patches), ...profile.patches])
  const cmdlineArgs = options.cmdlineArgs ?? []
  const ctx = await boot('web', rootConfig, patches, hostCtx => {
    provideCmdline(hostCtx, { args: [...cmdlineArgs], exit: code => { process.exitCode = code } })
    return options.prepare?.(hostCtx)
  })
  const startup = ctx.get('webStartup') as { host?: string; port?: number } | undefined
  const host = startup?.host ?? '127.0.0.1'
  const port = startup?.port ?? 3080
  const url = `http://${host}:${port}`
  let disposed = false
  return Object.freeze({
    ctx,
    url,
    profileDirectory: profile.dir,
    async dispose() {
      if (disposed) return
      disposed = true
      await ctx.fiber.dispose()
    },
  })
}
