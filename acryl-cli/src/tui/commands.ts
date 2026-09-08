/**
 * Terminal-only commands the prompt intercepts before text reaches the
 * agent. Data-driven so `PromptInput` can both dispatch on submit and render
 * a filtered picker while the reader is still typing.
 * @module @tomowang/dsh-tui/tui/commands
 */

import type { TuiActions } from './actions.js'

export interface SlashCommand {
  readonly command: string
  readonly description: string
}

export const SLASH_COMMANDS: readonly SlashCommand[] = [
  { command: '/help', description: 'Show help and available commands' },
  { command: '/login', description: 'Configure provider authentication (API key)' },
  { command: '/logout', description: 'Remove provider authentication' },
  { command: '/model', description: 'Manage LLM provider profiles' },
  { command: '/trajectory', description: 'Browse the turn/step event ledger' },
  { command: '/tools', description: 'Browse and expand tool cards' },
  { command: '/context', description: 'Show context window usage' },
  { command: '/plugins', description: 'Show the loaded plugin tree' },
  { command: '/presets', description: 'Show and switch agent presets (only while the session is blank)' },
  { command: '/goal', description: 'Set or view the long-running goal: /goal <objective> | clear | edit <objective> | pause | resume' },
  { command: '/plan', description: 'Enter plan mode, optionally with a message; /plan off to leave' },
  { command: '/compact', description: 'Summarize and compact session history' },
  { command: '/clear', description: 'Clear the screen and start a new session' },
  { command: '/exit', description: 'Exit ACRYL' },
  { command: '/quit', description: 'Exit ACRYL' },
]

/** Widest command text, so the dropdown can pad every row's description to the same column. */
export const SLASH_COMMAND_WIDTH = Math.max(...SLASH_COMMANDS.map(c => c.command.length))

export function matchSlashCommands(query: string): readonly SlashCommand[] {
  return SLASH_COMMANDS.filter(c => c.command.startsWith(query))
}

export function commandQuery(value: string): { isCommandMode: boolean; matches: readonly SlashCommand[] } {
  // A trailing space (but no *internal* whitespace) still counts as command
  // mode, so `"/clear "` behaves like `value.trim() === '/clear'`.
  const query = value.trim()
  const isCommandMode = value.startsWith('/') && !/\s/.test(query)
  return { isCommandMode, matches: isCommandMode ? matchSlashCommands(query) : [] }
}

/** `/plan` on its own, or followed by whitespace — matches the harness's own `/plan [message]`/`/plan off` syntax. */
const PLAN_COMMAND = /^\/plan(?:$|\s)/u

/**
 * `/plan`'s argument takes free text (a message, or the literal `off`), so unlike every other
 * command it can't route through {@link matchSlashCommands}'s whitespace-free matching.
 * @param text - Raw submitted line.
 * @returns The trimmed argument text, or `undefined` when `text` isn't a `/plan` invocation.
 */
export function parsePlanCommand(text: string): string | undefined {
  const trimmed = text.trim()
  if (!PLAN_COMMAND.test(trimmed)) return undefined
  return trimmed.slice('/plan'.length).trim()
}

/** One parsed `/goal` invocation, mirroring `@deepseek-ai/dsh-command-goal`'s `GoalCommand` union. */
export type GoalCommand =
  | { readonly kind: 'show' }
  | { readonly kind: 'create'; readonly objective: string }
  | { readonly kind: 'edit'; readonly objective: string }
  | { readonly kind: 'invalid-edit' }
  | { readonly kind: 'pause' }
  | { readonly kind: 'resume' }
  | { readonly kind: 'clear' }

/** `/goal` on its own, or followed by whitespace — its objective is free text, so it shares `/plan`'s parse-ahead shape. */
const GOAL_COMMAND = /^\/goal(?:$|\s)/u

/**
 * Parse a `/goal` invocation exactly the way `@deepseek-ai/dsh-command-goal`'s own
 * `parseGoalCommand` does — bare `/goal` shows the current goal, the control words
 * `clear`/`pause`/`resume` (case-insensitive) mutate it, `edit <objective>` replaces
 * the objective (bare `edit` is an error), and any other text is a create objective.
 * @param text - Raw submitted line.
 * @returns The parsed command, or `undefined` when `text` isn't a `/goal` invocation.
 */
export function parseGoalCommand(text: string): GoalCommand | undefined {
  const trimmed = text.trim()
  if (!GOAL_COMMAND.test(trimmed)) return undefined
  const input = trimmed.slice('/goal'.length).trim()
  if (input.length === 0) return { kind: 'show' }
  const control = input.toLowerCase()
  if (control === 'clear') return { kind: 'clear' }
  if (control === 'pause') return { kind: 'pause' }
  if (control === 'resume') return { kind: 'resume' }
  if (control === 'edit') return { kind: 'invalid-edit' }
  if (/^edit(?=\s)/iu.test(input)) return { kind: 'edit', objective: input.slice(4).trim() }
  return { kind: 'create', objective: input }
}

export function runSlashCommand(command: string, actions: TuiActions): void {
  switch (command) {
    case '/help':
      actions.help()
      return
    case '/exit':
    case '/quit':
      actions.shutdown()
      return
    case '/clear':
      actions.clear()
      return
    case '/model':
      actions.openModelProfile()
      return
    case '/login':
      actions.login()
      return
    case '/logout':
      actions.logout()
      return
    case '/trajectory':
      actions.openTrajectory()
      return
    case '/tools':
      actions.openToolCards()
      return
    case '/context':
      actions.openContext()
      return
    case '/plugins':
      actions.openPlugins()
      return
    case '/presets':
      actions.openAgentPresets()
      return
    case '/compact':
      actions.compact()
      return
  }
}
