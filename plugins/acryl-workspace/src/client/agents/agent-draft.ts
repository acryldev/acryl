/** The "Add an agent" form: what the user typed, and the definition it turns into. */

import { AgentDefinitionError, BADGE_COLORS, parseCustomAgent, type AgentBadge, type CustomAgent } from '../../agents/definition.ts'

export interface AgentDraft {
  readonly name: string
  readonly command: string
  /** One argument per line, exactly as the process will receive it. */
  readonly args: string
  readonly letter: string
  readonly color: AgentBadge['color']
}

export const EMPTY_DRAFT: AgentDraft = { name: '', command: '', args: '', letter: '', color: BADGE_COLORS[1] }

/** "My Agent!" becomes "my-agent"; a name with no usable character gives an empty id (which is then refused). */
export function slugifyAgentId(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32)
  return /^[a-z]/.test(slug) ? slug : slug === '' ? '' : `a-${slug}`.slice(0, 32)
}

export type DraftResult =
  | { readonly ok: true; readonly agent: CustomAgent }
  | { readonly ok: false; readonly message: string }

/** @returns the validated definition, or the rule the draft breaks, in words. */
export function draftToAgent(draft: AgentDraft): DraftResult {
  const name = draft.name.trim()
  const letter = draft.letter.trim() === '' ? ([...name][0] ?? '').toUpperCase() : draft.letter.trim()
  const args = draft.args.split('\n').map(line => line.replace(/\r$/, '')).filter(line => line !== '')
  try {
    return {
      ok: true,
      agent: parseCustomAgent({ id: slugifyAgentId(name), label: name, command: draft.command.trim(), args, badge: { letter, color: draft.color } }),
    }
  } catch (cause) {
    return { ok: false, message: cause instanceof AgentDefinitionError ? cause.message : 'that agent is not valid' }
  }
}

/** The exact command line the Host will run, for the user to read before saving. */
export function previewCommand(agent: CustomAgent): string {
  return [agent.command, ...agent.args].map(part => (/^[A-Za-z0-9._@+:%~/-]+$/.test(part) ? part : JSON.stringify(part))).join(' ')
}
