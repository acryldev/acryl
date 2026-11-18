# IDE port: where it stands (2026-10-31)

Live status for a fresh session. The plan is [ide-port.md](ide-port.md); each slice's evidence document (`ide-sliceN-*.md`) sits beside it.

## Landed on `main` (all with the full repository check green)

| Slice | Commit | What works |
| --- | --- | --- |
| 1 | e7d9d3e3 | Frame, `@acryl/ui`, `acryl-app-shell`, settings, shortcuts, control, diagnostics, brand; profile and overlay generation; the door on both hosts; first-run dialog off |
| 2 | 4e2d28c2 | `acryl-workspace` ported whole (803 tests + 1); Projects left pane, right panel, real PTY terminals; frame rendered in DSH; comparison alpha fix and recaptured references |
| 3 | 1f4c6af2 | DSH chat as a tab; first-run connect card; key stored only by DSH (600) and never under the app; sessions survive a restart; gate flake fixed |
| 4 | a93324cd | Files, editor, Changes, Review right-panel views; 4 new references with a committed, hash-verified fixture; 20 of 26 views within 2% |
| 5 | 127447cf | `acryl-sign-in` ported (30 tests) and mounted; OAuth connect flow in Settings > Models; API-key card suppressed for signed-in accounts; no token on disk under the app |

## The slice 6 decisions (made 2026-10-31, before the code)

1. **The frame stays at `/`; the app's routes mount at `/app` in the frame host** and the tile opens `/app/`. Changing the frame's URL would move DSH's page, the index hook and the door's target.
2. **The prefix lives in one place per template and is empty outside the frame.** Production runs the app on its own server, so public URLs there do not move; a test asserts a template built with prefix `''` serves its old URLs.
3. **The agent template keeps its own page and agent panel** inside the tile (the workshop guide depends on them); the plan's "the panel gives way to the frame" is recorded as a post-workshop change. DSH's chat remains beside the tile.

## Slice 6, step 1 landed on `main` (1f306a62)

Uncommitted work from the previous worker, adopted:

- `packages/cli/src/ide-profile.ts`: `IdeProfileInput.rows` (the app's own overlay rows) threaded into `overlayOf`.
- `packages/cli/templates/blank/src/routes.ts`: `apply(ctx, { prefix })`, `FRAME_MOUNT_PREFIX = '/app'`.
- `packages/cli/templates/blank/src/frame.ts` (new): the row the overlay mounts, which mounts the app's routes at the prefix.
- `packages/cli/templates/blank/test/app.test.ts`: asserts the old URLs standalone and `/app/*` through the frame row.

Landed: the scaffolder (`acrylblends init`) calls the generator for a template with `src/frame.ts`: it writes the profile, the overlay (app row `app-routes` -> `./src/frame.ts` plus the frame rows and the door row) and the `dev`/`profile` scripts; the frame package specs come from `ACRYLBLENDS_FRAME_PACKAGES` (JSON) while the ide packages are unpublished, and without it the app stays framework-only with a printed note. Two tests cover both paths (packages/cli/test/init-frame.test.ts). The blank template's routes take one mount prefix (`FRAME_MOUNT_PREFIX = '/app'`), its frame row mounts them there through the same `makeApp()` builder, and its test proves the standalone URLs do not move. The scaffolder gate is green for every template; the full repository check is green on 1f306a62.

Not yet done, in this order: (1) a per-template boot gate: scaffold with the frame specs, install, run `npm run profile`, `npm run dev`, assert the profile's rows are active and the app's page answers at `/app` inside the frame; (2) the remaining templates one at a time: todo, notes, chat, agent (its own panel stays inside the tile, per the decision above), nodejs, each with the same gate; (3) `acrylblends upgrade` for pre-frame apps; (4) Windows (mbpi9win) for the template gate. Publishing the ide packages (owner decision: npm names) is the blocker for a real attendee app to install the frame at all, and the `ACRYLBLENDS_FRAME_PACKAGES` bridge is a checkout-only stopgap. The tile at `/app` is reachable (ACRYL's canvas has a browser tile kind, `BrowserPane`, and the tab strip offers it) but is not yet asserted in a gate.

**Open question to settle first:** the browser tile is DSH's `ui-sidebar-browser`, enabled only in the desktop profile (the documented `right-panel-open@1024` difference). Whether a web-hosted frame can show the app's page at `/app` in a tile, or needs its own tab kind, decides how a template's page reaches the main surface. Do not assume; check `packages/bundle/web-app/cordis.patch.yml` and ACRYL's canvas tab kinds. Settled: ACRYL's canvas browser tile shows the app at `/app`, and every gate asserts it.

## Slice 6, step 2 landed: todo, notes, chat and nodejs on the frame

`todo`, `notes`, `chat` and `nodejs` now build from one mount prefix: their own path on their own server (the todo app keeps `/todo`; the others keep the root) and `/app` when the ACRYL frame hosts them. Every link, form action and client-script URL in a template's pages is derived from that prefix, so the standalone URLs do not move, and each template's test asserts both. The app's composition is exported as `composeInto`; the generated `app-plugins` row calls it with `host: true`, which leaves the host's infrastructure rows (server, router, page, app instance, door) to the frame and mounts the app's own rows at `/app`. `src/frame.ts` claims `/app` on the frame's router-http adapter, and `template.json` lists the host rows the launcher mounts (`acryl-web-server`, `acryl-page`); `todo` now carries the door like the other templates.

- `todo`: 448ab65f (merged to `main` as 94e25bae)
- `notes`: e82ce3e7
- `chat`: 4babfcff
- `nodejs`: ef01af0d
- the shared gate change (each template's page, plus the JSON route that proves its API answers at the prefix): 448ab65f

Each step was proved the same way: the template's own suite and `npm run check` (also in Codex's workspace-write sandbox, where only the real-server tests skip), a framed test that mounts the app at `/app` and checks its page, its API or client module and its prefix-derived URLs, the page gate end to end (composition, the app's page in the browser tile, a door call, the frame's panels, the palette, a PTY, chat with the local model, Settings, the key rule), and the full repository check.

Not covered by this step: the agent template's own panel does not load inside its `/app` tile under the host (section 13d of ide-host-inversion.md); decision 3 keeps the panel and records its host admission as a post-workshop change.

## Next steps, in order

1. `acrylblends upgrade` for pre-frame apps (DS_Fork3's slice, branch `112-upgrade`): write the generated profile and layer into an existing app without touching its source.
2. Windows: the template gate on mbpi9win (arrange with the owner; do not fake).
3. The agent template's own panel under the frame host (decision 3, section 13d of ide-host-inversion.md).
4. Publishing the ide packages: the `ACRYLBLENDS_FRAME_PACKAGES` bridge is a checkout-only stopgap, and a real attendee app cannot install the frame until the `@acrylblends/*` names are published.
5. After the port: Electron window, workshop guide rerun, owner's attendee test. The workshop of 2026-11-20 stays on the `agent` template.

## Rules that keep this safe

- Gate each step: lint, typecheck, full repository check; boot gate where the template is involved; land on `main` only on exit 0.
- Never mask a comparison view; a finding is reported with its number.
- One branch per slice; delete merged branches.
- Node-pty and koffi need `allowBuilds` in the generated profile, already present.
