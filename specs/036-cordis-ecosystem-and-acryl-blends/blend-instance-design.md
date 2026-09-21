# Blend instance: persistence, packaging, distribution and orchestration

Status: design, with the capture half built and tested (see "Built now"). Follows `spec.md` (the ecosystem map) and builds on spec 033 (runtime
contract) and the `blends` repo (format, `blends-core`). It answers four questions: how a Blend instance is created and persisted from the current state
of all plugins and local extensions; how it is packaged and distributed; how it orchestrates at runtime; and how ACRYL Blends becomes a framework.

## The principle (from pi.dev, and already true in ACRYL)

The source is the truth; the running composition is derived and rebuildable. A Blend is therefore not a database row or a snapshot of process
memory: it is a small set of plain files that describe a composition, plus the source of the parts that exist nowhere else.

```text
        intent  (human)         blend.yaml          rows by id and package name, overrides, lineage   -> what the app IS
        state   (machine)       blend.lock.json     exact versions and digests of every part          -> what makes it reproducible
        source  (only local)    extensions/<name>/  the code of everything built here                 -> what exists nowhere else
        data    (never in it)   plugin-data/, .acryl/  what plugins remember                         -> not part of the recipe
```

## 1. Where every part comes from: provenance (built)

Each installed plugin has an origin, derived from what the profile already records (nothing extra is stored, so it cannot drift):

| Origin | Recorded as | Reproduced from | Editable |
| --- | --- | --- | --- |
| `registry` (marketplace / npm) | a version spec plus the lockfile `integrity` | name and version, verified by digest | no, managed by the market |
| `local` (built here) | a `file:` staged install, its source folder, scope (project, global) and content hash | the vendored source, verified by sha256 | yes, in its source folder |
| `git`, `linked` | the URL / the checkout | the spec staying reachable | reported only |

`acryl_list_plugins` and the installed-extensions prompt note expose it, so an agent never looks for a source folder to edit on a marketplace plugin.

## 2. Creating and persisting an instance (built: capture and verify)

`/blend snapshot` reads the live profile and writes `<workspace>/.acryl/blend/`:

- `blend.yaml`: a manifest that validates against `blends-core`'s v1alpha1 schema and compiles (round-trip checked) to the same Cordis patch the Loader consumes. It is a
  `Blend` when given a `lineage` (the Blueprint it grew from) and a `Blueprint` otherwise, because `blends-core` requires a Blend to name its origin. Rows come from each
  installed package's own bundle patch; the profile's patch layer becomes `overrides`.
- `blend.lock.json`, `formatVersion: 2` (proposed additive step over blends-core's v1, which records only origin and rows): adds `modules[]`, one per installed package.
  Registry: version and integrity. Local: version, `sha256:` of the source tree, and the vendored path. Deterministic: sorted, no timestamps.
- `extensions/<name>/`: the source of every local extension, copied so the Blend is self-contained. A global extension is vendored in; a project extension is copied.
- `/blend verify` checks offline that the manifest still matches the lock and every vendored source still matches its digest.

Not captured, deliberately: the ACRYL runtime's own plugins (engine-owned, versioned with ACRYL), plugin data, and secrets. Anything that cannot be reproduced (a source folder that
is gone, a registry package with no digest) is listed under "Not captured" so the gap is visible, never silent.

Persistence is git: `.acryl/blend/` sits in the project. History, diff, review, rollback and branching come free (pi.dev's second persistence layer); no extension registry is added.

## 3. Packaging and distribution (design; capture is the input)

A captured Blend is a directory, so it is already a distributable unit. Three publishing shapes, in increasing effort:

1. **Source Blend (works today)**: commit `.acryl/blend/` to a git repository. Anyone can clone it; local modules travel as vendored source and are verified by digest.
2. **Hub Blueprint**: publish the definition to the `acryl.dev/blends` git-hub (a definition directory plus generated `index.json`, blends roadmap D6). Hub ingest already rejects
   `!!js` (D4). Local modules must be either vendored (source distribution) or promoted first to real packages through the marketplace path (`acryl_prepare_publish`, then the
   human publishes). A Blueprint whose modules are all registry entries is the lightest form: only `blend.yaml` and the lock.
3. **Private registries**: the same two, pointed at a self-hosted hub and npm registry (business-model note in `spec.md`); nothing here hardcodes a single public source.

Trust at the edge: the union of the modules' declared `acryl.permissions` is shown before an instance is created (the permission diff of the Blends spec section 18). Declarative, not sandboxed.

## 4. Orchestration at runtime (design)

Instantiate (`acryl init --blend <id>` or applying a captured directory):

```text
blend.lock.json  ->  for each module:
                       registry -> dsh plugin add name@version, check the lockfile integrity against the digest
                       local    -> place the vendored source in the project extension scope (.acryl-extensions/) and install it through the same pipeline
blend.yaml       ->  blends-core compile -> Cordis patch (the static composition desktop-blend.ts already consumes)
```

The project extension scope is the natural home of a Blend's local modules: once they are there, everything already built applies unchanged: `/reload` reconciles by content hash,
the startup pass re-syncs changes, provenance labels them, and `acryl_install_plugin` updates them. The Blend needs no second loader.

Evolve (the Differentiation Engine, spec 033, not built): an agent adds a capability with `acryl_install_plugin`; that is an Evolution Step. Recording it means appending to the
ledger and refreshing the capture, which is a small step now that capture exists. Checkpoint and rollback are git operations on `.acryl/blend/` plus a re-apply, not a new store.

## 5. ACRYL Blends as a framework

Five layers, each with an owner:

| Layer | What | Owner |
| --- | --- | --- |
| Format | manifest, lock, compile, validation | `blends` repo (`blends-core`); lock v2 (`modules`) is the proposed addition |
| Capture and apply | read the live composition, write and verify a Blend, re-apply it | this repo (primitives, per spec 033); capture and verify built |
| Authoring | build a module and deliver it live, with docs, examples, skills and a verifier | the extension pack (spec 037), built |
| Distribution | hub (Blueprints), marketplace (packages), private variants | `blends` hub and `cordis-plugin-market` |
| Building blocks | shared UI and TUI components so a Blueprint's screens are assembled, not hand-styled | spec 038 |

The blank-canvas Blend is the smallest Blueprint that boots: an agent, a model chooser, an input, and the pack. Everything else is added by modules, local first, promoted to the
marketplace when worth sharing (the graduation path of `spec.md`, now with provenance to tell the two apart).

## Built now, and not

Built and tested: provenance (`listInstalledPlugins`), capture with lock v2 (`captureBlend`), vendoring, `/blend snapshot` and `/blend verify` on a booted app,
and a check that the manifest validates against and compiles with `blends-core`. Not built: applying a Blend (`/blend apply`: install every module from the lock and compile the
rows), the ledger and Evolution Steps, lock v2 accepted by `blends-core` itself, the hub publish path, the permission diff UI, data adapters. Each is a follow-on ticket under 033.

## Open questions

- Should `blends-core` adopt `formatVersion: 2` with `modules`, or keep the lock minimal and put modules in a second file? Additive is simpler; it is the `blends` repo's decision.
- Where do a Blend's rows override the profile's patch layer versus replace it when applying onto a non-empty profile (merge policy)?
- Does applying a Blend on Desktop, Web and CLI produce the same rows? Web and Desktop share the composition; the CLI has its own bundle set (spec 034).
- Naming of grouping above the single plugin stays open (`spec.md`); a Blend is the first real grouping and may answer it.
