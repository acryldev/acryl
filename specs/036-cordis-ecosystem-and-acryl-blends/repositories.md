# Where each part of ACRYL Blends lives: acryl, blends, acrylblends.github.io

Status: **Proposed**, awaiting the owner's decision. Nothing has moved yet.

## The question

Three repositories hold parts of the framework today, and it is not settled which part belongs where:

| Repository | Holds today |
| --- | --- |
| `acryldev/acryl` (this monorepo) | the runtime and surfaces, `acryl new`, the app instances, the builder (extension pack), `/blend snapshot|verify|apply|ledger`, a reader of `blend.yaml` |
| `acryldev/blends` | `blends-core` (the manifest format: schema, parse, validate, resolve, compile, lock v1/v2), `blends-cli` (a local hub index, ingest, `blends init`), the recipes `acryl.blank` and `acryl.organizer` |
| `acrylblends/acrylblends.github.io` | the framework's website (Vite), not yet a catalog |

The original idea for `blends`: an auxiliary "Docker Hub manager" that instantiates Blends from a registry, manages their persistence, pushes to and pulls
from the registry, and reads Blueprints and catalogs.

## What the split has cost so far

- **Three on-disk shapes of one thing**: an owned Blend (`blends init`: `acryl.blend.yaml` plus `.acryl/blend.lock.json`), a captured Blend (`/blend snapshot`:
  `.acryl/blend/`), an app folder (`acryl new`: `blend.yaml`). Each was built on the side of the split where it was needed.
- **Format changes that have to cross repositories**: lock v2 was proposed in one repository for a change the other needed, and applied later.
- **Two readers of one format**: the runtime reads `blend.yaml` with its own small reader because it cannot depend on a sibling repository.
- The self-containment incident (`docs/acryl/APP-INSTANCES-AND-BULKHEADS.md`) had the same root shape: one concept, several sources of truth.

## How Docker is organized (the analogy the framework already uses)

| Docker | Role | ACRYL Blends equivalent |
| --- | --- | --- |
| Docker Engine and the `docker` CLI (one product): `run`, `ps`, `stop`, `rm`, `commit`, `build`, `push`, `pull` | runs containers and moves images | **ACRYL**: `acryl new`, `bin/acryl`, `ps`/`stop`/`rm`, `/blend snapshot` (commit), `/blend apply`, and `push`/`pull` against a registry |
| OCI image and distribution specs, with reference libraries | the format everyone implements | **the Blend format** (`blends-core`) |
| Docker Hub | a registry service and a browsable catalog | **acrylblends.github.io**: the registry of Blueprints and Blends by category |

Docker keeps "running and moving images" in one product, the format as a separate small specification, and the registry as a service. It does not ship a
separate "manager" beside the engine: `push`, `pull` and `commit` are engine commands.

## Recommendation

1. **Everything an app does over its life is ACRYL** (the engine). Create, run, list, stop, remove, snapshot, apply, push, pull are `acryl` commands and plugins,
   because the builder inside the app must be able to use them too (snapshot and restore from the inside is the framework's promise). The interim scripts
   become those commands.
2. **The format moves into the monorepo as its own package** (`runtime/blends-core`, published to npm as `@acryl/blends-core`), with the specification as that
   package's docs. It stays a small library with no runtime dependencies, so other runtimes and the registry can use it, but it versions and tests with the
   engine that depends on it, and there is one reader of `blend.yaml`. Then the three shapes become one (an app folder is the Blend; `/blend snapshot` writes
   into it; `acryl pull` creates one).
3. **acrylblends.github.io becomes the registry and catalog**: a content repository of Blueprints and Blends by category (`blends/<category>/<id>/blend.yaml`,
   plus README and screenshots), a CI job that validates every entry with `@acryl/blends-core` and generates `index.json`, and the website that renders the
   catalog from it. Publishing is a pull request, reviewed by a human, which matches "publishing is the user's decision". `acryl pull <id>` reads
   `index.json`; `acryl push` opens that pull request. A private registry is the same repository shape on a company's own git host.
4. **`acryldev/blends` is archived** once its code has moved, with a README pointing at the two new homes. Its history stays readable.

Why not keep `blends` as the manager: it would be a second tool beside `acryl` for things the app itself must do, and every change to the lifecycle would cross
a repository boundary, which is what produced the three shapes. Why not put the registry in the monorepo: its content is contributed by many people on a
different rhythm and must be hostable privately; that is what a separate repository is for.

## Migration, if accepted (each step leaves everything working)

1. Copy `blends-core` into `runtime/blends-core` with its tests; point the runtime's `blend.yaml` reader at it; publish.
2. Make an app folder the one Blend shape: `/blend snapshot` writes the lock and vendored modules into the app folder; `acryl new --from <file|id>`.
3. Move `acryl.blank`, `acryl.organizer` and `blends_registry_marketplace/` content into acrylblends.github.io with the validating CI and `index.json`.
4. Add `acryl pull <id>` and `acryl push`; move the interim `scripts/` lifecycle into `acryl` commands.
5. Archive `acryldev/blends`.
