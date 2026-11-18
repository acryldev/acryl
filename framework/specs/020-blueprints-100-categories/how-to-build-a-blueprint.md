# How to build an ACRYL Blends blueprint

This is the procedure for one blueprint, from its design to its listing. `spec.md` says what a blueprint is, `cloud-brief.md` is the prompt a cloud session
gets, `tasks.md` is the ledger, `design/` holds the owner's mockups and specs, and `design/repos.md` gives every blueprint's registry id and repository. The
reference blueprint is **02 Productivity Hub** (`acrylblends/02-productivity-hub`, id `acrylblends.productivity-hub`, listed on https://acrylblends.github.io/blends; seven plugins: productivity-hub for the domain, hub-shell for pages and style, then my-day, inbox, tasks, notes and calendar); read its app before you build another, and copy its
shape, not its job.

## What exists for each blueprint

| Thing | Where | Made by |
|---|---|---|
| Design: spec and mockup | `specs/020-blueprints-100-categories/design/batch-<NN>/` here, and `design/` in the blueprint's repository | the owner |
| Repository | `https://github.com/acrylblends/<NN>-<name>`, `<NN>` the blueprint's number (01 to 100), `<name>` the mockup's file name without its number | the coordinator, `workshop-registry/scripts/publish-repo.mjs` or `gh` |
| Registry entry | `registry/blends/acrylblends.<name>/` in `acrylblends/acrylblends.github.io`, with its line in `registry/index.json` | `workshop-registry/scripts/make-entry.mjs` |
| Listing | https://acrylblends.github.io/blends (the site's category page) and https://acryl.dev/blends (reads the same registry index live) | the site's `src/lib/registry-placement.ts` line, then a merge to the site's `main` |

The id is `acrylblends.<name>` and the name is in `design/repos.md`. Where a spec or `tasks.md` writes another id, `design/repos.md` wins.

## The rule: composed from Cordis plugins

A blueprint is an app composed from Cordis plugins and nothing else.

- Every feature is its own plugin in its own folder `plugins/<feature>/` (`index.ts` exporting `name`, `inject` and `apply`; its domain code beside it) and its own row in
  `blend.yaml` (`- id: <feature>` and `name: <feature>`). The row resolves to the app's own folder; no edit of `src/app.ts` or `src/frame.ts` is needed.
- No feature code in `src/app.ts`, `src/main.ts`, `src/frame.ts` or a shared routes file. An app with several areas has several plugins.
- `blend.yaml` is the app's composition: reading its rows tells what the app is made of. The snapshot is `blend.yaml` plus `plugins/` (and `src/`), and it is what a
  person shares, saves as a version, or makes a blueprint from.
- Split by area. One plugin owns the domain (types, seed data, rules, persistence behind an adapter) and one plugin per screen or area serves its routes and, where
  it fits, puts its widget on the home page. A plugin that another needs is reached through a service (`inject`), not by importing its files.
- Anything that touches the outside world (the clock, the disk, the network, a process) sits behind a small adapter the plugin takes as config, so tests hand in a fake.
- No sign-in to an outside service, no API key, no paid service. Seed data makes the first start show something.

## Steps

1. **Read the design.** `design/spec.md` (intent, screens, data, seed, states, routes, flows) and `design/mockup.html` (open it in a browser; it is the visual
   target, and the spec wins where it differs from `tasks.md`). Do not replace the mockup's composition with a generic dashboard.
2. **Make the app** with the CLI the brief names, outside any repository: `npm create acrylblends@latest <name> -- --template blank --yes` (use `--template agent`
   only where the spec says the app's job is an agent). Write absolute paths in every command.
3. **Build each feature as a plugin** as above. Pages come from the router and the page helpers the framework documents (`docs/framework/README.md`, `AGENTS.md`);
   use the home widget helper for a widget on the first screen. The first page at `/` shows the seed data at once.
4. **Match the mockup.** Open your first page and the mockup headless at the same width and compare them side by side; fix differences in layout, type, colour and
   states before you call it done. Light and dark both stay usable.
5. **Test.** `node:test` covers the domain logic and every route; `npm test` and `npm run check` pass; `npm start` serves the seeded first page (fetch it).
6. **Write `README.md`:** what it is, who it is for, how to start it (`npm install`, `npm start`, `npm test`), three prompts to try in the chat next, and
   `docs/screenshot.png` (a headless screenshot of the first page).
7. **Capture the snapshot** (`npm run snapshot capture`, or Save point in the frame) so `blend.lock.json` matches the folders; `make-entry` refuses a stale one.
8. **Make the registry entry:**
   `node <acrylblends>/workshop-registry/scripts/make-entry.mjs <app> acrylblends.<name> --description "<one line>" --license MIT --category <category slug> --out <site>/registry`
   then add the entry's line to `<site>/src/lib/registry-placement.ts` (`"acrylblends.<name>": { category: "<Category>", subcategory: "<Subcategory>" }`, names as
   `tasks.md` writes them), run `node scripts/registry-index.ts registry` and `... --check` in the site checkout, and the site's tests and build. An entry with no
   placement line is not shown on the site. Do not edit `registry/index.json` by hand.
9. **Prove it as a person gets it:** `npm create acrylblends@latest t-<name> -- --from acrylblends.<name> --registry <absolute path to the site's registry>`, then
   `npm install`, `npm test`, and `npm start` with the first page fetched; in the ACRYL frame (`npm run dev`) the app is on the canvas and Settings > Plugins lists
   each plugin and switches it. Also check that a clean copy works with the published npm packages only, which is what everyone else gets.
10. **Publish, in this order, each a normal commit, never a force:**
    - the site: a branch of `acrylblends/acrylblends.github.io` with the entry folder, the index and the placement line; after review it is merged to `main`, which
      publishes https://acrylblends.github.io/blends, and https://acryl.dev/blends lists it from the same index;
    - the repository `acrylblends/<NN>-<name>`: the app at its root beside the existing `design/` folder, with the final README and a `.gitignore`;
    - `tasks.md`: tick the task and note anything you ran into under "Found".

A cloud session cannot create repositories; the coordinator does that, so a session pushes only its branches and the coordinator merges and fills the repositories.

## Done for one blueprint

- [ ] Every feature is a plugin folder with its own `blend.yaml` row; `src/app.ts` and `src/frame.ts` carry no feature code.
- [ ] The first page matches the mockup (side-by-side capture) and shows seed data.
- [ ] `npm test`, `npm run check` and `npm start` pass; every route has a test.
- [ ] The app made from the registry entry passes the same, with published packages only.
- [ ] README, three prompts and screenshot are in.
- [ ] The entry passes the registry checks (no links, install scripts, keys or oversized files), `index.json` is regenerated, the placement line is in.
- [ ] The site lists it, https://acryl.dev/blends lists it, and `acrylblends/<NN>-<name>` holds the app and its design.
