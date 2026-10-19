# Spec 045: Software factory

Status: requested by the owner on 2026-10-19. Capability 2 (move a session between agents) works through the shared workspace brief, proven 2026-10-19; the rest is not started. Recorded the night before the Vienna talk; nothing here is built yet unless "Exists today" says so.

## The owner's words (2026-10-19)

> how about software factory? meaning we have a way like https://herdr.dev to detect running agent sessions, to access sessions of any of them, to be able to grab session of any supported coding agent (codex, claude, muse, kimi etc..) and continue in another agent

> or to create pre-configured CoC (convention over configuration) workflow of software factory. we for example we copy our current process into software factory: docs/workmethodology. so when users copy our blend with our own set of plugins (blend.yaml) it also brings our workflow. initiating Github's spec-kit, having one main agent and few secondary workers to whom agent asks to test, to branch out quick experiment in isolated worktree, etc

> how hard is feature swapping agents ... we should go in the path of the least resistance where we don't of course need to reimplement in every agent. We just reuse the context file ... in T3 code we can extract ideas, they have shared context ... instead of adapting each agent to handoff from claude to codex, from codex to muse, from muse to pi, we create a shared context in the project - we already have it - just prove that it works

## Three capabilities

1. **See every agent session.** Detect coding-agent sessions running on the machine, inside ACRYL and outside it (Claude Code, Codex, Kimi, Muse and other CLI agents), with project, branch, state (working, needs you, done) and how to open each.
2. **Move a session between agents.** Take the conversation and working state of one agent's session and continue it in another agent: a structured handoff (goal, decisions, changed files, open questions, the next step), not a raw transcript dump.
3. **A workflow that travels with a Blend.** A convention-over-configuration factory: our methodology (`docs/workmethodology/acryl-hybrid-engineering-methodology.md`) as plugins, so `acryl new --from <our blend>` brings the workflow along with the plugins. It starts GitHub's spec-kit in a project, runs one main agent, and gives it worker agents to delegate to: run the tests, review, try a quick experiment on a branch in an isolated worktree, report back.

## Exists today (from `specs/001-.../docs-coverage.md`)

- Claude Code, Codex and other CLI agents run in terminal tabs next to ACRYL's own chat (3.4); custom agents and agent presets (6.3, 6.4).
- New git worktree from the project tree, chats bound to a branch and its worktree (2.3, 2.4).
- A shared context brief that every agent in a workspace reads: chat, Claude Code, Codex, Pi (2.9).
- Attention queue: an agent that needs you is flagged, for Claude Code only, through its hooks (3.13).
- The agent control plane has providers for ACP, Claude, Codex and ACRYL's own agent (`runtime/acryl-control/src/agent/providers/`).
- Blends carry plugins and their versions, including pulled ones (spec 036 T026), so a workflow made of plugins can travel with a Blend once it exists.

## Moving a session: the shared brief (proven 2026-10-19)

The least-resistance path the owner chose: no agent is adapted to another. Every agent started in a Shared Context workspace (spec 043) is
given the same context block (the workspace's projects and its brief) and the workspace folder. Agent A, asked to, writes a handoff into
the brief (what it did, which files, the next step); agent B, of any kind, starts with that brief in its context and continues.

T3 Code (`docs/user/portable-handoffs.md`, `docs/internals/context-handoffs.md`) does it the other way: the app owns a normalized
transcript of every provider and injects a budgeted selection of it into the next provider, plus a tool to read the rest. That needs ACRYL
to own each agent's transcript; the brief needs nothing per agent beyond a flag to pass a prompt, so it comes first.

What it took (commit 79e76c97): Claude Code and Codex get the workspace folder (`--add-dir`), so they can read and write the brief without
a permission stop; Codex gets the context block as `-c developer_instructions=...` (before, it got no context at all). Pi already had it.

Proof: `proof/handoff-across-agents.mjs` uses ACRYL's own `SharedContext` and `contextLaunch` with the real CLIs (Claude Code 2.1.303,
Codex 0.162.1, Pi 1.2.0). Two projects (shop-api, shop-web), brief "show prices in euros in the storefront". Agent A adds `toEuros` in
shop-api and writes a handoff into the brief; agent B, started in shop-web with only "continue where the previous agent left off", names
what A did and builds the storefront on it.

| A to B | Result |
|---|---|
| Claude to Codex, before the fix | Claude could not reach the brief (permission); Codex got no context and stopped |
| Claude to Codex | handoff written; Codex named `toEuros` in `shop-api/prices.js`, wrote `storefront.js` and a passing test |
| Codex to Claude | handoff written; Claude named it and wrote `storefront.js` (prints `apple: 1.20 EUR`, `pear: 0.90 EUR`) |
| Claude to Pi | handoff written; Pi named it, wrote `storefront.js`, ran it |

Limits: the handoff is written when the user asks for it (no button yet); Muse and Kimi get only `ACRYL_WORKSPACE_CONTEXT` (Kimi has
`--agent-file` and `--add-dir`, Muse `--add-dir`; neither is wired); outside a Shared Context workspace there is no brief. A one-shot Codex
run with the owner's skills stops for design confirmation unless the task says the design is approved; interactive runs are unaffected.

## Next: assemble the context from the whole workspace (owner, 2026-10-19)

> how we can better do it so that we assemble a context somehow from the whole project

Today an agent is told the workspace's projects, which instruction files each has, and the brief. In order, cheapest first:

1. **Facts ACRYL already knows, generated, no model call:** per project the branch, uncommitted files, the last commits, its worktrees, the open spec-kit tasks (`specs/*/tasks.md`), and which agent works in which worktree (the PTY tabs and chats ACRYL started). Written into `WORKSPACE.md` and a short summary into the prompt block.
2. **A handoff section kept apart from the user's brief:** `HANDOFF.md` next to `BRIEF.md` (goal, done, files, open questions, next step), so agents write there and the brief stays the user's.
3. **"Hand off to..." in an agent tab's menu:** asks the current agent to write the handoff, then starts the chosen agent in the same worktree.
4. **Fresh context for long sessions:** the prompt is fixed at launch; the block tells the agent to re-read `WORKSPACE.md`, which ACRYL rewrites when the facts change (the DSH chat already gets it per turn).
5. **Muse and Kimi:** wire their flags (Kimi `--agent-file`, both `--add-dir`).
6. Later, T3 Code style: a budgeted selection of the previous agent's transcript, once ACRYL reads each agent's session files (capability 1).

## Not built

- Detecting sessions started outside ACRYL; listing sessions of agents other than Claude Code with state.
- A "hand off" action in the UI (asks the current agent to write the handoff, then starts the chosen agent); Muse and Kimi launch flags.
- The factory workflow as plugins: spec-kit start, main agent with workers, worker tasks in isolated worktrees, results back to the main agent.

## Next step

Research first (methodology section 6): how herdr.dev and similar tools detect sessions, where each agent keeps its sessions on disk (Claude Code, Codex, Kimi, Muse), and what a handoff must carry. Then a plan with a Cordis mini-design per capability. Not before the 2026-10-20 talk.
