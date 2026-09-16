# cordisplugins.github.io — design and web portal content structure

Companion design doc to `specs/036-cordis-ecosystem-and-acryl-blends/spec.md`
and to the sibling `acrylblends.github.io_design_and_webportal_content_strucutre.md`
in this same `design/` folder. Describes the full content structure,
navigation, menus, sections, and pages for the `cordisplugins` registry site
(`github.com/cordisplugins`) — the atom-level registry in spec 036's own
three-layer model, sitting directly below `acrylblends` (the Blend
registry, the Docker-Hub analog) the same way npm sits below Docker Hub.

## What this site is, and what it deliberately is not

- **Is**: the public discovery and browsing surface for Cordis plugins —
  the "npm registry, but browsable and Cordis-aware" from spec 036's own
  three-layer table (Atom : npm :: Blend : Docker image :: Blend registry
  : Docker Hub). A Cordis plugin here is the minimal unit / building
  block / brick / "cell" per spec 036's "core claim" — the smallest thing
  everything else (including a Blend) is built out of.
- **Is not**: a Blend catalog (that is `acrylblends`, browsable by the
  100-category taxonomy at the *product/instance* level). A plugin here
  is an ingredient; a Blend is a composed dish. Cross-links exist in both
  directions but the content model never merges.
- **Is not**: the installer itself. `cordis-plugin-market` (the actual
  installed Host/Client package, `plugins/cordis-plugin-market/` in this
  repo) is the *in-instance* browse/install experience running inside a
  live ACRYL or stock DeepSeek Harness instance. `cordisplugins.github.io`
  is the *public, unauthenticated, web* front door onto the same
  underlying package data — same registry, two surfaces, matching the
  npm-vs-npmjs.com relationship exactly.
- **Is compatible with, not owned by, DeepSeek Harness.** Per the user's
  own framing (spec 036, "Cordis the protocol vs. ACRYL Blends the
  framework"): Cordis is the common ground both ACRYL and stock DeepSeek
  Harness build on, so this registry has to read as neutral community
  infrastructure, not an ACRYL-branded storefront. Any plugin tagged
  compatible with stock DSH must work there without ACRYL installed.

## References this is built from (same set as the acrylblends design doc)

- **`open-harness`'s `docs.json`** (local clone,
  `apps/docs/docs.json`) — the Mintlify nav-group template reused here for
  the Docs tab, same six-group shape (Getting Started / Core Concepts /
  Tools / Advanced / Integration / Resources), re-scoped to plugin authoring
  instead of Blend composition.
- **`orchestra-mcp.dev`** — its browsable-catalog-by-category pattern is
  the direct template for this site's own **Browse Plugins** page, the
  same way it templated `acrylblends`'s Browse Blends page — here scoped
  to Cordis capability categories (services, tools, UI slots, providers)
  rather than product-level categories.
- **`tanstack.com`** — the "Libraries by purpose" top-nav grouping and the
  ecosystem-of-many-packages presentation pattern, directly relevant here
  since `cordisplugins` fronts potentially hundreds of small independent
  packages, not one product.
- **npm's own `npmjs.com`** (not separately fetched this pass, but the
  explicit real-world analog spec 036 names) — package detail page shape
  (README render, version history, dependents, weekly downloads, publish
  provenance) is the baseline content model for this site's own **Plugin
  detail page**, adapted to add Cordis-specific facts npm has no concept
  of (service/tool/event surface, Fiber lifecycle notes, compatibility
  tier).

## Recommended platform

**Mintlify**, same recommendation and same reasoning as the
`acrylblends` design doc — proven by `open-harness`'s own docs site, one
deployable `.mdx` + `docs.json` site serving both docs and a data-driven
catalog. Not locked; confirm when this moves from design to build. If the
catalog outgrows a static generator (real-time download counts, live
search across hundreds of packages), the **Docs** tab stays Mintlify and
**Browse Plugins** can front a small dedicated registry API instead — the
sitemap below is written to work either way.

## Top-level navigation (tabs)

```
[Home]  [Browse Plugins]  [Docs]  [Publish]  [Ecosystem]  [Blog]
```

- **Home** — the pitch: what a Cordis plugin is, why a registry for it
  exists, how it differs from a Blend.
- **Browse Plugins** — the registry itself, npm-equivalent.
- **Docs** — how to build, test, and compose Cordis plugins (protocol
  depth lives here; ACRYL-Blends-specific tooling stays in `acrylblends`'s
  own Docs, cross-linked, not duplicated).
- **Publish** — the concrete, step-by-step path from local plugin to a
  listed registry entry, given its own top-level slot because "how do I
  get my plugin listed" is the single highest-intent journey on a
  registry site (mirrors why npmjs.com gives publishing its own doc
  cluster rather than burying it in general docs).
- **Ecosystem** — same map page concept as `acrylblends`'s own Ecosystem
  tab, scoped to this layer: `cordis-plugin-market` (the in-instance
  surface), DeepSeek Harness compatibility, `acrylblends` (what plugins
  compose into), governance/moderation of the public listing.
- **Blog** — new-plugin roundups, compatibility notes, registry policy
  changes.

Header CTAs (persistent): **Browse Plugins** (primary), **Publish a
Plugin**, **GitHub**.

## Section 1 — Home

1. **Hero** — tagline positioning the plugin as the atom, distinct from
   both Cordis-the-protocol and ACRYL-the-product. Working shape (not
   final copy): *"The registry for Cordis plugins — the smallest building
   block everything else, including a Blend, is made of."* Primary CTA:
   **Browse Plugins**. Secondary: **Publish yours**.
2. **"Where this sits"** — the same three-layer diagram as `acrylblends`'s
   Home (Atom → Blend → Blend registry), with *this* site's own layer
   highlighted, so a visitor arriving here first (not through
   `acrylblends`) still gets the whole picture in one glance.
3. **What makes something a Cordis plugin** — the real code sample from
   spec 036's own "What a Cordis plugin actually is" section (the minimal
   `hello.ts` + `cordis.yml`), so the homepage substantiates the pitch
   with real code immediately, not just prose.
4. **"Works with ACRYL and stock DeepSeek Harness"** compatibility
   callout — a visible badge/section explaining the compatibility-tier
   concept (a plugin can declare itself DSH-stock-compatible or
   ACRYL-specific), addressing directly the user's own requirement that
   this registry serve both communities without ACRYL branding crowding
   it out.
5. **Category preview grid** — a compact preview (not exhaustive) of
   Cordis-capability categories (Services, Tools, UI/Client contributions,
   Providers, Editors/Canvas surfaces, Brand/theming slots, Market/registry
   integrations, Community/interop adapters), linking into **Browse
   Plugins**. Distinct from `acrylblends`'s own 100-category product
   taxonomy — this one is about *what kind of Cordis extension point* the
   plugin fills, not what kind of software product it belongs to.
6. **Quick start, three steps** (matching the pattern used across the
   ecosystem's other sites) — **Scaffold** a plugin from template →
   **Develop** with hot-reload, in-instance, unpublished → **Publish** to
   list it here.
7. **Footer** — same directory-style footer as `acrylblends`: links to
   Docs, Browse Plugins, GitHub (`cordisplugins`, `acryldev/acryl`,
   `acrylblends`), the DeepSeek Harness project, and the ACRYL product
   itself, kept even-handed rather than ACRYL-first.

## Section 2 — Browse Plugins (the registry)

The core "npm, but browsable and Cordis-aware" experience.

- **Category index page** — the Cordis-capability categories from Home's
  preview grid, rendered as a browsable grid (same interaction pattern as
  `orchestra-mcp.dev`'s Packs catalog and `acrylblends`'s own Browse
  Blends index).
- **Category page** — plugins tagged to that capability category, each
  card showing name, one-line summary, compatibility tier (ACRYL / DSH
  stock / both), latest version, publisher.
- **Plugin detail page** (one per published plugin, npm-package-page
  shaped, Cordis-extended) —
  - README render (source of truth, not re-authored content)
  - Version history and changelog
  - **Cordis surface summary**: what it provides (services/tools/events)
    and what it consumes (`inject` requirements vs. optional `ctx.get()`
    dependencies) — the one piece of content with no npm equivalent,
    directly derived from spec 036's own "Provides and consumes" mini-design
    discipline (this repo's own `CLAUDE.md` Cordis protocol section),
    surfaced here so a visitor can judge compatibility before installing.
  - Compatibility tier badge (ACRYL-only / DSH-stock-compatible / both),
    and if DSH-stock-compatible, which Harness version range.
  - Install command (`pnpm add <package>` plus the in-instance
    `cordis-plugin-market` equivalent for users already running an
    instance).
  - Dependents (other plugins/Blends that declare this as a dependency) —
    npm's own "used by" pattern, doubling as a trust signal.
  - Publisher and provenance (which registry account published it, when,
    from what source repo).
  - **"Used in these Blends"** cross-link — pulls from `acrylblends`'s
    own registry data, the concrete two-way link between the atom and
    blend layers spec 036 describes.
- **Search and filter** — by category, compatibility tier, publisher,
  free-text, matching `acrylblends`'s own search/filter approach for
  consistency across the two sibling sites.
- **"acryl-package" discoverability convention** — a visible filter/badge
  surfacing plugins that opted into the "Acryl-package" suffix/tag
  convention from the user's own earlier framing ("users can publish
  freely with a special indication suffix... to be automatically listed
  in the real community market"), so ACRYL-specific plugins are
  discoverable without requiring every plugin on the site to be
  ACRYL-flavored.
- **"Publish a plugin" CTA**, persistent — links into Publish tab.

## Section 3 — Docs

Modeled on `open-harness`'s six-group `docs.json` shape, re-scoped to the
plugin-authoring layer (deliberately narrower than `acrylblends`'s own
Docs, which owns Blend composition):

```
Getting Started
  - What is a Cordis plugin (cross-links Cordis Primer on acrylblends)
  - Install the CLI / scaffolding tool
  - Your first plugin (walks the real tutorial's minimal example)

Core Concepts
  - Fiber lifecycle (PENDING/LOADING/ACTIVE/FAILED/UNLOADING/DISPOSED)
  - Services and inject
  - Effects and disposal
  - Events and composition/HMR
  - Function plugins vs. Service classes, and when to use each

Building a Plugin
  - Generate from template (the scaffolding skill spec 036 describes)
  - The six-part Cordis mini-design discipline (capability boundary,
    provides/consumes, effects/disposal, configuration/composition,
    events/durability, verification) - same discipline this repo's own
    CLAUDE.md requires internally, documented here for external authors
  - Loader row id naming (id equals package name by default; the shared-
    slot exception, named explicitly when used)
  - Testing a plugin in isolation

Compatibility
  - Cordis-only vs. ACRYL-flavored vs. DSH-stock-compatible
  - Declaring a compatibility tier
  - The "Acryl-package" suffix/tag convention
  - What breaks if you assume ACRYL-only services from a "compatible
    with stock DSH" plugin

In-Instance Authoring (before publishing)
  - Hot-reload development without publishing first
  - When a plugin is ready to graduate to this registry
  - Local-only vs. published: the same distinction, documented from the
    plugin-author's side (acrylblends's own Docs documents it from the
    Blend-builder's side)

Composition
  - How a plugin becomes part of a Blend (cross-links acrylblends Docs)
  - Nesting/grouping (flagged exploratory, matching spec 036's own
    explicitly-unresolved framing - no settled content yet)

Private and Enterprise
  - Private plugin registries for teams
  - Enterprise-only plugins (what "not published openly" means here,
    mirrored from acrylblends's own Business Model framing)

Resources
  - CLI reference
  - Examples
  - FAQ
  - Troubleshooting
```

## Section 4 — Publish

A focused, linear flow, not a doc cluster buried in general docs (this is
the single highest-intent journey on a registry site):

```
Publish
  - Checklist before you publish (README, license, compatibility tier
    declared, version, category tag)
  - Publish command and what happens (pnpm publish workflow, same
    workspace:* rewriting concern this repo's own release history hit
    for real - the guidance here should tell external authors to use
    pnpm publish, not npm publish, explicitly, since that exact mistake
    broke a standalone install of this repo's own cordis-plugin-market
    package)
  - How listing works (does it appear immediately, is there a review
    step - policy TBD, flagged as an open decision, not asserted as
    settled)
  - The "Acryl-package" suffix convention, if you want auto-listing in
    ACRYL's own in-instance market
  - Updating a published plugin
  - Deprecating or unpublishing
```

## Section 5 — Ecosystem

```
Ecosystem
  - The three layers (same diagram as Home and as acrylblends's own
    Ecosystem page - kept byte-for-byte consistent between the two
    sites' explanations so visitors don't get conflicting mental models
    depending on which site they land on first)
  - cordis-plugin-market - the in-instance browse/install surface this
    registry's data powers (this repo's own plugins/cordis-plugin-market/)
  - acrylblends - what plugins listed here compose into
  - DeepSeek Harness compatibility - concretely, what "works with stock
    DSH too" means, and current real limits
  - Governance - who moderates listings, what gets a plugin delisted,
    namespace-squatting policy (a real, already-encountered problem in
    this exact ecosystem - the dsh-community-market name collision with
    an unrelated squatted npm stub - so this page should say plainly how
    that class of problem is handled here, once decided)
  - Business model - same open-core framing as acrylblends's own page:
    registry itself free and public, consulting/private-registry/
    enterprise-plugin options for teams, not duplicated in full here,
    cross-linked instead
  - Roadmap / what's not built yet - honest gap list (review/moderation
    workflow, download-count telemetry, dependents graph, all not yet
    real), matching spec 036's own gap-table honesty
```

## Full sitemap (URL tree)

```
/                                   Home
/plugins                            Browse Plugins (category index)
/plugins/{category}                 Category page
/plugins/p/{plugin-slug}            Plugin detail page
/docs                               Docs index
/docs/getting-started/...
/docs/core-concepts/...
/docs/building-a-plugin/...
/docs/compatibility/...
/docs/in-instance-authoring/...
/docs/composition/...
/docs/composition/nesting            (stub, explicitly exploratory)
/docs/private-and-enterprise/...
/docs/resources/...
/publish
/publish/checklist
/publish/how-listing-works
/publish/acryl-package-convention
/publish/updating
/publish/unpublishing
/ecosystem
/ecosystem/{page}
/blog
/blog/{post-slug}
```

## Content relationship to `acrylblends.github.io`

The two sites are siblings at different layers, not competitors for the
same content. Rule of thumb applied throughout this doc: **anything about
a single plugin's own code, lifecycle, or publishing lives here; anything
about composing many plugins into a running instance lives on
`acrylblends`.** Where both sites need the same concept explained (the
three-layer diagram, the compatibility-tier idea, the business model),
each site gets its own page but the *content* is kept consistent between
them rather than one linking out to the other for the core explanation —
a visitor should never have to leave the site they landed on to understand
the layer they're looking at.

## What this design deliberately does not decide

- No visual design system — deferred exactly as the `acrylblends` design
  doc defers it, likely a shared design language across both sites once
  one is chosen.
- No decision on registry backend (static generation from package
  metadata vs. a real API/database) — the sitemap works either way, same
  posture as `acrylblends`.
- No moderation/review policy for publishing — flagged as an open
  decision in the Ecosystem → Governance section above, not asserted.
- No final copy — every bracketed/working-shape phrase above is
  illustrative.

## Related

- `specs/036-cordis-ecosystem-and-acryl-blends/spec.md` — the concept
  this site operationalizes at the plugin/atom layer.
- `design/acrylblends.github.io_design_and_webportal_content_strucutre.md`
  — the sibling design doc for the Blend/registry layer this site feeds
  into.
- `plugins/cordis-plugin-market/` — the real, implemented in-instance
  surface this public site's data mirrors.
- `_reference_projects/open-harness/apps/docs/docs.json` — the nav-config
  template this doc's Docs section is adapted from.
