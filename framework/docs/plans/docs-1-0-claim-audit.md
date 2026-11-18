# 1.0 docs claim audit (2026-10-28)

Scope, from the coordinator: `acrylblends.github.io/blends` and `acryl.dev/blends` plus their docs must match what the framework really has at 1.0 (spec 049, `docs/plans/framework-1-0-readiness.md`). Every page claim is checked against the code or the release notes; each is fixed or confirmed; no claim about what 1.0 removes (the cut adapters, `App`/`AppRequest`); experimental features labelled; internal links checked.

Method: read each page against the tree it describes. Two checks were automated rather than eyeballed, because they are exhaustive by nature:

- **Subpaths.** Every `acrylblends/<subpath>` an example imports, in all 94 framework pages, compared with `packages/framework/api-surface.mjs` (`PUBLIC` and `EXPERIMENTAL`). Result: 70 subpaths used, **0 not public**.
- **Links.** Every relative `.md` link in the framework docs resolves to a file. Result: **156 links, 0 broken**.

Where a claim rests on a count or a flag, the source is named below.

## A. acrylblends.github.io - the registry page

| # | Claim on the page | Checked against | Verdict |
| --- | --- | --- | --- |
| A1 | Seven Blends are in the registry (ACRYL, Blank Canvas, Agent Workbench, Local-first Studio, Secure Ops, Data Pipeline, Release Pilot), each with a version, a publisher and a plugin list | `registry/index.json` has **6** entries, none of the seven; the plugin names were invented. The page did mark them "Preview · not published" and their detail pages said "This is an illustrative composition" | **fixed**: removed with their data, routes and search entries (patch 0001) |
| A2 | "100 categories · 7 illustrative previews, not published" | same | **fixed**: "6 starters in the registry · 100 categories" |
| A3 | The 100-category taxonomy is the registry's organization | `src/lib/content.ts` taxonomy: 100 entries; the registry's own `category` field is a different, shorter word (starter, finance, ...) | **confirmed as an organizing idea, fixed as a mapping**: `src/lib/registry-placement.ts` places each real starter in the taxonomy, so category pages list real entries instead of always "No Blends here yet" |
| A4 | "Start here: in the registry now" lists real, creatable starters with the exact command | `registry/index.json` (6 entries) and `acryl new my-app --from <id>` (spec 049 slice 8) | **confirmed** |
| A5 | A Blend's page shows its `blend.yaml`, id, version, kind, license | `registry/blends/<id>/blend.yaml` files exist and are fetched at runtime | **confirmed** |
| A6 | Publishing is a pull request to the registry with `blends/<id>/` | `registry/README.md` and `.github/workflows/registry.yml` | **confirmed** |

## B. acrylblends.github.io and acryl.dev - the framework docs (generated)

| # | Claim | Checked against | Verdict |
| --- | --- | --- | --- |
| B1 | The docs are at 0.11.0 | `docs/framework` at origin/main 06e3e861 (1.0.0-rc.1) | **fixed by sync**: `scripts/sync-sites.mjs` replaces the tree; Blends runs it after 1.0.0 is published |
| B2 | Getting-started pages for AWS Lambda, Lambda@Edge, Cloudflare Workers/Pages, Vercel, Netlify and Service Workers | 1.0 does not build or export those adapters (release notes "Removed", `subpaths.mjs`) | **fixed by sync** (the pages disappear with the wholesale replace) |
| B3 | `cordis/migration-to-1-0` and `guides/production` exist | present in `docs/framework` at 06e3e861 | **fixed by sync** |
| B4 | Release notes 1.0.0 | `docs/release-notes/1.0.0.md` | **fixed by sync** (entry and list item) |
| B5 | README: "The starter asks which one you want (`nodejs`, `notes`, `chat`, or `acryl-app`, with an agent)" | `packages/create/src/index.ts`: `TEMPLATES = ['blank','nodejs','notes','chat','todo','agent']`, `acryl-app` only an alias | **fixed in acrylblends 122b8cf8** (names the six) |
| B6 | agents/index.md: "The `acryl-app` template ..." | same | **fixed in acrylblends 122b8cf8** |
| B7 | basic.md: "The same application code works on every verified runtime"; "Starter templates are available for each runtime" | `guides/faq.md` ("Node.js. Bun is experimental"), `getting-started/other-runtimes.md`, CI matrix (Node 22 and 24 on ubuntu/macos/windows) | **fixed in acrylblends 122b8cf8** |
| B8 | basic.md: "Write your first application in `src/index.ts`" | the templates have `src/main.ts` (composition root), `src/app.ts`, `src/routes.ts`; no `src/index.ts` | **fixed in acrylblends 122b8cf8** |
| B9 | basic.md: "[JSX] is not yet available" | `acrylblends/jsx` is PUBLIC; `templates/nodejs/src/page.tsx` is JSX | **fixed in acrylblends 122b8cf8** |
| B10 | concepts/web-standard.md: "Acryl runs on these runtimes: Cloudflare Workers, Deno, Bun, Fastly Compute, AWS Lambda, Node.js, Vercel, WebAssembly, Netlify and other platforms" | 1.0: Node verified, Bun experimental, everything else out | **fixed in acrylblends 122b8cf8** |
| B11 | api/acryl.md: title "App - Acryl" and an example comment "for Cloudflare Workers or Bun" | `App` removed in 1.0; the adapter is out | **fixed in acrylblends 122b8cf8** |
| B12 | "Verified on Node 22 and 24, on Linux, macOS and Windows" | `.github/workflows/ci.yml` matrix | **confirmed** |
| B13 | Experimental features are labelled (door, agent panel, driver-pty, live plugin install, Bun) | `guides/production.md` table, `getting-started/bun.md` header, release-notes "Experimental" | **confirmed** |
| B14 | 1.0.0 release notes name `driver-acp` as a driver plugin | `plugins/` at origin/main has only `driver-pty`; `driver-acp` lives on branch 075-driver-acp (8967ee78, in Blends' review) | **kept, by decision**: `driver-acp` merges before rc.1 (M8). If it does not make rc.1, Blends removes it from the 1.0.0 notes |
| B15 | Middleware, helper and API pages carry notes about Cloudflare Workers, Deno, Fastly, AWS Lambda, Vercel and Netlify | 1.0 ships no adapter for any of them | **fixed**: the notes are removed or rewritten for the host the app runs on; where a runtime statement is needed the page says Node.js is verified and Bun experimental |

## C. acrylblends.github.io - the hand-written Blends guide (`/docs/blends`)

`sync-sites` does not touch these pages, so they had drifted furthest.

| # | Claim | Checked against | Verdict |
| --- | --- | --- | --- |
| C1 | "The acrylblends command has three verbs: init, add and plugins" | `packages/cli/src/cli.ts` HELP: init, add, upgrade, plugins, build-client, kv import, check-deps | **fixed** (patch 0002) |
| C2 | `init --template blank\|todo\|agent` | `packages/create/src/index.ts` and `cli.ts`: six templates, plus `--desktop` | **fixed** |
| C3 | `add` copies into `src/plugins/`, a folder path into `extensions/` | 1.0: one `plugins/` folder (`plugins/library.lock.json`, agents/index.md) | **fixed** |
| C4 | "Three templates ship with the CLI" | six (`TEMPLATES`) | **fixed** |
| C5 | The plugin library list, with `settings` repeated twice in one sentence | `acrylblends plugins` list; the duplication was a copy-paste error | **fixed** |
| C6 | "The lock file is being unified with ACRYL's blend.lock.json. Until that lands, the framework writes acrylblends.lock.json" | `plugins/manifest/lock.ts`: `LOCK_FILE = 'blend.lock.json'`, formatVersion 3 "the lock ACRYL writes too" | **fixed** |
| C7 | `npm run lock writes acrylblends.lock.json` | same | **fixed** |
| C8 | A starter publishes "the plugins it adds under `extensions/`" | `registry/README.md`: `plugins/` | **fixed** |
| C9 | "An extension is a folder in the app's `extensions/`" | 1.0: `plugins/` only (`agents/index.md`, `library.ts` warning for the old layout) | **fixed** |
| C10 | Framework page example: `import { App } from 'acryl-router'`, `new App()` | `App` removed in 1.0; the published entry is `acrylblends` / `acrylblends/cordis/router` | **fixed** |
| C11 | `docs/framework` "is being unified ... copied by hand" style notes | docs use published names since 0.11 (readiness step c) | **confirmed** |
| C12 | "acryl.dev/blends and acryl.dev/packages mirror both [registries]" | `acryldev.github.io` `App.tsx` has `/blends` and `/packages`; `BlendsPage.tsx` reads the registry index live | **confirmed** |

## D. acryl.dev

| # | Claim | Checked against | Verdict |
| --- | --- | --- | --- |
| D1 | `/blends` exists and shows the registry | `src/pages/BlendsPage.tsx` reads `registry/index.json` live and says "Source of truth: acrylblends.github.io" | **confirmed** |
| D2 | `/blends` "Save your app with `acryl save`, then open a pull request to the registry repository" | `apps/acryl-cli/src/cli/grammar.ts` has a `save` verb; the registry flow is the PR in `registry/README.md` | **confirmed** |
| D3 | `/docs` is the framework docs | `FrameworkDocsPage` renders the synced copy; it is at 0.11.0 | **fixed by sync** (same run as B1) |
| D4 | `/docs/platform` ("ACRYL is an agent-agnostic desktop and lifecycle environment built as a clean plugin layer over DeepSeek Harness", "Install a standard DSH package", the DSH compatibility contract) | still true of the desktop product today, but it is the pre-framework framing and not part of the framework docs | **open, owner's call**; untouched |

## E. Decisions taken (coordinator, 2026-10-28)

| # | Item | Decision | Where |
| --- | --- | --- | --- |
| E1 | `driver-acp` in the 1.0.0 notes (B14) | Keep. It merges before rc.1 as M8; if it does not make rc.1, Blends removes it from the notes. | recorded in B14; no page change |
| E2 | The home page's "Checkpoint & rollback - Differentiate safely with traceable states and reversibility" card | Keep only what can be shown today: each claim names the page or command that proves it, and anything without one is gone. | rewritten, patch 0003 (site) |
| E3 | `/docs/platform`'s DSH framing (D4) | DSH is one chat driver (the `dsh` preset of the ACP driver), not the platform; the platform is Acryl plus Cordis plugins. | rewritten, patch 0001 (acryl.dev) |
| E4 | Middleware notes about removed platforms | Remove them; where a runtime statement is needed, say Node is verified and Bun is experimental. | fixed in the framework docs (B15) |
| E5 | The five releases the site never had (0.5.1, 0.6.0, 0.6.2, 0.6.3, 0.6.4) | No pages for them; link to the GitHub releases list instead. | added to the oldest release-notes page, patch 0003 (site) |

Nothing from the audit is left undecided.

## What changed where

- **acrylblends** `docs-1-0`: commit 122b8cf8 fixes five framework pages (B5-B11); a later commit removes the platform notes about the runtime adapters 1.0 does not ship and splits `helpers/adapter.md` into the two runtimes that exist (B15). 16 pages changed: `middleware/builtin/{basic-auth,cache,compress,context-storage,cors,jsx-renderer,logger,mount,request-id,timing}.md`, `helpers/{adapter,streaming}.md`, `api/{acryl,context,presets,request}.md`, `guides/{jsx-dom,rpc}.md`, `concepts/web-standard.md`.
- **acrylblends.github.io** (branch `site-patches` in a local clone, commits `f642d89`, `933fc05` and `40d8244`; patches in `docs/plans/site-patches/acrylblends.github.io/`): the registry page (A1-A3), the hand-written Blends guide (C1-C10) and the home page (E2, E5).
- **acryl.dev** (branch `site-patches` in a local clone, commit `5f946f7`; patch in `docs/plans/site-patches/acryl.dev/`): `/docs/platform` and the footer note (E3).
- **Docs sync and release notes** (B1-B4, D3): `scripts/sync-sites.mjs`, run by Blends after 1.0.0 is published.
- Verified at each step: `bun run build` on the framework site (726 real routes with the 0.11.0 docs, 722 after the 1.0 docs replace them) and on acryl.dev (`tsc -b && vite build`, clean against its own lockfile), `git am` of both patch series into fresh clones followed by a build, and headless screenshots of `/blends`, `/blends/application`, `/blends/software-factories`, the 1.0.0 release-notes page, the home page's primitives grid and code samples, and `/docs/platform`.
