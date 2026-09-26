# The blank-canvas Blend: the stem cell of the framework

Status: built for Web and CLI, verified headless and with a real model (see "Verification"). Desktop consumption is a follow-on (see "Not built").
Follows `spec.md` (open question 3: the blank-canvas Blend's literal minimal plugin set) and `blend-instance-design.md` (capture, apply, ledger).

## What it is

`acryl.blank` is the smallest ACRYL that is still a working agent, and everything else is grown from it by adding Cordis plugins, local first,
published when worth sharing. `acryl.full` is today's product: the most differentiated Blend the team ships, and still the default.

Select one with `ACRYL_BLUEPRINT=acryl.blank` (a built-in id; unset means `acryl.full`). Rebrand any Blueprint without editing a file with
`ACRYL_BRAND_NAME`, `ACRYL_BRAND_TAGLINE`, `ACRYL_BRAND_ACCENT`, `ACRYL_BRAND_ACCENT_DARK`, `ACRYL_BRAND_FONT`, `ACRYL_BRAND_MARK`.

## The minimal set, and why each row is in

| Kept in `acryl.blank` | Why it is the floor |
| --- | --- |
| the harness base profile | the agent loop, the chat, the input, the model providers: the part that cannot be a "later addition" |
| `authorization` capability | the model chooser and sign-in; without it the LLM adapter has nowhere to register its providers |
| `persona`, `agent-roster`, `session-stats` (CLI) | the terminal surface needs them to open an agent; Web and Desktop bundles already compose their own |
| `extension-context` | the growth path: docs, verified examples, and the install tool that makes a plugin the agent wrote live (spec 037) |
| `acryl-system-prompt` | pi.dev-shaped prompt; carries the brand's identity line, so the agent says it is the product the user named |
| `@acryl/ui` (Web) / `acryl-ui-tui` (CLI) | the shared building blocks, so what the agent grows looks like one product; a library, no slot |
| `brand` (`acryl-brand`, Web) | the identity is configuration, not code: see "Branding" |

| Left out, each one added later as an ordinary plugin | Why it is not the floor |
| --- | --- |
| `acryl-workspace`, the advanced shell | a coding product's Projects, tabs, files and terminal: the flagship, not the seed |
| `acryl-plugin-admin` | management UI for a plugin set the user has not grown yet |
| `community-market` | discovery of published plugins; the blank path is local-first |
| `acryl-shortcuts`, `acryl-mount-anchors` | conveniences and a developer inspector |
| Development Canvas | a developer surface of the full product |

Nothing is deleted from the product: `acryl.full` composes all of them exactly as before, and a user can enable any row in a blank instance with
the same reversible row edit (`acryl plugin enable`, the Lifecycle panel, or a line in a Blend file).

## Branding: your product, not ours

`acryl-brand` is a Cordis plugin whose whole configuration is the row's `config`: name, tagline, mark, accent, dark-mode accent and font. Its host half
publishes the identity and rewrites the page title and favicon; its browser half fills the sidebar name and mark, the conversation hero mark, the accent
color and font (through the theme service), and keeps the name on the tab or window title. The Blueprint's system-prompt row gets the same name in
its identity line. So a team ships a private, closed-source product or an internal tool under its own name by editing one YAML row, with no fork of ACRYL.
Disabling the row restores the stock look; nothing else is touched.

Known gap (upstream): the pinned harness shows an "Internal Testing Notice" modal and stock DeepSeek text on first launch; a white-label product will want
that suppressible. It belongs to the harness (a pinned submodule we do not edit), so the answer is a client plugin, tracked below.

## Architecture (Clean Architecture and DDD, in this repo's terms)

Bounded context: **Blueprint composition**, in `runtime/acryl-harness-runtime/src/blueprint/`. Ubiquitous language: Blueprint, Blend, Row, Capability, Brand
identity, Surface. Dependencies point inward:

```text
selection.ts   (boundary: reads ACRYL_BLUEPRINT and ACRYL_BRAND_*; the only process.env access here)
      |
blueprint.ts   (domain: Blueprint value object, the two built-ins, BlueprintCatalog port, selectBlueprint use case)
brand-identity.ts (domain: BrandIdentity value object, invariants enforced at construction)
compose.ts     (domain: Blueprint x Surface -> ACRYL rows and packages; pure, no I/O)
      |
engine-dsh.ts  (composition root: materializes packages, mounts the patches; the only place with Loader mechanics)
```

Every row a Blueprint names is an ordinary Cordis plugin with its own lifecycle, so everything is reversible: a Blueprint is data over rows, a Blend
file is data over rows, and the user's own lifecycle overrides still apply last. The `BlueprintCatalog` port is how a hub, a Blend lock or a private registry
becomes a source of Blueprints later without touching the domain.

`acryl-brand` validates its own config at its own boundary instead of importing the runtime's copy: plugins depend on services, never on each other.

## Verification

- `tests/blueprint.spec.ts`: pure rules (brand invariants, selection, exact rows per surface in mount order, no double composition, fresh objects).
- `tests/blank-blueprint.spec.ts`: real engines. Blank on Web has the stem-cell rows and none of the product's, the stock brand is disabled (not deleted), the brand
  identity and the prompt identity carry the configured name, no row FAILED; a profile with no selection still composes the full product; Blank on CLI keeps the agent essentials.
- `tests/organizer-growth.spec.ts`: the first use case. From Blank, a to-do, calendar and meeting-booking plugin (`examples/acryl-organizer`) is installed live, used
  through the real tool runtime (overlap refused, agenda, free slots, persistence in the project), captured with `/blend snapshot`, and re-created on a fresh app
  from the capture alone with `/blend apply`.
- A real browser run of Blank on Web shows the configured brand in the sidebar and the tab title.
- Real model run: see the log in `docs/DEVELOPMENT-LOG.md` (2026-09-26 entry).

## Not built (follow-ons)

- **Desktop** consumes a Blueprint through its own profile pipeline (`apps/acryl-desktop/src/profile.ts`, which also reads a Blend lock at `dsh-desktop.blend`).
  It needs the same `composeBlueprintRows` call and lock v2. Its Electron chrome (window title, dock icon, tray, menu) is owned by the main process and needs its
  own brand seam. Until then Desktop always runs `acryl.full`.
- Blueprints from a YAML file or a hub (`blends.acryl.dev` manifests) instead of the two built-ins: the `BlueprintCatalog` port is the seam.
- A suppressible first-launch notice for white-label products (client plugin).
- Terminal branding beyond the prompt identity (the CLI's compiled palette and banner).
- More starters than `blank` (the 100-category taxonomy); each should be a Blueprint plus the plugins it names, grown from `blank` the way the organizer is.
