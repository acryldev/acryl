# DSH Desktop repository rules

This repository owns the desktop product around an unmodified DeepSeek Harness checkout.

The agent's system prompt (where it comes from, how to change it, and a generated current copy per surface): `docs/system-prompt/README.md`.

Building or changing an ACRYL plugin, tool, UI slot or skill: start at `plugins/acryl-extension-context/docs/README.md` (routed docs) and `plugins/acryl-extension-context/example-plugins/README.md` (verified examples for every plugin type).

## Prerequisites and setup

- Use Node.js `^22.19.0` or `>=24.0.0` and the root PNPM `11.11.0` release through Corepack.
- Initialize the pinned upstream checkout with `corepack pnpm run upstream:sync`.
- Install root dependencies with `corepack pnpm install --frozen-lockfile`.

## Build, run, and verify

- Start the isolated local Desktop (own `~/.acryl-dev` home, advanced mode, Development Canvas) with `corepack pnpm run dev` (alias: `corepack pnpm run desktop`) or `corepack pnpm run local`.
- Use `corepack pnpm run dev:shared` only when you intentionally want the installed app's `~/.dsh` home.
- Fast headless loop: `corepack pnpm run typecheck`, `corepack pnpm run test`, or both via `corepack pnpm run verify`.
- Typecheck, test, then isolated GUI: `corepack pnpm run lifecycle`.
- Build the desktop package with `corepack pnpm run build`.
- Run the complete headless gate with `corepack pnpm run check`.
- Run upstream operations through the root scripts, such as `corepack pnpm run upstream:build`.

- `deepseek-harness/` is a pinned upstream Git submodule. Never edit files inside it from a desktop feature branch.
- `apps/acryl-desktop/` owns the Cordis Host and Client faces, Electron bootstrap, packaging, and release tests.
- `plugins/dsh-community-fabric/` owns the community interoperability RFC. Until schemas and a reviewed reference adapter exist, it remains a private documentation scaffold and must not declare loadable DSH or package entry points.
- `plugins/cordis-plugin-market/` is an implemented private Host/Client package. It is an optional Desktop Market provider, disabled by default, and must continue to use ordinary DSH/Cordis, profile, and Desktop service contracts rather than a parallel plugin runtime.
- The outer repository and all owned packages use the root PNPM release with `node-linker=isolated`.
- The upstream submodule keeps its own PNPM workspace. Run upstream commands through the root `upstream:*` scripts, which enter the submodule before invoking its pinned Corepack release.
- Compatibility mode must run the upstream default client without overrides. Advanced presentation belongs to desktop-owned client plugins and may replace documented slots or services through profile composition.
- Keep graphical application launch explicit. Builds, typechecks, unit tests, and Loader smokes must remain headless-safe.
- During the current small-team rapid-development phase, work directly on `main` unless the user explicitly requests a branch or pull request. Do not create routine PRs. Third-party contributors on forks should always work on a feature branch and open a PR upstream — the "work on main" convention applies to maintainers with push access, not to fork-based contributors.
- Commit every important coherent change promptly so regressions can be reverted to a precise checkpoint. Prefer several focused commits over rare large snapshots.
- Record every important product, architecture, workflow, or operational evolution in [`docs/DEVELOPMENT-LOG.md`](docs/DEVELOPMENT-LOG.md). Commit the implementation first, then add its full canonical commit hash and human-readable explanation to the log in a separate documentation checkpoint. Update logged hashes after any history rewrite or squash.
- Commit before major changes of direction and keep the submodule pin update separate from desktop behavior changes.
- Keep the repository topology and package-manager split consistent with the [owning Agent Note](.agents/notes/implemented/process/2026-08-15-pinned-upstream-and-isolated-yarn-workspace.md).

## Cordis development protocol

Before changing a plugin, service, tool, provider, event hook, Host route,
Client contribution, or Loader composition, read
[`docs/cordis/cordis_system_guide_for_coding_agents.md`](docs/cordis/cordis_system_guide_for_coding_agents.md).
Then inspect the owning pinned Harness subsystem documentation and package
types/source. The local vendored Harness behavior is authoritative over generic
Cordis examples.

Before implementation, write the Cordis mini-design in the active plan or
research note:

1. **Capability and plugin boundary** — what domain owns it and why it needs
   independent lifecycle/configuration/replacement.
2. **Provides and consumes** — services, tools, events, durable facts, hard
   `inject` requirements, and intentionally optional `ctx.get()` dependencies.
3. **Effects and disposal** — every activation-owned resource, its disposer,
   required cleanup order, cancellation, and quiescence behavior.
4. **Configuration and composition** — validated runtime schema, stable Loader
   row ids, scopes/isolation, and provider replacement behavior.
5. **Events and durability** — dispatch mode, explicit waterfall `next()`
   semantics, and which replay-critical facts belong in durable session state.
6. **Verification** — real Loader activation plus PENDING/reactivation,
   provider replacement, disposal, repeated mount/reload, and leak checks.

**Loader row id naming.** A Loader row's `id` (what `include:` prefixes)
must equal its package name by default — `acryl-development-canvas` gets
row id `acryl-development-canvas`, never an unrelated shorthand a reader
has to look up in the package's own `cordis.patch.yml` to decode (fixed
real instances of the anti-pattern: `acryl-development-canvas` itself
shipped with row id `desktop-development-canvas` until this rule was
written; `acryl-dsh-editor-plugin`'s row id is the still-unfixed, opaque
`dsh-editor`, discovered only when it broke Desktop's boot — neither was
a hypothetical). The one legitimate
exception is a deliberately shared, multi-provider slot where the id names
a *capability*, not a package, because more than one interchangeable
package can fill it (e.g., the brand-slot pair, where `ui-brand-official`
and `dsh-client-ui-brand-acryl` both occupy the same swap slot by design).
That exception must be named as such in the mini-design (point 4 above) —
it is never a default excuse for an unrelated or abbreviated id.

Use function plugins by default and `Service` classes for direct named
capabilities. Consumers depend on stable service interfaces through `inject`,
not concrete providers or YAML row order. Cordis/Harness registrations are
lifecycle-owned; raw timers, watchers, sockets, PTYs, subprocesses, routes, and
subscriptions are acquired inside one owning `ctx.effect()` and fully released
by its disposer.

A Harness Tool is a consumer of `ctx.tools`, not a Cordis primitive. Tool
plugins inject `tools`, register with `defineTool(...)`, return canonical typed
values separately from model/UI rendering, honor `exec.signal`, traverse the
normal policy pipeline, and disappear when their owning Fiber unloads.

Treat PENDING as valid missing-dependency state. Current Fiber states are
PENDING, LOADING, ACTIVE, FAILED, UNLOADING, and DISPOSED. A provider change
must unload and reactivate consumers without stale references or duplicate
registrations. Cordis service isolation scopes resolution; it is not an OS
sandbox.

## Architecture and clean-code discipline (engineering books)

Engineering reference (authoritative for clean-architecture, DDD, and
day-to-day engineering-discipline judgement; this section is the
ACRYL-specific interpretation):

- `~/.agents/rules/agent-rules-books/clean-architecture/clean-architecture.md`
- `~/.agents/rules/agent-rules-books/implementing-domain-driven-design/implementing-domain-driven-design.md`
- `~/.agents/rules/agent-rules-books/the-pragmatic-programmer/the-pragmatic-programmer.md`

Precedence: the constitution, the Cordis coding-agent guide, and the ACRYL
control-surface design win over this section; this section never overrides a
documented seam or an owning-package contract. These are coding-style and
boundary-discipline rules, not a second architecture.

### Boundaries

- Surfaces (`acryl-tui`, Electron, Web) render and drive runtime semantics; they
  do not own domain or business logic. ACRYL-owned capability logic belongs
  behind `acryl-control` / `acryl-harness-runtime` contracts. Never implement a
  provider/credential/authorization state machine, a durable-state write, or a
  business invariant inside an overlay or surface file.
- Depend on typed service interfaces (`inject` keys and typed `ctx.get(...)`),
  never on `any`, bare framework handles, concrete providers, or YAML row order.
  A `const svc: any = ctx.get('x')` in production code is a review failure
  (break the pattern with an explicit decision, or fix it; do not extend it).
- Do not mutate durable/system state from a presentation surface, and do not
  encode internal state bits into user-visible names or fields (no `-oauth`
  display-name suffixing). A presentation field is not a domain store.
- Cross-boundary data flows through one typed projection/service, not through
  ad-hoc re-fetch plus `refreshCredentialState()`-style shotgun loops. One
  source of truth per state; targeted invalidation or subscription, not
  "refresh everything".

### Repository layout (package placement discipline)

Root packages are grouped by role, not left flat (fixed real instance:
ten packages sat loose at repo root with no grouping signal for what
depended on what — `acryl-npm-launcher`, a release shim, sat at the same
level as `acryl-harness-runtime`, the core engine, and `cordis-plugin-market`,
a Cordis plugin; regrouped 2026-09-14, `pnpm-workspace.yaml` and
`scripts/verify-layout.mjs` are the enforced source of truth for the
result). This is Clean Architecture ch.11 (dependency inversion — depend
inward, never let the stable core depend on a replaceable surface) and
ch.17 (plugin architecture — components a reader should recognize as
swappable belong grouped, not scattered) applied to directory layout, not
just import direction. It is also *Pragmatic Programmer*'s broken-windows
discipline: one un-grouped, randomly-placed package normalizes the next
one, and a repo that looks abandoned gets treated like one.

Current groups and what belongs in each:

- `apps/` — the swappable surfaces (`acryl-cli`, `acryl-web`, `acryl-desktop`).
  A new terminal/web/desktop-shaped entry point goes here.
- `runtime/` — the stable core every surface depends on
  (`acryl-control`, `acryl-harness-runtime`). Nothing here may depend on
  anything under `apps/`.
- `plugins/` — independently replaceable Cordis/DSH plugins
  (`dsh-client-ui-brand-acryl`, `dsh-community-fabric`, `cordis-plugin-market`).
  A new installable capability package goes here, not next to `apps/` or
  `runtime/`.
- `examples/` — demo/reference packages (`acryl-blend-demo`) that ship
  nothing production-facing.
- `distribution/` — release/publish shims (`acryl-npm-launcher`), never
  product logic.
- `deepseek-harness/` (pinned submodule), `docs/`, `specs/`, `scripts/`,
  `patches/`, `assets/` stay at root — they are not workspace packages.

A new top-level package's home is decided by which of the five groups it
plays the *role* of, not by where it's convenient to drop it "for now" —
there is no scratch space at root. If a new package genuinely fits none
of the five, that is a signal to design the grouping deliberately (raise
it, don't invent a sixth ad hoc bucket) — the same discipline this
section already asks for Loader row ids and service contracts. Whichever
directory a package moves to or is added under, update it in the same
commit as `pnpm-workspace.yaml`'s package list and
`scripts/verify-layout.mjs`'s asserted layout — the CI gate
(`corepack pnpm run check`) is the actual enforcement, this text is only
the reasoning behind it.

### Models and language

- Model real domain concepts with small, immutable, explicit types (value
  objects / discriminated unions), not bare `string` / `'a' | 'b'` unions
  smeared inline. One exported type per concept;
  do not re-declare it in three files.
- One term, one meaning (ubiquitous language). Do not overload a single field
  (e.g. `configured`) to mean different things in different overlays. Rename
  when understanding improves; keep tests, events, commands, and services
  speaking the same language.
- Prefer identity (IDs) over object references across aggregate/context
  boundaries; keep aggregates small and centered on immediate invariants.
  Protect the core domain from generic abstractions and vendor terms.

### Functions and state

- `render()` / UI projection functions are pure — no state mutation during
  render. View state is a small discriminated-union state machine, not a loose
  field cluster that can drift inconsistent.
- Extract genuinely shared logic once (e.g. list-window slicing) into a narrow,
  owned helper; do not build generic `utils/`, `shared/`, or `core/` dumping
  grounds.
- Depend inward: framework/infrastructure details at the edge, business rules
  in the application/domain layer.

### Checkpoints and honesty

- Land coherent, buildable commits. A `HEAD` that cannot typecheck (a feature
  split so its container is committed but its surface is not) is a review
  failure — restore a green, reversible checkpoint.
- Keep the spec ledger honest: when a delivered interaction diverges from
  `spec.md` / `plan.md` / `tasks.md`, update the ledger (or open a decision
  ticket) before marking the slice done. Never leave a stale spec apparently
  active.

## Agent skills

### Issue tracker

Decisions and feature specs live as markdown under `specs/` (Spec Kit + Wayfinder). See `docs/agents/issue-tracker.md`.

### Triage labels

Default Matt Pocock roles: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context. Constitution, orientation, Cordis spec, and `docs/acryl/` are required reading; `CONTEXT.md` / ADRs are created lazily. See `docs/agents/domain.md`.

### Local Cordis plugin quick-build

Need a Cordis plugin for your own immediate use, not public distribution? Use the `cordis-plugin-quickstart` skill (`.claude/skills/cordis-plugin-quickstart/SKILL.md`) to scaffold, mount, and hot-iterate one locally instead of going through `cordis-plugin-market`'s npm-publish install path.

Agent-runtime, Development Canvas, context-relay, and third-party adapter work must follow [`docs/acryl/AGENT_CONTROL_SURFACE_CORDIS_DESIGN.md`](docs/acryl/AGENT_CONTROL_SURFACE_CORDIS_DESIGN.md) and [the current alignment audit](docs/cordis/acryl_cordis_alignment_audit.md). Build on Cordis services, injection, effects, events, Fibers, Loader composition, and existing DSH capability seams; do not introduce a parallel lifecycle, dependency-injection, event, tool, or provider framework.

## Rebuilding the graft graph

Use `corepack pnpm run graft:deepscan`, never a bare `graft build --deep`. Graft 0.18.0 cannot finish a DeepSeek deep pass unpatched (it stalls at ~80% with `empty-parsed` on ~175 files); the script re-applies the four required patches and then builds. `corepack pnpm run graft:deepscan -- --check` verifies the setup and writes nothing. A `graft upgrade` or reinstall reverts those patches, so re-run the script after either. Rationale and measurements: [`docs/DEVELOPMENT-LOG.md`](docs/DEVELOPMENT-LOG.md), 2026-09-14.

<!-- graft:start -->
## Graft — repo context graph

This repo is indexed in `graft/`: small linked markdown nodes that explain each
system and carry exact file:line spans, kept in sync with the code through git.

For ANY task here — understanding how something works, finding where code lives,
or scoping a change — get context from the graph before grepping or opening
source files. Re-ask freely (it's cheap) and reuse literal identifiers you
already have (symbol, error string, file name) as the query. New to this repo?
Run `graft map` first — a token-budgeted orientation (dir clusters, hubs,
hotspots), no LLM, no key.

- Run `graft ask "<your question>" --source` → ranked nodes with the relevant
  code spans inlined (each hit's ≤8-line crux by default; `--full` for whole
  definitions when the crux isn't enough). Match the tool to the task shape:
  for understanding or editing, the top node IS the answer — cite its
  `covers:` file:line spans and edit straight from `--source`. For
  exhaustive tasks ("every occurrence / every caller of this pattern"), ranked
  results are top-N, not complete — run `graft grep "<literal>"` instead
  (exhaustive over indexed files, grouped by enclosing symbol), falling back
  to raw `grep -rn` only for unindexed files.
- `graft skeleton <file>` → every definition's signature + span, ~10× cheaper
  than reading the file; use it to skim an API surface.
- `graft callers <symbol>` gives precomputed, exact edges — who calls this.
  Add `--direction out` for what it calls, or `--depth N` to walk
  transitively for the full blast radius. For structural questions, skip
  ranking and use this directly.
- Or browse: `graft/INDEX.md` lists every node; follow the links.
- Monorepos and folders of multiple repos rank fairly across sub-projects —
  hits carry `[scope/]` labels naming which one they're from. Narrow with
  `graft ask "<task>" --in <scope>/` once you know where you're working.

If a returned span is truncated ("+N more lines"), open the file at that exact
range before finalizing. Only open source files when a node genuinely lacks a
needed detail, and then at the exact file:line the node points to — never
re-read whole files.

After big code changes, refresh the graph with `graft build` (deterministic,
no API key, $0).
<!-- graft:end -->
