# Architecture review of the ACRYL ecosystem, 2026-11-14

Asked for by the owner on 2026-11-14: "criticise thoroughly all current architecture and find how to improve the current entire architecture of acryl
ecosystem", with the goal of the launcher's full function for the 2026-11-20 workshop: pulling and pushing Blends and Cordis plugins (registry, git,
WebBoxes.ai), and a full ACRYL Blends web instance on WebBoxes.ai.

Every finding below was seen on this Mac today (a live walk of the launcher's API on a scratch home, the registry, the installed apps, the WebBoxes
repository), not recalled. What was not checked is listed at the end.

## What works today (walked live)

| Function | Result |
| --- | --- |
| Read the Blends store (public registry) | works: 49 Blends listed in the launcher (the registry file has 55 entries) |
| Make an app from a starter (`blank`) | works, the app starts in the frame |
| Make an app from a registry Blend (`acrylblends.small-crm`) | works, the app starts |
| List the plugins of a fresh app | works |
| Pull a plugin from GitHub (`github:inboxxobni/hello-cycle@0.1.0`) | works, the plugin is active |
| Plan a plugin publish (what would be sent) | works |
| List or pull plugins in an app made from a registry Blend | **fails**: "this door has no extensions plugin to drive" (stale template, finding 2) |
| Publish a plugin for real | not run today (an outward action); the plan path it shares works |
| Push a whole Blend (an app) to git or the registry from the launcher | **does not exist** in the launcher (the frame has Share; the launcher has no call for it) |
| Deploy to WebBoxes.ai | **does not exist**: the button is disabled, "coming: acryl deploy" |
| Make an ACRYL-runtime Blend (`acryl.music`) from the published CLI | **fails**: `acryl` 0.2.4 needs the framework checkout (T018) |

## Findings, most damaging first

### 1. Three stacks do one job

- **ACRYL** (this repository): the DSH engine, `apps/acryl-desktop` (its own Electron shell), `apps/acryl-web`, apps made by `acryl new` through
  `scripts/blank.mjs` (registry runtime `acryl`).
- **ACRYL Blends** (acrylblends repository): `create-acrylblends`, the frame, its own desktop window (`plugins/desktop`), its own door
  (`npm run acryl`), registry runtime `acrylblends`.
- **WebBoxes.ai**: on its `main` and on the server, a third runtime (plain Node starters in Docker) and a third agent (`@webboxes/agent`, a 25-step
  loop with four tools). No ACRYL and no Blends frame run there yet. **Corrected the same day:** the fix is already written and not deployed, see
  "WebBoxes.ai: what exists" below.

Cost seen today: two desktop shells, two commands named `acryl` that do different things (the npm `acryl` and an app's `npm run acryl`), two app
formats in one registry (one of which the published CLI cannot make), and a cloud that cannot run either. Every feature is paid for two or three times
and each copy is thinner.

**Improve:** one app runtime, the Blends frame. ACRYL ADE is already listed as a Blend (`acryl.ade`, runtime `acrylblends`): finish that and retire the
`blank.mjs` app path and the registry's `acryl` runtime (6 entries: accounting, blank, gtd, music, orderdesk, organizer, ported or dropped). WebBoxes
runs the same frame app in its container. Then one launcher, one door, one desktop shell, one agent panel.

### 2. A template is a copy of the framework, so templates rot

An app made by `create-acrylblends` carries the framework inside it: `plugins/acryl-door`, `acryl-node-server`, `acryl-router`, `desktop`, `instance`,
`manifest`, `save`, `sandbox` are folders of source in every app, plus 512 MB of `node_modules`. A registry template is a snapshot of all of that from
the day it was made. That is why the owner saw old left and right panels in templates, and why the Small CRM template cannot list or pull plugins
while a fresh blank app can: same `acrylblends` package version (1.5.3), different copied plugin set (no `plugin-share` row).

**Improve:** a template holds only what is the app's own (its feature plugins, `blend.yaml`, pages, data). The framework's plugins come from versioned
packages and are named in `blend.yaml`, so every app gets the current frame by installing, and `npm run upgrade` is a version bump. T017 then is
"regenerate 55 templates from their own plugins", once, not "refactor 55 copies" every time the frame changes. Until then, a registry check must make
each template, start it and run `plugin list` and `plugin pull` before the entry is published.

### 3. The launcher is installed by copying files and editing a route with string replace

`scripts/launcher-blend.mjs` copies the Host half and rewrites its imports with `replaceAll`, patches `src/routes.ts` with three string replaces, and
adds a `blend.yaml` row by string search. It stops with "the Blends template changed" the day the template's text changes. It also needs this
repository's checkout, so an installed ACRYL cannot do it.

**Improve:** the launcher is what it sells: a Cordis plugin published to the registry and pulled into a blank app (`plugin pull`), or a Blend
(`acryl.launcher`) made with `create-acrylblends --from`. That needs one frame feature: a plugin can provide the app's canvas page. Then there is no
copy step, no patch, and no checkout.

### 4. The page reaches into the frame's DOM

To hide the left panel and follow the theme, the launcher page reads `window.parent.document`, finds buttons by their `aria-label` and clicks them. A
renamed label breaks it silently.

**Improve:** two small frame contracts: `panels: { left: false, right: open }` in the app's `blend.yaml`, and the theme handed to the canvas (CSS
variables or a message). Both are in the acrylblends repository.

### 5. Weight

One app is 547 MB (512 MB of `node_modules`); the Blends desktop window keeps a renamed Electron copy per app in `~/.acryl/electron`. Ten apps are
5 GB. The launcher app itself cannot ship inside the Desktop installer (600 MB budget), and `npx acryl` still pulls a 454 MB IDE runtime (T009).

**Improve:** one shared store for the framework's packages on a machine (pnpm's content-addressed store, or one install under `~/.acryl/runtime` that
apps link to), and one Electron per machine with per-app names. This is also what makes a WebBox image small.

### 6. Homes multiplied

`~/.acryl`, `~/.acryl-dev`, `~/.acryl-worktrees`, `~/.acryl-instances`, `~/.acryl/apps`, `~/.acryl/electron`, `~/.acryl/launcher`, the launcher's apps
folder (`ACRYL` beside the home), and until today `~/Library/Application Support/ACRYL *` (fixed in 0ceecd3b). The owner's rule is one predictable home.

**Improve:** everything under `~/.acryl` with one documented tree (`apps/`, `runtime/`, `dev/`, `worktrees/`), written once in
`docs/acryl/APP-INSTANCES-AND-BULKHEADS.md` and enforced by the bulkhead test.

### 7. Three faces of the launcher, three implementations

The journeys (`plugins/acryl-launcher`, JS), the desktop service (`plugins/acryl-launcher-desktop/src/service.ts`) and the agent tools (`tools.ts`)
each describe "make an app", "pull a plugin". The journeys end in a command line; the service spawns `npm` itself; the tools call the service.

**Improve:** one application service (the service) with the journeys as data over it; the terminal face and the tools call the same operations. Small,
and it removes a place where the three can drift.

### 8. Third-party plugins run with the person's full rights

`plugin pull` pins a digest, which proves what was downloaded, not that it is safe. A pulled plugin is Node code in the app's process. At a workshop
people will pull each other's plugins.

**Improve (workshop):** say so on the pull screen and show the publisher and digest before the yes. **Later:** the `sandbox` plugin as the default for
pulled plugins.

### 9. Process

- A test was red on main and nobody saw it (the tool-definition ceiling, fixed in 3e6d94e7): the full check is not run before pushes ("no CI at
  product stage"). A fast subset (typecheck plus the three launcher packages plus runtime instance tests, about two minutes) before each push would
  have caught it.
- `acryl` 0.2.8 is tagged but not released; the published 0.2.4 lacks fixes main has.
- The owner's checkout and the agent's worktree diverge; one command of mine ran in the wrong one today.

## Plan for the 2026-11-20 workshop, in order

1. **Templates work with the current frame** (T017). Regenerate the registry's templates on the current base, with a check that makes each one,
   starts it and runs `plugin list`. Without this, pull and push fail in every app made from the store. (acrylblends repository.)
2. **Push a Blend from the launcher**: a "Share" action on an app's card that calls the app's own save and share (git remote, registry entry), with
   the same plan-then-yes shape as plugin publish.
3. **Plugins in the launcher's screen**: the list, pull and publish calls work; walk the screen itself and fix what the walk shows.
4. **WebBoxes.ai runs a Blends app**: a WebBox image that is a `create-acrylblends` app started with the frame, reachable through the WebBoxes proxy
   (`ACRYL_WEB_HOST`, trusted hosts), replacing the plain Node starters for new boxes; then "Deploy to WebBoxes.ai" in the launcher pushes the app's
   git repository to a box.
5. **Desktop's first screen** (T016 rest): the launcher as a Blends product of its own.

Findings 1, 2 (the structural part), 3, 4 and 5 are the after-workshop architecture work, in that order of value.

## WebBoxes.ai: what exists (correction, 2026-11-14 evening)

The first version of this review read only webboxesai `main` and said nothing runs a Blends app there. That missed a branch. Seen today:

- Branch `m9-acryl-box` of webboxesai (worktree `webboxesai.worktrees/m9-acryl-box`, 7 commits of 2026-11-12, not merged, not pushed to `main`):
  a box image `webbox-acryl:1` that holds an app made by `create-acrylblends` and starts it with `npm run dev` (the full Blends frame with its
  agents), a second runner listener (the box gate) that turns a signed link from webboxes.ai into a session cookie on
  `https://<app id>.webboxes.ai`, one Traefik route file per box, the one workshop model key, the web app's "Open app" panel and a database
  migration. This is the design in `specs/049-framework-architecture/design/m9-hosted-workspace.md` (steps W2 and W3).
- acrylblends 1.5.2 already has the app side (step W1): the frame accepts its page through a trusted front (`ACRYL_PUBLIC_ORIGIN`,
  `ACRYL_TRUSTED_PROXY`).
- DNS: `*.webboxes.ai` resolves to the server (213.47.80.26), so the owner's wildcard record is in place.
- The server (z370n), read only: the runner image is 2 days old, there is no `webbox-acryl` image and nothing listens on the gate's port 7071.
  So none of the branch is deployed.

What is left is deployment and the gate run, not design: build the image and the runner on the server, apply the migration, merge the branch (a
push to `main` deploys the web app), then walk it in a browser. After that, `acryl deploy` and the launcher's "Deploy to WebBoxes.ai" (step W5).

## Not checked

- A real plugin publish and a real Blend share today (outward actions; the plan path works).
- The launcher's Plugins screen by hand (the API under it was walked).
- WebBoxes production: the web app itself was not opened; the server was read with `docker images`, `docker ps` and the listening ports only.
- Windows and Linux for anything in this document.
