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
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'
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
    id: 'agent-presets',
    name: '@deepseek-ai/dsh-agent-presets',
    config: { default: 'standard' },
  },
  {
    id: 'session-stats',
    name: '@deepseek-ai/dsh-session-stats',
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
