# Spec 044 - Extension persistence and registries

Status: decided (2026-10-13, see "Decisions"). Ticket: spec 001 T083. First real case: `.acryl-extensions/acryl-quick-notes` (an agent-written plugin, untracked in this repository), pushed as a test to https://github.com/inboxxobni/acryl-quick-notes.

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

Superseded by these: the "Cordis Plugins registry by pull request" target below is now discovery by topic and keyword (the index at cordisplugins.github.io is generated from GitHub and npm search, like acryl.dev's), and the open questions are answered.

### Verified: the first push (2026-10-13)

`acryl-quick-notes` 0.2.0 was pushed from the `musichen` login to `inboxxobni/acryl-quick-notes` (public, topics `acryl-package`, `cordis-plugin`, `dsh-plugin`, release `v0.2.0` with `acryl-quick-notes-0.2.0.tgz`, sha512 `3TB0b3tv...g2Byw==`). Within a minute GitHub search `topic:<each label> org:inboxxobni` returned it, and the downloaded release asset had the same sha512 as the local pack. Done by hand with `git`, `gh repo create --public`, `gh repo edit --add-topic`, `gh release create`; step 2 below turns exactly these commands into `acryl ext push`.

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
  "version": "0.2.0",
  "license": "MIT",
  "keywords": ["acryl-package", "cordis-plugin", "dsh-plugin"],
  "repository": { "type": "git", "url": "git+https://github.com/inboxxobni/acryl-quick-notes.git" },
  "acryl": {
    "visibility": "public",
    "targets": [
      { "kind": "git", "url": "https://github.com/inboxxobni/acryl-quick-notes.git" },
      { "kind": "npm", "registry": "https://registry.npmjs.org" }
    ]
  }
}
```

The project source and the local store are always available and need no entry.

## Operations (one service, three faces)

A Cordis service `acrylExtensions` (Host side, owned by `acryl-extension-context` or a new `acryl-extension-store` plugin) with `list`, `save` (to the local store), `push(target)` (git: create the repository if missing, commit, tag, set the topics, attach the release tarball; npm: publish), `pull(identity, target)`. There is no separate publish step: making the repository public with the labels is the listing. Its faces, three words for the user:

- **Save** (the local store), **Share** (push to the user's GitHub, private by default), **List publicly** (switch to public; the labels are already there).
- **CLI**: `acryl ext list | save | push [git|npm] [--owner <user-or-org>] [--public] | pull <owner/repo | npm name | store id>`.
- **Plugins page**: each extension shows where it is saved and a Save / Share / List publicly menu; pulling is "Add from..." (store, GitHub `owner/repo` or URL, npm name, catalog search).
- **Agent tools**: `acryl_extension_save` and `acryl_extension_pull` run directly; `push` only proposes, and the user confirms each push in the app.

## Guards

- **Visibility**: `acryl.visibility` is `private` by default, and Share creates a private repository. A private extension is refused for npm (unless the scope is private) and for a public repository; only "List publicly" changes it.
- **Secrets**: every push runs the secret check (`@webboxes/app-persistence`'s `acryl-secret-check`) over what is about to leave the machine, and refuses on a hit.
- **Credentials**: git, `gh` and npm use the user's own logins; ACRYL never reads, stores or prints a token.
- **Confirmation**: every push to a remote and every switch to public needs the user's confirmation in the app; the agent can only propose.
- **License**: a public target requires a `license` field.
- **Integrity on pull**: npm pulls go through spec 030's managed install; GitHub pulls take the release tarball for the tag and check its sha512 against the catalog's (or, pulled by URL with no catalog, record it on first install); the store keeps a sha512 per tarball.

## Build order

1. Local store: `save` and `pull` from the store, `acryl ext list`, the Plugins page list. Test with `acryl-quick-notes`.
2. GitHub target: `push` (repository, tag, topics, release tarball, exactly the verified commands above) and `pull` by `owner/repo`, with the secret check and the visibility guard.
3. Catalog: `acryldev.github.io`'s `sync-acryl-catalog.mjs` also searches GitHub topic `acryl-package` (today it reads only the npm keyword) and records each repository's latest release tarball and sha512; cordisplugins.github.io builds its index the same way from `cordis-plugin`; the Market's install accepts a GitHub release tarball.
4. npm target: publish through the user's npm login; pull through spec 030's managed install.
