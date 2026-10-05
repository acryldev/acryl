/**
 * The Agent Control tools the model sees: `ui_snapshot`, `ui_click`, `ui_type`, `ui_select`, `ui_press`,
 * `ui_scroll` and `ui_wait`. Each is an ordinary Harness tool: validated arguments, a typed result, a
 * separate model-facing rendering, cancellation honoured, gone when this plugin's Fiber unloads.
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineAcrylTool } from 'acryl-control'
import { MUTATING_OPS, parseUiRequest, UiControlError, type AuditEntry, type UiActionResult, type UiOp, type UiRequest, type UiResult, type UiSnapshot } from '../contract.ts'
import { renderSnapshot } from '../snapshot-text.ts'
import type { AuditLog } from './audit.ts'
import type { UiChannel } from './channel.ts'

/** The tool name for each operation. */
export const TOOL_NAMES: Readonly<Record<UiOp, string>> = {
  snapshot: 'ui_snapshot',
  click: 'ui_click',
  type: 'ui_type',
  select: 'ui_select',
  press: 'ui_press',
  scroll: 'ui_scroll',
  wait: 'ui_wait',
}

/** Names of the tools that change the page, so each call is asked about. */
export const MUTATING_TOOL_NAMES: ReadonlySet<string> = new Set(MUTATING_OPS.map(op => TOOL_NAMES[op]))

/** What each ref in the latest snapshot means, so an approval prompt can name the control. */
export class RefDirectory {
  private generation = 0
  private readonly names = new Map<string, { role: string; name: string }>()

  remember(snapshot: UiSnapshot): void {
    if (snapshot.generation !== this.generation) { this.generation = snapshot.generation; this.names.clear() }
    for (const node of snapshot.nodes) this.names.set(node.ref, { role: node.role, name: node.name })
  }

  /** Words for the control a ref names, or the ref itself when it is not known. */
  describe(ref: unknown): string {
    if (typeof ref !== 'string') return 'a control'
    const known = this.names.get(ref)
    return known === undefined ? `the control ${ref}` : `the ${known.role} "${known.name}"`
  }
}

/** Words for one call, for the approval prompt. */
export function describeCall(toolName: string, args: unknown, refs: RefDirectory): string {
  const a = (typeof args === 'object' && args !== null ? args : {}) as Record<string, unknown>
  const clip = (value: unknown): string => JSON.stringify(typeof value === 'string' && value.length > 60 ? `${value.slice(0, 59)}…` : value)
  switch (toolName) {
    case TOOL_NAMES.click: return `Click ${refs.describe(a.ref)}`
    case TOOL_NAMES.type: return `Type ${clip(a.text)} into ${refs.describe(a.ref)}${a.submit === true ? ' and press Enter' : ''}`
    case TOOL_NAMES.select: return `Choose ${clip(a.option)} in ${refs.describe(a.ref)}`
    case TOOL_NAMES.press: return `Press ${String(a.key)}${a.ref === undefined ? ' on the focused control' : ` on ${refs.describe(a.ref)}`}`
    default: return toolName
  }
}

const REF_PARAM = { type: 'string', required: true, description: 'Ref from the latest ui_snapshot.' } as const

const ACTION_OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      ok: { type: 'boolean', required: true },
      target: { type: 'object', additionalProperties: false, properties: { role: { type: 'string', required: true }, name: { type: 'string', required: true } } },
      detail: { type: 'string' },
    },
  },
} as const

const renderAction = (_args: unknown, value: UiActionResult): Array<{ type: 'text'; text: string }> => [{
  type: 'text',
  text: `Done${value.target === undefined ? '' : `: ${value.target.role} "${value.target.name}"`}${value.detail === undefined ? '' : ` (${value.detail})`}. Take a new ui_snapshot before the next action.`,
}]

/** The snapshot as the plain, mutable value a tool result carries. */
function plain(snapshot: UiSnapshot) {
  return {
    generation: snapshot.generation,
    title: snapshot.title,
    total: snapshot.total,
    ...(snapshot.nextCursor === undefined ? {} : { nextCursor: snapshot.nextCursor }),
    nodes: snapshot.nodes.map(node => ({
      ref: node.ref, role: node.role, name: node.name, depth: node.depth, states: [...node.states],
      ...(node.value === undefined ? {} : { value: node.value }),
      ...(node.level === undefined ? {} : { level: node.level }),
    })),
  }
}

export interface ToolDeps {
  readonly channel: UiChannel
  readonly audit: AuditLog
  readonly refs: RefDirectory
  /** Whether each mutating call is asked about first (recorded in the audit log). */
  readonly approval: 'asked' | 'none'
}

/**
 * Run one already-parsed call on the page and record it in the shared audit log - the one piece of logic both
 * the model's own tools ({@link perform}) and the online channel ({@link runOnlineCall}, spec 041 TB30) share,
 * so a click from either path leaves one consistent trail and neither can bypass the other's bookkeeping.
 * @throws UiControlError, unwrapped, so a caller can map its `code` (the online route to JSON, `perform` to
 * a model-readable message).
 */
async function callAndRecord(
  deps: Pick<ToolDeps, 'channel' | 'audit' | 'refs'>,
  toolName: string,
  request: UiRequest,
  signal: AbortSignal,
  approval: AuditEntry['approval'],
): Promise<UiResult> {
  try {
    const value = await deps.channel.call(request, { signal, ...(request.op === 'wait' ? { timeoutMs: (request.timeoutMs ?? 3000) + 5000 } : {}) })
    if ('nodes' in value) deps.refs.remember(value)
    const target = 'target' in value ? value.target : undefined
    deps.audit.record({ at: new Date().toISOString(), tool: toolName, ...(target === undefined ? {} : { target }), outcome: 'ok', approval })
    return value
  } catch (cause) {
    const code = cause instanceof UiControlError ? cause.code : 'failed'
    const refused = cause instanceof UiControlError && ['protected', 'sensitive', 'killed', 'invalid', 'stale-ref', 'unknown-ref', 'not-actionable'].includes(cause.code)
    deps.audit.record({ at: new Date().toISOString(), tool: toolName, outcome: refused ? 'refused' : 'failed', detail: code, approval })
    throw cause
  }
}

/**
 * The online channel's own entry point (TB30): a request the HTTP route already parsed with
 * {@link parseUiRequest}, authorized by the instance secret rather than a per-call interactive approval (TB03:
 * same OS-user trust, the online channel's own boundary, not the model's).
 * @throws UiControlError.
 */
export async function runOnlineCall(deps: Pick<ToolDeps, 'channel' | 'audit' | 'refs'>, request: UiRequest, signal: AbortSignal): Promise<UiResult> {
  return callAndRecord(deps, TOOL_NAMES[request.op], request, signal, 'token')
}

/** Run one call on the page and record it, turning every refusal into an error the model can read. */
async function perform(deps: ToolDeps, toolName: string, args: unknown, signal: AbortSignal): Promise<UiSnapshot | UiActionResult> {
  const mutating = MUTATING_TOOL_NAMES.has(toolName)
  const approval = mutating ? deps.approval : 'not-needed'
  let request: UiRequest
  try {
    request = parseUiRequest({ ...(args as object), op: Object.entries(TOOL_NAMES).find(([, name]) => name === toolName)?.[0] })
    return await callAndRecord(deps, toolName, request, signal, approval) as UiSnapshot | UiActionResult
  } catch (cause) {
    if (cause instanceof UiControlError) throw new Error(`${cause.code}: ${cause.message}`)
    throw cause
  }
}

/** Register every Agent Control tool on `ctx.acrylTools`. @returns disposer. */
export function registerUiTools(ctx: Context, deps: ToolDeps): () => void {
  const tools = [
    defineAcrylTool({
      name: TOOL_NAMES.snapshot,
      description: 'LIVE ACTION: for \'do X now\' (hide/click/type/enable) - live, reversible, no files touched. Controls: role, name, state, ref. Secrets hidden. Long: pass nextCursor.',
      parameters: {
        cursor: { type: 'integer' },
        maxNodes: { type: 'integer' },
      },
      output: {
        schema: {
          type: 'object', additionalProperties: false,
          properties: {
            generation: { type: 'integer', required: true },
            title: { type: 'string', required: true },
            total: { type: 'integer', required: true },
            nextCursor: { type: 'integer' },
            nodes: {
              type: 'array', required: true,
              items: {
                type: 'object', additionalProperties: false,
                properties: {
                  ref: { type: 'string', required: true }, role: { type: 'string', required: true }, name: { type: 'string', required: true },
                  depth: { type: 'integer', required: true }, states: { type: 'array', required: true, items: { type: 'string' } },
                  value: { type: 'string' }, level: { type: 'integer' },
                },
              },
            },
          },
        },
        render: (_args: unknown, value: UiSnapshot) => [{ type: 'text', text: renderSnapshot(value) }],
      },
      execute: async (args, exec) => plain((await perform(deps, TOOL_NAMES.snapshot, args, exec.signal)) as UiSnapshot),
    }),
    defineAcrylTool({
      name: TOOL_NAMES.click,
      description: 'Click a control by ref. The user approves each call.',
      parameters: { ref: REF_PARAM },
      output: { ...ACTION_OUTPUT, render: renderAction },
      execute: async (args, exec) => (await perform(deps, TOOL_NAMES.click, args, exec.signal)) as UiActionResult,
    }),
    defineAcrylTool({
      name: TOOL_NAMES.type,
      description: 'Type into a text field by ref (replaces its text unless clear is false). Never password, token or payment fields. The user approves each call.',
      parameters: {
        ref: REF_PARAM,
        text: { type: 'string', required: true },
        submit: { type: 'boolean', description: 'Press Enter after.' },
        clear: { type: 'boolean' },
      },
      output: { ...ACTION_OUTPUT, render: renderAction },
      execute: async (args, exec) => (await perform(deps, TOOL_NAMES.type, args, exec.signal)) as UiActionResult,
    }),
    defineAcrylTool({
      name: TOOL_NAMES.select,
      description: 'Choose an option (text or value) in a select by ref. The user approves each call.',
      parameters: { ref: REF_PARAM, option: { type: 'string', required: true } },
      output: { ...ACTION_OUTPUT, render: renderAction },
      execute: async (args, exec) => (await perform(deps, TOOL_NAMES.select, args, exec.signal)) as UiActionResult,
    }),
    defineAcrylTool({
      name: TOOL_NAMES.press,
      description: 'Press a key (a character, Enter, Escape, Tab, Backspace, Delete, Space, Arrow*, Home, End, PageUp/Down) on a ref or the focused control. The user approves each call.',
      parameters: { key: { type: 'string', required: true }, ref: { type: 'string' } },
      output: { ...ACTION_OUTPUT, render: renderAction },
      execute: async (args, exec) => (await perform(deps, TOOL_NAMES.press, args, exec.signal)) as UiActionResult,
    }),
    defineAcrylTool({
      name: TOOL_NAMES.scroll,
      description: 'Scroll the page, or a ref.',
      parameters: {
        direction: { type: 'string', required: true, enum: ['up', 'down', 'left', 'right'] },
        ref: { type: 'string' },
        amount: { type: 'number', description: 'Pixels.' },
      },
      output: { ...ACTION_OUTPUT, render: renderAction },
      execute: async (args, exec) => (await perform(deps, TOOL_NAMES.scroll, args, exec.signal)) as UiActionResult,
    }),
    defineAcrylTool({
      name: TOOL_NAMES.wait,
      description: 'Wait up to 10s for text, or a role and name, to appear (or, with gone, disappear).',
      parameters: {
        text: { type: 'string' },
        role: { type: 'string' },
        name: { type: 'string' },
        gone: { type: 'boolean' },
        timeoutMs: { type: 'number' },
      },
      output: { ...ACTION_OUTPUT, render: (_args: unknown, value: UiActionResult) => [{ type: 'text', text: `Done (${value.detail ?? 'ok'}).` }] },
      execute: async (args, exec) => (await perform(deps, TOOL_NAMES.wait, args, exec.signal)) as UiActionResult,
    }),
  ]
  const disposers = tools.map(tool => ctx.acrylTools.register(tool))
  return () => { for (const dispose of disposers.reverse()) dispose() }
}
