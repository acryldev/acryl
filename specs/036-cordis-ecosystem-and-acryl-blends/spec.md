# The Cordis plugin ecosystem and ACRYL Blends

**Tracking:** https://github.com/acryldev/acryl/issues/54

Status: needs-triage

## Why this spec exists

This captures a product-direction conversation (2026-09-16, in-session with
the user) that is not written down anywhere else yet. It names the pieces,
how they interconnect, why each exists, and what is genuinely still open
versus already decided. It is deliberately a **synthesis/positioning spec**,
not an implementation plan: `specs/030-acryl-marketplace/` owns the Market's
own technical build-out, `specs/033-acryl-blends-runtime-contract/` owns the
ACRYL-side runtime primitives Blends needs, and `specs/034-plugins-on-every-
surface/` owns the plugin-composition mechanics. This spec is the connective
tissue explaining why those three, plus two things not yet specced at all
(in-instance unpublished plugin authoring; the business model), are one
coherent system rather than three unrelated features. Follow-on specs should
peel work off this one rather than this one growing an implementation
section of its own.

## The core claim

**A Cordis plugin is the atomic unit of everything ACRYL builds.** Not just
"installable extras" — the file browser, the Market UI itself, the branding,
a settings panel, a whole GUI surface: all of it is, or should be, a Cordis
plugin. Cordis (the meta-framework both stock DeepSeek Harness and ACRYL are
built on — `@deepseek-ai/cordis` and friends) is the one substrate the two
communities already share, so it is the correct name for anything meant to
work across both, not "dsh" (implies DeepSeek-team ownership ACRYL does not
have and should not claim) and not "acryl" (implies ACRYL-exclusivity for
something that does not need to be exclusive). This is exactly the reasoning
that renamed `dsh-community-market` to `cordis-plugin-market` tonight
(`043fa47`) — not just to dodge an npm name collision, but because
"Cordis plugin market" is the *accurate* name for what the package already
does architecturally, independent of the collision.

Given that, the ecosystem has three layers, each with a real-world registry
analog:

| Layer | What it is | Registry analog | Where it lives today |
| --- | --- | --- | --- |
| **Atom**: a Cordis plugin | One bounded capability — a tool, a UI slot occupant, a settings tab, a whole surface feature | **npm** itself, browsed through `cordis-plugin-market` | Any public npm package; `cordis-plugin-market`'s own catalog (`acryl.dev/v1/plugins` today, source-pluggable per its own "Sources" concept) |
| **Blend**: a composed instance state | A YAML manifest naming which Cordis rows (plugins) are mounted, their config, and (once the Differentiation Engine in spec 033 exists) a ledger of what an agent added live | **A Docker image** — reproduces a whole running instance from a declarative recipe | `acryldev/blends` (sibling repo, M1–M3 already landed per spec 033's own summary — BLEND format, `blends-core`, local hub index/CLI, static boot-time composition into `acryl-desktop/src/desktop-blend.ts`) |
| **Blend registry**: a catalog of shareable Blends | A place to publish/discover/pull whole pre-configured instance recipes across ~100 (eventually) categories of starter apps | **Docker Hub** | `github.com/acrylblends` (user-created 2026-09-16, not yet populated — this spec's own open item) |

The **npm : Cordis-plugin-market :: Docker image registry : acrylblends**
analogy is deliberate and should be kept exact when explaining this to
anyone new — it is the fastest way to make the three-layer shape click.

## Why ACRYL itself is "just" one Blend

The product currently called ACRYL — agentic development environment,
software factories, skills, planning, the works — is not a special,
hardcoded thing sitting outside this model. It is **one Blend among many: a
maxed-out one.** The framework's actual minimal starting point is a
**blank-canvas Blend**: an agent to talk to, a model chooser, an input
field, maybe a file view — the smallest set of Tier-2 subsystems (per
`docs/acryl/MENTAL-MODEL-factory-car-driver.md`'s own Tier 0–3 framing) that
still constitutes something a person can start from. A user (or an agent,
per the Differentiation Engine) then grows that blank Blend into something
specialized — a CRM, a blogging tool, an agentic coding environment — by
adding Cordis plugins one at a time, the same mechanism regardless of
destination. ACRYL-the-product is simply the specific, most-differentiated
point on that spectrum this team has built and ships as the flagship.

This reframes the roadmap question from "what features does ACRYL have" to
"what is the blank-canvas Blend's own minimal plugin set, and does today's
Loader/Fiber/Tier-2 machinery already support assembling from that floor
upward for any target, not just the one we ship." Nothing here changes the
Tier 0–3 model itself (factory/car/subsystem/driver stays canonical) — it
reframes what currently sits at "the car's subsystem list" as itself a
composable, swappable, publishable thing, which is exactly spec 033's own
`BlendRuntimeAdapter`/Differentiation Engine territory, now given the
explicit product framing of "growing a Blend from blank."

## The missing piece: unpublished, in-instance plugin authoring

Everything above assumes Cordis plugins are npm packages, resolved through
`cordis-plugin-market`. That is correct for the **stable, shared** case —
once a capability is generically useful, publishing it is exactly right
(discoverable, versioned, install-anywhere). But it is bad developer
experience, and directly hostile to the actual differentiation workflow, to
require a full publish cycle for every capability an agent builds *while
growing one specific user's Blend*. A user starting from blank canvas and
asking for one form field does not want that to become a public npm
package before it can exist in their own running instance.

So the model needs a second, faster path that does not exist yet:

- An agent operating inside a live ACRYL instance can **scaffold and mount a
  new Cordis plugin on the fly**, hot-reloaded into the running Fiber tree
  (this is squarely `specs/032-universal-hot-reload`'s mount/unmount
  machinery, and spec 033's still-open "B2: wire reconcile + activate
  together for an agent-generated module" gap — see that spec's gap table).
- That plugin starts life **local to the instance**, captured as new Blend
  state (spec 033's Differentiation Engine, still unbuilt) — not published
  anywhere.
- Only when a capability reaches a state worth sharing does it graduate to
  a real `cordis-plugin-market` listing — matching the existing
  `"acryl-package"` keyword + structured `"acryl"` package.json field
  convention already shipping in real published plugins tonight (e.g.
  `acryl-dsh-editor-plugin-cli`'s own manifest), which is the shape a
  future automatic-listing mechanism would key off. Whether
  `cordis-plugin-market`'s catalog build actually crawls npm by that
  keyword today, or listings are still curated, is unverified and worth
  checking before promising automatic listing as a real feature.

The concrete, missing deliverable this implies: **a reliable "generate a
Cordis plugin from template" skill** the agent can invoke, that guarantees
whatever it scaffolds is structurally compatible with the Loader (correct
`cordis.patch.yml` shape, row-id-equals-package-name convention already
documented in this repo's own `CLAUDE.md`, the six-part Cordis mini-design
discipline) every time, mechanically — not left to the agent's own
judgment each time and therefore inconsistent. This is the actual technical
bridge between "everything is a plugin" as a philosophy and "an agent can
build anything as a plugin" as a working feature.

## Open, explicitly unresolved: nesting/grouping plugins

The user raised, as a live, not-yet-decided idea: once a Blend has enough
plugins, does it need a grouping/composition concept above the single
plugin — bundles-of-plugins, or a biology-flavored framing (cell/organism)
for how atoms combine into larger, still-swappable units? This is
explicitly **not settled**. It is recorded here so it is not lost, and so
a future pass does not have to rediscover it from scratch, but no naming or
mechanism should be assumed from this paragraph. The nearest existing prior
art worth checking before inventing anything: Cordis's own group/HMR
plugins already in this repo's dependency tree
(`@deepseek-ai/cordis-plugin-group`, `@deepseek-ai/cordis-plugin-hmr`) may
already express a composition primitive close to what this idea wants.

## Business model (context, not a build item)

Recorded because it shapes what "open" means in every decision above, not
because it implies new code:

- The product is open source. Development is funded by Webboxes (the
  company behind this work), whose actual revenue plan is consulting —
  helping businesses adopt and adapt the framework.
- Some Blends — polished, specialized white-label starter apps — may ship
  enterprise-only, not published to the open `acrylblends` registry.
- Teams building privately on the framework should be able to run their
  own private Blend/plugin registries inside their own infrastructure,
  rather than only the public `cordisplugins`/`acrylblends` ones. This is
  the shape a future paid offering takes: not gating the framework itself,
  but supporting private, self-hosted variants of the two public registries
  this spec names.

None of this needs code today. It is recorded so that naming, licensing, or
registry-architecture decisions made under specs 030/033/034 (or this one's
own later follow-ons) do not accidentally foreclose it — e.g., a registry
design that hardcodes a single public source would need revisiting before
"private registry for one company" could ever be a real feature.

## What already exists vs what this spec adds

| Piece | Status | Owning spec/repo |
| --- | --- | --- |
| Cordis as shared substrate, "everything is a plugin" | Existing principle (constitution Principle I; `MENTAL-MODEL-factory-car-driver.md`) | This repo, canonical |
| `cordis-plugin-market`: browse/install published Cordis plugins | **Live tonight.** Renamed from `dsh-community-market`, published publicly (`043fa47`, npm `cordis-plugin-market@0.1.0`) | `specs/030-acryl-marketplace/`, `specs/034-plugins-on-every-surface/` |
| `cordisplugins` GitHub org (catalog home, `cordisplugins.github.io` already scaffolded) | Created 2026-09-16, not yet populated. Three already-published, ACRYL-authored Cordis plugin repos transferred into it tonight (`acryl-dsh-editor-plugin`, `-web`, `-cli`), plus `acryl-development-canvas`, `-web`, `cordis-plugin-graph`, `dsh-cordis`, `pi-cordis` (8 repos total) | This spec (new) |
| BLEND format, `blends-core`, local hub index/CLI, static boot-time composition | **Landed** (M1–M3) | `acryldev/blends` (sibling repo), `specs/033-acryl-blends-runtime-contract/` |
| Live Differentiation Engine (agent adds a capability to a running Blend, checkpointed, rollback-able) | **Not built.** Real, scoped gap analysis already exists | `specs/033-acryl-blends-runtime-contract/` (gap table is the authoritative "what's missing" reference — do not duplicate it here) |
| "Generate a Cordis plugin from template" agent skill, guaranteed-compatible scaffolding | **Not built. No spec yet.** | Needs its own follow-on spec once scoped — candidate `037` |
| `acrylblends` registry (Blend recipes, ~100 starter categories) | Org created 2026-09-16, not populated, no CLI/index built against it yet | Needs its own follow-on spec once scoped, coordinating with `acryldev/blends`'s own already-landed M2 local hub index (does `acrylblends` replace, front, or federate with that local index? — unanswered) |
| Blank-canvas Blend as the literal framework floor | **Product framing stated here for the first time.** No blank-canvas Blend YAML exists yet to point at | Needs its own follow-on spec |
| Nesting/grouping plugins above the single-plugin unit | **Explicitly open**, not designed | Deferred — see "Open" section above |
| Private/self-hosted registry variant (business model) | Context only, no design | Deferred until a public registry design exists to extend |

## Non-goals for this spec

- Does not implement anything. It is the map; specs 030/033/034 and their
  successors do the building.
- Does not re-litigate or duplicate spec 033's own gap table (Differentiation
  Engine primitives) — read that spec directly for the technical detail.
- Does not lock the nesting/grouping naming or mechanism.
- Does not commit to a specific `acrylblends` architecture (static site vs.
  API-backed index vs. something federating with `acryldev/blends`'s
  existing local hub) — that is real design work for its own follow-on spec.
- Does not change licensing or pricing. The business-model section is
  context for future decisions, not a decision itself.

## Related

- `specs/030-acryl-marketplace/` — `cordis-plugin-market`'s own build-out.
- `specs/033-acryl-blends-runtime-contract/` — the ACRYL-side primitives
  the Differentiation Engine needs; authoritative gap table, do not
  duplicate.
- `specs/034-plugins-on-every-surface/` — the TUI/Web/Desktop plugin
  composition mechanics `cordis-plugin-market` and every other Cordis
  plugin actually mount through.
- `specs/032-universal-hot-reload/` — the live mount/unmount/cascade
  machinery in-instance plugin authoring needs.
- `docs/acryl/MENTAL-MODEL-factory-car-driver.md` — the Tier 0–3 framing
  this spec's "Blend = Tier-2 subsystem manifest" claim is stated against.
- `acryl_blends_project/blends/docs/ACRYL_BLENDS_SPEC.md` — Blends' own
  governing product spec (the "what" and "why" on that side of the
  boundary).
- `docs/DEVELOPMENT-LOG.md`, 2026-09-16 entries — the real commits behind
  the `cordis-plugin-market` rename and publish this spec's table cites.

## Open questions (carried forward, not answered here)

1. Does `cordis-plugin-market`'s real catalog-build process crawl npm by
   the `"acryl-package"` keyword today, or is listing still manual/curated?
   Determines whether "publish and it's auto-listed" is a real current
   feature or still aspirational.
2. What is `acrylblends`'s actual architecture — static index (matching
   `cordisplugins.github.io`'s own GitHub Pages shape), or does it need a
   real backend? Does it federate with or replace `acryldev/blends`'s
   already-shipped local hub index (M2)?
3. What is the blank-canvas Blend's literal minimal plugin set? No one has
   enumerated it yet.
4. Nesting/grouping of plugins — genuinely open, see above.
5. Does `@deepseek-ai/cordis-plugin-group` already provide (or nearly
   provide) whatever the nesting idea above is reaching for? Unchecked.
