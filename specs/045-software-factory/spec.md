# Spec 045: Software factory

Status: requested by the owner on 2026-10-19, not started. Recorded the night before the Vienna talk; nothing here is built yet unless "Exists today" says so.

## The owner's words (2026-10-19)

> how about software factory? meaning we have a way like https://herdr.dev to detect running agent sessions, to access sessions of any of them, to be able to grab session of any supported coding agent (codex, claude, muse, kimi etc..) and continue in another agent

> or to create pre-configured CoC (convention over configuration) workflow of software factory. we for example we copy our current process into software factory: docs/workmethodology. so when users copy our blend with our own set of plugins (blend.yaml) it also brings our workflow. initiating Github's spec-kit, having one main agent and few secondary workers to whom agent asks to test, to branch out quick experiment in isolated worktree, etc

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

## Not built

- Detecting sessions started outside ACRYL; listing sessions of agents other than Claude Code with state.
- Moving a session from one agent to another. acryl.dev's home page claims this today ("Swap agents. Keep working.", "Structured handoffs"; docs-coverage 6.6 "no (home page claims it)").
- The factory workflow as plugins: spec-kit start, main agent with workers, worker tasks in isolated worktrees, results back to the main agent.

## Next step

Research first (methodology section 6): how herdr.dev and similar tools detect sessions, where each agent keeps its sessions on disk (Claude Code, Codex, Kimi, Muse), and what a handoff must carry. Then a plan with a Cordis mini-design per capability. Not before the 2026-10-20 talk.
