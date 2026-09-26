# Phase 9 design: custom agents, terminal fidelity, layout and chrome

Status: accepted 2026-09-26 (owner asked for all three). Tasks: `tasks.md` Phase 9. Rules: Clean Architecture and Domain-Driven Design rule books (dependency rule, no god services, one term one meaning, wiring at the composition root).

## 1. Custom agents (T098) - the safe design

**Threat.** The workspace starts processes. A page must never be able to make the Host run an arbitrary command, and a repository (untrusted content) must never be able to add an agent.

**Rules.**
1. The page names an agent by **id** only. It never sends a command line to start one (unchanged from today).
2. The set of ids the Host will start is the **agent catalog**: the built-in ids plus the user's custom entries. The catalog lives in the **user's own ACRYL home** (`<ACRYL home>/workspace/agents.json`), never in a worktree, so a cloned repo cannot add an agent.
3. A custom entry is a validated value: `id` (`[a-z][a-z0-9-]{1,31}`, not a built-in id), `label` (1 to 40 chars), `command` (an absolute path, or a bare executable name resolved on the Host's PATH, no shell metacharacters, no whitespace), `args` (up to 16 strings of up to 200 chars, passed as an argument array, never through a shell), `badge` (one letter and a colour from a fixed palette). Invalid input is refused at the Host, not sanitised.
4. Adding or removing an entry is a same-origin loopback `POST` (the same protection as every private route), made from an explicit form that shows the exact command and arguments before saving. The Host also refuses a command that does not resolve to an executable file, so a typo fails at add time.
5. The catalog file is written atomically, is read at start and re-read on change, and a damaged file is ignored with a notice (built-ins keep working).

**Shape (Clean Architecture).** Domain: `AgentDefinition` value object with its own validation (`agent-catalog/definition.ts`, pure). Application: `AgentCatalog` (list, add, remove) behind a `CatalogStore` port. Adapters: file store (Host), routes (Host), client API and the Configure agents form (Client). The PTY registry depends on a `resolve(id)` port, not on the file.

## 2. Terminal fidelity (T101 to T105)

- **T103 start at the real size.** The pane's size is sent with the start request (bounded, validated); the process draws its first frame at the right size.
- **T101 exact screen restore.** The Host keeps a headless terminal per session (`@xterm/headless` fed the same bytes) and answers a new attach with a serialized screen (`@xterm/addon-serialize`) instead of a replayed tail. A reconnect that still has its cursor resumes from the log; one that does not gets the serialized screen. The screen model is a Host-side detail behind the existing `subscribe` port.
- **T102 GPU renderer.** WebGL addon with a fallback to the DOM renderer on context loss or when unavailable; chosen at attach.
- **T105 regression run.** An automated scenario against a real PTY running a full-screen program (resize, burst output, reconnect with and without a cursor, exit), plus the manual browser checklist in `research.md`.

## 3. Layout and chrome (T106 to T110)

Direction taken from Orca, super.engineering and superset.sh: chrome that is quiet and information-dense, with agent activity visible without opening anything.

- **Status line (T106):** one slim row under the workspace with the selected branch, changed-file count, running agents, and the context pressure of the current chat. Built as a workspace-owned component in the canvas column (not a change to the shell frame's grid), fed by the existing shell and session state through pure projection functions.
- **Sidebar (T107):** worktree rows show branch, change counts and the agent icons of the terminals running there. Attention states use only what the runtime really reports today (running, finished-since-last-seen); "needs approval" waits for a real signal.
- **Right panel (T108):** Changes and Code tabs show +/- totals and a branch chip.
- **Toast (T109):** when an agent tab finishes, a small toast with its name and a button to open it.
- **Run (T110):** an optional per-worktree run command (from the user's own configuration, same trust rules as agents).

Every new piece is a pure model plus a thin component, tested without a browser, with the pixel pass tracked separately (T096).
