/**
 * The hook settings ACRYL adds to a Claude Code launch so Claude reports what it is doing.
 *
 * They travel as `--settings <json>`, which Claude merges with the user's own settings; nothing is written to the
 * user's files. Each hook runs one `curl` to ACRYL's loopback status route. The secret and the terminal id are read
 * from the environment ACRYL gives that terminal, never written into the JSON. A failing or slow hook is silent
 * and can never block Claude (`-m 2`, `|| true`).
 */

import type { AgentState } from './agent-status.ts'

/** The environment a status-reporting terminal is started with. */
export const STATUS_ENV = {
  terminal: 'ACRYL_TERMINAL_ID',
  url: 'ACRYL_STATUS_URL',
  token: 'ACRYL_STATUS_TOKEN',
} as const

const report = (state: AgentState): string =>
  `curl -fsS -m 2 -X POST "$${STATUS_ENV.url}" -H "authorization: Bearer $${STATUS_ENV.token}" -H "content-type: application/json" -d '{"terminal":"'"$${STATUS_ENV.terminal}"'","state":"${state}"}' >/dev/null 2>&1 || true`

const hook = (state: AgentState, matcher?: string) => [{ ...(matcher === undefined ? {} : { matcher }), hooks: [{ type: 'command', command: report(state) }] }]

/** @returns the JSON text for `claude --settings`. */
export function claudeStatusSettings(): string {
  return JSON.stringify({
    hooks: {
      UserPromptSubmit: hook('working'),
      // After an approved tool runs Claude is working again, though no prompt was submitted.
      PostToolUse: hook('working', '*'),
      Notification: hook('waiting'),
      Stop: hook('done'),
    },
  })
}

/** The extra launch arguments for an agent that reports through hooks. */
export function statusHookArgs(kind: 'claude'): readonly string[] {
  return kind === 'claude' ? ['--settings', claudeStatusSettings()] : []
}
