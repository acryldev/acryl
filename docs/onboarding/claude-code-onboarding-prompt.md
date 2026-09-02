# Claude Code onboarding prompt — ACRYL

Paste everything below into a fresh Claude Code session as your opening message.
It is written to be self-contained, up to date, and pointed at the authoritative
documents so a new agent reaches working context without guessing.

---

You are onboarding onto **ACRYL**, a local-first, plugin-native, multi-surface
agent workspace built on an unmodified DeepSeek Harness + Cordis runtime.

Current release: **v0.1.25** (multi-surface distribution).

## 1. First, orient yourself (required reading, in order)

Read these before writing any code:

1. `.specify/memory/constitution.md` — binding ACRYL/Cordis laws. Violating these
   is a review failure.
2. `docs/onboarding/orientation_spec_acryl.md` — the product mission and what
   ACRYL actually is (not another coding agent; the continuity layer above them).
3. `docs/ACRYL-ROADMAP.md` — product direction, milestones M0–M8, and the
   non-negotiable architectural invariants. This is the **global navigator**.
4. `docs/ACRYL-RUNTIME-SURFACE-CONTRACT.md` — the current product decision:
   agent behavior is implemented **once** in the runtime, and TUI/Electron/Web
   are peer surfaces that render the same semantics.
5. `AGENTS.md` at the repo root (also `CLAUDE.md`, a symlink to it) — the
   operational rules: PNPM-only, Cordis protocol, commit/discipline rules,
   package boundaries. This file wins over everything else.

Then read the **Cordis stack**, since all product work is Cordis plugins:

6. `docs/cordis/cordis_spec.md` — the Cordis runtime model.
7. `docs/cordis/cordis_system_guide_for_coding_agents.md` — the operational
   Context / Fiber / Service / inject / effect / event / Tool / Loader / HMR
   rules. **Read this before touching any plugin, service, tool, provider, event,
   Host route, Client contribution, or Loader composition.**
8. `docs/cordis/acryl_cordis_alignment_audit.md` — what is aligned, what is
   transitional, and what is gated before room/agent-provider work.
9. `docs/acryl/ACRYL_DSH_GAP_ANALYSIS.md` — first-pass substrate map of what DSH
   already gives us vs the real ACRYL gaps.
10. `docs/acryl/AGENT_CONTROL_SURFACE_CORDIS_DESIGN.md` — constraints on the
    agent control surface (protocol-native + third-party agents, no parallel
    plugin runtime, no raw-terminal-as-canonical).

## 2. The codebase map (package roles)

```text
acryl              -> public npm selector/launcher (bin: acryl)
acryl-harness-runtime -> the engine: boots/disposes the one pinned Harness
                         profile + Cordis root. Owns durable state.
acryl-control      -> control plane linked by every surface: lease, protocol,
                      inspection, lifecycle, provider-neutral agent control.
acryl-tui          -> terminal surface (pi-tui). Never owns a Cordis root.
acryl-web          -> standalone web surface (local HTTP/WebSocket server).
acryl-desktop      -> Electron GUI + packaging; shrink toward Electron-only.
acryl-development-canvas -> first ADE surface (Orca-inspired canvas).
dsh-community-fabric     -> community interop RFC (doc scaffold, not loadable).
dsh-community-market     -> optional Market provider (disabled by default).
deepseek-harness/        -> PINNED UPSTREAM SUBMODULE. Never edit from a feature.
```

The migration direction matters: reusable logic moves **out of** `acryl-desktop`
and into `acryl-harness-runtime` / `acryl-control`; the desktop package shrinks
toward window chrome, tray, native menu, packaging, updater, OS integration.

## 3. How to plan and track work (Spec Kit + Wayfinder SDD)

The spec system is the source of truth for what to build. Read:

- `specs/README.md` — how the three methods interleave: **GitHub Spec Kit**
  (per-milestone spec/plan/tasks), **Wayfinder** (Matt Pocock, for foggy
  decisions), and **Matt Pocock SDD** (to-spec / to-tickets / triage).
- `specs/000-wayfinding/map.md` — the current Wayfinder map: destination =
  Ship Development Canvas as the first ADE surface. Tickets live in
  `specs/000-wayfinding/issues/`.
- `docs/agents/issue-tracker.md` and `docs/agents/triage-labels.md` — tracker
  conventions and triage roles.
- `docs/agents/domain.md` — the required reading list and glossary vocabulary.

Milestone folders: `specs/NNN-<feature>/`. Each holds `spec.md`, `plan.md`,
`tasks.md`, `research.md`, `checklists/`, and `evidence/`. A stub `spec.md` is
**not** approved until filled by `/speckit-specify` after the unlocking Wayfinder
ticket is resolved.

Typical order for one milestone: resolve the Wayfinder ticket -> read the Cordis
guide and write the six-part mini-design -> `/speckit-specify` -> `/speckit-plan`
-> `/speckit-tasks` -> `/speckit-implement` for the current slice only.

## 4. Engineering method (read `docs/workmethodology/acryl-hybrid-engineering-methodology.md`)

This is the operative method. It fuses:

- **Spec Kit** — durable spec artifacts and dependency-ordered tasks.
- **Wayfinder / Matt Pocock SDD** — decisions when the way is foggy; tickets
  decide, they do not build.
- **Superpowers** — process skills: `/brainstorming`, `/systematic-debugging`,
  `/test-driven-development` (RED-GREEN-REFACTOR), `/verification-before-completion`.
- **Ponytail minimalism** — the simplest correct root-cause change. Climb the
  ladder (skip it / reuse / stdlib / native / installed dep / smallest code /
  new dep) and stop at the first option that satisfies acceptance. Prefer
  deletion to addition; no speculative factories, flags, caches, or registries.

Available skills: `/wayfinder`, `/speckit-specify`, `/speckit-clarify`,
`/speckit-plan`, `/speckit-tasks`, `/speckit-analyze`, `/speckit-converge`,
`/ponytail`, `/brainstorming`, `/systematic-debugging`,
`/test-driven-development`, `/verification-before-completion`, `/grilling`,
`/domain-modeling`, `/research`, `/writing-plans`.

The governing loop for every task:

```text
Roadmap gives direction -> Specs ledger gives task truth ->
Tests/evidence give behavioral proof -> Git history gives recoverable checkpoints.
```

Run the readiness protocol (see methodology §3) before work. Use RED-GREEN-REFACTOR
for behavior changes. Never claim completion without fresh command evidence
(methodology §13). A coherent change gets a focused commit; record the canonical
commit hash in `docs/DEVELOPMENT-LOG.md` in a **separate** docs commit.

## 5. Non-negotiable rules (from AGENTS.md + constitution)

- **Never edit `deepseek-harness/`.** It is a pinned upstream submodule.
- Use **PNPM only** (`corepack pnpm ...`), pinned release `11.7.0`. Never `npm
  install`, `yarn`, or direct `node_modules` hacks in the workspace.
- One writable runtime owner per profile; one Cordis lifecycle/DI system. Never
  introduce a parallel event, DI, registry, or state store.
- Every process/socket/watcher/timer/PTY/subscription/route/plugin registration
  has one lifecycle owner and an ordered disposer (`ctx.effect()`).
- Durable Harness/profile records are canonical; terminal scrollback, browser
  state, and Electron process state are projections only.
- Preserve upstream Harness composition, HMR (launch with `--expose-internals`
  when a profile enables HMR), and `cordis.patch.yml` behavior.
- Work directly on `main` during this rapid-development phase unless the user
  asks for a branch/PR. No routine PRs.
- Never `git add .` / `git add -A`; stage explicit paths. Run `git status`
  before risky git commands. No destructive git operations unless asked.

## 6. Build, run, verify

Setup: Node `^22.19.0` or `>=24.0.0`; `git submodule update --init --recursive`;
`corepack pnpm install --frozen-lockfile`.

- Fast loop: `corepack pnpm run typecheck` / `corepack pnpm run test` /
  `corepack pnpm run verify`.
- Full headless gate: `corepack pnpm run check`.
- Isolated GUI: `corepack pnpm run lifecycle` (or `dev` / `local`).
- Web surface: `corepack pnpm run web` (see `scripts/web-run.mjs`).
- TUI surface: `corepack pnpm run tui`.

Before claiming any work done, run the relevant package or root gate and read
the exit status, not just the last line.

## 7. Release distribution (context you may need)

The repo ships a **coordinated multi-surface release**: the public `acryl`
selector, the standalone `acryl-web` server, the `acryl-tui` CLI runtime, and
Desktop installers. See `specs/027-multisurface-release-distribution/` and
`docs/RELEASE-FOUNDATION-HANDOFF.md` for the release matrix, version-sync
guards, and npm publication. Release tags are the single source of truth for
version numbers.

## 8. Where to look first when lost

- Product direction: `docs/ACRYL-ROADMAP.md`
- Runtime/surface contract: `docs/ACRYL-RUNTIME-SURFACE-CONTRACT.md`
- Cordis how-to: `docs/cordis/cordis_system_guide_for_coding_agents.md`
- Cordis quick reference: `docs/cordis/cordis-usage-cheatsheet.md`
- First plugin example: `docs/cordisplugins/hello-world-plugin-guide.md`
- Method: `docs/workmethodology/acryl-hybrid-engineering-methodology.md`
- History of decisions: `docs/DEVELOPMENT-LOG.md`
- User/FAQ/why docs: `docs/user-guide.md`, `docs/faq.md`, `docs/why-desktop.md`

Begin by reading §1 in order, then report back a short readiness summary
(milestone, feature, and task you intend to work on) before touching code.
