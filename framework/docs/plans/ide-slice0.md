# Slice 0 of the IDE port: the decision record

Status: done, on branch `099-ide-slice0`; nothing is released and nothing changes for a user. The code is `spikes/ide-slice0/` (one script, `run.sh`, reproduces every number below from nothing). This page is the evidence the plan (`ide-port.md`) was amended with.

## What was proved

On a clean folder, from npm only: `@deepseek-ai/dsh` 0.2.0-rc.2 (DSH, the DeepSeek Harness) and `acrylblends` 1.1.0, plus ACRYL's own workspace shell, booted as **one Cordis context and one page**:

- `dsh --profile web --patch overlay.yml` starts DSH's web application; the overlay adds rows for the framework's router and `routerHttp`, an app plugin, the ported ACRYL brand, ACRYL's `acryl-settings`, `acryl-app-shell` and `acryl-workspace`.
- The app plugin injects `router`, `routerHttp` **and DSH's `sessions`** and answers `GET /api/spike/hello` and a page at `/board`: the framework's router (1.1.0 from the registry) and DSH's session host are in the same context.
- The page shows ACRYL's frame (Projects pane, tab strip, collapsible panels, "ACRYL" brand and tab title), its Settings screen (sections General, Models, Built-in plugins, Agent presets, Agents, Tabs, Command palette; Appearance Light, Dark, System), and an "AcrylDSH Chat" tab.
- A terminal tab opens a real PTY (xterm in the page, `node-pty` on the host, the WebSocket through `acrylWeb`); a typed `echo spike-pty-$((6*7))` came back as `spike-pty-42`.
- Every row activated (no "did not activate" line).

Screenshots from the run (`run.sh` writes them): [the frame](ide-slice0-evidence/frame.webp), [its Settings screen](ide-slice0-evidence/settings.webp), [a terminal tab that answered a typed command](ide-slice0-evidence/terminal.webp).

## The decision: DSH hosts, and the framework is rows of its profile

**Topology.** DSH's own architecture page says supported Node applications launch through named `dsh` profiles, and that direct in-process plugin mounting is not a Harness application launcher. Both ways to put the framework and DSH in one process were weighed:

| | The framework hosts (our `acryl-node-server`, DSH plugins loaded into our context) | DSH hosts (`dsh --profile web`, the framework as profile rows) |
| --- | --- | --- |
| Supported by DSH | no (in-process mounting is outside its rule) | yes, it is the rule |
| What is missing | DSH's `webServer`, its page delivery and token fence, the module loader, would all need a stand-in | nothing: `acrylblends/cordis/router` and `/router-http` already exist and mount on DSH's `webServer` |
| What the spike showed | not tried | works, with ACRYL's whole shell |

**Chosen: DSH hosts.** `npm run dev` of an IDE-based app becomes `dsh --profile <app> --patch <overlay>`; the framework (`acrylblends`) is added to the profile with DSH's own `dsh plugin --profile web add acrylblends@<version>` (DSH says "declares no dsh.bundle, installed as a plain dependency", which is what is wanted); the app's own plugins are rows of the overlay. Consequences measured or read:

- Routes mounted with `routerHttp.mount('/board')` are served at **root-level paths** on DSH's server (not only under `/api`), and answer without DSH's token cookie (DSH's browser-trust fence guards its own `/api` surfaces; ours stay protected by our own `loopbackOnly` and the door's secrets). They carry no frame-blocking headers, so an app page can sit in a tile.
- **The framework does not need to port DSH's client contract.** The earlier plan had the framework owning a ported copy of the slots, store, renderer, module loader, page shell and connection (about 12,000 lines). Under "DSH hosts" those arrive from npm as DSH's own packages (289 `@deepseek-ai/*` packages come with `dsh`), and the ported ACRYL client plugins register against them exactly as they do in ACRYL. What is ported is ACRYL's own code (below).
- `appInstance` and `acrylWeb`, the two services ACRYL's runtime gives its plugins, are 15 lines each over DSH's `webServer` and the app's folders (`app/runtime.mjs`); they become small framework plugins (the repository already has `instance`).

## The build step: none in the app

DSH serves each plugin package's **prebuilt** `lib/client.js` (declared by `dsh.client` in `package.json`, built with `tsdown` as CommonJS with a `__ModuleLoader__` banner; React, Cordis and DSH's client packages are external, supplied by the page's frozen module table). The page loads them as combined scripts (`plugins/??a/client.js,b/client.js,...`). So:

- A ported ACRYL client plugin is **an npm package built at publish time**, not source copied into the app. The app's `npm install` (or `dsh plugin add`) brings the built bundle. There is no bundler in the attendee's dev loop, and the framework's `clientModules` (which compiles TypeScript on request and bundles no npm package) is not involved in the IDE.
- This repository's `tsdown` makes the ported brand's `client.js` **byte-identical** (52,075 bytes) to the one ACRYL's own build makes, from the same unmodified source (`provenance.json`), and the original suite (5 tests) passes here.
- Open, for slice 1: where the app's **own client code** goes. Its pages can be served at root paths and shown in a browser tile (works today), or be client plugin rows built with the same `tsdown` recipe (what an agent writing a native panel would use). Slice 1 decides after the frame is in.

## Measurements

One MacBook, loopback, a fresh Chrome profile, Node 24.19, warm npm cache (the cold install is in brackets).

| What | DSH alone (stock web profile) | With the framework, the ported brand and ACRYL's shell |
| --- | --- | --- |
| `npm install` of `dsh` (and the framework) | 18 s [57 s cold], 523 MB, 289 `@deepseek-ai/*` packages | the same |
| Cold start of `dsh web` to its URL | 1.2 s | 1.4 s (all rows activated) |
| Page load event | 0.46 s | 0.59 s |
| First render of the shell | 0.46 s | 0.83 s |
| Requests | 32 | 41 |
| Bytes on the wire (gzip) | 6.0 MB | 7.4 MB |
| Bytes decoded | 13.0 MB | 17.4 MB |
| JS heap | 41 MB | 50 MB |

Reading: the IDE shell adds about 1.3 MB on the wire and 4 MB decoded to DSH's own page (ACRYL's `acryl-workspace` `client.js` is 3.97 MB raw, 1.0 MB gzip, larger than the 3.3 MB the plan first quoted; `acryl-ui` 395 KB, `acryl-app-shell` 39 KB, the brand 52 KB). DSH's own page is most of the cost, and it is the same page for every DSH user. Over a slow workshop Wi-Fi 7 MB is noticeable once (it is cached after) and the 523 MB install is the heavier problem: see risks.

## What the spike found that the plan did not know

1. **`node-pty`'s install script.** `pnpm` inside DSH's profile refuses it (`ERR_PNPM_IGNORED_BUILDS`) until the profile's `pnpm-workspace.yaml` says `allowBuilds: node-pty: true`; npm prints the same kind of "allow-scripts" warning. The package ships prebuilt binaries for darwin, linux and win32 (arm64 and x64) and its script only moves `conpty.dll` on Windows, so POSIX works without it and **Windows is the platform that needs the script allowed**. `run.sh` writes the setting; the template must.
2. **One copy of the framework.** ACRYL's packages declare `acrylblends ^0.9.2` as a dependency, which would install a second router beside the 1.1.0 the app uses. The staged packages drop it (`stage-acryl.mjs`); the ported ones must declare it as a peer.
3. **DSH's first run.** Two dialogs appear before anything else: DSH's "Preview Notice" and "Add an API key to get started" (a DeepSeek provider setup). Both are DSH's and both are in the way of a workshop; they are configuration (DSH keeps the answers in its home), to be settled when connecting models is designed. DSH's Settings has a Models section already, and ACRYL's `acryl-sign-in` (OAuth for Claude and ChatGPT) plugs into it.
4. **DSH's version tags are inconsistent on npm**: `@deepseek-ai/dsh` has `latest` 0.2.1-rc.5, but most `dsh-*` packages have `latest` 0.0.1-rc.1 and `next` 0.2.1-rc.5. Never install a DSH package unpinned; `npm view` before trusting a tag.
5. **The door does not run here yet.** `acryl-door` injects `nodeServer` (our `acryl-node-server`), which does not exist when DSH hosts; it needs the same adaptation as ACRYL's own `acryl-agent-control` got (`acrylWeb` + `router` + `routerHttp`), and its page script has to be added to DSH's page through DSH's index-inject hook (the framework's `router.wrap` does not see DSH's own `index.html`). "The door stays" is therefore slice 1 work, and the largest single item in it.
6. ACRYL's own `acryl-web` from its checkout exited right after printing its URL when started here; its desktop boot is being fixed by the ACRYL side. The reference screenshots of ACRYL's own frame, which each slice is compared with, have to come from them.

## The DSH pin and its upgrade routine

**Pin.** `@deepseek-ai/dsh` **0.2.0-rc.2** exactly, which is what ACRYL builds against (its packages pin `0.2.0-rc.2` peers). The profile's `package.json` lists it exactly; no range. DSH says its public APIs are pre-stable ("update every consumer"), so a rc bump is an owner decision, not a routine one.

**Upgrade routine** (what to do when DSH moves; each step is a command in `spikes/ide-slice0/`):

1. `DSH_VERSION=<new> ACRYL=<checkout> ./run.sh`: installs the new DSH next to the same framework, and fails loud if the overlay's row ids or names no longer exist (`ui-brand-official`, `ui-layout`, `ui-sidebar`, `ui-conversation`; DSH prints "patch: name mismatch" and skips), if a row does not activate, if the page does not render, or if the terminal does not answer.
2. Diff `dsh --profile web --dump-config` of the old and new DSH (the composed row list is 1,259 lines, and is the contract the overlay relies on).
3. Re-run the ported suites against the new client packages (their `devDependencies` pin the DSH client packages they type-check against).
4. Rebuild the client bundles with the new DSH's client packages and compare the module table the page provides (React, Cordis) with what the bundles `require`.
5. Only then change the pin, the lockfile and the release notes together.

## What slice 0 did not prove

- **Windows and Electron.** Not run. `node-pty` on Windows is the known risk (finding 1). Electron: DSH has its own desktop shell and ACRYL ports around it; the plan's section 4 still stands.
- **The door in this arrangement** (finding 5) and the framework's `acrylblends` panel; neither is part of the IDE app until adapted.
- **An app's own page in the main surface.** `/board` is served and frame-able, but it was not opened in a tile.
- **The ACRYL reference comparison** (finding 6).
- **Any real model**: no key was used. The chat tab renders; asking it something needs the DSH models setup.

## Estimates after the spike

The spike took about five agent hours, inside the plan's 16-24 h range because DSH's packages and ACRYL's prebuilt bundles made the foundation mostly integration. The estimates in `ide-port.md` were revised from it.
