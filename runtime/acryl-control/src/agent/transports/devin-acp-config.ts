/** Configuration and binary resolution for the Devin ACP transport. */

import { execFileSync } from 'node:child_process'

export type DevinAcpAuthMode = 'devin-auth' | 'windsurf-key' | 'interactive'

export interface DevinAcpTransportConfig {
  /** Path to the devin binary. If omitted, resolved via `which devin`. */
  readonly binaryPath?: string
  /** Authentication mode. Default: 'devin-auth' (use stored credentials). */
  readonly authMode?: DevinAcpAuthMode
  /**
   * Fallback working directory for the devin acp subprocess. The bound
   * worker's `workspace.cwd` wins when set; `process.cwd()` is the last
   * resort.
   */
  readonly cwd?: string
  /** Additional environment variables for the subprocess. */
  readonly env?: Record<string, string>
  /** Default model to use (spawned as `devin acp --model <model>`). */
  readonly model?: string
  /**
   * Permission mode passthrough. There is no `devin acp` CLI flag for it;
   * the value is consumed by the `session/request_permission` policy
   * handler.
   */
  readonly permissionMode?: 'normal' | 'dangerous' | 'bypass'
  /**
   * Per-request JSON-RPC timeout in milliseconds. `0` disables. Default:
   * 30_000 (see `JsonRpcClient`).
   */
  readonly requestTimeoutMs?: number
}

/**
 * Resolve the devin binary path.
 *
 * Priority: explicit config.binaryPath → `which devin` → throw.
 */
export function resolveDevinBinary(config: DevinAcpTransportConfig): string {
  if (config.binaryPath !== undefined && config.binaryPath !== '') {
    return config.binaryPath
  }
  try {
    return execFileSync('which', ['devin'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
  } catch {
    throw new Error(
      'Could not find the `devin` binary. Install Devin CLI (brew install --cask devin-cli) or set binaryPath in the Devin ACP config.',
    )
  }
}

/**
 * Build the environment for the devin acp subprocess.
 *
 * Inherits the current process environment, then applies config.env.
 * When authMode is 'windsurf-key', WINDSURF_API_KEY is passed through
 * from the existing environment (if present).
 */
export function devinEnv(config: DevinAcpTransportConfig): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value
  }
  if (config.env !== undefined) {
    Object.assign(env, config.env)
  }
  // For windsurf-key mode, ensure WINDSURF_API_KEY is present
  if (config.authMode === 'windsurf-key' && env.WINDSURF_API_KEY === undefined) {
    throw new Error(
      "authMode 'windsurf-key' requires WINDSURF_API_KEY in the environment.",
    )
  }
  return env
}

/** Apply defaults to a partial config. */
export function normalizeDevinAcpConfig(partial: Partial<DevinAcpTransportConfig> = {}): DevinAcpTransportConfig {
  const config: MutableConfig = {
    authMode: partial.authMode ?? 'devin-auth',
    permissionMode: partial.permissionMode ?? 'normal',
  }
  if (partial.binaryPath !== undefined) config.binaryPath = partial.binaryPath
  if (partial.cwd !== undefined) config.cwd = partial.cwd
  if (partial.env !== undefined) config.env = partial.env
  if (partial.model !== undefined) config.model = partial.model
  if (partial.requestTimeoutMs !== undefined) config.requestTimeoutMs = partial.requestTimeoutMs
  return Object.freeze(config) as DevinAcpTransportConfig
}

type MutableConfig = {
  binaryPath?: string
  authMode: DevinAcpAuthMode
  cwd?: string
  env?: Record<string, string>
  model?: string
  permissionMode: 'normal' | 'dangerous' | 'bypass'
  requestTimeoutMs?: number
}
