# ADE as a BLEND — Roadmap

Status: Committed (2026-09-14)

Build ACRYL's own agentic development environment (ADE) as a concrete, proven BLEND. This is not "a feature of ACRYL" — it's an ACRYL instance + plugins in a particular configuration. Once ADE ships and is documented, other teams can build their own BLENDs using the same patterns.

## Vision

**ACRYL is the atom.** Every product — ADE, customer workflows, white-label apps — is the same core (ACRYL) with different plugin sets and state configurations. BLENDS is not a separate system; it's how ACRYL instances are specified and reproduced.

Once ADE works, the BLENDS machinery is simply "the patterns ADE proved."

## Phase 1: Ship ACRYL 0.2.0 (Target: Sep 14-15, 2-3 hours)

Finalize the core product without BLENDS/ADE scope.

### Tasks

- [ ] **Version decision**: 0.2.0 (minor bump for spec 032/034 landing) or 1.0.0 (declare API stability)?
  - Recommendation: 0.2.0 (hot-reload + market landed, but ADE not shipping yet)
  - Document decision in this file

- [ ] **README.md updates**
  - Feature summary (hot-reload, plugin market, 3 surfaces)
  - Installation: npm, macOS DMG, Windows (if shipping)
  - Getting started link
  - Known limitations / setup required (OAuth app registration)

- [ ] **CHANGELOG.md**
  - What's new in 0.2.0 (specs 032, 034)
  - Breaking changes (none expected)
  - Known issues (pre-existing test failures documented)

- [ ] **Release tag**
  - `git tag v0.2.0 && git push origin v0.2.0`
  - GitHub Release draft (auto-generated or manual)

- [ ] **Web/CLI smoke test** (5-10 min each)
  - Web: navigate, create new session, install plugin (if possible)
  - CLI: `acryl` startup, `/market` command works, install plugin

### Exit Criteria

- [ ] Main branch tagged `v0.2.0`
- [ ] GitHub Release published with notes
- [ ] README reflects current features
- [ ] No new test failures introduced

---

## Phase 2: ADE Spec & Design (Sep 15-16, 3-4 hours)

Define what ADE is and what ACRYL machinery it needs.

### ADE Requirements

**What ADE provides:**
- An agent running inside ACRYL (not spawned externally, not in a separate chat)
- Agent can see: workspace files, git history, code context
- Agent can act: create/edit files, run git commands, execute code
- User can guide agent: chat + context instructions + task definitions
- State persists: current task, agent instructions, workspace, chat history

**What ADE plugs into ACRYL:**
- Agent loop service (Cordis service, receives turns from the chat UI)
- File tools (read, write, search, diff)
- Git tools (status, log, commit, branch, checkout)
- Code execution tools (shell, interpreter-specific)
- State persistence layer (task state, instructions, context)
- Multi-file editor (browse workspace, open files in editor)

### Design Tasks

- [ ] **ADE as a Cordis composition** — list the plugins
  - Core plugins: agent-loop, file-io, git, code-execution
  - UI plugins: workspace-browser, multi-file-editor
  - State plugins: persistence-layer, task-context
  
  Document in `specs/036-ade-agentic-dev-environment/design.md` (TBD path)

- [ ] **State persistence design**
  - ADE blend.lock.json: what does it need to pin?
  - YAML config: agent instructions, workspace root, initial context
  - Runtime state: current task, in-flight chat, file diffs
  - How does this fit into BLENDS' "forkable state" model?

- [ ] **Agent tool facade**
  - How does ADE's agent loop register tools with ACRYL?
  - Reuse unified `AcrylSurfaceTools` from spec 035 / AGENT_CONTROL_SURFACE_CORDIS_DESIGN.md
  - What tools does ADE expose? (file, git, code-run, context-add, etc.)

- [ ] **Multi-file chat context**
  - Currently ACRYL chat is single-turn with single file context
  - ADE needs multi-file context (user can point agent at multiple files)
  - Does this require changes to the chat UI or just agent instructions?

### Exit Criteria

- [ ] Design doc written (goals, plugin list, state model, tool facade)
- [ ] No new ACRYL machinery required beyond what spec 035 already defines
- [ ] ADE can be expressed as a valid YAML Blend configuration
- [ ] Ready for Phase 3 (implementation)

---

## Phase 3: ADE Implementation (Sep 16-18, ongoing)

Build the actual agent, plugins, and state management.

### Implementation Tasks

- [ ] **Agent loop service** (Cordis service)
  - Input: user message from chat UI + workspace context
  - State: current task, instructions, file diffs, git state
  - Output: agent response, tool calls (file edits, git commands, etc.)
  - Reuse DSH's agent loop framework or build minimal state machine

- [ ] **File tools plugin**
  - `file_read(path)` — read file or directory structure
  - `file_write(path, content)` — create or update file
  - `file_diff(path, newContent)` — show diff before writing
  - Integrate with existing ACRYL file browser UI

- [ ] **Git tools plugin**
  - `git_status()` — unstaged changes, branch, commits ahead
  - `git_log(--oneline)` — recent commits
  - `git_diff(path)` — show specific file diffs
  - `git_commit(message, files)` — stage and commit with agent-generated message
  - `git_branch(create|checkout|list)` — branch operations

- [ ] **Code execution plugin**
  - `bash(command)` — run shell command, capture output
  - `python(code)` — execute Python snippet
  - `node(code)` — execute Node.js snippet
  - Sandbox/security: run in isolated environment (Docker, subprocess limit)

- [ ] **State persistence plugin**
  - Save/load task state: current objective, progress, blockers
  - Save/load agent instructions: system prompt, context rules
  - Save/load workspace snapshot: files, git state, chat history
  - Checkpoint/restore on task switch

- [ ] **ADE Cordis composition**
  - Wire all plugins into one Cordis Fiber
  - Create ADE blend.lock.json template
  - Verify `pnpm --filter acryl-desktop run verify:profile` passes with ADE BLEND

### Exit Criteria

- [ ] All plugins functional and tested
- [ ] ADE BLEND config reproducible (can fork/restore)
- [ ] Agent can run a simple task: "create a new file with hello world, then commit it"
- [ ] `pnpm run check` passes

---

## Phase 4: Document & Generalize (Sep 18-19, 2-3 hours)

Show that BLENDS work by proving ADE.

### Documentation Tasks

- [ ] **docs/BLENDS-BY-EXAMPLE.md**
  - Concrete example: ADE as a BLEND
  - Show acryl.blend.yaml + .acryl/blend.lock.json
  - Explain how ACRYL + plugins = specialized product
  - Map ADE's plugins back to ACRYL's UI/service boundaries

- [ ] **Extract minimal BLENDS machinery**
  - What from the theoretical Blends spec do we actually need?
  - Answer based on what ADE required, not theoretical gaps
  - Update specs/033-acryl-blends-runtime-contract/spec.md with real findings

- [ ] **ADE BLEND published**
  - Create `examples/ade-agentic-dev-environment/` directory
  - Include blend.yaml, .acryl/blend.lock.json, setup instructions
  - Document: "To run ADE, clone this directory and `acryl blend load ./acryl.blend.yaml`"

- [ ] **"ADE is ACRYL + Plugins" narrative**
  - Blog post or README section: "How we built ADE using the same framework as the base product"
  - Show that the same machinery scales from minimal (blank ACRYL) to maximal (ADE)

### Exit Criteria

- [ ] ADE published as an example BLEND in this repo
- [ ] Documentation makes clear: BLENDS is not a separate system, it's how ACRYL instances are specified
- [ ] Any team can build their own BLEND by copying ADE's pattern
- [ ] Ready for next BLEND projects (customer workflows, white-label apps, etc.)

---

## Success Metrics

- **0.2.0 shipped** with clean check gates, documented features, known issues listed
- **ADE works end-to-end** — agent can run a real task (write code, commit, etc.)
- **BLENDS machinery reduced** — we ship only what ADE proved necessary, not theoretical gaps
- **Clear pattern established** — "ACRYL + plugins = specialized product" proven by example
- **Other teams unblocked** — can build their own BLENDs by following ADE's pattern

---

## Timeline

- **Sep 14-15**: Ship 0.2.0 (2-3h)
- **Sep 15-16**: ADE spec & design (3-4h)
- **Sep 16-18**: ADE implementation (6-8h, can parallelize plugins)
- **Sep 18-19**: Document & generalize (2-3h)
- **Total: ~15-20 hours**

---

## Related

- `specs/033-acryl-blends-runtime-contract/spec.md` — theoretical BLENDS spec (will be refined based on ADE)
- `specs/032-universal-hot-reload/` — hot-reload machinery ADE depends on
- `specs/034-acryl-market/` — plugin market that ADE uses
- `docs/SHIP-ASAP-CHECKLIST.md` — release readiness (Phase 1 prerequisite)
- `docs/acryl/adr/ADR-0001-blends-runtime-boundary.md` — BLENDS runtime mapping (informs Phase 2)
