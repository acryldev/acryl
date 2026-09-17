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

**A Cordis plugin is the minimal unit, the building block, the brick, the
"cell" — the smallest thing everything else in ACRYL is built out of.** Not
just "installable extras": the file browser, the Market UI itself, the
branding, a settings panel, a whole GUI surface, a tool, a whole product
capability — all of it is, or should be, a Cordis plugin, and nothing in
ACRYL should exist as a special, non-pluginized exception to that rule.
Cordis (the meta-framework both stock DeepSeek Harness and ACRYL are built
on — `@deepseek-ai/cordis` and friends) is the one substrate the two
communities already share, so it is the correct name for anything meant to
work across both, not "dsh" (implies DeepSeek-team ownership ACRYL does not
have and should not claim) and not "acryl" (implies ACRYL-exclusivity for
something that does not need to be exclusive). This is exactly the reasoning
that renamed `dsh-community-market` to `cordis-plugin-market` tonight
(`043fa47`) — not just to dodge an npm name collision, but because
"Cordis plugin market" is the *accurate* name for what the package already
does architecturally, independent of the collision.

## Cordis the protocol vs. ACRYL Blends the framework

These are two different things and the names should not blur together:

- **Cordis** is the *formal meta-framework* — the protocol-level rules for
  how a plugin declares itself, how the Loader composes rows, how Fibers
  mount/unmount/reload, how services are provided and injected. It answers
  "what is a valid way to compose plugins," in the abstract. It is not
  ACRYL's own; it is the substrate DSH and ACRYL both build on.
- **ACRYL Blends** is the *practical, opinionated framework built on top of
  Cordis* — real libraries and real machinery (not just a specification)
  that let a team actually scaffold, compose, and stably ship Cordis
  plugins as the fundamental unit ("cells"/"atoms"/"bricks") of an
  application, without everyone re-deriving Cordis's own formal rules from
  first principles every time. Where Cordis says *how composition is
  legal*, ACRYL Blends is the tooling that makes *doing it correctly, fast,
  every time* the path of least resistance — starting with `blends-core`
  (already landed) and extending through the still-missing "generate a
  Cordis plugin from template" skill described below.

`acrylblends` (lowercase, the GitHub org) names the *registry* specifically
— the Docker-Hub-analog catalog of shareable Blend recipes. **ACRYL
Blends** (the framework) is the larger thing that registry is one part of:
the format, the composition machinery, the registry, and eventually the
Differentiation Engine (spec 033) all together. Keep the two apart when
writing about this — "ACRYL Blends" is not just another word for the
registry.

## What a Cordis plugin actually is (from the real tutorial)

DeepSeek Harness's own Cordis tutorial
(`deepseek-harness.github.io/deepseek-harness/en/develop/cordis-tutorial/`,
seven chapters) is the canonical source for this — summarized here so it is
not just a link, with real code quoted from it, not paraphrased:

**A plugin is a function; the Loader mounts it.** The minimal plugin
(chapter 1, "Your first plugin"):

```typescript
import type { Context } from '@deepseek-ai/cordis'

export const name = 'hello'

export function apply(ctx: Context) {
  console.log('hello from my first plugin')
}
```

mounted via a Loader composition entry:

```yaml
- name: './hello.ts'
```

**A plugin can provide a service** (chapter 3, "Services") by extending
`Service`:

```typescript
export class GreeterService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'greeter')
  }
  greet(who: string) {
    return `Hello, ${who}!`
  }
}
```

**A plugin declares what it needs** via `inject` (hard dependency — Cordis
holds the plugin PENDING until every listed service exists) or `ctx.get()`
(optional):

```typescript
export const inject = ['greeter']
export function apply(ctx: Context) {
  console.log(ctx.greeter.greet('world'))
}
```

**Plugins compose hierarchically and hot-reload** (chapter 6, "Composition
and HMR") through Loader entries with stable `id`s, `disabled` toggles, and
groups that load/unload as one unit:

```yaml
- id: logger
  name: '@deepseek-ai/cordis-plugin-logger-console'
- id: hmr
  name: '@deepseek-ai/cordis-plugin-hmr'
  config:
    root: ['.']
- id: hello
  name: './hello.ts'
```

That is Cordis's own formal answer to "how do you build one." What ACRYL
Blends adds on top, per the distinction above, is not a different way to
write this code — it is the *machinery* that removes the manual work of
getting `cordis.patch.yml`/Loader-row-id-equals-package-name/the
six-part-mini-design discipline right by hand every time: the still-missing
"generate a Cordis plugin from template" skill (below) is meant to produce
exactly the shape this tutorial teaches, mechanically, not leave an agent to
re-derive it from the tutorial each time.

Given that, the ecosystem has three layers, each with a real-world registry
analog:

| Layer | What it is | Registry analog | Where it lives today |
| --- | --- | --- | --- |
| **Atom**: a Cordis plugin | One bounded capability — a tool, a UI slot occupant, a settings tab, a whole surface feature | **npm** itself, browsed through `cordis-plugin-market` | Any public npm package; `cordis-plugin-market`'s own catalog (`acryl.dev/v1/plugins` today, source-pluggable per its own "Sources" concept) |
| **Blend**: a composed instance state | A YAML manifest naming which Cordis rows (plugins) are mounted, their config, and (once the Differentiation Engine in spec 033 exists) a ledger of what an agent added live | **A Docker image** — reproduces a whole running instance from a declarative recipe | `acryldev/blends` (sibling repo, M1–M3 already landed per spec 033's own summary — BLEND format, `blends-core`, local hub index/CLI, static boot-time composition into `acryl-desktop/src/desktop-blend.ts`) |
| **Blend registry**: a catalog of shareable Blends | A place to publish/discover/pull whole pre-configured instance recipes, targeting the 100-category software taxonomy below | **Docker Hub** | `github.com/acrylblends` (user-created 2026-09-16, not yet populated — this spec's own open item) |

The **npm : Cordis-plugin-market :: Docker image registry : acrylblends**
analogy is deliberate and should be kept exact when explaining this to
anyone new — it is the fastest way to make the three-layer shape click.

### The 100-category taxonomy exists and is real

`docs/acrylbelnds_100ctgs/acrylbelnds_100ctgs.md` (added 2026-09-16, note
the directory's own typo in "acrylbelnds" — not renamed here since it is
not this spec's call to make) is a genuine, complete taxonomy: 100 numbered
top-level software categories (System, Application, Business, Developer,
AI, Data, Analytics, Cloud, DevOps, Networking, Cybersecurity, ... through
Autonomous and Meta-software), each broken into named subcategories with
examples, plus eight cross-cutting classification dimensions (interaction
model, execution environment, architecture, delivery model, licensing,
user type, autonomy level, and a condensed 16+1-family top-level view).
This is the real, already-done inventory `acrylblends` is meant to be
organized against — it answers open question 6 from the first version of
this spec directly. It is a *category taxonomy*, not yet a set of actual
Blend recipes; turning categories into real, buildable starter Blends is
still open work, not implied by the taxonomy's own existence.

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

A second, related requirement: the agent operating inside a blank-canvas
(or any) Blend needs to **know its own architecture** the way `pi.dev`'s
own coding agent is documented to understand the runtime it operates
in — not just be handed the scaffolding skill, but have ACRYL's own
Tier 0–3 model, the Cordis composition rules, and the Blend/plugin
relationship available to it as real, in-context knowledge, so it can
reason about *when* growing the Blend with a new plugin is the right move
versus reusing something that already exists. This is a documentation/
context-design requirement as much as a tooling one, and is currently
unspecified — no inventory of what an agent would need to know, or where
that knowledge should live (a skill, a bundled doc, a tool), exists yet.

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
| Agent self-knowledge of ACRYL's own architecture (pi.dev-style), so it can judge when to differentiate a Blend | **Not designed. No inventory of required knowledge exists.** | Needs its own follow-on spec once scoped |
| `acrylblends` registry (Blend recipes) | Org created 2026-09-16, not populated, no CLI/index built against it yet. Its target category taxonomy exists and is real (`docs/acrylbelnds_100ctgs/`) — actual Blend recipes per category do not yet exist | Needs its own follow-on spec once scoped, coordinating with `acryldev/blends`'s own already-landed M2 local hub index (does `acrylblends` replace, front, or federate with that local index? — unanswered) |
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
- `docs/acrylbelnds_100ctgs/acrylbelnds_100ctgs.md` — the real 100-category
  software taxonomy `acrylblends` is meant to organize around.
- https://deepseek-harness.github.io/deepseek-harness/en/develop/cordis-tutorial/
  — the canonical Cordis plugin tutorial (7 chapters); quoted from directly
  above rather than only linked.
- `specs/036-cordis-ecosystem-and-acryl-blends/design/` — the `acrylblends`
  web portal's own content structure/sitemap (new, this same pass).

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
6. ~~Where does the "~100 categories of starter apps" inventory live?~~
   **Resolved:** `docs/acrylbelnds_100ctgs/acrylbelnds_100ctgs.md`, added
   2026-09-16. Open now: turning categories into actual, buildable starter
   Blend recipes — the taxonomy alone is not that.
7. What, precisely, does an agent need to know about ACRYL's own
   architecture to reason well about differentiating a Blend (pi.dev-style
   self-knowledge)? No inventory exists yet.
