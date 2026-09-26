/** Configuration and binary resolution for the Devin ACP transport. */

import { execFileSync } from 'node:child_process'

export type DevinAcpAuthMode = 'devin-auth' | 'windsurf-key' | 'interactive'

export type DevinAcpPermissionMode = 'normal' | 'dangerous' | 'bypass'

/**
 * ACP `PermissionOptionKind` — the option vocabulary a
 * `session/request_permission` call may offer.
 */
export type DevinAcpPermissionOptionKind =
  | 'allow_once'
  | 'allow_always'
  | 'reject_once'
  | 'reject_always'

/** ACP `PermissionOption` (`session/request_permission` params). */
export interface DevinAcpPermissionOption {
  readonly optionId: string
  readonly name: string
  readonly kind: DevinAcpPermissionOptionKind
}

/**
 * The `toolCall` field of a `session/request_permission` request. ACP types
 * it as `ToolCallUpdate`: `toolCallId` is required, every other field is an
 * optional update projection. This is the client-side view of the wire
 * object; unknown fields pass through unmodelled.
 */
export interface DevinAcpPermissionToolCall {
  readonly toolCallId: string
  readonly title?: string | null
  readonly kind?: string | null
  readonly status?: string | null
  readonly rawInput?: unknown
  readonly rawOutput?: unknown
}

/** ACP `RequestPermissionRequest` params for `session/request_permission`. */
export interface DevinAcpPermissionRequest {
  readonly sessionId: string
  readonly toolCall: DevinAcpPermissionToolCall
  readonly options: readonly DevinAcpPermissionOption[]
}

/**
 * ACP `RequestPermissionOutcome`: either an option was selected by id, or
 * the request was cancelled (the client declined to pick — the agent treats
 * this as refusal, not an error).
 */
export type DevinAcpPermissionOutcome =
  | { readonly outcome: 'selected'; readonly optionId: string }
  | { readonly outcome: 'cancelled' }

/**
 * ACP `RequestPermissionResponse` — the JSON-RPC `result` written back to
 * the agent for `session/request_permission`.
 */
export interface DevinAcpPermissionResponse {
  readonly outcome: DevinAcpPermissionOutcome
}

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
   * Permission policy applied to inbound `session/request_permission` calls
   * when {@link onPermissionRequest} is not set. `devin acp` has no CLI flag
   * for permission modes (`--agent-type`/`--model`/`--refusal-fallback`
   * only), so the policy is enforced client-side when answering:
   * `dangerous`/`bypass` prefer `allow_always` then `allow_once` options;
   * `normal` (default) fails closed on `reject`-kind options or a cancelled
   * outcome.
   */
  readonly permissionMode?: DevinAcpPermissionMode
  /**
   * Optional answerer for `session/request_permission`, consulted before
   * {@link permissionMode}. Its return value is written to the agent as the
   * ACP `RequestPermissionResponse` result.
   *
   * This is the extension seam for a future worker-scoped approval adapter:
   * the DSH `ApprovalService` requires a DSH `Agent` and an open session
   * turn, which an `AgentSnapshot` binding cannot supply — see
   * `mini-design-composition.md` §5.
   */
  readonly onPermissionRequest?: (
    params: DevinAcpPermissionRequest,
  ) => Promise<DevinAcpPermissionResponse>
  /**
   * Bound in milliseconds on {@link onPermissionRequest} resolving. The
   * agent must never be left unanswered: a callback that overruns is
   * answered with the cancelled outcome. `0` disables the bound — only for
   * answerers that guarantee a response. Default: 60_000.
   */
  readonly permissionTimeoutMs?: number
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
  if (partial.onPermissionRequest !== undefined) config.onPermissionRequest = partial.onPermissionRequest
  if (partial.permissionTimeoutMs !== undefined) config.permissionTimeoutMs = partial.permissionTimeoutMs
  if (partial.requestTimeoutMs !== undefined) config.requestTimeoutMs = partial.requestTimeoutMs
  return Object.freeze(config) as DevinAcpTransportConfig
}

type MutableConfig = {
  binaryPath?: string
  authMode: DevinAcpAuthMode
  cwd?: string
  env?: Record<string, string>
  model?: string
  permissionMode: DevinAcpPermissionMode
  onPermissionRequest?: (
    params: DevinAcpPermissionRequest,
  ) => Promise<DevinAcpPermissionResponse>
  permissionTimeoutMs?: number
  requestTimeoutMs?: number
}
