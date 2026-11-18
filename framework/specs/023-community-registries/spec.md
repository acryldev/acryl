# Spec: community Blends and Cordis plugins in both registries

Status: delivered 2026-11-18 (the rest is under "What is left"). Asked by the owner, relayed by the coordinator (Acryl_main_thread_1).

## The owner's words

"to ensure we can easy share and detect community BLENDS and Cordis Plugins to any repo and still detect it and display in catalogs with labels 'official' or 'community'"

And, when the hourly registry run had been removed: "Why didn't you tell me that it was important to discover automatically the metadata on packages when people publish stuff to be compatible with our registry so that we automatically auto-discover it [...] Of course in this case we need it." The hourly run stays, for both registries.

The discussion this was planned from: `acryldev/docs-acryl-project-RnD-ideas-discussions-questions/Community_Blends_Registry_and_Cordis_Plugins_Registry/discussion_community_blends_and_cordis_plugins_borth_registries.md`.

## The rule

A repository is listed when all three hold:

|  | Cordis plugin (cordisplugins.github.io) | Blend (acrylblends.github.io) |
| --- | --- | --- |
| GitHub topic | `cordis-plugin` | `acrylblends-blend` (a second topic may name a subcategory: `productivity`) |
| Metadata, read, never run | package.json with the keyword `cordis-plugin` | blend.yaml: `visibility: public`, a licence, a `description`, a `category` that is a /blends category's address (`application`), passing @acryl/blends-core's validation; an `acryl.template.json`; a package.json without install scripts |
| Something to install | the latest release holds exactly one `.tgz` | a release, else a tag: people start with `--from github:owner/repo#<tag>` |

Official or community is a fact the sync computes, never what the author writes: **official** when the repository owner's numeric GitHub id is in the registry's `official-owners.json`, **community** otherwise. It is stored as `origin` in each entry (cordisplugins `registry/index.json`, acrylblends `registry/discovered.json`).

## Decisions (coordinator, 2026-11-18)

1. Official owners: acrylblends (329572928), acryldev (321071188, the project's org and the monorepo home in spec 051), cordisplugins (328784535). The ids, not the logins, decide: a renamed org's old login can be taken by someone else.
2. A community entry may not use our names: npm scopes `@acryl`, `@acrylblends`, `@acryldev`, `@cordisplugins`, name prefixes `acrylblends-` and `cordisplugins-` (not `acryl-`, which would refuse honest names), Blend id prefixes `acryl.`, `acrylblends.`, `acryldev.`, `cordisplugins.`. Such an entry is skipped with the reason.
3. Our old inboxxobni test plugins named `acrylblends-*` are refused by rule 2; they are test material and go in the cleanup.
4. A fork is listed only once it has its own release (or tag, for a Blend).
5. `blocklist.json` in each registry repository removes an owner or one `owner/repo` at the next sync.
6. Anything malformed is skipped and the sync log names why; the site never breaks because of one repository.
7. Community entries are shown by default (filter All), with the badge.
8. An app made from a repository (`--from github:owner/repo#tag`) is its new owner's, as one made from a registry id: its own id, `visibility: private`, no `license` line; the starter's LICENSE file stays as `STARTER-LICENSE` (its terms ask for the notice to be kept).

## What the person sees

- A **Community** or **Official** badge on every card of both sites, and a filter: All (default), Official, Community. Official first within a list.
- A community entry's page: "by @owner" linking to the author, the main link is the author's repository, and the notice: "Community plugin. Made and maintained by @owner, not by ACRYL. We list it automatically from its public repository and have not reviewed its code. Install it only if you trust the author." (the Blends page says Blend and "Use it").
- In an app, Settings > Plugins > Registry: the same badge and filter, yours first, then official, then newest; the question before adding a community plugin says "It is a community plugin: it runs code written by @owner, inside your app, and ACRYL has not reviewed it." An index without `origin` reads as community: nothing is called official that the registry did not call so.

## Tasks

- [x] Cordis sync: `origin`, official-owners.json, reserved scopes and prefixes, blocklist.json, fork rule, a logged reason for every skip (cordisplugins.github.io 20487f8)
- [x] Cordis site: badge, filter, official first, by @owner and the notice on a community page; the detail page no longer scrolls sideways on a long install line (20487f8)
- [x] Blends sync: `scripts/sync-blends.ts`, topic `acrylblends-blend`, blends-core validation plus the app checks shared with `registry-index.ts` (`scripts/lib/entry-checks.ts`), `registry/discovered.json` (acrylblends.github.io 5d9f6b4)
- [x] Blends deploy workflow: sync on push, by hand and hourly, with a comment saying why the hour is needed (5d9f6b4)
- [x] Blends site: badge, filter, official first, by @owner and the notice, the start command from `github:owner/repo#tag`, files read from the repository at its tag; registry/README.md says how to publish from your own repository (5d9f6b4)
- [x] Frame Registry tab: `origin` in the view, badge, filter, order, "community" in the add question (acrylblends 1.5.21, @acrylblends/blends-frame 0.1.6)
- [x] create: an app from `github:owner/repo#tag` gets its own id, private, no licence claim; test in packages/create/test/source.test.ts (create-acrylblends 1.5.21)
- [x] Rehearsal on inboxxobni: community Blend https://github.com/inboxxobni/team-notes (v0.1.0) listed as Community at https://acrylblends.github.io/blends/application/productivity/inboxxobni.team-notes/ ; community plugins (inboxxobni/hello-ana and others) labelled Community on cordisplugins.github.io; live index 74 plugins, 12 official, 62 community
- [x] Tests: cordisplugins `scripts/lib/discover.test.mjs` (origin, reserved names, blocklist), acrylblends.github.io `scripts/lib/discover-blends.test.ts` (origin, reserved ids, blocklist, placement), frame `tests/registry.spec.ts` (origin parsing, order, filter, add question)

## What is left

- [ ] Delete the old inboxxobni `acrylblends-*` test plugins (coordinator's cleanup).
- [ ] An npm keyword search (`keywords:cordis-plugin`) as a second source, if GitHub-only discovery misses plugins people publish only to npm. Not asked yet.
- [ ] A Blend for the ACRYL app (no `acryl.template.json`) from its own repository is skipped today ("create-acrylblends cannot start from it"); listing those needs a start path in the ACRYL app.
