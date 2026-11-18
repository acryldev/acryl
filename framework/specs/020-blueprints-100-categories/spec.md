# 020 - A blueprint for every category

Owner, 2026-11-04: "we need new specs milestone with defined tasks to build acrylblends categories apps (100 categories, at least 1 for each, to as far
as we can go, eventually should be 100 or more total) to let our users choose from what starterkit to start (blueprint)". The first builders are
Claude Code cloud agents, paid from a $100 bonus credit that expires on 2026-11-05.

The step-by-step procedure for building one is `how-to-build-a-blueprint.md`.

## What a person gets

On https://acrylblends.github.io/blends every one of the 100 categories (from `src/lib/content.ts` in the site repository) lists at least one
blueprint. Picking one gives a single command:

```sh
npm create acrylblends@latest my-app -- --from acrylblends.<name>
cd my-app && npm install && npm run dev
```

The app opens in the ACRYL frame and already does the category's job. From there the person changes it in the chat.

## What a blueprint is

- An ordinary acrylblends app, made with the published CLI (`npm create acrylblends@latest <dir> -- --template blank`; use `--template agent` only
  where the app's own job is an agent). Its domain code is the app's own plugins and routes, built with the framework's documented parts (router,
  state, page, db port) and no extra frameworks.
- Composed from Cordis plugins only (owner, 2026-11-05): each feature is a plugin in `plugins/<feature>/` with its own row in `blend.yaml`, so `blend.yaml` reads as
  what the app is made of.
- Small and real: one clear job, two to five screens, real data shapes, and seed data so the first start shows something. No sign-in to an outside
  service, no API key, no paid service and no network call it cannot do without. Whatever needs a key reads it from settings and says so on the page.
- Its own tests (`npm test`) cover the domain logic and every route.
- A `README.md`: what it is, who it is for, what to ask the chat next (three example prompts), and a screenshot.
- Published as `registry/blends/acrylblends.<name>/` in the site repository with the registry's own entry script (`make-entry.mjs --out <site>/registry --category <slug>`, see
  `cloud-brief.md`), with `category` in its `blend.yaml` set to the category's slug. The subcategory is not a field of `blend.yaml`: it is the entry's line in `src/lib/registry-placement.ts` of the site repository, which is also what makes the site list the entry.

- Its own repository in the organization, https://github.com/acrylblends/<NN>-<name> (NN is the category's place in the site's
  taxonomy, System = 01), like 01-system-monitor. The coordinator creates it from the reviewed registry entry
  with `workshop-registry/scripts/publish-repo.mjs <site checkout> <entry id>`; a cloud session cannot create repositories. acryl.dev/blends mirrors
  the registry live, so an entry on https://acrylblends.github.io/blends is on acryl.dev too.

## Done for one blueprint

1. `npm create acrylblends@latest t -- --from acrylblends.<name> --registry <path to the site repository>` makes the app.
2. Then `npm install`, `npm test` and `npm run build` (when the app has one) pass.
3. `npm start` serves the app, with its first page showing the seed data. (`npm run dev` serves it inside the ACRYL frame; the coordinator checks that, a cloud agent cannot.)
4. The entry passes the registry's checks (no links, install scripts, keys or oversized files), and `registry/index.json` is regenerated.
5. Its repository exists in the organization with the entry's content.

## Done for the milestone

Every category has at least one blueprint that meets "Done for one blueprint", and the site's category page shows it. After that the target is 100
or more in total, more than one where a category is broad.

## Out of scope

Signing, a paid tier, reviews and ratings, and changes to the frame or the CLI. A blueprint that needs a CLI change records it under "Found" in
tasks.md instead of changing the CLI.
