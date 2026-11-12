# One name for every part: `acryl` and `@acryl/*` (milestone M13)

Owner's words (2026-11-10): "here we got ideas to how make all under 1 brand 'acryl' ... use that to create new milestone in specs so
that we use our npm name 'acryl' as main entry point that will point to acrylblends and any other sub part, like @acryl/blends or
@acryl/core etc."

Source discussion: `docs-acryl-project-RnD-ideas-discussions-questions/acrylblends_strategic_direction_steering/v2_Critique_of_ACRYL_and_new_Thinking_on_Architecture_6af1c645-2558-83eb-a512-c1b997cc2827.md`
(the last third: Core without agents, "Agent Pack", Core and Full editions, then the namespace answer). Earlier steering, already decided:
`Discussion_acrylblends_strategic_direction_steering.md` and the Critique chat's "Architecture A" (each Blend is its own OS app, its writable
folder is in userspace), which is [app-storage.md](./app-storage.md).

Owner's answers, 2026-11-11: `@acryl` is ours and the `acryl` package page (npmjs.com/package/acryl) is ours. The commands must be short and
memorable, with no `--` separator and no long flag lists; the `@acryl/*` names are the way to say it. The owner's summary of the v2 final
answer: `acryl` the platform launcher and CLI, `@acryl/core` the agent-free runtime, `@acryl/blends` the composition and distribution
framework, `@acryl/code` the IDE and agentic environment, `@acryl/blend-*` the application ecosystem, `@acryl/plugin-*` the extensibility
ecosystem. This note matches it, with the points below made explicit.

Recorded by AcrylImplementer. This note proposes; the owner's answers to the questions at the end make it a decision.

## What is true today (checked 2026-11-10, not taken from the discussion)

- npm `acryl` is published (0.2.6): "A persistent, agent-agnostic coding environment", bin `acryl` and `acryl web`. Maintainers: musichen,
  webboxescom, acryldev. In this repo it is `distribution/acryl-npm-launcher`.
- npm `acrylblends` (1.4.x, the framework and its CLI) and `create-acrylblends` (1.4.2) are published, maintainer webboxescom. They come from
  the repository `acrylblends/acrylblends` (`packages/cli`, `packages/create`, private staging package `acrylblends-framework`).
- `@acryl/core`, `@acryl/blends`, `@acryl/code`, `@acryl/create`, `@acryl/ide` and `@acryl/ui` all answer 404 on npm. A 404 does not say
  whether the `@acryl` scope (an npm organization) exists and is ours, so that is unverified and is T031. `npm whoami` on this Mac answers
  401, so this machine is not signed in to npm.
- Names inside the repositories today: `acryl-control`, `acryl-harness-runtime`, `acryl-web`, `acryl-desktop` (unscoped, in `acryldev/acryl`);
  `@webboxes/blends-core`, `@webboxes/plugin-hub`, `@webboxes/app-persistence`; in the Blends repository the frame is `acryl-blends-frame`
  and the shared UI is already named `@acryl/ui` (not published).
- `@webboxes/blends-core` has no notion of a profile (a search for "profile" in its sources finds nothing), so "Core and Full editions of one
  Blend" would be new work in the format, not a rename.
- The Blank template's `blend.yaml` already has no agent rows, but it does carry the `acryl-door` row. The door is agent-facing (verbs,
  MCP routes), so Blank is "no built-in agent", not yet "provably agent-free". Whether the door still starts without the agent plugin is
  unchecked and is T033's first finding.

## Decisions proposed

**D1. `acryl` is the one entry point; `@acryl/*` are the parts.** `acryl` stays what it is and gains subcommands that forward to the parts:
`acryl` and `acryl web` unchanged, then `acryl new` (also `create`), `acryl install`, `acryl list`, `acryl update`, `acryl blends`,
`acryl plugin`, `acryl code` (the discussion's section 2). The agent CLI the package is today
becomes `acryl agent` only if the owner answers Q1 that way (this is the open question 1 below).

**D2. The names.**

| Name | What it is | Comes from today |
| --- | --- | --- |
| `acryl` | the launcher and the one command | `distribution/acryl-npm-launcher` |
| `@acryl/core` | the agent-free application runtime: Cordis loader, AppInstance, router, server, state, db, extensions | a package list of existing plugins plus a boundary test (T033), no code moved first |
| `@acryl/blends` | the framework apps import (`from '@acryl/blends'`), blend.yaml, lock, resolver, installer | `acrylblends` |
| `@acryl/create` | scaffolding: `npm create @acryl`, and `npm create acryl` through a small `create-acryl` | `create-acrylblends` |
| `@acryl/blend-code` | the ACRYL IDE as one Blend: the coding app (registry id `acryl.code`, command `acryl code`), D9 | `acryldev/acryl` apps and the frame |
| `@acryl/ui` | the shared components | `@acryl/ui` in the Blends repository, unpublished |
| `@acryl/plugin-*` | official Cordis plugins, only where one has its own consumer | `plugins/` of the Blends repository |

Later, only where a package has its own consumer (the discussion's list, not a promise to publish): `@acryl/cli` (only if separate from
`acryl`), `@acryl/cordis` (ACRYL's Cordis integration, only if it has to be its own package), `@acryl/design-system`, `@acryl/sdk`.

Not decided here: what `@webboxes/blends-core` is called. The discussion warns that "core" would then mean two things (the Blend format and
the runtime). Proposal: leave it until `@acryl/core` exists, then name it for what it is (the format), never "core".

**D3. A Blend is not an npm sub-path; the application family is `@acryl/blend-*`.** npm's package boundary is the slash after the scope: `@acryl/blends/03-crm` cannot be its own
package, only a sub-path of `@acryl/blends` that package would have to own. Ready-made Blends are registry entries with stable ids
(`acryl.crm`, `acryl.accounting`; the registry already uses ids like `acrylblends.notes-desktop`), not names with ordering numbers like
`03-`. The npm family for Blends that ship as packages is `@acryl/blend-crm`, `@acryl/blend-accounting`, `@acryl/blend-projects`,
`@acryl/blend-studio` (the v2 discussion's own list). Core and Full are profiles of one package (D6), not `blend-accounting-core` and
`blend-accounting-full` as two packages: the discussion itself prefers one package with named profiles.

**D4. npm is not the Blend registry.** npm carries code (`@acryl/*`). Plugins stay on GitHub releases and `cordisplugins.github.io` (M12),
Blends and starters on the Blends registry. An entry may point at npm, a Git repository or a signed app artifact.

**D5. Dependency direction, enforced by a test.** `@acryl/core` knows nothing of agents. `@acryl/blends` sits on core. The IDE Blend
(`@acryl/blend-code`, D9) sits on both, like every other Blend. The test (T033) fails when the core package set imports `agent*`, `driver-*`, `openai`, the frame or a DSH agent package, and it
reads the packaged closure, not only the import lines.

**D6. Core and Full editions of one Blend are profiles, not two apps.** One Blend id; `core` is its rows without agents, `full` extends
`core` with the agent rows. The Registry offers both. This needs a `profiles` field in the Blend format (T037), after D5 holds.

**D7. Nothing breaks for people who have the old names.** `acrylblends` and `create-acrylblends` keep working as thin aliases of
`@acryl/blends` and `@acryl/create` for a long period (ACRYL's own CLI depends on `acrylblends` today). Old and new commands must make the
same app (T035).

**D8. The workshop of 2026-11-20 uses short commands, and nothing else moves before it.** The owner's requirement of 2026-11-11 replaces the
earlier "commands do not change": the long form (`npm create acrylblends@latest app -- --template blank --desktop -y --install`) is not
acceptable for participants. T039 makes `npx acryl new my-app` and `cd my-app && npm run dev` the workshop commands, verified on all three
systems from local tarballs first; the old commands stay as the fallback. Outward steps (reserving names, publishing `acryl` with the new
subcommands, `create-acryl`, `@acryl/blends`, `@acryl/create-blends`) each need the owner's explicit go (T031, T035). No repository move before
the workshop.

**D9. The ACRYL IDE is one Blend, the coding one (owner, 2026-11-12).** Owner's words: "acryl IDE https://github.com/acryldev/acryl has to
be just one of the BLENDs for coding as agentic IDE Acryl Blends app". So the IDE is not a separate product layer above Blends: it is an app
built on `@acryl/blends` like the CRM, with the same blend.yaml, registry entry, Core/Full profiles and plugin pull. Names, following D3:

| What | Name | Why this one |
| --- | --- | --- |
| registry id | `acryl.code` | the stable id every Blend has (`acryl.crm`, `acryl.notes`) |
| npm package, if it ships as one | `@acryl/blend-code` | the `@acryl/blend-*` family; `@acryl/blends/code` cannot be its own package (D3): only a sub-path of the framework, which would put the IDE into every app's install |
| command | `acryl code` (open it), `acryl new my-ide code` (make one) | the same `acryl new <dir> <starter>` line as every Blend |

`@acryl/code` is no longer a layer of its own; it is not published unless it becomes a short alias of `@acryl/blend-code`. The stack reads:
`@acryl/core` (agent-free runtime), `@acryl/blends` (the framework), then the Blends: `acryl.code` the IDE, `acryl.crm`, `acryl.notes`, and
the person's own; `@acryl/plugin-*` and the agent pack plug into any of them. This is the direction already taken on 2026-10-23 and
2026-10-30 (the IDE ported into the framework, DSH one chat driver), now with its name. Not before the workshop (D8).

## Repository ownership (open, Q2)

Two views exist. The owner's earlier message: move the framework into `github.com/acryldev/acryl` as `@acryl/blends` and `@acryl/code`.
The v2 discussion's recommendation: keep it a separate repository but transfer `acrylblends/acrylblends` to `acryldev/blends`, so that the
framework stays independently releasable and `acryldev/acryl` consumes it by version; one organization, two repositories, the npm package
is the contract. Either keeps one npm name family. This note does not choose; T036 carries out whichever the owner picks.

## The short commands (T034, T039)

```
npx acryl new my-app            blank app in the frame with agents, installed
npx acryl new my-app notes      the same from a starter; a registry starter opens in the frame too
cd my-app && npm run dev
npx acryl plugin publish hello  inside an app, no "npm run acryl --"
npm create acryl my-app         the same through create-acryl (npm create passes positional words, never flags, so none are needed)
npm create @acryl/blends my-app the same through @acryl/create-blends (npm maps @scope/name to @scope/create-name)
```

Why no `--`: `npm create` is the only form that swallows `--flags` (they need `--` in front); `npx` passes them. Defaults carry the rest.

## Order of work

Phase A, no outward action: decisions (T032), the boundary test (T033), the `acryl` subcommands that forward to the existing CLI (T034), the
short commands checked from local tarballs on three systems (T039).
Phase B, after the workshop and each step with the owner's go: names and publishing (T035), repository (T036), editions (T037), registry
ids (T038), sites and docs (T041).

## Questions for the owner

0. Answered 2026-11-11 (owner): `@acryl/core` is a dependency of an app, not source copied into it. The whole picture and the reasons are in
   [vision-simplification.md](./vision-simplification.md); the door as its own package (`@acryl/door`) is proposed there, not yet decided.

1. Answered 2026-11-11: `@acryl` is ours. Still open inside T031: which names may be reserved before 2026-11-20, and the member check once the owner is signed in.
2. One repository or two (`acryldev/acryl` only, or `acryldev/acryl` plus `acryldev/blends`)? The discussion recommends two.
3. Does the agent CLI the `acryl` package is today become `acryl agent` (recommended in open question 1)?
4. Blend ids: `com.acryl.crm` (the discussion), `acryl.crm` (the registry today), with the old `acrylblends.` prefix kept as an alias?
