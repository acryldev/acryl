# Site patches for the 1.0 docs pass

Four patches, each made in a local clone on top of that repository's `origin/main` and produced with `git format-patch`, so each set applies with `git am` in order. They are site source, which `scripts/sync-sites.mjs` does not carry, so they have to be applied by hand. Nothing was pushed to either site repository.

```sh
# acrylblends.github.io (origin/main e2bc43f)
git clone https://github.com/acrylblends/acrylblends.github.io.git
cd acrylblends.github.io
git am /path/to/site-patches/acrylblends.github.io/000*.patch
bun install && bun run build     # expect "real-routes: 726 pages emitted..." with the 0.11.0 docs still in place; after sync-sites replaces them it is 722

# acryl.dev (origin/main da4be90)
git clone https://github.com/acryldev/acryldev.github.io.git
cd acryldev.github.io
git am /path/to/site-patches/acryl.dev/000*.patch
corepack pnpm install --frozen-lockfile && bun run build
```

The commits also exist as branch `site-patches` in the two local clones, at `f642d89`, `933fc05` and `40d8244` (acrylblends.github.io) and `5f946f7` (acryl.dev); a fetch from those clones is equivalent to `git am`.

## acrylblends.github.io/0001 - the /blends page shows what exists

The page listed seven "Preview - not published" Blends above the six starters that are really in the registry: ACRYL, Blank Canvas, Agent Workbench, Local-first Studio, Secure Ops, Data Pipeline and Release Pilot.

**None of the seven was real.** None is in `registry/index.json`, which has six entries (`acryl.blank`, `acryl.accounting`, `acryl.gtd`, `acryl.music`, `acryl.orderdesk`, `acryl.organizer`). The plugin names in them were invented as well (`agent-runtime`, `checkpoint-store`, `tool-router`, `desktop-surface`, `local-store`, `sync-adapter`, `identity-gate`, `secret-vault`, `audit-log`, `source-connectors`, `transform-engine`, `schema-guard`, `test-runner`, `release-graph`, `deploy-adapter`); the ACRYL entry also named four plugins that do exist in acryldev/acryl (`acryl-control`, `acryl-harness-runtime`, `cordis-plugin-market`, `dsh-client-ui-brand-acryl`), but no published Blend composes them, so the entry was still a fiction. The page did label them "Preview - not published" and their detail pages said "This is an illustrative composition", so nothing claimed they were pullable; the problem is that they were the larger half of the page and a reader could not tell the two halves apart.

What the patch does:

- removes the invented list and its data (`src/lib/content.ts`), the page-local search and mode toggle, and the per-Blend detail pages for names that do not exist (`BlendDetail` now 404s anything not in the registry);
- adds `src/lib/framework-parts.ts`: the "what a Blend is made of" map in spec 049's order (core, routing, serving, records, tiny data, live state, UI, desktop, agents, the door, live plugins, tooling), each row with the service a plugin injects, the real provider packages, and stable / optional / experimental;
- adds `src/lib/registry-placement.ts`: each published starter's place in the 100-category taxonomy, because the registry's own `category` field is the publisher's short word (starter, finance, productivity, ...), not the taxonomy. Category and subcategory pages now list the real starter instead of always "No Blends here yet";
- the header count becomes "6 starters in the registry - 100 categories".

## acrylblends.github.io/0002 - the /docs/blends guide describes 1.0

`/docs/blends` is hand-written (`src/lib/doc-content.ts`) and `sync-sites` does not touch it. It had drifted: three CLI verbs instead of six, three templates instead of six, two old plugin folders instead of the one `plugins/` folder, `npm run lock` writing a file it does not write, and `App` (removed in 1.0) in the framework page's example. The patch brings those pages to the 1.0 commands, templates, plugin folder and class names, and names the published entries (`acrylblends/cordis/router`, ...) beside the app's own copies.

## acrylblends.github.io/0003 - the home page keeps only claims that can be shown

Nine primitives, none checkable - "Checkpoint & rollback" (a differentiation engine that does not exist), "Harness compatible", "Private registries", "Category registry" - and two invented code samples: a plugin importing `cordis` (the package is `@deepseek-ai/cordis`) with `ctx.logger`, and a "blend.yml" naming `agent-runtime`, `tool-router`, `checkpoint-store` and `web-surface`.

- Eight cards, each with its proof: a command (`npm create acrylblends@latest my-app notes`, `npx acrylblends upgrade --dry-run`, `npx acrylblends init my-app --desktop`) or a docs page (Add a plugin, The app manifest, Data and migrations, Acryl in a Cordis app, What runs in production). The claims without one are gone.
- The samples are real: a plugin the docs verify, and the blank template's own `blend.yaml`.
- "Plugins like the one above are published on cordisplugins.github.io, the sibling registry this site's own Blends pull from" is replaced by a link to the plugin-lifecycle page: no Blend in the registry composes that plugin, so the claim could not be shown.
- The oldest release-notes page (0.3.0) now points at the GitHub releases list for the releases without a page (0.5.1, 0.6.0, 0.6.2, 0.6.3, 0.6.4) instead of leaving the gap silent; no pages are added for them.

## acrylblends.github.io/0008 - every docs code block gets a copy button, and its scrollbar is visible

Patch 0004-0007 came from Blends. This one is the workshop page's usability fix, found by opening the live page in a browser: the long registry command
continued past the code block's right edge and the reader could not tell, because the theme's overlay scrollbar only shows while scrolling, and there was
no way to copy a command without selecting it by hand.

- The markdown renderer wraps every `<pre>` in a `.md-code` container with a copy button: it copies the block's exact text (no prompt characters), shows
  "Copied" for 1.5 s, and falls back to selecting the block and `document.execCommand('copy')` when `navigator.clipboard` is refused.
- The scrollbar is thin and visible in both themes (`scrollbar-width: thin`, `scrollbar-color: var(--code-muted) transparent`, with the webkit
  pseudo-elements styled so Chrome and Safari draw a classic thin bar rather than an overlay).
- Checked in a headless browser without `--hide-scrollbars` at 1280 px and 400 px, light and dark: the long block scrolls inside itself (scrollWidth 988
  against clientWidth 766 and 358) while the document never scrolls sideways, the bar is visible, and the button's clipboard content equals the block's
  text at both widths.

## acryl.dev/0001 - /docs/platform is the Cordis platform, not the DSH one

The page described ACRYL as "a clean plugin layer over DeepSeek Harness", installed DSH packages as its main path, and listed a five-item DSH compatibility contract.

- Lede, install section and contract now describe 1.0: a Cordis plugin platform whose web framework is Acryl (router, Node server, `db` and `kv` ports, live state, JSX), apps as folders of plugins mounted from `blend.yaml`, dependencies as service names, a versioned public surface with `acrylblends upgrade`, and ACRYL capabilities as additive and optional.
- A 1.0 notice states that DeepSeek Harness is not the platform: it is one agent driver, the ACP driver runs any agent that speaks the Agent Client Protocol, and `dsh` is its first preset.
- The runtime-layers stack gains the missing middle: ACRYL (the product), Acryl (the framework), Cordis (the runtime).
- The footer note that appeared on every page ("Built on Cordis and DeepSeek Harness") now says an agent joins as a driver, so the app is not tied to one.

## What is not in these patches

- `src/docs/framework` and the release-notes entries: `scripts/sync-sites.mjs` does that, and Blends runs it after 1.0.0 is published.
- The home page's "One of a hundred starting points" section on the framework site: it links to the category browser, which patch 0001 keeps real.
- acryl.dev's `/` and `/packages` pages, which still describe the DeepSeek Harness package ecosystem. They are the product and catalog story rather than the framework docs, and changing them is the owner's call.
