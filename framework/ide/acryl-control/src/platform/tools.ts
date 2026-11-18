/**
 * The tools port of the ACRYL platform: what ACRYL's own Host plugins need to give an agent a tool, and to have a say in whether a call runs, without
 * importing a DeepSeek Harness package. A plugin injects `acrylTools` (optional where a chat may not exist), defines tools with {@link defineAcrylTool}
 * and registers them; a policy decides allow, deny or ask before a call runs. The provider is an adapter in the engine seam (`acryl-harness-runtime`),
 * so the registry behind it can change without touching a plugin.
 *
 * @module acryl-control/platform/tools
 */

/** A parameter of a tool: a JSON Schema type, whether it must be given, and a description for the model. */
export interface AcrylToolParam {
  readonly type: 'string' | 'integer' | 'number' | 'boolean' | 'array' | 'object'
  readonly required?: boolean
  readonly description?: string
  readonly [extra: string]: unknown
}

type ValueOf<P extends AcrylToolParam> =
  P['type'] extends 'string' ? string
    : P['type'] extends 'integer' | 'number' ? number
      : P['type'] extends 'boolean' ? boolean
        : unknown

/** The arguments object a tool receives, inferred from its parameter specs: required ones always present, the others optional. */
export type AcrylToolArgs<P extends Readonly<Record<string, AcrylToolParam>>> =
  { readonly [K in keyof P as P[K]['required'] extends true ? K : never]: ValueOf<P[K]> }
  & { readonly [K in keyof P as P[K]['required'] extends true ? never : K]?: ValueOf<P[K]> }

/** One block of what the model reads back. */
export interface AcrylToolBlock {
  readonly type: 'text'
  readonly text: string
}

/** What a running tool is given besides its arguments. */
export interface AcrylToolExecution {
  /** Aborted when the call is cancelled; a tool honours it. */
  readonly signal: AbortSignal
}

export interface AcrylToolDefinition {
  readonly name: string
  readonly description: string
  readonly parameters: Readonly<Record<string, AcrylToolParam>>
  readonly output: {
    /** JSON Schema of the value `execute` returns. */
    readonly schema: Readonly<Record<string, unknown>>
    /** What the model reads, separately from the typed value. */
    readonly render?: (args: never, value: never) => readonly AcrylToolBlock[]
  }
  readonly execute: (args: never, exec: AcrylToolExecution) => unknown
}

/**
 * Describe a tool with its arguments inferred from `parameters` and its value typed by `execute`. Plain data in, the same data out: the typing is the
 * whole job.
 */
export function defineAcrylTool<const P extends Readonly<Record<string, AcrylToolParam>>, V>(definition: {
  readonly name: string
  readonly description: string
  readonly parameters: P
  readonly output: {
    readonly schema: Readonly<Record<string, unknown>>
    readonly render?: (args: AcrylToolArgs<P>, value: V) => readonly AcrylToolBlock[]
  }
  readonly execute: (args: AcrylToolArgs<P>, exec: AcrylToolExecution) => V | Promise<V>
}): AcrylToolDefinition {
  return definition as unknown as AcrylToolDefinition
}

/** The call a policy is asked about. */
export interface AcrylToolCall {
  readonly name: string
  readonly arguments: unknown
  /** The agent session that made the call, when there is one (an outside caller has none). */
  readonly agent?: { readonly session: unknown }
}

export type AcrylToolDecision =
  | { readonly kind: 'allow' }
  | { readonly kind: 'deny'; readonly reason: string }
  | { readonly kind: 'ask'; readonly reason?: string }

/** A policy: ask `next()` for what the rest of the chain would decide, and return it unchanged unless this policy has something to say. */
export type AcrylToolPolicy = (call: AcrylToolCall, next: () => Promise<AcrylToolDecision>) => Promise<AcrylToolDecision>

/** A tool as the registry knows it. */
export interface AcrylToolInfo {
  readonly name: string
  readonly description: string
  /** JSON Schema of the arguments. */
  readonly parameters: Readonly<Record<string, unknown>>
}

export interface AcrylToolResult {
  readonly isError?: boolean
  readonly content?: ReadonlyArray<{ readonly type: string; readonly text?: string }>
}

export interface AcrylTools {
  /** @returns the disposer that removes exactly this tool. */
  register(definition: AcrylToolDefinition): () => void
  /** @returns the tool, or `undefined` when none by that name is registered. */
  get(name: string): AcrylToolInfo | undefined
  /** Run a tool through the registry's whole pipeline: every policy applies. */
  execute(input: { readonly callId: string; readonly name: string; readonly arguments: unknown; readonly signal: AbortSignal }): Promise<AcrylToolResult>
  /** @returns the disposer that removes exactly this policy. */
  policy(handler: AcrylToolPolicy): () => void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    acrylTools: AcrylTools
  }
}
