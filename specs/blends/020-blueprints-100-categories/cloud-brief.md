# 020 - The cloud-agent brief

One Claude Code cloud session builds one batch of ten blueprints. Paste the brief below into a new session on claude.ai/code with
**both repositories** attached (`acrylblends/acrylblends` and `acrylblends/acrylblends.github.io`), and replace `<NN>` with the batch number.
Budget: the $100 credit, ten batches, about $10 each, spent by 2026-11-05. Run up to three batches at once. The coordinator reviews and merges the
branches.

T000 in tasks.md proved the publish steps with `acrylblends.system-monitor` (T001) and corrected this brief to what ran: every command below was run as written. The finished blueprint is the worked example a builder reads first (branch `blueprints/batch-01` of the site repository, `registry/blends/acrylblends.system-monitor/`).

The procedure behind this brief, with the composition rule and the done list, is `how-to-build-a-blueprint.md` in this folder.

---

```text
You are building ACRYL Blends blueprints: starter apps people pick from https://acrylblends.github.io/blends.

Two checkouts are attached. In what follows ACR is the acrylblends/acrylblends checkout and SITE is the acrylblends/acrylblends.github.io checkout.
Work in a scratch folder outside both (called WORK), and run the commands from there.

Read first:
- Your batch's designs, which are the task for each blueprint: specs/020-blueprints-100-categories/design/batch-<NN>/ in ACR (README.md, specs/<n>-<name>.md and
  mockups/<n>-<name>.html, one pair per task). Build each app to its spec (intent, screens, data, seed, states, routes, flows) and make its pages look and work like
  its mockup; do not replace them with a generic dashboard. Open the mockup in a headless browser and compare it with your first page before you publish.
  Where tasks.md and the spec differ, the spec wins, except the id: each blueprint's registry id is the one in design/repos.md.
- ACR, branch main (the latest acrylblends, the same 1.1.0 the published CLI is): specs/020-blueprints-100-categories/spec.md (what a blueprint is and when one is done) and tasks.md (your batch: the ten tasks marked [B<NN>]).
- A finished blueprint, as the pattern to follow: `git -C SITE fetch origin blueprints/batch-01` and read registry/blends/acrylblends.system-monitor/ on that branch
  (src/monitor.ts is the plugin, src/monitor/ its domain code, test/ the tests, README.md, and AGENTS.md's last section). Do not copy its job; copy its shape.
- In any app you make: AGENTS.md and docs/framework/README.md. The same docs are at https://acrylblends.github.io/docs.

Once, before the first blueprint:
a. Branches. In SITE: `git switch -c blueprints/batch-<NN> origin/main`. In ACR: `git switch -c blueprints/batch-<NN>-tasks origin/main`.
b. The registry index tool needs the Blend format library. CI takes it from a private checkout; use the published package instead:
     mkdir -p WORK/core/shim && cd WORK/core && npm init -y && npm install @webboxes/blends-core@0.4.0
     printf "export * from '../node_modules/@webboxes/blends-core/dist/registry.js'\n" > shim/registry.ts
     printf '{"type":"module"}\n' > shim/package.json
   and in every shell that runs the index tool: export BLENDS_CORE=WORK/core/shim   (it runs with Node 24 or with bun).

For each of your ten tasks:
1. Make the app with the published CLI, outside both repositories:
     cd WORK && npm create acrylblends@latest <name> -- --template blank --yes
   (npm needs the --. Use --template agent only where the task says agent template.) It is a Cordis app: src/main.ts, src/app.ts, blend.yaml, plugins/.
2. Composition rule (owner): a blueprint is composed from Cordis plugins and nothing else. Every feature is its own plugin in its own folder
   plugins/<feature>/ (index.ts exporting name, inject and apply; its domain code beside it), listed as its own row in blend.yaml (the template loads the folder by the row's name; do not import it in src/app.ts). No feature code in src/app.ts, src/main.ts or a shared routes file; an app with several domains (say tasks and calendar) has several plugins, one row each.
   blend.yaml is the app's composition: reading its rows must tell what the app is made of.
   Build the app's job. The pattern, as in the example (which keeps its plugin in src/; yours go in plugins/<feature>/): a plugin file (export name, inject = ['router'], apply(ctx, config) that builds one Acryl app and
   mounts it with ctx.router.route('/', app)), its domain code in src/<feature>/, listed as a row in blend.yaml before the acryl-node-server row (the blank template loads an app's own plugin folders by their row name, so nothing is imported or registered in src/app.ts). Replace the template's src/routes.ts and src/about.tsx and their test; test/app.test.ts counts the manifest's rows, update it. Put the first
   page at `/` with seed data (or the real machine's data) so it shows something at once. Keep the parts that touch the outside world (the clock, the disk, the network,
   a process) behind a small object the plugin takes as config, so the tests hand in a fake (createApp takes `overrides: { <row id>: { ... } }` in the example).
   Tests (node:test) cover the domain logic and every route. No outside service, API key or paid API; only framework parts and small, well-known npm packages.
   Set `metadata.name` in blend.yaml to the human name (`name: System Monitor`): it is what the registry and the site list. Leave the rest of metadata as it is.
3. Check it, in the app folder: npm install, npm test, npm run check (type-check), then `ACRYLBLENDS_PORT=<a free port> npm start` and fetch the first page with curl
   (it answers with the seed data). Stop the server. In this blank template `npm run dev` is the same app with a file watcher; the ACRYL frame is checked by the coordinator,
   not here.
4. Write README.md: what it is, who it is for, how to start it (npm install, npm start, npm test), three prompts to try in the chat next, and docs/screenshot.png (a headless
   browser screenshot of the first page; if no browser is available, leave the image out and say so under "Found").
5. Publish it into SITE:
     node ACR/workshop-registry/scripts/make-entry.mjs WORK/<name> acrylblends.<name> --description "<one line>" --license MIT --category <category slug> --out SITE/registry
   That writes SITE/registry/blends/acrylblends.<name>/ (without node_modules, .acrylblends, data and docs/framework) and makes its blend.yaml public and licensed.
   The category slug is the one in tasks.md (`system`, `developer`, ...). blend.yaml has no field for the subcategory: the site's placement is a line you add to
   SITE/src/lib/registry-placement.ts, at the end of the `registryPlacement` object, using the names as tasks.md writes them (not slugs):
     "acrylblends.<name>": { category: "System", subcategory: "System utilities" },
   (subcategory: the closest of the task's subcategories). An entry with no placement line is not shown on the site.
   Then regenerate the index and check it: cd SITE && node scripts/registry-index.ts registry && node scripts/registry-index.ts registry --check
   (this also runs the entry checks: no links, install scripts, keys or oversized files, an acryl.template.json, a package.json and src/). Do not edit registry/index.json by hand.
6. Prove the entry as a person gets it: cd WORK && npm create acrylblends@latest t-<name> -- --from acrylblends.<name> --registry SITE/registry
   then, in t-<name>: npm install, npm test, and `ACRYLBLENDS_PORT=<free port> npm start` with the first page fetched. (--registry takes SITE/registry; SITE itself works too.)

Do not create repositories (the session cannot). After review the coordinator merges your branch so the entry shows on https://acrylblends.github.io/blends and
https://acryl.dev/blends, and gives every blueprint its own repository in the acrylblends organization, named
<NN>-<name> like 01-system-monitor (workshop-registry/scripts/publish-repo.mjs), and the site and acryl.dev/blends list it from the registry.

Commit each blueprint as its own commit in SITE (the entry folder, registry/index.json and the registry-placement.ts line), on branch blueprints/batch-<NN>, and push that
branch. Do not open a pull request, merge, or push to main. In ACR, on blueprints/batch-<NN>-tasks, tick your tasks in tasks.md and add anything you ran into under
"Found" (one line each, with the task), commit and push that branch too. Commit messages carry no AI or agent attribution and no co-author lines.

If one task is blocked, record why under "Found" and go on to the next one. Finish with a short report: each blueprint, its proof (the test count from npm test in
t-<name> and the first page's title), and what is left.
```
