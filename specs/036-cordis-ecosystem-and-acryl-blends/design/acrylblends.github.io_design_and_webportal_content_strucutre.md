# acrylblends.github.io — design and web portal content structure

Companion design doc to `specs/036-cordis-ecosystem-and-acryl-blends/spec.md`.
Describes the full content structure, navigation, menus, sections, and pages
for the `acrylblends` registry site (`github.com/acrylblends`,
`cordisplugins.github.io`'s sibling for the Blend layer per spec 036's own
three-layer model). This is a **sitemap and content-structure design**, not
an implementation plan — no framework, hosting, or build decision is locked
here beyond a recommendation.

## References this is built from (real sites, actually inspected)

- **`open-harness.dev`** (local clone at
  `_reference_projects/open-harness`) — the closest existing analog to
  what ACRYL Blends wants to be: a practical, composable-primitives
  framework, not just a formal protocol. Its docs app
  (`apps/docs/docs.json`) is Mintlify-based with a clean, six-group
  navigation (Getting Started, Core Concepts, Tools, Advanced, UI
  Integration, Resources) — the closest direct template for this doc's own
  "Docs" section below. Its homepage (hero tagline, "Everything you need"
  feature grid, two real code samples, three-step quick start, repeated
  docs/GitHub CTAs) is the closest direct template for the "Home" section.
- **`tanstack.com`** — the top-nav category grouping (Libraries by
  purpose, not by name), the "principles" pillar section, and the
  maintainers/sponsors/blog sections are the template for how a
  *multi-library ecosystem* (not a single tool) presents itself at the top
  level — relevant here because `acrylblends` fronts many independent
  Blends and Cordis plugins, not one product.
- **`orchestra-mcp.dev`** — its "Packs" section (a browsable catalog of
  pre-built content bundles, grouped by stack, each showing install
  command + tool/skill counts) is the direct template for this doc's own
  "Browse Blends" registry UI — the single closest existing pattern to
  "browse Blends by category and pull one."

## Recommended platform

**Mintlify**, matching `open-harness`'s own proven choice for exactly this
shape of content (docs + marketing landing in one deployable site, `.mdx`
pages, a single `docs.json` nav config). Not a locked decision — a
recommendation carried over from the closest real precedent, to be
confirmed when this moves from design to build.

## Top-level navigation (tabs)

Following `open-harness`'s own tab pattern, but Blends is fundamentally
*two audiences* at once — people who want to **pull a Blend** and people
who want to **build one** — so the top nav has to serve both without
burying either:

```
[Home]  [Browse Blends]  [Docs]  [Cordis Primer]  [Ecosystem]  [Blog]
```

- **Home** — marketing landing, the pitch and the mental model.
- **Browse Blends** — the registry itself: the Docker-Hub-style catalog.
- **Docs** — the practical framework: how to build/publish a Blend, how to
  build a Cordis plugin with ACRYL Blends' own tooling.
- **Cordis Primer** — a condensed, ACRYL-flavored on-ramp to Cordis itself
  (the protocol), always deferring to the real DeepSeek Harness tutorial
  for depth rather than duplicating it.
- **Ecosystem** — the map of the whole thing: `cordisplugins`,
  `cordis-plugin-market`, DeepSeek Harness compatibility, the open
  core / enterprise / private-registry business model.
- **Blog** — release notes, new-Blend-category announcements, case studies.

Header CTAs (persistent, right-aligned, matching `open-harness`'s own
"Read the Docs" / "Star on GitHub" pattern): **Browse Blends** (primary),
**GitHub**, **Docs**.

## Section 1 — Home

Structure, adapted directly from `open-harness.dev`'s own proven shape:

1. **Hero** — tagline positioning ACRYL Blends against the two things it is
   not: not a marketing product name, not "just Cordis." Working line
   shape (not final copy): *"The practical framework for composing stable
   software out of Cordis plugins — start from a blank canvas, grow into
   anything."* Primary CTA: **Browse Blends**. Secondary: **Read the
   Docs**.
2. **The three-layer picture** — a single visual (not prose) making the
   `npm : cordis-plugin-market :: Docker image registry : acrylblends`
   analogy from spec 036 immediately legible: Atom (Cordis plugin) → Blend
   (composed instance) → Registry (acrylblends). This is the one idea the
   whole site exists to explain; it belongs above the fold.
3. **"Everything you need to grow a Blend"** feature grid (matching
   `open-harness`'s nine-item feature grid, ACRYL-flavored): Cordis-plugin
   scaffolding, hot-reload in-instance authoring, the Blend YAML format,
   one-command pull/spin-up, category browsing, private registry support,
   Differentiation Engine (checkpoint/rollback), multi-surface composition
   (TUI/Web/Desktop), DeepSeek-Harness compatibility.
4. **Two real code/config samples** (matching `open-harness`'s two-sample
   pattern): (a) a minimal Cordis plugin, quoted from the real tutorial per
   spec 036's own "What a Cordis plugin actually is" section; (b) a Blend
   YAML snippet naming a handful of plugins, showing the declarative
   "recipe" shape.
5. **Quick start, three steps** (matching both `open-harness` and
   `orchestra-mcp`'s own three-step patterns): **Pull** a starter Blend →
   **Grow** it (agent-driven, in-instance plugin authoring) → **Publish**
   (graduate a stable plugin to `cordis-plugin-market`, or a whole Blend to
   `acrylblends`).
6. **"One of a hundred starting points"** — a compact preview grid (6–8
   category cards, not the full 100) pulled from
   `docs/acrylbelnds_100ctgs/`, linking into **Browse Blends**. Not an
   exhaustive listing on the homepage — a teaser into the real catalog.
7. **Business-model strip** (light-touch, not a pricing page) — "Open
   source, built by Webboxes. Consulting and private registries for teams
   who want to build proprietary." Links to **Ecosystem → Business Model**
   for the full explanation, not expanded inline.
8. **Footer** — matching `tanstack.com`'s comprehensive footer-as-directory
   pattern: links to Docs, Browse Blends, GitHub (`acrylblends`,
   `cordisplugins`, `acryldev/acryl`), `cordis-plugin-market`, the ACRYL
   product itself, DeepSeek Harness, and social/community.

## Section 2 — Browse Blends (the registry)

The core "Docker Hub for Blends" experience. Structure directly modeled on
`orchestra-mcp.dev`'s "Packs" catalog:

- **Category index page** — all top-level categories from
  `docs/acrylbelnds_100ctgs/` (System, Application, Business, Developer,
  AI, Data, Analytics, Cloud, DevOps, Networking, Cybersecurity, ... through
  Autonomous and Meta-software), rendered as a browsable grid, not a flat
  list — matching that source document's own 100-entry hierarchical
  taxonomy exactly, so the site's own categories never drift from the
  canonical list.
- **Category page** (one per top-level category, e.g. `/blends/developer`)
  — the category's own subcategories (from the same taxonomy document,
  e.g. Developer → Code editors, IDEs, Version control, Build tools...),
  each showing available Blends tagged to it. A category with zero Blends
  yet still renders — it is a real target, not hidden — with an explicit
  "no Blends here yet, be the first to publish one" state.
- **Blend detail page** (one per published Blend) — matching
  `orchestra-mcp`'s per-pack card content: name, description, category/
  subcategory tags, the plugin list it composes (linking each to its own
  `cordis-plugin-market` listing), install/pull command, version history,
  publisher, license, and — once the Differentiation Engine (spec 033)
  exists — provenance (was this Blend agent-differentiated from another
  one, and from what base).
- **Search and filter** — by category, by tag, by included-plugin name,
  by publisher, free-text. A `⌘K` command palette (matching
  `orchestra-mcp`'s own pattern) is a reasonable UX target, not a hard
  requirement of this design pass.
- **"Publish a Blend" CTA**, persistent on every Browse page — links into
  Docs → Publishing.

## Section 3 — Docs

Directly modeled on `open-harness`'s own `docs.json` group structure,
re-scoped for ACRYL Blends' own two audiences (pulling vs. building):

```
Getting Started
  - What is ACRYL Blends
  - Install
  - Quickstart: pull your first Blend
  - Quickstart: publish your first Cordis plugin

Core Concepts
  - Cordis plugins: the atom (cross-links Cordis Primer for protocol depth)
  - Blends: the composed instance (Docker-image analogy)
  - The registries: cordis-plugin-market vs. acrylblends
  - The blank-canvas Blend and growing a Blend from it
  - ACRYL-the-product as one maxed-out Blend

Building Blocks
  - Generate a Cordis plugin from template (the scaffolding skill)
  - The row-id-equals-package-name convention and why it matters
  - The six-part Cordis mini-design discipline
  - Writing a cordis.patch.yml
  - Testing a plugin in isolation

In-Instance Authoring
  - Hot-reload: building a plugin without publishing first
  - When a plugin graduates from local to published
  - The "acryl-package" keyword convention for discoverability
  - The Differentiation Engine (links to spec 033 for the technical
    contract; this page stays user-facing)

Building and Publishing Blends
  - The Blend YAML format
  - Composing a Blend from existing plugins
  - Categorizing a Blend (the 100-category taxonomy)
  - Publishing to acrylblends
  - Versioning and updating a published Blend

Nesting and Composition (flagged explicitly as unstable/exploratory,
matching spec 036's own "explicitly unresolved" framing - not written as
settled documentation until the concept itself is settled)
  - Grouping plugins into larger units (open question, no page content
    committed yet beyond linking spec 036's own section)

Private and Enterprise
  - Self-hosted registries
  - Private Blend catalogs for teams
  - Enterprise-only Blends (what "not published openly" means in practice)

Resources
  - CLI reference
  - Examples
  - FAQ
  - Troubleshooting
```

## Section 4 — Cordis Primer

Deliberately thin — a condensed on-ramp, not a competing tutorial. Mirrors
spec 036's own "What a Cordis plugin actually is" section (same real code
samples: the minimal plugin, a service, `inject`, composition/HMR), then
hands off:

```
Cordis Primer
  - What is Cordis (the protocol, not ACRYL's own)
  - The minimal plugin (real code, from the DeepSeek Harness tutorial)
  - Services and injection (real code)
  - Composition and hot-reload (real code)
  - Where Cordis ends and ACRYL Blends begins (cross-links Core Concepts)
  - Go deeper: the full 7-chapter DeepSeek Harness Cordis tutorial (external
    link, not reproduced)
```

## Section 5 — Ecosystem

The map page — makes the whole system legible in one place, matching
`tanstack.com`'s own "About/Ethos" instinct for a multi-project umbrella:

```
Ecosystem
  - The three layers (same diagram as Home, expanded with prose)
  - cordisplugins (github.com/cordisplugins) - the Cordis plugin catalog
    home, and the 8 already-transferred repos as real examples
  - cordis-plugin-market - browsing/installing published Cordis plugins
    inside a running ACRYL (or any Cordis-based) instance
  - acrylblends - this registry
  - DeepSeek Harness compatibility - what "works with stock DSH too" means
    concretely, and its current real limits
  - ACRYL - the flagship, maxed-out Blend (cross-links the product itself)
  - Business model - Webboxes, open core, consulting, enterprise Blends,
    private registries (spec 036's own Business Model section, written for
    a public audience here rather than as internal spec context)
  - Roadmap / what's not built yet (honest gap list, not a promise list -
    Differentiation Engine, plugin-from-template skill, nesting/grouping,
    all explicitly marked not-yet-real, matching spec 036's own gap table)
```

## Full sitemap (URL tree)

```
/                                   Home
/blends                             Browse Blends (category index)
/blends/{category}                  Category page
/blends/{category}/{subcategory}    Subcategory page (if the category
                                     taxonomy's own depth warrants a third
                                     level - most do, per the source doc)
/blends/b/{blend-slug}               Blend detail page
/docs                               Docs index
/docs/getting-started/...
/docs/core-concepts/...
/docs/building-blocks/...
/docs/in-instance-authoring/...
/docs/building-and-publishing/...
/docs/nesting-and-composition        (stub, explicitly marked exploratory)
/docs/private-and-enterprise/...
/docs/resources/...
/cordis                             Cordis Primer index
/cordis/{page}
/ecosystem                          Ecosystem index
/ecosystem/{page}
/blog
/blog/{post-slug}
```

## What this design deliberately does not decide

- No visual design system (colors, type, logo) — a later pass, once a
  platform choice is confirmed.
- No decision on whether `acrylblends` is a static site only, or has a
  real backend/API behind Browse Blends (spec 036's own open question 2).
  This sitemap is written to work either way (a static Mintlify site can
  render a category catalog from data at build time; a real backend would
  serve the same page shapes dynamically).
- No decision on how `/blends/b/{blend-slug}` pages actually get their
  content — hand-authored, generated from each Blend repo's own manifest,
  or something else. Structure-only, not a data pipeline design.
- Does not commit final page copy anywhere in this doc — every bracketed
  or "working line shape" phrase above is illustrative, not final.

## Related

- `specs/036-cordis-ecosystem-and-acryl-blends/spec.md` — the concept this
  site is built to communicate and operate.
- `_reference_projects/open-harness/apps/docs/docs.json` — the concrete
  nav-config template this doc's Docs section is adapted from.
- `docs/acrylbelnds_100ctgs/acrylbelnds_100ctgs.md` — the canonical
  category taxonomy Browse Blends renders directly from.
