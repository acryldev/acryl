# Plan: guardrailed self-extension

**Spec**: `specs/037-guardrailed-self-extension/spec.md`
**Data model**: `data-model.md`
**Status**: active (research gates closed 2026-09-20; Slice 1 next)
**Created**: 2026-09-20

## Shape of the change

Six moves, each independently shippable and each leaving `corepack pnpm run
check` green. Slices 1 and 2 form the walking skeleton: an agent on any surface
is routed to a real doc and a real example, and a candidate package can be
verified. Nothing in the later slices is needed to demonstrate that the
mechanism works end to end.

1. **Route** - the pack package exists with a manifest, three docs and two
   examples; the runtime plugin puts the router `PromptSection` on all three
   surfaces; the agent can read the resolved files. (Pi: system-prompt `docs`
   section + docs and examples on disk.)
2. **Verify** - `acryl plugin verify` and the scenario runner; the gate
   (`verify-pack`) enforces index completeness, scenario passes and the prompt
   budget. (Pi has no equivalent; this is the guardrail Pi lacks and the reason
   the tutorial found a doc error.)
3. **Deliver** - both paths: local live install (031, 032, 033 B2) and
   marketplace prepare plus human-approved publish (030).
4. **Cover** - the full corpus: sync the handbook, cheatsheet and harness docs
   with surface tags; write the per-type docs and verified examples for every
   row of the coverage matrix; per-surface docs.
5. **Skill and ship** - bundled authoring skills, the `AGENTS.md` pointer, and
   packaging so an installed CLI, Web runtime and packaged Desktop have the pack
   on disk.
6. **Measure** - the eval harness, baselines with and without docs on tasks with
   headroom, tuning of the router from the results.

Order rationale: verify (2) before deliver (3) because delivery consumes the
verifier result; deliver before cover (4) so the docs describe commands that
exist; ship (5) after the corpus so the Q3 asar decision is tested against the
real size; measure (6) last because it needs everything, but its harness shape
(FR-014 exclusions) is fixed in the data model now so examples are tagged
`solutionFor` from the start.

## Seam inventory (what exists today, and what this plan adds)

| Concern | Today | This plan |
| --- | --- | --- |
| Per-surface composition | `ACRYL_CODING_CAPABILITIES` + `createAcrylCodingCapabilityPatches(surfaces)` in `acryl-harness-runtime/src/coding-capabilities.ts` | add a capability `extension-context` with `surfaces: ['tui','web','desktop']` (data change, per spec 034) |
| System prompt content | `dsh-system-prompt` `PromptSection` / `PromptContext`; `persona` composed for `tui` only | one router `PromptSection`; must not depend on `persona` (Q2) |
| Skills | `dsh-skill` registry, `SkillProvider`, bundled rank 600, `dsh-skill-badge` precedent | `acryl-extension-context` registers a bundled `SkillProvider` for `skills/` |
| Project instructions | `dsh-agent-instructions` (default) | one pointer line in this repo's `AGENTS.md` only |
| Docs on disk for installed users | none: the published `acryl` package is a launcher plus per-platform prepared runtime archives (`publish-npm-cli.mjs`, `build-cli-archive.mjs`, `build-web-archive.mjs`); Desktop is asar with `node_modules/**` unpacked | pack as a `dependencies` entry so it is under `node_modules` in every archive and unpacked in Desktop; runtime resolves it and maps `app.asar` to `app.asar.unpacked`; release inspection fails if it is absent; not in `noExternal` (Q3) |
| Examples | `examples/acryl-blend-demo` only | `plugins/acryl-extension-context/example-plugins/packages/*`; the demo stays where it is and is cross-linked |
| Candidate verification | `plugin-doctor.ts` (profile health) | `acryl-harness-runtime/src/plugin-verify.ts` beside it, per-candidate, per-surface (Q4) |
| Local install and live activation | `desktop-plugin-reconcile.ts` (031), `ctx.livePluginActivation` (032), generated-module resolution (033 B2); CLI has `plugin list/enable/disable/doctor` (034 T003) | `acryl plugin install --local`: verify, `dsh plugin add file:`, explicit `livePluginActivation.activate`, compensating `remove`; shared capability, no Desktop-private copy (Q7) |
| Marketplace | `cordis-plugin-market`, catalog from npm `acryl-package` keyword (030) | `acryl plugin publish` prepare + human-approved publish; no catalog change (Q8) |
| Eval | `specs/013-acryl-12-trace-eval` is an unfilled stub with a privacy note; tutorial harness in `_experiments` | `plugins/acryl-extension-context/evals/`; full trajectories local and gitignored, summaries committed (Q5, D11) |
| Doc corpus | scattered, no manifest | synced, split, surface-tagged, provenance-stamped, manifest-indexed |

## Cordis mini-design (`AGENTS.md` requires this before implementation)

**1. Capability and plugin boundary.** Capability: "an agent can find, read and
be checked against ACRYL's own extension documentation". Owner: the
`acryl-extension-context` plugin. It needs independent lifecycle (disable it and
the router disappears from the next assembly, the pack stays on disk),
configuration (token budget, extra doc roots) and replacement (a deployment may
supply another pack provider). Verifier core and publish preparation are library
code in the same package, exposed by CLI commands and one agent tool; they are
not separate plugins because they have no independent activation lifecycle.

**2. Provides and consumes.** Provides service `extensionContext`
(`root`, `manifest()`, `resolveDoc(id)`, `listExamples(filter)`); a `PromptSection`
named `acryl:extension-router`; a bundled `SkillProvider` named
`acryl-extension-skills`; a tool `acryl_verify_plugin`. Hard `inject`:
`systemPrompt` (to register the section). Optional via `ctx.get()`: `skills`
(absent means skills are simply not registered, the router still works), `tools`
(absent means no verify tool on that composition). No dependence on `persona`.

**3. Effects and disposal.** Every registration is an effect with a disposer, in
this order of acquisition and reverse order of release: pack root resolution
(no resource), `extensionContext` service, prompt section, skill provider, tool.
The prompt section is registered inside the owning `ctx.effect()` so disposal
removes it and a re-mount does not throw the duplicate-name error. A file watcher
is not used by the plugin; manifest changes take effect on re-mount, which is the
existing hot-reload path. The verifier runs scenarios in a throwaway Context it
owns and disposes; it never touches the user's Context or profile.

**4. Configuration and composition.** Config schema (Schemastery, validated
before `apply`): `routerTokenBudget` (default 1500), `extraDocRoots` (default
none), `enableVerifyTool` (default true). Stable Loader row id
`extension-context`, name `acryl-extension-context`. Composed on `tui`, `web`,
`desktop` through the capability entry, not per-surface lists. Provider
replacement: `extensionContext` is a service key; another provider of the same
key replaces it and the router reactivates (consumers depend on the key, never
the concrete provider).

**5. Events and durability.** The router text is static for the process
lifetime (cache-safe prefix). Anything session-specific (for example the list of
locally installed generated capabilities) is a `PromptContext`, which the harness
logs durably when it changes. The plugin emits no Cordis events of its own;
verification and delivery results are typed records returned to the caller and
recorded by the existing session and lifecycle logs, not a new event stream.

**6. Verification.** Real Loader activation of the composed row on each surface;
`PENDING` when `systemPrompt` is absent and activation when it appears;
provider replacement of `extensionContext`; disposal removes the section,
service and tool; repeated mount and reload leaves exactly one section and no
leaked effect; assembled-prompt assertion on all three surfaces; token budget
test. These are scenarios in the pack's own gate, run against the pack's own
plugin as well as the examples.

## Per-surface composition target

Derived from `surfaces` declarations, not a per-surface list.

| Capability or row | tui | web | desktop |
| --- | --- | --- | --- |
| `extension-context` (router, service, skills, verify tool) | yes | yes | yes |
| pack on disk (installed build) | CLI dependency | Web runtime dependency | packaged app, asar-safe (Q3) |
| `acryl plugin verify` / `install --local` / `publish` | CLI commands | invoked via runtime capability from the Settings > Plugins panel (034) | same, plus Desktop reconcile |
| live activation after local install | Q7 | Q7 | yes (032 T2) |
| client-slot examples and docs | n/a | yes | yes |
| Desktop-main examples and docs | n/a | n/a | yes |
| TUI contribution examples and docs | Q6 | n/a | n/a |

## Local live delivery design

Reuses, does not reimplement:

1. Agent writes the package under the profile's local plugin workspace
   (`<profile>/plugins-local/<name>/`, so a throwaway `DSH_HOME` isolates it).
2. `acryl plugin verify` against the surfaces the package declares.
3. `acryl plugin install --local <dir>`: the shared install capability refuses on
   verifier errors, runs `dsh plugin add file:<dir>` (pnpm add plus bundle
   reconcile), reads `ctx.get('livePluginActivation')` **at call time** (the
   documented ordering trap), and calls `activate(packageName)`. On any failure it
   runs the compensating `dsh plugin remove`, because CLI and Web have no recovery
   log (measured: a throwing plugin stayed in `dsh.profile.bundles`). Desktop keeps
   its own recovery log behind the same result type. `file:` copies the package, so
   editing requires re-adding; `link:` may enable the edit-and-see loop (T018 tests
   it).
4. The result is a `LocalInstallResult`. `activation: 'live'` on host-side
   rows; `'reload-required'` when a client bundle changed (spec 032 renderer
   reload); `'restart-required'` only if Q7 finds a surface that needs it, in
   which case the docs and the router policy say so.
5. Iteration: edit, verify, install again; the lifecycle controller disposes the
   old fiber first. `ACRYL_PLUGIN_WATCH` may automate step 5 in development.

## Marketplace delivery design

1. Same verified package.
2. `acryl plugin publish --prepare` (safe, automatic): `npm pack`, lint against the
   catalog's real listing rules (exact `acryl-package` keyword, valid `acryl`
   manifest with existing artifact paths, `dsh.bundle.patch` in `files`, `exports`
   includes `./package.json`, GitHub `repository`, `description`, `license`, version
   not yet published, no secrets, declared surfaces equal verified surfaces), run
   `npm publish --dry-run` (no credentials needed, cannot upload), then install the
   produced tarball into a throwaway profile and mount it (proven headlessly), so
   the packed artifact is what is verified. Returns `PublishPrepResult`.
3. `acryl plugin publish` (human-only): shows the tarball contents, version and
   registry, requires an interactive terminal and a typed confirmation of package
   name and version, uses the user's own npm authentication, and is never run by any
   automated gate. **No agent tool for publish is registered**, so misuse is
   structurally impossible rather than policy-blocked.
4. Visibility: the catalog refreshes about every 15 minutes (spec 030 A). The
   agent confirms with the catalog source's own read API through the market
   client, not by scraping npm, and reports "pending refresh" honestly.
5. Install from the market is unchanged from a user's flow.

## Corpus plan (Slice 4)

| Group | Content | Source | Method |
| --- | --- | --- | --- |
| `start-here/` | this runtime vs DSH vs Cordis; authoring laws (constitution condensed); six-part mini-design template; verify-before-done | constitution, `AGENTS.md`, surface contract | hand-written, short |
| `extending/<type>.md` x 18 | one page per matrix row: what it is, when to use it, contract, per-surface notes, anti-patterns, the verified example, verify command | handbook parts, cookbook, harness subsystem docs, real source | hand-written from sources, each cites its example |
| `surfaces/{tui,web,desktop}.md` | what each surface can host, transports, slots, boot and verify commands | surface contract, specs 034 and 018, Q1 census | hand-written from measurement |
| `delivery/{local-live,marketplace}.md` | the two paths above with commands, results and failure modes | specs 030-033, this plan | hand-written, examples verified |
| `lifecycle/` | HOT/WARM/COLD; generated package shape; rollback; hot-reload limits | constitution V, spec 032, `docs/acryl/plugin-hot-reload.md` | hand-written |
| `guide/` | handbook split by Part, surface and applicability tagged | `docs/cordis/cordis_system_guide_for_coding_agents.md` | `sync-corpus.mjs` |
| `harness/` | cookbook and subsystem docs relevant to authors | `deepseek-harness/docs` at the submodule pin | `sync-corpus.mjs` |
| `reference/` | cheatsheet, capability seams, config catalog pointer, Cordis API | `docs/cordis/`, harness generated docs | sync, links |

Doc-to-source drift is the failure mode the cheatsheet already documents. Each
`extending/` page therefore names the verified example that proves its contract,
and the gate fails if that example's scenario fails: a doc cannot outlive a
false claim it depends on.

## Migration path (no big-bang change)

- The pack is additive: a new package and one capability entry. Removing the
  entry returns the runtime to today's behavior.
- The router ships behind the capability's `surfaces` data: enabled on `tui`
  first (walking skeleton), then `web` and `desktop` when the assembled-prompt
  check passes for each.
- Nothing under `deepseek-harness/` changes. Docs sync reads the submodule at its
  pinned commit and refuses to run against an unpinned or dirty checkout.
- Existing human docs in `docs/` are not moved or deleted; the pack copies from
  them and links back. Any later consolidation is a separate decision.
- Spec 034 owns moving install and lifecycle into a shared capability. 037 adds
  `install --local` and `publish` on top of that boundary and must not add a
  second copy in a surface. If 034's relocation is not finished when Slice 3
  starts, Slice 3 lands the smallest shared entry point and records the
  dependency.

## Verification

Per surface, with real evidence:

- **router**: cold start with a throwaway `ACRYL_HOME`; dump the assembled system
  prompt; assert the router section, the pack path exists on disk, and the token
  budget. tui, web, desktop.
- **pack scenarios**: `verify-pack` mounts every example scenario per declared
  surface headlessly (NFR-001, NFR-004).
- **verifier**: one fixture per `VerifyCode`, each producing exactly that finding.
- **local delivery**: throwaway profile, real `pnpm add file:`, real activation,
  fiber state and bundle diff before and after, failed-install rollback.
- **marketplace prepare**: pack, lint and tarball-install in a throwaway profile,
  plus negative fixtures. Real publish only in a human-attended run.
- **installed builds**: CLI tarball installed in a scratch directory, a built Web
  runtime, and a packaged Desktop app each open `docs.json` through the agent's
  read tool at the resolved path (Q3).
- **real agent**: a recorded session per surface on a task with a verifiable goal,
  trace showing reads, verify call, fix, and delivery.
- **eval**: `full` versus `without_docs` on tasks with headroom (Slice 6).

GUI confirmation for Desktop and Web panels stays a separate human-attended task
(repo rule), not part of the headless gate.

## Risks

- **Packaging (Q3, measured).** Files inside `app.asar` are invisible to child-process
  tools, and the release pruner deletes `test`/`tests` directories under
  `node_modules`. Mitigation: dependency under `asarUnpack`ed `node_modules`, path
  mapping, examples use `checks/`, release inspection asserts the pack is present;
  fallback is materializing to `<ACRYL_HOME>/context/<version>/`.
- **Router present but ignored.** The tutorial showed reads at first contact and
  none later. Mitigation: verifier findings carry doc ids so failure routes the
  agent back to the right doc; the eval measures reads and outcome; the policy
  text is tuned against results, not opinion.
- **Prompt and context cost.** Measured 2x input tokens in the tutorial.
  Mitigation: static router under a token budget; docs are read on demand only;
  cache-friendly ordering; the eval records tokens and cache hit for every variant.
- **Docs drift from source.** The cheatsheet already lists doc-versus-source
  corrections. Mitigation: every `extending/` page is tied to a verified example;
  synced files carry provenance and the sync fails on a dirty or unpinned source.
- **Verifier fidelity.** A headless composition can pass a package the real
  surface rejects. Mitigation: verifier uses the real engine definitions per
  surface (Q4), and the local-delivery evidence uses the real install path.
- **Publish safety.** Publishing is public and irreversible. Mitigation: prepare
  is separate from publish, publish needs fresh human approval, credentials are
  not agent-readable, no automated gate can publish (D6).
- **Spec 034 overlap.** Both touch plugin capability on every surface.
  Mitigation: 037 consumes 034's shared boundary; ownership stated above.
- **Eval without headroom.** Passing 9/9 both ways proves nothing (tutorial).
  Mitigation: tasks must state expected headroom and are rejected if a docs-less
  baseline passes them all.
- **Answer-key leak.** Mitigation: `solutionFor` tagging and the harness failing a
  run that read an excluded path (FR-014).

## Ledger updates

- `docs/DEVELOPMENT-LOG.md`: one entry per landed task, added after the
  implementation commit in a separate documentation commit (repo rule).
- `specs/034-plugins-on-every-surface/spec.md`, `specs/033-.../spec.md`,
  `specs/030-acryl-marketplace/spec.md`: cross-reference 037 for the agent
  authoring and delivery flow instead of leaving it implicit.
- `AGENTS.md`: one pointer line (FR-011).
- `docs/plugin-development.md` and `docs/cordisplugins/README.md`: link to the
  pack as the agent-facing counterpart.
- `.specify/memory/constitution.md`: no amendment expected; this spec implements
  principle V for the authoring half.
