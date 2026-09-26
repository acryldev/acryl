/**
 * Devin provider plugin — mounts `devin acp` (JSON-RPC over stdio) as the
 * `acp` agent provider behind ACRYL's provider-neutral agent-control surface.
 *
 * Composition: this plugin builds a lazily-spawning `devinAcpTransport`,
 * mounts `acpProvider(transport)` as a child Fiber so provider registration
 * stays an owned effect, and registers the transport disposer on its own
 * Fiber so a row unload leaves no orphan `devin acp` process.
 *
 * @module acryl-agent-devin
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import {
  acpProvider,
  type DevinAcpAuthMode,
  devinAcpTransport,
  normalizeDevinAcpConfig,
} from 'acryl-control'

/** Stable Cordis plugin name; the Loader row id equals the package name. */
export const name = 'acryl-agent-devin'

/** The agent-control service owns provider registration; a hard dependency. */
export const inject = ['acrAgentControl']

/**
 * Devin ACP composition settings, validated by the Loader before `apply`.
 * No binary probing happens at mount: `binaryPath` falls back to
 * `which devin` when a `start`/`resume` command first spawns the transport.
 */
export interface Config {
  /** Path to the devin binary. Omit to resolve `devin` from PATH lazily. */
  binaryPath?: string
  /** Authentication mode. Default: `devin-auth` (stored credentials). */
  authMode?: DevinAcpAuthMode
  /**
   * Fallback working directory for the `devin acp` subprocess. The bound
   * worker's `workspace.cwd` wins when set; `process.cwd()` is the last
   * resort.
   */
  cwd?: string
  /** Default model selection passed to the Devin agent. */
  model?: string
  /** Permission mode passthrough. Default: `normal`. */
  permissionMode?: 'normal' | 'dangerous' | 'bypass'
  /** Per-request JSON-RPC timeout in milliseconds. `0` disables. Default: 30_000. */
  requestTimeoutMs?: number
}

/** Schemastery validation for {@link Config}. */
export const Config: z<Config> = z.object({
  binaryPath: z.string(),
  authMode: z.union(['devin-auth', 'windsurf-key', 'interactive'] as const).default('devin-auth'),
  cwd: z.string(),
  model: z.string(),
  permissionMode: z.union(['normal', 'dangerous', 'bypass'] as const).default('normal'),
  requestTimeoutMs: z.number(),
})

/**
 * Mount the Devin `acp` provider.
 * @param ctx - Cordis context carrying `acrAgentControl` and the fiber scope.
 * @param config - Validated Devin ACP composition settings.
 */
export function apply(ctx: Context, config: Config): void {
  // `cwd` stays optional through composition: the transport resolves
  // `binding.workspace.cwd ?? config.cwd ?? process.cwd()` per worker at
  // spawn time, so a packaged host never pins workers to `/`.
  const transport = devinAcpTransport(normalizeDevinAcpConfig({ ...config }))
  ctx.plugin(acpProvider(transport))
  ctx.effect(() => () => transport.dispose())
}
