# Spec 044 - Extension persistence and registries

Status: decided (2026-10-13, see "Decisions"; the service contract added 2026-10-15). Ticket: spec 001 T083. First real case: `.acryl-extensions/acryl-quick-notes` (an agent-written plugin, untracked in this repository), pushed as a test to https://github.com/inboxxobni/acryl-quick-notes.

## Where this was defined before, and the gap

| Document | Covers | Does not cover |
| --- | --- | --- |
| `docs/acryl/SELF-EXTENSION-PERSISTENCE.md` | how an agent-written plugin is installed into the running app: source folder, staged snapshot, profile registration, plugin data | moving the plugin anywhere else |
| `specs/037-guardrailed-self-extension/` | the agent writing, verifying and installing its own plugin under guards | saving or sharing it |
| `specs/036-cordis-ecosystem-and-acryl-blends/persistence-and-registries.md` | a whole app (a Blend): git as transport, private by default, registry by pull request at acrylblends.github.io | a single plugin |
| `specs/030-acryl-marketplace/` | a catalog of npm-published plugins and the managed install from npm | publishing; anything not on npm |
| acryl.dev `docs/packages/publishing.md` (repo `acryldev/acryldev.github.io`) | listing by the exact npm keyword `acryl-package`, found by `scripts/sync-acryl-catalog.mjs` four times an hour, no submission or pull request (the pi.dev `pi-package` model) | packages that are only on GitHub |

Nothing defines how one extension (one Cordis plugin) is saved, versioned, shared or fetched. This spec does.

## Decisions (owner, 2026-10-13)

Effortless for the author: a listing is a label on the package, never a submission. Users keep their extensions in their own repositories.

1. **Discovery by label, no pull request, no approval.** An extension is listed when it carries the labels, in both places:
   - `package.json` `keywords`: `acryl-package` (the ACRYL catalog), `cordis-plugin`, `dsh-plugin`;
   - the same three as GitHub repository topics (ACRYL sets them on push).

   This is how the ecosystem already works: dshfind.com and deepseek1024.com index the GitHub topic `dsh-plugin` (19,080 repositories on 2026-10-13; `cordis-plugin`: 474), and pi.dev lists npm packages with the keyword `pi-package`. Catalogs read the labels; listing is not trust (acryl.dev's Candidate / Manifest declared / DSH installable / Verified levels stay).
2. **Namespace: the GitHub owner.** The identity of a shared extension is `<owner>/<repo>` on GitHub, a user or an organization the user can push to. An npm name is used only if the author also publishes there. No ACRYL account.
3. **GitHub only is enough; npm is optional.** Push creates a release `v<version>` with the `npm pack` tarball attached; the catalog records the tarball URL and its sha512, and install uses the tarball exactly like an npm one (integrity checked, no lifecycle scripts). Raw clone-and-build is not an install path.
4. **One repository per extension**, in the user's own account or organization, created by ACRYL on the first push. A `path` field in the git target allows a folder of a shared repository for those who want one.
5. **`.acryl-extensions/` here stays untracked.** ACRYL's own repository is the product, not a user's project; quick-notes lives in its own repository. In a user's project ACRYL never adds `.acryl-extensions/` to `.gitignore`; committing it is the user's choice.

6. **A listing says what the extension needs and adds: its service contract** (owner, 2026-10-15). See "The service contract" below. The labels stay as they are: `cordis-plugin` is true of every extension, and whether a given app can run one is answered by the contract, not by a label.

Superseded by these: the "Cordis Plugins registry by pull request" target below is now discovery by topic and keyword (the index at cordisplugins.github.io is generated from GitHub and npm search, like acryl.dev's), and the open questions are answered.

### Verified: the first push (2026-10-13)

`acryl-quick-notes` 0.2.0 was pushed from the `musichen` login to `inboxxobni/acryl-quick-notes` (public, topics `acryl-package`, `cordis-plugin`, `dsh-plugin`, release `v0.2.0` with `acryl-quick-notes-0.2.0.tgz`, sha512 `3TB0b3tv...g2Byw==`). Within a minute GitHub search `topic:<each label> org:inboxxobni` returned it, and the downloaded release asset had the same sha512 as the local pack. Whose credentials and on whose authority: `inboxxobni` is a GitHub organization, not a second account; `musichen` is one of its two members and an admin (`gh api user/memberships/orgs/inboxxobni`: role admin, active), so the push used the owner's own `gh` login writing to the owner's own organization, on the owner's instruction in chat on 2026-10-13 ("push as test from user 'musichen' to github.com/inboxxobni"). Done by hand with `git`, `gh repo create --public`, `gh repo edit --add-topic`, `gh release create`; step 2 below turns exactly these commands into `acryl ext push`.

`0.2.1` (2026-10-15, same login, organization and authority, on the owner's instruction "do them" for the four points above): the contract written by `preparePublish`, `dshHomePath` declared with no `homedir()` fallback, a "Needs" section in the README. The secret check (`acryl-secret-check`) found nothing in the 6 files, which are exactly the tarball's; release `v0.2.1` with `acryl-quick-notes-0.2.1.tgz`, sha512 `TwmOjCfp...oQDbA==`, the same after download.

## The service contract (decided 2026-10-15)

### Why

"Is it a Cordis plugin?" is the wrong question. Cordis itself provides only the context, dependency injection, events and lifecycle; every capability is a service that some plugin provides and other plugins consume by name. In DSH, `connection` (`packages/client/connection`, `super(ctx, 'connection')`), `webServer` (`packages/host/webserver`) and `slots` (`packages/client/ui-renderer`) are plugins too: everything is a plugin. The one value set outside a plugin is `dshHomePath`, which `packages/boot/app-boot` provides at boot with `ctx.provide`.

So `acryl-quick-notes` runs in any app whose plugins provide `connection`, `dshHomePath` and `webServer` on the host and `connection` and `slots` in the browser. Today those are DSH-based apps (ACRYL, stock DSH); a bare Cordis app loads none of those plugins, and the extension would wait in PENDING. The dependency is on services, not on DSH.

This is what the registry is for. ACRYL is one instance of the ACRYL Blends framework: an app is a container whose builder agent assembles it from Cordis plugins, toward any application, agentic from day one (spec 036). A builder choosing an extension needs to know "this app has every service it needs", or "it is missing `slots`; that comes with `ui-renderer`". A label cannot answer that; a contract can.

### What it is

Two fields in the extension's own `package.json`, per side (host, client):

```json
"acryl": {
  "requires": { "host": ["connection", "dshHomePath", "webServer"], "client": ["connection", "slots"] },
  "provides": { "host": [], "client": [] }
}
```

- `requires`: the plugin's `inject`. In the pinned Cordis every `inject` entry is required (an array, or a name-to-config map; `Inject.resolve`); an optional dependency is a `ctx.get()` and is not part of the contract.
- `provides`: every service the extension registers: `super(ctx, '<name>')` in a Service class, `ctx.provide('<name>')`.
- A side the package does not have is absent (a host-only extension has no `client` key).
- `dsh.requiresAcrylPackages` (existing) stays the package-level dependency list; the contract is the service-level one a builder resolves against.

### Generated, never hand-written

`plugins/acryl-extension-context/lib/contract.js` reads it from the code: the host entry is imported and its `inject` read the way the Loader reads it (including a Service class's static or decorated `inject`); the client bundle, which only runs in the browser's module loader, is read as source, and only its literal list form (`exports.inject = ['slots', ...]`, the form every example uses) is accepted; any other form is an error, so a contract is never silently empty. `provides` is scanned from the source.

`preparePublish` (the agent's publish-prep tool) writes the contract into `package.json` and returns it; a package with no `acryl` block gets the documented minimal one (`schemaVersion: 1`, `artifacts.plugins` = the host entry). The catalog check validates its shape. `push` (build step 2) runs the same function, so a pushed extension always carries a contract that matches its code. Shipped in `66cf7d43` (with 7 unit tests and a real-engine test).

### No guessing a home

A contract only means something if the code honours it. quick-notes, and the `state-host-store` example it was generated from, read their data folder from `dshHomePath` but fell back to `homedir()/.acryl/.dsh/...` when it was missing, which in a test or second app instance writes into the user's real `~/.acryl`. Both now declare `dshHomePath` in `inject` and have no fallback: in an app without it they wait. The authoring doc (`extending/state-and-persistence.md`) says so. Proven in a real Web engine: the example goes ACTIVE and its data folder is under that engine's home.

For Blends: the home a plugin writes to should come from a base-kit service, not from the boot code. In ACRYL that is the `appInstance` family (`runtime/acryl-harness-runtime/src/instance/`); `dshHomePath` is DSH's equivalent. Which services every Blend provides (the base kit) is recorded in spec 036 (`persistence-and-registries.md`, "Extensions in a Blend").

## Terms

- **Extension**: one Cordis plugin package (`package.json` with `dsh.bundle.patch`, a Host and/or Client entry) whose source the user or an agent owns. The source is the truth (as in SELF-EXTENSION-PERSISTENCE.md).
- **Target**: a place an extension is pushed to and pulled from. An extension may have several.
- **Identity**: `@<namespace>/<name>@<version>` (semver). The namespace is the user's (their GitHub or npm user or organization); an unpublished local extension may use the bare name.

## The targets

| Target | What it holds | Push | Pull | Visibility |
| --- | --- | --- | --- | --- |
| **Project source** (exists) | `<project>/.acryl-extensions/<name>/` | the agent's file tools; commit with the project | the project's own git | the project's |
| **Local package store** | `<ACRYL home>/extensions/store/<namespace>/<name>/<version>.tgz` plus `index.json` | `npm pack` of the source into the store | install from the store (offline, any app instance on the machine) | private, this machine |
| **Git remote** (GitHub, GitLab, any git host) | a repository per extension (or a folder of a monorepo), tagged `v<version>` | commit, tag, push with the user's own git credentials | clone or fetch at a tag, then install | the repository's |
| **npm** | `@<namespace>/<name>` on npmjs.com (or another npm registry the user configures) | `npm publish` with the user's own npm login | the managed install of spec 030 (identity, integrity, no lifecycle scripts, bundle evidence) | public, or private on a paid scope |
| **Catalogs** (acryl.dev, cordisplugins.github.io, dshfind, deepseek1024) | nothing of the extension: each finds it by its labels (GitHub topics, npm keywords) | none beyond the labels: a public repository or package with them is listed on the catalog's next refresh | search a catalog, then pull from the GitHub release or npm package it names | public |

Catalogs hold an index, not code: code lives on GitHub or npm, where integrity and history already exist. Nobody submits anything; removing the labels removes the listing.

## Where an extension records its targets

In its own `package.json`, under `acryl.targets` (reviewed with the code, travels with it):

```json
{
  "name": "acryl-quick-notes",
  "version": "0.2.1",
  "license": "MIT",
  "keywords": ["acryl-package", "cordis-plugin", "dsh-plugin"],
  "repository": { "type": "git", "url": "git+https://github.com/inboxxobni/acryl-quick-notes.git" },
  "acryl": {
    "visibility": "public",
    "requires": { "host": ["connection", "dshHomePath", "webServer"], "client": ["connection", "slots"] },
    "provides": { "host": [], "client": [] },
    "targets": [
      { "kind": "git", "url": "https://github.com/inboxxobni/acryl-quick-notes.git" },
      { "kind": "npm", "registry": "https://registry.npmjs.org" }
    ]
  }
}
```

The project source and the local store are always available and need no entry.

## Operations (one service, three faces)

Re-iterated 2026-10-15 in [`lifecycle.md`](lifecycle.md): the pinned Harness's `pluginManager` already installs, lists, enables and removes, so ACRYL's service narrows to save, share, pull and edit-a-copy, under one noun (`acryl plugin`), with a real-case test matrix. This section and "Build order" stand until the owner decides D1-D7 there.

A Cordis service `acrylExtensions` (Host side, owned by `acryl-extension-context` or a new `acryl-extension-store` plugin) with `list`, `save` (to the local store), `push(target)` (git: create the repository if missing, commit, tag, set the topics, attach the release tarball; npm: publish), `pull(identity, target)`. There is no separate publish step: making the repository public with the labels is the listing. Its faces, three words for the user:

- **Save** (the local store), **Share** (push to the user's GitHub, private by default), **List publicly** (switch to public; the labels are already there).
- **CLI**: `acryl ext list | save | push [git|npm] [--owner <user-or-org>] [--public] | pull <owner/repo | npm name | store id>`.
- **Plugins page**: each extension shows where it is saved and a Save / Share / List publicly menu; pulling is "Add from..." (store, GitHub `owner/repo` or URL, npm name, catalog search).
- **Agent tools**: `acryl_extension_save` and `acryl_extension_pull` run directly; `push` only proposes, and the user confirms each push in the app.

## Guards

- **Visibility**: `acryl.visibility` is `private` by default, and Share creates a private repository. A private extension is refused for npm (unless the scope is private) and for a public repository; only "List publicly" changes it.
- **Secrets**: every push runs the secret check (`@webboxes/app-persistence`'s `acryl-secret-check`) by itself over exactly what is about to leave the machine, and refuses on a hit. It is part of `push`, not a step the user or agent remembers: no Share button and no `acryl ext push` ships without it (spec 001 T084).
- **Credentials**: git, `gh` and npm use the user's own logins; ACRYL never reads, stores or prints a token.
- **Confirmation**: every push to a remote and every switch to public needs the user's confirmation in the app; the agent can only propose.
- **License**: a public target requires a `license` field.
- **Contract on pull**: before installing, the pull checks the extension's `requires` against the services the running app provides, and names the missing ones (and, from the catalog, which extensions provide them) instead of installing something that would sit in PENDING.
- **Integrity on pull**: npm pulls go through spec 030's managed install; GitHub pulls take the release tarball for the tag and check its sha512 against the catalog's (or, pulled by URL with no catalog, record it on first install); the store keeps a sha512 per tarball.

## Build order

0. Service contract (done, `66cf7d43`): generated into `package.json` by publish prep, checked as catalog metadata.
1. Local store: `save` and `pull` from the store, `acryl ext list`, the Plugins page list (with each extension's contract: what it needs, and whether this app has it). Test with `acryl-quick-notes`.
2. GitHub target: `push` (contract, repository, tag, topics, release tarball, exactly the verified commands above) and `pull` by `owner/repo`, with the secret check and the visibility guard.
3. Catalog (critical path for listing a GitHub-only extension: until it is done, "List publicly" lists it on dshfind and deepseek1024 but not on acryl.dev; tracked as https://github.com/acryldev/acryldev.github.io/issues/1, assigned to musichen): `acryldev.github.io`'s `sync-acryl-catalog.mjs` also searches GitHub topic `acryl-package` (today it reads only the npm keyword) and records each repository's latest release tarball, its sha512 and its contract; cordisplugins.github.io builds its index the same way from `cordis-plugin`; the Market's install accepts a GitHub release tarball.
4. npm target: publish through the user's npm login; pull through spec 030's managed install.
