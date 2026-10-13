# Spec 044 - Extension persistence and registries

Status: draft for the owner's review (2026-10-13). Ticket: spec 001 T083. First real case: `.acryl-extensions/acryl-quick-notes` (an agent-written plugin, untracked in this repository).

## Where this was defined before, and the gap

| Document | Covers | Does not cover |
| --- | --- | --- |
| `docs/acryl/SELF-EXTENSION-PERSISTENCE.md` | how an agent-written plugin is installed into the running app: source folder, staged snapshot, profile registration, plugin data | moving the plugin anywhere else |
| `specs/037-guardrailed-self-extension/` | the agent writing, verifying and installing its own plugin under guards | saving or sharing it |
| `specs/036-cordis-ecosystem-and-acryl-blends/persistence-and-registries.md` | a whole app (a Blend): git as transport, private by default, registry by pull request at acrylblends.github.io | a single plugin |
| `specs/030-acryl-marketplace/` | a catalog of npm-published plugins and the managed install from npm | publishing; anything not on npm |

Nothing defines how one extension (one Cordis plugin) is saved, versioned, shared or fetched. This spec does.

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
| **Cordis Plugins registry** | an index entry at cordisplugins.github.io (`plugins/@<namespace>/<name>.json`, CI-built `index.json`) pointing at the package on npm or a git source | a pull request to `cordisplugins/cordisplugins.github.io`, never a direct push; CI validates the entry | search the index, then pull from the source it names | public |

The registry holds an index, not code: code lives on npm or git, where integrity and history already exist. This matches spec 036 (acrylblends.github.io indexes Blends the same way) and keeps one install path (spec 030's managed install).

## Where an extension records its targets

In its own `package.json`, under `acryl.targets` (reviewed with the code, travels with it):

```json
{
  "name": "@musichen/quick-notes",
  "version": "0.1.0",
  "license": "MIT",
  "acryl": {
    "visibility": "private",
    "targets": [
      { "kind": "git", "url": "git@github.com:musichen/acryl-quick-notes.git" },
      { "kind": "npm", "registry": "https://registry.npmjs.org" },
      { "kind": "cordis-registry", "url": "https://github.com/cordisplugins/cordisplugins.github.io" }
    ]
  }
}
```

The project source and the local store are always available and need no entry.

## Operations (one service, three faces)

A Cordis service `acrylExtensions` (Host side, owned by `acryl-extension-context` or a new `acryl-extension-store` plugin) with `list`, `save` (to the local store), `push(target)`, `pull(identity, target)`, `publish` (push to npm or git, then propose the registry entry). Its faces:

- **CLI**: `acryl ext list | save | push <target> | pull <id> [--from <target>] | publish`.
- **Plugins page**: each extension shows its targets and a "Save to..." menu; pulling is "Add from..." (store, git URL, npm name, registry search).
- **Agent tools**: `acryl_extension_save` and `acryl_extension_pull` run directly; `push` and `publish` only propose, and the user confirms each in the app (as spec 036 requires for publishing).

## Guards

- **Visibility**: `acryl.visibility` is `private` by default. A private extension is refused for npm (unless the scope is private), for a public git remote, and for the registry.
- **Secrets**: every push runs the secret check (`@webboxes/app-persistence`'s `acryl-secret-check`) over what is about to leave the machine, and refuses on a hit.
- **Credentials**: git, `gh` and npm use the user's own logins; ACRYL never reads, stores or prints a token.
- **Confirmation**: every push to a remote, every publish and every registry pull request needs the user's confirmation in the app; the agent can only propose.
- **License**: a public target requires a `license` field.
- **Integrity on pull**: npm pulls go through spec 030's managed install; git pulls verify the tag exists and install from that commit; the store keeps a sha512 per tarball.

## Open questions for the owner

1. Namespace: the GitHub user or organization, the npm scope, or one ACRYL account name that maps to both?
2. Should the Cordis Plugins registry also accept git-only entries (no npm package), or require npm for the managed install's integrity checks?
3. One repository per extension, or one "my extensions" monorepo per user with a folder each?
4. Should `.acryl-extensions/` in this repository be committed (it is the project-source target for this project), or kept untracked and saved to the local store?

## Build order

1. Local store: `save` and `pull` from the store, `acryl ext list`, the Plugins page list. Test with `acryl-quick-notes`.
2. Git target: push and pull with tags, the secret check and the visibility guard.
3. npm target: publish through the user's npm login; pull through spec 030's managed install.
4. Registry: entry schema, a validating CI and `index.json` in `cordisplugins.github.io`, `publish` opening the pull request, search in the Plugins page.
