export {
  ACRYL_CODING_CAPABILITIES,
  createAcrylCodingCapabilityPatches,
  type AcrylCodingCapability,
  type AcrylSurface,
} from './coding-capabilities.ts'
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
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
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

import { createAcrylCodingCapabilityPatches } from './coding-capabilities.ts'

const require = createRequire(import.meta.url)
const dshInstallAnchor = require.resolve('@deepseek-ai/dsh/package.json')
const profileRoot = '[]\n'

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
    ...createAcrylCodingCapabilityPatches(new Set(['tui'])),
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
 * composes the persona/agent rows ACRYL's terminal surface adds, so no shared
 * coding-capability patches are re-inserted here (that would duplicate `system-prompt`).
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
