/**
 * A custom coding agent: something the user added to the "+" menu. Pure rules, shared by the Host (which
 * enforces them) and the page (which uses the same rules to explain a refusal before asking).
 *
 * The Host starts an agent only by its id from the catalog, so what a definition may contain is the whole
 * safety story: a bare executable name or absolute path, an argument list that never goes through a shell,
 * and nothing else. See `specs/040-agentic-multiplexer-ade/design-phase-9.md`.
 */

import { WORKSPACE_PTY_COMMAND_IDS } from '../pty/contract.ts'

export const MAX_CUSTOM_AGENTS = 32
export const MAX_AGENT_ARGS = 16
export const MAX_AGENT_ARG_LENGTH = 200
export const MAX_AGENT_LABEL = 40

/** The colours a badge may use, so a definition can never carry arbitrary CSS. */
export const BADGE_COLORS = ['#94a3b8', '#d97757', '#10a37f', '#4285f4', '#a78bfa', '#34d399', '#f59e0b', '#ef4444', '#38bdf8', '#fb923c'] as const

export interface AgentBadge {
  readonly letter: string
  readonly color: (typeof BADGE_COLORS)[number]
}

export interface CustomAgent {
  readonly id: string
  readonly label: string
  /** An absolute path, or a bare executable name found on the Host's PATH. */
  readonly command: string
  /** Passed as an argument array to the process; never interpreted by a shell. */
  readonly args: readonly string[]
  readonly badge: AgentBadge
}

/** Thrown for a definition that breaks a rule; the message is fit to show the user. */
export class AgentDefinitionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AgentDefinitionError'
  }
}

const ID_PATTERN = /^[a-z][a-z0-9-]{1,31}$/
/** A bare name or an absolute path; no whitespace, quotes, or shell metacharacters. */
const COMMAND_PATTERN = /^(?:\/[A-Za-z0-9._@+:%~\-/]+|[A-Za-z0-9._@+-]+)$/
const BUILTIN = new Set<string>(WORKSPACE_PTY_COMMAND_IDS)

export function isBuiltinAgentId(id: string): boolean {
  return BUILTIN.has(id)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** @param value - untrusted JSON. @throws AgentDefinitionError with a user-facing message. */
export function parseCustomAgent(value: unknown): CustomAgent {
  if (!isRecord(value)) throw new AgentDefinitionError('an agent needs an id, a name, a command and a badge')
  const extra = Object.keys(value).filter(key => !['id', 'label', 'command', 'args', 'badge'].includes(key))
  if (extra.length > 0) throw new AgentDefinitionError(`unknown field: ${extra[0] ?? ''}`)
  const { id, label, command, args, badge } = value
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) throw new AgentDefinitionError('the id must be 2 to 32 characters: lowercase letters, digits and dashes, starting with a letter')
  if (isBuiltinAgentId(id)) throw new AgentDefinitionError(`"${id}" is a built-in agent`)
  if (typeof label !== 'string' || label.trim() === '' || [...label.trim()].length > MAX_AGENT_LABEL) throw new AgentDefinitionError(`the name must be 1 to ${String(MAX_AGENT_LABEL)} characters`)
  if (typeof command !== 'string' || !COMMAND_PATTERN.test(command) || command.includes('..')) {
    throw new AgentDefinitionError('the command must be an absolute path or a bare program name, without spaces or shell characters (put options in the arguments)')
  }
  const argList = args === undefined ? [] : args
  if (!Array.isArray(argList) || argList.length > MAX_AGENT_ARGS
    || !argList.every((arg): arg is string => typeof arg === 'string' && arg.length <= MAX_AGENT_ARG_LENGTH && !arg.includes('\0'))) {
    throw new AgentDefinitionError(`up to ${String(MAX_AGENT_ARGS)} arguments of up to ${String(MAX_AGENT_ARG_LENGTH)} characters each`)
  }
  if (!isRecord(badge) || typeof badge.letter !== 'string' || [...badge.letter].length !== 1
    || !(BADGE_COLORS as readonly unknown[]).includes(badge.color)) {
    throw new AgentDefinitionError('the badge needs one character and one of the offered colours')
  }
  return { id, label: label.trim(), command, args: argList, badge: { letter: badge.letter, color: badge.color as AgentBadge['color'] } }
}
