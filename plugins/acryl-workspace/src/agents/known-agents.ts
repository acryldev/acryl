/**
 * The coding agents ACRYL knows by name: what to run, which flags mean "do not ask me", and where to install
 * them. This is the single source for the "+" menu, the launcher and Settings > Agents; the closed list of
 * ids is also the Host's allowlist of what a terminal tab may start.
 *
 * The launch commands, permission flags and install pages follow the public documentation of each agent
 * (the shape of the list is inspired by Orca's agent catalog, MIT licensed).
 */

/** The permission mode a launch uses. `yolo` adds the agent's own "skip approvals" flags; `manual` adds none. */
export type PermissionMode = 'yolo' | 'manual'

export interface KnownAgent {
  readonly id: string
  readonly label: string
  /** The executable looked up on PATH. */
  readonly command: string
  /** Added to a launch in `yolo` mode, one argument per entry. */
  readonly yoloArgs: readonly string[]
  /** Environment added to a launch in `yolo` mode. */
  readonly yoloEnv?: Readonly<Record<string, string>>
  /** Where the agent's install instructions live. */
  readonly homepageUrl: string
  /** The letter and colour of its tab icon when no drawn mark exists. */
  readonly badge: { readonly letter: string; readonly color: string }
}

const agent = (
  id: string, label: string, command: string, homepageUrl: string, color: string,
  yoloArgs: readonly string[] = [], yoloEnv?: Readonly<Record<string, string>>,
): KnownAgent => ({
  id, label, command, homepageUrl, yoloArgs, ...(yoloEnv === undefined ? {} : { yoloEnv }),
  badge: { letter: [...label][0]?.toUpperCase() ?? '?', color },
})

/** In the order the lists show them. Ids of agents that shipped earlier keep their spelling. */
export const KNOWN_AGENTS = [
  agent('claude', 'Claude', 'claude', 'https://code.claude.com/docs', '#d97757', ['--dangerously-skip-permissions']),
  agent('codex', 'Codex', 'codex', 'https://github.com/openai/codex', '#10a37f', ['--dangerously-bypass-approvals-and-sandbox']),
  agent('grok', 'Grok', 'grok', 'https://x.ai/cli', '#94a3b8', ['--permission-mode', 'bypassPermissions']),
  agent('copilot', 'GitHub Copilot', 'copilot', 'https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli', '#a78bfa', ['--yolo']),
  agent('opencode', 'OpenCode', 'opencode', 'https://opencode.ai/docs/cli/', '#94a3b8'),
  agent('ante', 'Ante', 'ante', 'https://github.com/AntigmaLabs/ante-preview', '#fb923c', ['--yolo']),
  agent('pi', 'Pi', 'pi', 'https://pi.dev', '#a78bfa'),
  agent('omp', 'OMP', 'omp', 'https://omp.sh', '#a78bfa'),
  agent('gemini', 'Gemini', 'gemini', 'https://github.com/google-gemini/gemini-cli', '#4285f4', ['--yolo']),
  agent('antigravity', 'Antigravity', 'agy', 'https://antigravity.google/docs/cli-overview', '#4285f4', ['--dangerously-skip-permissions']),
  agent('aider', 'Aider', 'aider', 'https://aider.chat/docs/', '#34d399', ['--yes-always']),
  agent('goose', 'Goose', 'goose', 'https://block.github.io/goose/docs/quickstart/', '#f59e0b', [], { GOOSE_MODE: 'auto' }),
  agent('amp', 'Amp', 'amp', 'https://ampcode.com/manual#install', '#ef4444', ['--dangerously-allow-all']),
  agent('kilo', 'Kilocode', 'kilo', 'https://kilo.ai/docs/cli', '#f59e0b'),
  agent('crush', 'Charm', 'crush', 'https://github.com/charmbracelet/crush', '#a78bfa', ['--yolo']),
  agent('command-code', 'Command Code', 'command-code', 'https://commandcode.ai/docs/quickstart', '#94a3b8', ['--yolo']),
  agent('cursor', 'Cursor', 'cursor-agent', 'https://cursor.com/cli', '#94a3b8', ['--yolo']),
  agent('droid', 'Droid', 'droid', 'https://docs.factory.ai/cli/getting-started/quickstart', '#94a3b8', ['--auto', 'high']),
  agent('kimi', 'Kimi', 'kimi', 'https://www.kimi.com/code/docs/en/kimi-code-cli/getting-started.html', '#38bdf8', ['--yolo']),
  agent('mistral-vibe', 'Mistral Vibe', 'vibe', 'https://github.com/mistralai/mistral-vibe', '#fb923c', ['--agent', 'auto-approve']),
  agent('qwen', 'Qwen Code', 'qwen', 'https://github.com/QwenLM/qwen-code', '#a78bfa', ['--approval-mode', 'yolo']),
  agent('hermes', 'Hermes', 'hermes', 'https://hermes-agent.nousresearch.com/docs/', '#94a3b8', ['--yolo']),
  agent('mimo-code', 'MiMo Code', 'mimo', 'https://mimo.xiaomi.com/coder', '#94a3b8'),
  agent('trae', 'Trae', 'traecli', 'https://docs.trae.cn/cli_get-started-with-trae-cli', '#34d399', ['--yolo']),
  agent('kiro', 'Kiro', 'kiro-cli', 'https://kiro.dev/docs/cli/', '#a78bfa', ['--trust-all-tools']),
  agent('aug', 'Auggie', 'auggie', 'https://docs.augmentcode.com/cli/overview', '#94a3b8'),
  agent('autohand', 'Autohand Code', 'autohand', 'https://github.com/autohandai/code-cli', '#94a3b8', ['--unrestricted']),
  agent('cline', 'Cline', 'cline', 'https://docs.cline.bot/cline-cli/overview', '#94a3b8', ['--auto-approve', 'true']),
  agent('codebuff', 'Codebuff', 'codebuff', 'https://www.codebuff.com/docs/help/quick-start', '#94a3b8'),
  agent('continue', 'Continue', 'cn', 'https://docs.continue.dev/guides/cli', '#94a3b8', ['--allow', '*']),
  agent('rovo', 'Rovo Dev', 'rovo', 'https://support.atlassian.com/rovo/docs/install-and-run-rovo-dev-cli-on-your-device/', '#4285f4', ['--yolo']),
  agent('devin', 'Devin', 'devin', 'https://devin.ai/cli', '#34d399', ['--permission-mode', 'bypass', '--respect-workspace-trust', 'false']),
  agent('openclaw', 'OpenClaw', 'openclaw', 'https://github.com/openclaw/openclaw', '#ef4444'),
] as const satisfies readonly KnownAgent[]

export type KnownAgentId = (typeof KNOWN_AGENTS)[number]['id']

export const KNOWN_AGENT_IDS: readonly KnownAgentId[] = KNOWN_AGENTS.map(entry => entry.id)

const BY_ID = new Map<string, KnownAgent>(KNOWN_AGENTS.map(entry => [entry.id, entry]))

/** @returns the known agent with this id, or undefined (a custom agent, the terminal, or nothing). */
export function knownAgent(id: string): KnownAgent | undefined {
  return BY_ID.get(id)
}
