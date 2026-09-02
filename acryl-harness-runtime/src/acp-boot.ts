/**
 * Boot the DSH ACP profile as an ACRYL runtime. Composes `dsh-base` with the
 * `dsh-acp` bridge and an acryl-owned startup latch that replaces the upstream
 * `dsh-acp-app` bundle (which is not published at the `0.1.1-rc.2` line).
 * acryl coding capabilities (authorization, agent-presets, session-stats,
 * system-prompt) are layered on top so the ACP agent has the same coding
 * surface as the TUI and Web profiles.
 *
 * @module acryl-harness-runtime/acp-boot
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import {
  DEFAULT_PROFILE_BUNDLES,
  boot,
  healProfilesModuleFallback,
  initProfile,
  loadProfile,
  resolveProfileDir,
} from '@deepseek-ai/dsh-app-boot'
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import { createAcrylCodingCapabilityPatches } from './coding-capabilities.ts'

// Use acryl-harness-runtime's own package as the fallback anchor so
// @deepseek-ai/dsh-acp (a direct dependency of this package, not of the
// dsh meta-package at 0.1.1-rc.2) enters the profile's module fallback.
const acrylInstallAnchor = fileURLToPath(new URL('../package.json', import.meta.url))
const profileRoot = '[]\n'

/** Service the `dsh-acp` bridge waits for before claiming stdio. */
const ACP_APP_STARTUP_SERVICE = 'acpAppStartup'

/**
 * Acryl-owned ACP startup latch. Publishes the `acpAppStartup` service so the
 * `dsh-acp` bridge activates, and binds stdin EOF to a clean shutdown. This
 * replaces the upstream `dsh-acp-app` bundle, which is not published at the
 * `0.1.1-rc.2` version line acryl pins.
 */
function acpStartupPlugin(ctx: Context): void {
  ctx.provide(ACP_APP_STARTUP_SERVICE, { accepted: true })
  const stdin = process.stdin
  let active = true
  const onEnd = (): void => {
    if (!active) return
    active = false
    stdin.off('end', onEnd)
    const exit = ctx.get('appExit')
    if (exit !== undefined) exit(0)
  }
  ctx.effect(() => () => {
    active = false
    stdin.off('end', onEnd)
  }, 'acryl-acp.stdin')
  stdin.once('end', onEnd)
  if (stdin.readableEnded) queueMicrotask(onEnd)
}

/** Loader patches for the DSH ACP bridge. */
const acpBridgePatches: readonly PatchOptions[] = [
  {
    id: 'system-prompt',
    name: '@deepseek-ai/dsh-system-prompt',
    config: {
      persona: 'You are a coding agent powered by the {{model}} model. Your working directory is {{cwd}}.',
    },
  },
  {
    id: 'session-title-llm',
    disabled: true,
  },
  {
    insert: [
      {
        id: 'acp',
        name: '@deepseek-ai/dsh-acp',
        inject: ['acpAppStartup'],
        config: {
          provider: 'deepseek-official',
          model: 'deepseek-v4-flash',
        },
      },
    ],
  },
]

export interface BootAcrylAcpProfileOptions {
  /** Inner arguments handed to the ACP app startup provider. Defaults to no flags. */
  readonly cmdlineArgs?: readonly string[]
  /** Host setup run after Loader installation and before any config-tree entry mounts. */
  readonly prepare?: (ctx: Context) => Promise<void> | void
}

export interface AcrylAcpRuntime {
  readonly ctx: Context
  readonly profileDirectory: string
  dispose(): Promise<void>
}

/**
 * Boot the DSH ACP profile as one normal ACRYL runtime. The ACP bridge
 * (`dsh-acp`) owns stdio JSON-RPC; the acryl startup latch publishes the
 * readiness service and binds stdin EOF to shutdown. acryl coding capability
 * patches (authorization, agent-presets, session-stats, system-prompt) give
 * the ACP agent the same coding surface as the TUI and Web profiles.
 */
export async function bootAcrylAcpProfile(
  options: BootAcrylAcpProfileOptions = {},
): Promise<AcrylAcpRuntime> {
  const profileName = 'acryl-acp'
  const profileDirectory = resolveProfileDir(profileName)
  initProfile(profileDirectory, DEFAULT_PROFILE_BUNDLES)
  healProfilesModuleFallback(acrylInstallAnchor)
  const profile = loadProfile('acryl', profileName, acrylInstallAnchor)
  const rootConfig = join(profile.dir, 'cordis.yml')
  writeFileSync(rootConfig, profileRoot)
  const patches = structuredClone([
    ...profile.layers.flatMap(layer => layer.patches),
    ...acpBridgePatches,
    ...createAcrylCodingCapabilityPatches(new Set(['acp'])),
    ...profile.patches,
  ])
  const cmdlineArgs = options.cmdlineArgs ?? []
  const ctx = await boot('acryl', rootConfig, patches, hostCtx => {
    provideCmdline(hostCtx, {
      args: [...cmdlineArgs],
      exit: code => { process.exitCode = code },
    })
    hostCtx.plugin({
      name: 'acryl-acp-startup',
      apply: acpStartupPlugin,
    })
    return options.prepare?.(hostCtx)
  })
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
