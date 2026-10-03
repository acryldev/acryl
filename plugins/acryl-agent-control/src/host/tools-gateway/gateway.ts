/** The gateway: the allowlisted extension tools of this Host's registry, listed and called through the registry's own pipeline. */

import type { Context } from '@deepseek-ai/cordis'
import type { GatewayCallResponse, GatewayTool } from '../../tools-contract.ts'

interface ToolDefinitionLike {
  readonly name: string
  readonly description: string
  readonly parameters: Readonly<Record<string, unknown>>
}

interface ToolRegistryLike {
  get(name: string): ToolDefinitionLike | undefined
  execute(input: { callId: string; name: string; arguments: unknown; signal: AbortSignal }): Promise<{ isError?: boolean; content?: ReadonlyArray<{ type: string; text?: string }> }>
}

export interface ToolsGateway {
  list(): readonly GatewayTool[]
  call(name: string, args: Record<string, unknown>, signal: AbortSignal): Promise<GatewayCallResponse>
}

/**
 * @param expose - the tool names this profile offers. A name no plugin registered is simply not listed (it may appear later); a call to a
 * name outside the list is refused before it reaches the registry, so the gateway can never run the shell or touch files.
 */
export function createToolsGateway(ctx: Context, expose: readonly string[]): ToolsGateway {
  const registry = (): ToolRegistryLike => ctx.tools as unknown as ToolRegistryLike
  const allowed = new Set(expose)
  let counter = 0
  return {
    list() {
      return expose.flatMap((name): GatewayTool[] => {
        const definition = registry().get(name)
        return definition === undefined ? [] : [{ name: definition.name, description: definition.description, inputSchema: definition.parameters }]
      })
    },
    async call(name, args, signal) {
      if (!allowed.has(name)) return { ok: false, code: 'not-exposed', message: `${name} is not offered through the gateway` }
      if (registry().get(name) === undefined) return { ok: false, code: 'unknown-tool', message: `${name} is not available right now` }
      const result = await registry().execute({ callId: `gateway-${String(++counter)}`, name, arguments: args, signal })
      const text = (result.content ?? []).flatMap(block => (block.type === 'text' && typeof block.text === 'string' ? [block.text] : [])).join('\n')
      return { ok: true, isError: result.isError === true, text }
    },
  }
}
