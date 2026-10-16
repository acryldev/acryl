# Spec 044 - Make, save, share, pull, list: one model for plugins

Status: decided 2026-10-15 (D1 to D9 accepted by the owner, D7 as option B, D9 as dotted names; targets an open list; one term, plugin; versions and fixes). Every build step ends with its scenarios from "Verification" passing. It re-iterates the "Operations" and "Build order" sections of `spec.md` in this folder, on the owner's request ("lets re-iterate on that, it's important to get right": how Cordis plugins are created on the fly, published by different methods, pulled from different sources, and listed and controlled through the `acryl` CLI or predefined commands). The decisions 1-6 in `spec.md` (labels, GitHub owner as namespace, GitHub release enough, one repository per plugin, service contract) are unchanged.

## Why re-iterate

`spec.md` planned a new ACRYL service `pluginHub` with `list`, `save`, `push`, `pull`, and a CLI noun `acryl ext`. An inventory of what already exists shows two problems with that plan:

1. **The pinned Harness already has the install half.** `@deepseek-ai/dsh-plugin-manager` (`deepseek-harness/packages/boot/plugin-manager`, "current-profile plugin and bundle management shared by dsh CLI, Web and agent tools") is mounted by the base bundle (`packages/bundle/base/cordis.patch.yml`, row `plugin-manager`) and provides the `pluginManager` service: `listPlugins`, `listBundles`, `inspect(spec)`, `installBundle(spec)` for a registry name, an absolute path, a git address or a tarball (file or URL), `setPluginEnabled`, `setBundleEnabled`, `removeBundle`, build-script approval, DSH peer compatibility checks with exemptions, and a live reload. DSH's Plugins page (`ui-plugin-manager`, reachable in ACRYL's frame since `db2c496`, spec 001 R39) and its agent tool `plugin_manager` (row `tool-plugin-manager`, disabled by default) both use it. A second list/install service in ACRYL would be the parallel framework the repository rules forbid.
2. **ACRYL already has five overlapping faces and three nouns** for the same object (see the inventory). Adding `acryl ext` would make it six faces and four nouns.

## What exists today

| Step | Agent tool (ACRYL) | Chat command (ACRYL) | `acryl` CLI | DSH (pinned) | Market (`cordis-plugin-market`) |
| --- | --- | --- | --- | --- | --- |
| Find how to build | `acryl_extension_lookup` (docs and verified examples) | | | | |
| Create | the agent writes files into a source folder (skill `acryl-build-extension`) | | | | |
| Check | `acryl_verify_plugin` | | | `pluginManager.inspect` (spec form, registry, compatibility) | |
| Install a source folder, live | `acryl_install_plugin` (staged versions, live update without restart) | `/reload [new\|remove-stale]` | | `installBundle(/abs/path)` (an update needs a restart) | |
| Install a package | | | | `installBundle(name\|path\|git\|tarball)`, Plugins page "Add plugin" | npm only, from catalogs (dshfind, 1024store, standard HTTP); GitHub entries have no install path (`src/install/manual.ts`) |
| List installed | `acryl_list_plugins` (origin local or registry) | | `acryl plugin list` | `listPlugins`, `listBundles`, Plugins page | installed tab |
| Enable, disable | | | `acryl plugin enable\|disable` (ACRYL's `plugin-lifecycle/state.json`) | `setPluginEnabled` (writes the profile patch) | |
| Remove | `acryl_remove_plugin` | | | `removeBundle` | uninstall |
| Prepare to publish | `acryl_prepare_publish` (checks, contract, `npm pack` dry run; never publishes) | | | | |
| Save, share a whole app | | `/blend snapshot\|verify\|apply` | `acryl save`, `acryl remote connect` (`@webboxes/app-persistence`: secret check, private/public guard, `gh repo create`) | | |
| Save, share one plugin | none; quick-notes was pushed by hand (`spec.md`, "Verified: the first push") | | | | |

## Problems found

1. **Three nouns**: "plugin" (CLI, tools), "extension" (docs, folders, the planned `acryl ext`), "package" (the `acryl-package` keyword). The user sees all three.
2. **Two enable/disable stores**: ACRYL's `plugin-lifecycle/state.json` (`runtime/acryl-harness-runtime/src/plugin-lifecycle-state.ts`, used by the CLI and Desktop's Lifecycle tab) and DSH's profile patch (`pluginManager.setPluginEnabled`, used by DSH's Plugins page). Turning a plugin off on one page does not show on the other. One state needs one source of truth.
3. **Three install paths into one profile**: ACRYL's staged install (`lib/install.js`), DSH's `installBundle`, and the Market's own pnpm wrappers (`web-market-install.ts`, `cli-market-install.ts`, Desktop's `pnpm.ts`).
4. **The publish story contradicts itself**: the agent skill `acryl-share-extension` says "npm publish is the user's step"; decision 3 says a GitHub release is enough and npm optional.
5. **No save, share or pull for one plugin** on any face.
6. **DSH's "Add plugin" accepts raw git specs** (pnpm clones and builds), which decision 3 rules out as an install path in ACRYL.

## One term: plugin (owner, 2026-10-15)

The owner: "let's always call it the same way as the DSH community calls it, 'plugin' or 'cordis-plugin', just to unite one term, not to confuse human users and agents."

- **Plugin** is the only word for it, for people and for agents: in the UI, the CLI (`acryl plugin`, D2), the chat command (`/plugin`, D3), tool names and results, skills, docs and this spec. **cordis-plugin** is the label (keyword and GitHub topic) and the precise name when the kind of plugin matters. "Extension" and "package" are retired as names for it ("package" stays only for the npm file format, `package.json`, and the `acryl-package` catalog label, which is a fixed external keyword).
- What a plugin *is* stays described by its parts, not by new nouns: a plugin you are editing has a **source folder**; a pulled one is **installed from a release**; "Edit a copy" makes a source folder from it (D5).
- The rename is build step 1b, one coherent change with a migration, because names are read by installed apps:
  - the source folder `.acryl-plugins/` (from `.acryl-extensions/`, about 60 uses); an app moves an old folder on first start and reads both until then, so no user's plugins disappear;
  - the context package `acryl-plugin-context` (from `acryl-extension-context`, about 80 uses); its Loader row id equals the package name, so installed profiles get the row migrated, proven on the installed DMG, EXE and DEB;
  - the agent tools (`acryl_plugin_lookup`, `acryl_plugin_docs` from `acryl_extension_*`) and skills (`acryl-build-plugin`, `acryl-share-plugin`, `acryl-remove-plugin`);
  - docs and UI text; the generated docs are regenerated, not hand-edited.
  Spec folder names (`specs/044-extension-persistence-and-registries/`) and past log entries are history and keep their names.
- **How 1b is built (2026-10-16)**, in four commits, each gated, each read back by installed apps:
  - **The context plugin**: package and folder `acryl-plugin-context`, its Loader row id the same (the old row id `extension-context` also broke the row-naming rule), the Blueprint row `plugin-context`. A Blend or Blueprint someone wrote keeps working: `acryl-extension-context` and `extension-context` are read as the new names (an alias, kept, never written); a disable kept for `include:extension-context` in `state.json` applies to the new row and moves to its id on the next switch.
  - **The agent's tool, prompt section, service and skills**: the tool `acryl_plugin_lookup`, the prompt section `acryl:plugin-router` tagged `<acryl_plugin_docs>`, the service `pluginContext`; the skills `acryl-build-plugin`, `acryl-share-plugin`, `acryl-remove-plugin`. The generated prompt copies are regenerated.
  - **The folders**: a project's source plugins in `.acryl-plugins/`; an app's own source plugins in `<app home>/plugins/` (it was `extensions/`), and its plugin store in `<app home>/plugins/.store/` (it was `plugins/store/`; a dot name is never a plugin name, so the store and a plugin named `store` cannot collide). Each old folder is moved to its new place the first time it is needed (`@webboxes/plugin-hub` `folders.ts`, the one place these names are written): renamed whole when the new one does not exist, otherwise entry by entry, and an entry whose name is already taken stays in the old folder and is reported. An install that recorded its source under an old name, and a Blend lock naming `extensions/<name>`, find it where it was moved. Nothing is deleted except an old folder left empty.
  - **Words**: docs, UI text, results and messages say "plugin".

## Names and nesting (owner, 2026-10-15; D9 open)

The owner: "suggest options for scope naming: how we have it now, what we can have. `@namespace/<plugin-name>`, also maybe nested ones like `@namespace/sidebar/sessions-filter`, `@namespace/sidebar/sessions-chooser`, so that users can publish into really nested, organized catalogs, to reduce chaos."

**Now**: no rule. ACRYL's own plugins are unscoped (`acryl-workspace`, `acryl-settings`, `cordis-plugin-market`, `dsh-client-ui-brand-acryl`), two libraries are scoped (`@webboxes/app-persistence`, `@webboxes/blends-core`), one is `@acryl/ui`; quick-notes is unscoped `acryl-quick-notes` in the GitHub owner `inboxxobni`; DSH's are `@deepseek-ai/dsh-*`; community DSH plugins are mostly unscoped `dsh-plugin-*`. Decision 2 says the namespace is the GitHub owner.

**What the places allow**: npm allows exactly one level, `@scope/name`, and a name may contain dots but no slash; DSH's installer checks the same (`PACKAGE_NAME` in `plugin-manager/src/install-spec.ts`). GitHub allows exactly `owner/repo`, dots allowed. GitLab allows nested groups, but only GitLab. So a slash-nested name cannot be the package name itself anywhere portable.

Two different hierarchies are mixed in the example and should stay apart:
- **Who owns it** (`@namespace`): the author's, chosen by the author.
- **Where it plugs in** (`sidebar/sessions`): shared by everyone. If each author invents their own tree the catalogs get more chaos, not less.

Options:

- **A. Flat name, hierarchy as metadata.** Identity `@owner/sessions-filter`; the plugin declares `acryl.path: "sidebar/sessions"`; catalogs and the Plugins page show trees from it. Works on npm, GitHub and every catalog; the tree is free to change without renaming anything.
- **B. Nested address mapped to a legal name.** Users see and type `@owner/sidebar/sessions-filter`; it maps one to one onto the npm name `@owner/sidebar.sessions-filter` and the GitHub repository `owner/sidebar.sessions-filter` (segments limited to `a-z0-9-`, so the dot is unambiguous). Real nesting in the author's own namespace, still portable; moving a plugin in the tree is a rename (a new package, with the old one pointing to it).
- **C. Collections as repositories.** `owner/sidebar` is one repository holding `sessions-filter/` and `sessions-chooser/` (decision 4's `path`), each released separately (tag `sessions-filter@1.0.0`). Natural for an author with many related plugins; npm names stay flat.
- **D. A shared taxonomy, computed.** The catalog's top levels are where a plugin plugs in, read from its code like the service contract (the UI slots it fills, the services it provides: Sidebar, Header, Tools, Providers, Brand/Theme...), extending cordisplugins.github.io's existing categories; the author adds only the leaf levels. The same tree for every author, nobody has to agree on it by hand.

Recommended: **A + D as the base, B as the address users type, C allowed.** Every plugin is `@owner/name` (scoped by default from the first Share, owner = GitHub owner or npm scope); the catalog tree is computed (D) plus the author's own sub-path (A); a user who wants nesting in their own namespace writes `@owner/sidebar/sessions-filter` and ACRYL maps it (B). `@acryl` (or the framework's scope) holds the official plugins, which moves today's unscoped `acryl-*` plugins under it in the step 1b rename.

**Follow-up (owner, 2026-10-15)**: "if the npm rule is one level, do we have to stick to it? Maybe users can come up with a prefix, or we can offer an automatic prefix or suffix for nesting purposes." Yes for the real name: npm, pnpm, DSH's installer and GitHub all enforce one level, and a name they refuse cannot be installed by stock DSH (D8). The nesting goes into the name as an automatic prefix, which is option B made concrete:

- The user types or picks a path: `@owner/sidebar/sessions/filter`.
- ACRYL writes the real name with the path as a prefix: `@owner/sidebar.sessions.filter` on npm, `owner/sidebar.sessions.filter` on GitHub, and keeps the path as a field (`acryl.path`).
- The separator is a dot, not a hyphen: names already contain hyphens (`sessions-filter`), so `sidebar-sessions-filter` could not be read back into a path; with segments limited to `a-z0-9-`, every dot is a level. Dots are valid in npm names (`socket.io`), GitHub repository names and Loader row ids.
- Every face shows the path form; catalogs and the Plugins page group by it; search matches either form.
- A user may also write a prefix by hand; it is just a name, with no tree.

**Decided (owner, 2026-10-15)**: dots, "like calling methods inside a nested class, a programming abstraction many developers understand", for example `accountingAppAurora.sidebar.dateFilter`, `.sidebar.calendar`, `.sidebar.clockTimer`. Settled with it:

- **One form, everywhere.** The dotted name is what users type, see and publish; there is no separate slash form to map. The path field (`acryl.path`) is derived from the name, not written by hand.
- **Lowercase, hyphens inside a segment.** npm refuses capital letters in new names and DSH's installer accepts only lowercase (`PACKAGE_NAME`), so the example is written `accounting-app-aurora.sidebar.date-filter`, `accounting-app-aurora.sidebar.calendar`, `accounting-app-aurora.sidebar.clock-timer`. A segment is `[a-z0-9-]`; the dot is only ever a level.
- **With its owner**: `@owner/accounting-app-aurora.sidebar.date-filter` on npm, `owner/accounting-app-aurora.sidebar.date-filter` on GitHub. The first segment naming the app keeps an app's plugins together in every catalog.
- **The shared top levels** (option D) are still computed from where a plugin plugs in, so catalogs can also show "all sidebar plugins" across apps and authors.


## Versions and fixes (owner, 2026-10-15)

The owner: "there must be the possibility of versions and fixes; also we have to display the plugin version."

- **Every plugin has a semver version, shown everywhere a plugin is shown**: list rows on every face, the Plugins page card, catalog entries, every tool and command result, the confirmation card. A source plugin that changed since its last save shows it: `0.2.1, changed since saved`.
- **A version is published once.** Share and npm publish refuse a version that already exists on the target (S10). A fix is a new version: `acryl plugin version patch|minor|major` (and the same verb on every face) bumps it in the source folder; the agent's fix loop is fix, verify, bump patch, share.
- **Updates**: a pulled plugin remembers its source and version. `list` shows `0.2.2, 0.2.3 available`; `acryl plugin update <name>` (or `--all`) pulls the newer release through the same pipeline (checksum, service contract), keeping the plugin's data folder.
- **Pin or follow**: pulled as `@0.2.1` it is pinned and never offered updates silently; pulled without a version it follows the latest release.
- **Rollback**: the store keeps every version pulled or saved, so `acryl plugin pull <name>@0.2.1` goes back offline.
- **Fixing someone else's plugin**: Edit a copy, fix, share it under your own owner (`acryl.forkedFrom` records the original); proposing the fix back to the author (a pull request through the user's own `gh`) is a later adapter operation.
- **Release notes**: Share writes the release's notes from the commits since the previous version tag.

## The model

### One unit: the tarball

Outside its source folder a plugin is always the same thing: its `npm pack` tarball plus that tarball's sha512. Save puts it in the local store, Share attaches it to a GitHub release, npm publishes it, a person can send it as a file. Every pull, from any source, ends the same way: a checked tarball installed by `pluginManager.installBundle(<absolute path of the .tgz>)`. One artifact, one integrity rule, one install path.

### Two kinds of installed plugin

- **Source plugin** (editable): the agent or the user owns its folder (`<workspace>/.acryl-extensions/<name>/`, or global `<ACRYL home>/extensions/<name>/`). Installed and updated live by ACRYL's staged install, so the agent can iterate without restarts. `acryl_list_plugins` already calls this origin `local`.
- **Package** (pulled, read-only): installed from a tarball by `pluginManager`. Nobody edits it in place; updating means pulling a newer version. To change one, **Edit a copy** unpacks it into `.acryl-extensions/<name>/` as a new source plugin, recording where it came from (`acryl.forkedFrom`).

### 1. Create on the fly

1. The user asks for a capability in chat ("a notes panel").
2. The agent calls `acryl_extension_lookup`, reads the routed docs, and copies the closest verified example from `example-plugins/` into a new source folder. Scope: the project by default; global when the user says "for all my projects"; an app instance's folder in a named instance.
3. It writes the code, then `acryl_verify_plugin`, which now also reports the **service contract** (what it needs, and whether this app provides it), so a missing service shows at the first check, not at publish.
4. `acryl_install_plugin` installs it live. Edit and install again is the update loop.
5. Nothing else happens: no save, no push. The source folder is the truth, and in a project it is committed with the project if the user wants.

### 2. Publish: the methods

| Method | What leaves the source folder | Where it goes | Visible to | Needs |
| --- | --- | --- | --- | --- |
| **Save** | the tarball | the local store `<ACRYL home>/extensions/store/<name>/<version>.tgz` and `index.json` (sha512, contract, saved-at) | this machine, every app instance on it | nothing |
| **Share** | the tarball, plus the source as a git repository | the user's GitHub (`<owner>/<name>`, created private on first share), tag `v<version>`, release with the tarball, topics | the repository's collaborators | the user's `gh` login |
| **List publicly** | nothing new | flips the repository to public; the labels are already on it | everyone; catalogs list it on their next refresh | `license`, confirmation |
| **npm** (optional) | the tarball | `npm publish` | public, or private on a paid scope | the user's npm login |
| **As a file** | the saved tarball | wherever the user sends it | the recipient | nothing |
| **Inside an app** | the source folder | the app's own repository (`acryl save`): `.acryl-extensions/` is committed with the app | the app's | spec 036 |

Every method that sends something off the machine runs the same steps, inside the operation and not as steps anyone remembers: verify, sync the contract, the secret check over exactly the tarball's files, pack, sha512, then the target. Git and GitHub reuse `@webboxes/app-persistence` (`gitCli`, `githubHosting`, the secret check), which `acryl save` already uses for whole apps.

### 3. Pull: the sources

One argument names a source; every face takes the same forms:

| Form | Example | Fetched as | Integrity |
| --- | --- | --- | --- |
| Store | `store:acryl-quick-notes@0.2.1` (or a bare name the store has) | the stored tarball | the store's sha512 |
| GitHub | `github:inboxxobni/acryl-quick-notes@0.2.1`, or the repository URL | the release asset of tag `v0.2.1` (latest release when no version) | the catalog's sha512; pulled with no catalog, recorded on first pull and checked after |
| npm | `npm:@scope/name@1.2.3`, or a bare name the store does not have | the registry tarball | the registry's integrity, through spec 030's managed install rules |
| Tarball file | `/abs/path/acryl-quick-notes-0.2.1.tgz` | the file | recorded on first pull |
| Source folder | `/abs/path/folder` | not a pull: installs it as a source plugin, after the same review `/reload new` asks for | |
| Catalog result | chosen from search | resolves to GitHub or npm above | as above |

Refused: a raw git clone (`git+https://...`, `github:owner/repo` with no release): decision 3.

The pipeline is the same for every form: resolve, fetch the tarball into the store, check sha512, **check the contract** against the services the running app provides (a missing one is named, with the catalog's plugins that provide it, and nothing is installed), then `pluginManager.installBundle(<tarball path>)`, which brings DSH's own compatibility check and blocks install scripts unless the user approves them. The result is ACTIVE, or the reason it is not.

Pulled packages are kept in the store, so the same version installs offline into any app instance on the machine.

### Where a plugin can live: an open list (owner, 2026-10-15)

The owner: "our users have to be able to choose how they persist: to a public registry, to their own git repo, to the DSH plugins market, to a private plugin registry, to a public git repo, etc. Just as many sources as possible, and keep the list and categories open; we might update it as we progress to add more."

So a target is not a fixed list in the service: it is an **adapter**, and each adapter is itself a Cordis plugin that registers with `pluginHub` (`pluginHub.targets.register({ kind, category, push?, pull?, resolve?, search? })`, disposed with its plugin). Adding a new place is installing a plugin, with the same machinery this spec builds; nothing in the service names a host. The faces list whatever adapters are registered, by category.

Every adapter moves the same unit (the tarball and its sha512) and every push still passes the service's own steps first (verify, contract, secret check, visibility, license, confirmation). An adapter may do only some operations: a catalog only lists, a file only pulls.

| Category | Targets (first ones; the list grows) | Push | Pull | Visibility |
| --- | --- | --- | --- | --- |
| **This machine** | the local store; a `.tgz` file | yes | yes | private |
| **Git host, own repository** | GitHub (first), GitLab, Gitea/Forgejo, Bitbucket, a self-hosted server | repository, tag, release with the tarball | the release tarball (decision 3: never a raw clone) | private or public, the user's choice |
| **Package registry** | npmjs.com; a private npm registry (GitHub Packages, Verdaccio, a company registry; DSH's `pluginManager` already takes a registry URL per install and configured fallbacks) | `npm publish` with the user's login | the registry tarball | public, private scope, or private registry |
| **Public catalog (index only)** | acryl.dev/packages, cordisplugins.github.io, the DSH plugin market sites (dshfind.com, deepseek1024.com) | nothing of the code: the labels on a public repository or package (`acryl-package`, `cordis-plugin`, `dsh-plugin`) | resolves to a git host or registry entry above | public |
| **Private catalog** | a team's own index (an ACRYL Market "standard HTTP" source, `cordis-plugin-market/src/adapters/standard-http.ts`) | a row the team's index generates from its private repositories | as above, with the user's own credentials | the team's |
| **Inside an app** | the app's own repository (`acryl save`, spec 036) | the source folder, committed with the app | with the app | the app's |

Open, to add when someone needs them: object storage (S3, R2), an OCI registry, a plain HTTPS URL, a USB folder, a Blend registry entry. Each is one adapter.

Credentials stay with the user's own tools (`git`, `gh`, `npm`, the OS keychain); an adapter never stores a token, as the guards in `spec.md` already say.

### 4. List: what it answers

`list` answers three questions, each its own view:

- **Installed in this app**: name, version, kind (source or package), where it came from (folder, store, GitHub `owner/repo`, npm, Market), state (ACTIVE, PENDING with the missing services named, FAILED with the reason, disabled), and where it is saved or shared.
- **Saved on this machine**: the store, each version with its contract and whether this app can run it.
- **Available**: catalog search (acryl.dev, cordisplugins.github.io, dshfind, 1024store), filtered to what this app can run when asked (`--runnable`, from the contract).

Machine-readable with `--json` on the CLI and as the tool's typed result for the agent.

## One service, four faces

### The service

ACRYL adds only what the pinned Harness lacks, as one Host service `pluginHub` that **injects `pluginManager`** and never installs, lists installed rows, enables or removes by itself:

- `save(name)`, `share(name, { owner, public })`, `listPublicly(name)`, `publishNpm(name)`: the publish methods above.
- `pull(source)`: resolve, fetch, verify, contract check, then `pluginManager.installBundle`.
- `editCopy(name)`: package to source plugin.
- `saved()`, `search(query)`, `installed()`: `installed()` is `pluginManager.listPlugins`/`listBundles` joined with ACRYL's source plugins, origins and contracts, so every face shows the same rows.
- The source-plugin install (today's `lib/install.js`) stays ACRYL's, because live updates without restart are what make on-the-fly building work; whether it can become a thin layer over `installBundle` is D6.

### The faces

One noun everywhere, **plugin** (D2). The same verbs on every face:

| Verb | CLI | Chat command (typed by the user) | Agent tool | Plugins page | Confirmation |
| --- | --- | --- | --- | --- | --- |
| list | `acryl plugin list [--saved\|--available <query>] [--runnable] [--json]` | `/plugin list` | `acryl_list_plugins` (extended) | Installed, Saved, Add from... | none |
| check | `acryl plugin verify <folder>` | | `acryl_verify_plugin` | | none |
| install a source folder | `acryl plugin add <folder>` | `/reload`, `/reload new` (kept) | `acryl_install_plugin` | | first install of a discovered folder: the user (as today) |
| save | `acryl plugin save <name>` | `/plugin save <name>` | `acryl_save_plugin` | Save | none (stays on this machine) |
| share | `acryl plugin share <name> [--owner <user-or-org>]` | `/plugin share <name>` | `acryl_share_plugin` proposes | Share | always the user |
| list publicly | `acryl plugin share <name> --public` | `/plugin share <name> --public` | proposes | List publicly | always the user |
| pull | `acryl plugin pull <source>` | `/plugin pull <source>` | `acryl_pull_plugin`: from the store directly, from anywhere else proposes (D4) | Add from... | remote sources: the user |
| version | `acryl plugin version patch\|minor\|major [<name>]` | `/plugin version patch <name>` | `acryl_plugin_version` | Version menu | none (stays in the source folder) |
| update | `acryl plugin update <name>\|--all` | `/plugin update <name>` | `acryl_update_plugin` proposes | Update button with the new version | the user |
| enable, disable | `acryl plugin enable\|disable <name>` | `/plugin enable\|disable <name>` | none | toggle | none |
| edit a copy | `acryl plugin edit-copy <name>` | | `acryl_edit_copy` | Edit a copy | none |
| remove | `acryl plugin remove <name>` | `/plugin remove <name>` | `acryl_remove_plugin` | Remove | none for source plugins; packages: the user |

The CLI is for people and scripts (and CI). The agent uses its tools, not the CLI through a shell, because tools pass the policy and approval pipeline and return typed results. The chat command is the user's shortcut inside a conversation and costs no model tokens. All four call the same service, so a result is identical whichever face asked.

"Proposes" means the tool returns a pending action that the app shows as a confirmation card; nothing leaves the machine and no remote code is installed until the user confirms there.

## Compatible with stock DSH (owner, 2026-10-15)

The owner: "of course we have to re-use what exists; as a bonus it'd be great if we are compatible with the large community of builders on stock DSH; at least, if our users build plugins that are also compatible with the DSH stock desktop app, it'd be beneficial for both communities."

Most of it follows from the model above:

- **The same package.** An ACRYL plugin is a DSH bundle (`dsh.bundle.patch`, a Host entry, an optional `dsh.client` bundle, a peer range on `@deepseek-ai/dsh`). Stock DSH installs it with the same `pluginManager.installBundle`, so the GitHub release tarball URL pasted into stock DSH's "Add plugin" box installs it there too.
- **The same labels.** `dsh-plugin` is the topic dshfind.com and deepseek1024.com index (19,080 repositories on 2026-10-13); every shared ACRYL plugin carries it, so DSH users find ours where they already look, and ACRYL's Market reads those catalogs, so ours find theirs.
- **The contract says which apps run it.** The services stock DSH provides are a fixed set read from the pinned Harness's own bundles. A plugin whose `requires` is inside that set runs on stock DSH; one that needs an ACRYL service (`appInstance`, `desktopProfiles`, `pluginHub`...) runs on ACRYL only. The catalog shows it as **Both / ACRYL / DSH stock**, the field cordisplugins.github.io already has (`Compatibility` in `src/lib/registry-data.ts`), computed rather than typed.
- **Building for both by default.** `acryl_verify_plugin` reports "runs on stock DSH: yes", or "no, because it needs `appInstance`", and the authoring docs and examples prefer the DSH service when one exists (`dshHomePath` for a data folder, as quick-notes now does), so an agent-built plugin is stock-compatible unless it truly needs ACRYL. An ACRYL-only plugin is allowed; it is labelled, never hidden.
- **Pulling theirs.** A stock DSH plugin from those catalogs pulls into ACRYL through the same pipeline (release tarball or npm; the contract is read from its code when its `package.json` has none).

What can break it, and is tested (S11, S12): ACRYL's frame replaces DSH's sidebar, so a stock plugin that adds a DSH sidebar item may have no visible place in ACRYL; and the peer range on `@deepseek-ai/dsh` must cover the version stock DSH ships, not only ACRYL's pin.

### In the shipped app, not only in development (owner, 2026-10-15)

The owner: "when we solve this self-extensibility it has to work also in the shipped app (DMG, EXE or DEB on Linux), so that it's not only on the development server but also in normal ones."

What differs in an installed app, and what the build must handle:

- **No repository, no workspace tools.** Everything the operations need ships inside the app: the bundled pnpm (already required by the install, `SELF-EXTENSION-PERSISTENCE.md`, "Limits"), the read-only docs and examples (`resources/app.asar.unpacked/node_modules/acryl-extension-context/`), and the packing and checksum code. Nothing may import from the source tree or a dev dependency.
- **The user's machine may lack `git`, `gh` or `npm`.** Save, pull from the store, from a file and from a release URL need none of them. Share and npm publish need them; when one is missing or not signed in, the operation says which one and how to get it (`gh auth login`), and never falls back to asking for a token. Whether ACRYL should ship its own git or use GitHub's API through the user's sign-in is a later decision, measured on real installs.
- **Engine processes run inside Electron.** Any child process the operations start with `process.execPath` needs `ELECTRON_RUN_AS_NODE` (the Windows/Linux installer bug fixed on `main`, `dsh-engine-inside-electron`).
- **Paths and homes.** The store, staged versions and plugin data live under the app instance's home (`~/.acryl`, `C:\Users\<user>\.acryl`, `/home/<user>/.acryl`), chosen by the `AppInstance` family, never the install folder, so an app update or reinstall keeps every saved and pulled plugin (as the installed snapshot already does).
- **Network as users have it**: proxies, offline, slow links; a pull that fails part-way leaves nothing half-installed.

So every scenario in "Verification" has a column for where it ran, and a build step is not done until its scenarios pass on **installed builds**: the macOS DMG (this Mac), the Windows EXE (mbpi9win) and the Linux DEB (z370n), each on a throwaway home, as well as in development.

## Built to be extracted into ACRYL Blends (owner, 2026-10-15)

The owner: "once we solve this, we will take it and extract the core into the agentic framework (acrylblends.github.io), so we allow building not only the agentic IDE ACRYL app but actually any kind of app with the same tooling, with blueprints and boilerplate (Blends)."

So the machinery is built in three layers from the start, and the lower two never depend on the ACRYL IDE:

1. **Format and logic, host-independent**, the way `runtime/blends-core` (`@webboxes/blends-core`) already is: the service contract reader, the source-argument parser, packing and sha512, the store's index, the adapter interface types, the refusal rules. No Cordis, DSH or surface imports; usable by the engine, a registry's CI (acryl.dev and cordisplugins.github.io syncs) and other runtimes. Today's `plugins/acryl-extension-context/lib/contract.js` moves here.
2. **The Cordis service and its adapters**: the plugin service and the target adapters as Cordis plugins. They depend on Cordis and on service names only: the home comes from the app instance service, and installing goes through an **installer** service. In a DSH-based app (ACRYL, a Blend grown from it) DSH's `pluginManager` is the installer (D1); a Blend without DSH provides its own installer with the same shape. That is the service contract applied to the machinery itself, and it puts the installer and the plugin service into the Blend base kit (spec 036, `persistence-and-registries.md`, "Extensions in a Blend").
3. **Faces**: the CLI verbs, the chat command, the agent tools and the Plugins page. Their logic is the service's; what a Blend gets is the same verbs under its own app's CLI and UI. ACRYL-IDE-only parts (Development Canvas, workspace tree, Desktop shell) stay out of layers 1 and 2.

Names follow the layers: the packages and the service get framework names, not IDE names, before anything is published, so extraction is a move and not a rename. Packages are proposed under the scope the framework already uses (`@webboxes/...`, like `blends-core` and `app-persistence`) and settled at build step 2.

The tests follow too: layer 1 has its own unit tests with no app; layer 2 is also proven in a bare Blend made with `acryl new` (no ACRYL IDE plugins), not only in ACRYL, as scenario S13.

## Verification: the real-case matrix (owner, 2026-10-15)

The owner: "it's one of the most important parts of our functionality, to be able to extend the core; this machinery has to work very well; we have to do extensive testing", naming the real case `https://github.com/inboxxobni/acryl-quick-notes` and each operation: pushing to it, pulling from it, updating the version (improving, committing to the remote source), sharing it, publishing to acryl.dev/packages and to cordisplugins.github.io.

### The registries today

- **acryl.dev/packages** (`acryldev/acryldev.github.io`): `scripts/sync-acryl-catalog.mjs` searches npm for the keyword `acryl-package` only. A GitHub-only plugin such as quick-notes is not listed until issue 1 ("Catalog: list GitHub-only packages by repository topic acryl-package", open) is done.
- **cordisplugins.github.io** (`cordisplugins/cordisplugins.github.io`): the list is written by hand in `src/lib/registry-data.ts`; there is no sync. Its `Plugin` type already has `provides` and `consumes`, which are exactly the service contract's `provides` and `requires`. It needs a sync like acryl.dev's (GitHub topic `cordis-plugin` plus npm keyword, contract read from each release's `package.json`), so that listing there is a label too, not a pull request.

### The scenarios

Each runs on a throwaway home (`scripts/live-run.mjs` in development; a separate home on the installed builds), never a real one, in development and on the installed DMG, EXE and DEB. "Restart" means a full quit and relaunch, because a plugin that works only until restart is the failure this machinery exists to prevent.

| # | Scenario | Passes when |
| --- | --- | --- |
| S1 | **Create on the fly**: in a fresh app, ask the agent in chat for a notes panel | it builds a source plugin from the examples, verify shows its contract, it is ACTIVE live, and after a restart |
| S2 | **Save**: `acryl plugin save`, `/plugin save`, the tool, the Plugins page | the same tarball and sha512 in the store from each face; `list --saved` shows it with its contract |
| S3 | **Pull from the store** into a second app instance with the network off | ACTIVE, and after a restart |
| S4 | **Share to the existing repository** `inboxxobni/acryl-quick-notes` (0.2.2) by the command, not by hand | commit, tag `v0.2.2`, release with the tarball, topics; the downloaded asset has the local sha512; nothing but the tarball's files was checked for secrets and pushed |
| S5 | **Share a new plugin** (first share creates the repository) | a private repository in the chosen owner, with the same release shape; not listed anywhere |
| S6 | **Update the version**: improve quick-notes (or Edit a copy of the pulled one), bump, share 0.2.3 | a machine with 0.2.2 sees that 0.2.3 is available, updates, the notes stored in `plugin-data` survive, and the old version can still be pulled |
| S7 | **Pull from GitHub**: `github:inboxxobni/acryl-quick-notes` (latest) and `@0.2.1` (pinned), into clean homes, on Web, Desktop and CLI, on macOS (here), Linux (z370n) and Windows (mbpi9win) | ACTIVE, and after a restart, on every surface and system **Run 2026-10-16** on the installed builds of the same commit, each on scratch homes: the macOS DMG (this Mac, arm64), the Windows NSIS installer (mbpi9win, x64, installed silently per user, uninstalled after) and the Linux DEB (z370n, x64, unpacked without root). Inside each installed app's own Electron in Node mode, from its own bundle: pulled quick-notes 0.3.0 from GitHub (the same sha512 on all three), packed and saved a plugin with a nested folder and a shebang script (the same sha512 on all three), read its contract from source, and installed the pulled tarball with the app's bundled pnpm (the lockfile records the same sha512). The hub's suites also ran natively on Windows and Linux (core, plugin, pack, CLI, Blueprint and the real-engine extension test). Found and fixed on the way: Windows has no executable bit, so the same plugin packed to different bytes there (`701a0c8601e69b8b11e0fb66a95405e5860d2a49`). Share where gh is missing (Linux) or not signed in (Windows) says exactly that and how to fix it, and never asks for a token. **GUI, 2026-10-16**, the installed EXE (in the signed-in Windows session) and DEB (on a virtual display), each on scratch homes and driven through its debugging port: DSH's own Plugins page, "Add plugin" with `github:inboxxobni/acryl-quick-notes`, installed the 0.3.0 release tarball with the app's bundled pnpm (no pnpm on the Linux PATH), "Enable now", restart; quick-notes' host routes then added and listed a note stored under the scratch home. Its top-bar button appears in a started chat's header, which needs a model key; that was not entered on the test machines. |
| S8 | **List publicly** (done 2026-10-16 for an already public repository: acryl-quick-notes 0.2.2 live on acryl.dev and cordisplugins.github.io after deploy; flipping a private one is covered by tests, not yet live) | the repository turns public; acryl.dev/packages and cordisplugins.github.io list it on their next refresh with its contract; pulling from each catalog's search result installs it |
| S9 | **The same operation from every face** (CLI, chat command, agent tool, Plugins page) | identical result and identical list rows |
| S11 | **Stock DSH runs ours**: quick-notes' release tarball URL into the stock DSH Desktop app's "Add plugin", on a throwaway DSH home | ACTIVE, the panel works, survives a restart; the catalog shows it as Both **Run 2026-10-16** with the installed DSH 0.2.0-rc.2's own `dsh` CLI on throwaway homes (its GUI was not launched; its Electron data is not isolated by DSH_HOME): 0.2.2 installed but FAILED (`cannot get property "webServer" without inject`): stock DSH's connection row does not declare `webServer`, so no third-party `connection.rpc.handle` channel works there; ACRYL patches that row (`engine-dsh.ts`), which hid it. The verified state example taught that pattern; fixed in `c802560ddfceb4ece71b4b1301691ca09ed30a5e` (exact routes under `/api` with `connection.fetch.register`). quick-notes 0.3.0, the same fix versioned and shared with the commands, installed from its release URL, went ACTIVE, and authenticated calls added and listed a note under the stock home. Lesson for D8: the contract said 0.2.2 needed only stock services and the catalog showed "Both", yet it failed; a contract is necessary, not sufficient, and the real run is the proof. The defect is DSH's (reportable upstream; the owner's call). |
| S12 | **ACRYL runs theirs**: three popular `dsh-plugin` repositories from dshfind, pulled into ACRYL | each ACTIVE, or the reason named (a missing service, or a DSH sidebar item with no place in ACRYL's frame), recorded as a compatibility gap to fix on our side **Run 2026-10-16** with eight released community plugins, not three (`runtime/acryl-harness-runtime/tests/live/community-plugins.spec.ts`, opt-in with `ACRYL_LIVE_COMMUNITY=1`; added in `d34a6c707106be65372ab8291c301983b642b3bf`): each pulled from its latest GitHub release through the hub (sha512 checked), installed by DSH's own installer into a throwaway Web profile, then the engine booted again. ACTIVE after the restart: dsh-plugin-message-edit 1.2.1, dsh-plugin-smooth-stream 1.2.0, dsh-t3-model-picker 1.1.0, dsh-web-api-balance 1.0.5, dsh-knowledge 0.1.0, dsh-agent-profiles 0.7.0, dsh-bite 0.1.1. Refused, with nothing left installed: @flowingspring/dsh-workspace-memory 0.2.15, by DSH's own compatibility check (its peers name DSH 0.1.x; ACRYL runs 0.2.0-rc.2), which is that plugin's to fix, not ours. No compatibility gap on ACRYL's side was found; whether each one's UI has a visible place in ACRYL's frame is not yet checked by eye. |
| S13 | **A Blend that is not the IDE**: an app made with `acryl new` from the blank Blueprint saves, shares and pulls quick-notes with the same verbs | the same results as in ACRYL; nothing from the IDE plugins loaded **Run 2026-10-16** in an app made with `acryl new` on a scratch home (no IDE rows: 0 of its 195 Web rows are ACRYL IDE plugins). `acryl plugin pull github:inboxxobni/acryl-quick-notes` fetched 0.3.0 with its sha512 and kept it in the app's store, then refused to install it in the terminal profile because that profile has no `connection`, naming where it can go (`/plugin pull store:acryl-quick-notes@0.3.0`), as in ACRYL's terminal; `acryl plugin saved` listed it; the app's Web engine then installed it from the store with no network, and after a restart it was ACTIVE (`include:acryl-quick-notes`). Its git status shows `plugins/store/` ignored. Found and fixed on the way (`d34a6c707106be65372ab8291c301983b642b3bf`): `acryl plugin list`, `enable` and `disable` had failed everywhere since at least 2026-09-13 (`service acrPluginLifecycle has been registered`: the command mounted a second plugin lifecycle on top of the engine's), and a new app did not ignore `plugins/store/`, so `acryl save` would have committed pulled tarballs. Share from a bare app ran only in the hub's suites, not live. |
| S14 | **Versions**: a fix to quick-notes shared as 0.2.4; a pinned install stays on 0.2.3, a following one is offered 0.2.4; update; roll back to 0.2.3 offline | the version is right on every face and in both catalogs, data survives each step, and sharing 0.2.4 again is refused **Run 2026-10-16:** `update` built (`e981ade1b12f5f9bac64f4831c8899b1a6b594c6`: from the store's record of where a plugin was pulled, newest release, installed only when newer; rollback is a pull of the older version from the store), tested with a moving release; live: quick-notes went 0.2.1 (hand), 0.2.2 and 0.3.0 (both by `acryl plugin version` and `share`), and after a refresh of each site (a manual dispatch, since GitHub runs schedules late) acryl.dev and cordisplugins.github.io list 0.3.0 with no change to either site. Versions are shown in `/plugin list`, `acryl plugin saved`, both catalogs and ACRYL's Lifecycle tab (`f89eb796f38cbeb7c4c88c01c2da478f7e1d2c13`); DSH's own Plugins page still shows none (upstream). |
| S10 | **Refusals**, each with a clear message and nothing left half-installed: a tarball whose sha512 does not match; an app missing a required service (the missing service named, with which plugin provides it); a secret in the source; a private plugin sent to a public target; no `license` on a public target; a raw git spec; an install script without approval; the network cut mid-pull; a version that already exists on the target; an agent push or remote pull without the user's confirmation | each refused as described |

### How the tests are built

- **Unit** (in the gate): the service with fake git, `gh`, fetch and `pluginManager`, for every rule and refusal in S10.
- **Integration** (in the gate, no network): a real engine in a throwaway home; the "remote" is a local bare git repository and a local HTTP server serving a GitHub-shaped release; covers S2, S3, S6, S9 and S10.
- **Installed builds** (before each step is called done): the step's scenarios on the DMG here, the EXE on mbpi9win and the DEB on z370n, from the release artifacts, each result recorded with the build version.
- **Live** (on demand, not in the gate, the owner's `gh` login, on the owner's instruction for each run): S4 to S8 against `inboxxobni`, including the three systems for S7. Each run is recorded in this folder with versions, hashes and timings, like "Verified: the first push" in `spec.md`.

## Decisions for the owner

Answered 2026-10-15: D1 to D8 all yes; D7 is option B, after the explanation below.

- **D1. Build on DSH's `pluginManager`** for installing, listing installed plugins, enabling and removing; ACRYL's service adds save, share, pull (fetch, verify, contract) and edit-a-copy, and calls `pluginManager` to install. **Accepted.** It replaces the `pluginHub` list/pull design in `spec.md`.
- **D2. One noun: `acryl plugin`**, extended with the verbs above; no `acryl ext`. "Plugin" stays only as the folder name `.acryl-extensions/`. **Accepted.**
- **D3. One chat command `/plugin <verb>`**, with `/reload` kept as the short form for source plugins. **Accepted.**
- **D4. The agent pulls from a remote only through a confirmation card.** Store pulls stay direct. **Accepted**; supersedes `spec.md`'s direct `acryl_extension_pull`.
- **D5. Pulled packages are read-only; changing one is "Edit a copy".** **Accepted.**
- **D6. One enable/disable store and one install path**, measured first. **Accepted**; build step 1.
- **D7. What DSH's own "Add plugin" box does inside ACRYL.** **Option B accepted.**
  - *Today*: DSH's Plugins page (shown in ACRYL's frame since `db2c496`) has an "Add plugin" box. Whatever is typed there goes to `pluginManager.installBundle`, which runs `pnpm add <what was typed>` in the profile. pnpm accepts a registry name, a folder, a tarball, and a git address (`github:owner/repo`, a repository URL); for a git address it clones the repository's current default branch and installs that. Install scripts wait for the user's approval (DSH's `allowBuilds`).
  - *The difference from ACRYL's pull*: a git address installs whatever the branch holds at that moment, not a released version; there is no checksum to compare; the repository often lacks the built files a plugin needs (they are produced at release time), so it fails or needs a build; and it skips ACRYL's steps (the store copy for offline reuse, the sha512, the service-contract check that names a missing service instead of leaving the plugin in PENDING).
  - *Option A, leave it*: two doors with two rules. ACRYL's pull refuses a raw git address; DSH's box, in the same window, accepts it.
  - *Option B, route it*: in ACRYL the same box sends what is typed to `pluginHub.pull`. A registry name, tarball or folder behaves as now plus ACRYL's checks; a git address is resolved to that repository's latest release tarball; a repository with no release is refused with "this repository has no release; ask its author to publish one, or pull a folder". Mechanism to prove first, without editing the submodule: ACRYL provides a `pluginManager` that wraps DSH's and forwards everything except the spec resolution (Cordis provider replacement through profile composition).
  - *Either way* stock DSH is unchanged, and S11 (stock DSH installing ours by release URL) holds.
  - Decided: B. Proving the wrapping `pluginManager` is part of build step 2.
  - Built and proven 2026-10-16 (`plugins/acryl-plugin-hub/manager.js`, row `acryl-plugin-hub/manager` in place of `plugin-manager` wherever the hub is composed): in an isolated Desktop run, DSH's own "Add plugin" box took `github:inboxxobni/acryl-quick-notes` and installed release 0.2.2 ("Tarball, Version 0.2.2"; the profile records `file:<instance home>/plugins/store/acryl-quick-notes/0.2.2.tgz`), enabled from the page; `#main` and `gitlab:` were refused on the page with their reasons. The live run found two bugs the unit tests had not: a `#private` method is unreachable through Cordis' service proxy, and only the `unknown` problem shows its reason on DSH's page. Gap: DSH's installed list shows no version (owner: "we have to display plugin version"), for the Plugins page face in step 4.
  - How (read from the code, 2026-10-16): DSH's page calls `ctx.remote.pluginManager.inspect(spec)` and `.installBundle(spec)` (`ui-plugin-manager/src/client/manager-store.ts`). `PluginManager` is a class (`TypertRemoteService`, `super(ctx, 'pluginManager')`) mounted by the base bundle's row `plugin-manager`. ACRYL provides a subclass that overrides only `inspect` and `installBundle`: a git address becomes that repository's latest release tarball, fetched into the store and checked through the hub, then handed to `super.installBundle(<tarball path>)`; everything else is DSH's. The profile replaces the row (disable `plugin-manager`, insert ACRYL's) rather than adding a second provider, which Cordis refuses. To prove: the `@Remote` methods stay remote on the subclass, DSH's page installs a `github:` address as the release, and a repository with no release shows the refusal on the page.
- **D8. Stock DSH compatibility is a default, not a promise**: verify and the catalog report Both / ACRYL / DSH stock from the contract; the docs and examples prefer DSH services; ACRYL-only is allowed and labelled. **Accepted.**
- **D9. Names and nesting**: options A to D in "Names and nesting", decided as dotted names, one form everywhere, lowercase with hyphens inside a segment (`@owner/accounting-app-aurora.sidebar.date-filter`). **Accepted.** Option C (several plugins in one repository, each released on its own) confirmed by the owner 2026-10-16 as an author's choice next to the default of one repository per plugin. Option D (the computed shared view) accepted by the owner 2026-10-16 ("yes, computed from each app"), refined after the owner's question (2026-10-16: "what if it's an ACRYL Blends app which is not the IDE, an accounting app or a music editor; they will have different types of UI"): the locations are not a list ACRYL fixes. In the code a UI location is just a named slot: the plugin that draws a part of the screen reads it (`slots.entries('sidebar.workspaces')`), and a plugin that adds something there fills it (`slots.inject('sidebar.right.pane.tab', ...)`); the most used ones in DSH today are `settings.section`, `plugins.item`, `shell.overlay`, `main`, `conversation.view`, `sidebar.right.pane.tab`. A music editor's shell would offer its own (`track.header`, `mixer.strip`), an accounting app its own (`invoice.toolbar`). So D reads both sides from the code, like the service contract: which slots a plugin **offers** and which it **fills** (proposed as `acryl.slots: { offers, fills }`, generated). The catalog then groups in two levels: universal kinds every Cordis app shares (UI, agent tool, service, model provider, theme), and under UI the locations, by the app family that offers them ("ACRYL IDE: sidebar", "music editor: track header"). It also answers "can this app show it": a plugin filling `track.header` is shown as runnable only in apps whose plugins offer that slot.

## D6 result: what the measurement found (2026-10-16)

Read from the code, each claim with its place:

- **The two enable/disable stores contradict each other today.** ACRYL's overrides (`plugin-lifecycle/state.json`) become `{ id, disabled: true }` patches pushed *after* the profile's own patch file (`runtime/acryl-harness-runtime/src/engine-dsh.ts:446` and `:717`, `apps/acryl-desktop/src/profile.ts:992`). DSH's Plugins page writes into that profile patch file (`pluginManager.setPluginEnabled` -> `writePluginEnabled`, `plugin-manager/src/patch.ts`). So a plugin disabled in ACRYL and switched on in DSH's page stays off (DSH reports `overridden` only under HMR), and one disabled in DSH's page and switched on in ACRYL also stays off, because ACRYL only removes its own override.
- **Swapping one store for the other is not a quick fix.** DSH's `listPlugins` marks every row that is not in the profile's own patch composition under its `include` group as `unaddressable` (`plugin-manager/src/index.ts`, `listPlugins`). ACRYL composes many rows itself (Blueprint rows, surface capability rows, `composeBlueprintRows`), and those are exactly the ones ACRYL's store exists to toggle.
- **The three install paths all end in `pnpm add`** into the same profile: ACRYL's staged install (`plugins/acryl-extension-context/lib/install.js`: `pnpm add file:<staged>`, adds the name to `dsh.profile.bundles`, then `livePluginActivation.activate`), the Market (`web-market-install.ts`, `cli-market-install.ts`: `dsh plugin add`; Desktop: its recoverable `pnpm.ts`), and `pluginManager.installBundle` (`pnpm add` plus `selectBundle` plus reload). They agree on the outcome (a dependency and a `dsh.profile.bundles` entry), so a plugin installed by any of them is listed by DSH's `listBundles`. Only the staged install updates live; `installBundle` answers `restart-required` for a package already present.

Decided from it:

1. **Pulls and Market installs go through `pluginManager.installBundle`** (D1); the Market's own pnpm wrappers are retired when the Plugins page's "Add from..." lands (step 4).
2. **Source plugins keep the staged install**, because live updates are what on-the-fly building needs; it already registers exactly as `installBundle` does.
3. **One enable/disable store** is its own migration, ticketed as spec 001 T089 (`specs/001-acryl-refactor-improvements-and-tech-debt/tasks.md`): ACRYL's rows become addressable to DSH's manager (or DSH's page writes through ACRYL's lifecycle for rows DSH calls `unaddressable`), with a one-time move of `state.json` entries; proven by toggling the same plugin from both pages, restart in between, on installed builds. Until then, ACRYL's Plugins views name the store a disable came from. **Built 2026-10-16** (`0d92b8f5de83c165abdb5b79eca85fde0daa5c19`): ACRYL's plugin manager lists the rows ACRYL's lifecycle admits to DSH's page as switchable and sends the page's switch through that lifecycle (live, kept in `state.json`); an enable from either page clears a disable the old DSH page left in the profile patch, which is the move of existing entries; rows ACRYL does not admit stay DSH's own. Proven on a real Web engine across six restarts; the installed-build run is part of the GUI check on the installed apps.

## Build order (replaces `spec.md`'s steps 1-4)

0. Service contract: done (`66cf7d43`).
1. D6 investigation: done 2026-10-16 ("D6 result" above; one store is spec 001 T089).
1b. The rename to one term (after step 2's core, so new code is born with the new names and the rename only moves old ones) ("One term: plugin"), with the migration of folders, profile rows, tools and skills, proven on installed builds. Built 2026-10-16 in four gated commits: the context plugin `d85c6a9b621e7699d3c91b4fcf090226ffb8c73c`, the tool, prompt section, service and skills `32043e9909b4292ce996491588c9850948fc41cd`, the folders `f0a44643e9a84e20e790d3d43579e506f5b546d8`, the words `e68b9b3e226f9d36305325c949d9718e4d9734f4` (with the synced corpus refreshed first, `c9403aff8b8d7c8df5d504ed0947d95a8139f2c3`). **Proven 2026-10-16 on the installed DMG (this Mac, arm64), EXE (mbpi9win, x64) and DEB (z370n, x64)** built from `d9b6566a` (a clean-archive build there found that no build chain built the hub before the runtime; fixed in that commit): each installed app's own runtime booted an `acryl new` app laid out as before the rename (`extensions/` with a plugin, the store in `plugins/store/`); `extensions/` moved into `plugins/`, the store to `plugins/.store/`, the context row `include:acryl-plugin-context` and the app's plugin ACTIVE; a kept disable of `include:extension-context` switched the renamed row off. The project folder move (`.acryl-extensions/`) is proven by the suites, not on the installed apps.
2. `pluginHub`: core done 2026-10-16 (`77899373`, `@webboxes/plugin-hub` in `runtime/plugin-hub`: names, sources, deterministic tarballs, store, save, pull with GitHub and npm ports) and service and faces done (`161f5bdc`, plugin `acryl-plugin-hub` in every Blend's base kit: `/plugin list | saved | save | version | pull`, `acryl plugin saved | save | version | pull`, install through `pluginManager.installBundle`, the host contract checked before install). As built:
   - **The store is per app instance** (`<instance home>/plugins/store`, `storeRootOf`), not machine-wide: a machine-wide store would put a development or test run's writes into the user's real `~/.acryl`, which the bulkhead rules forbid. Another instance pulls a saved version with its `.tgz` path or `store:` in that instance. S3 is adjusted accordingly.
   - **The tarball is written by the hub, not by npm** (the shipped app has none): npm's file rules and layout, deterministic (fixed times, owners and gzip header), checked against `npm pack` on quick-notes (same files) and installed by pnpm with the same integrity.
   - Still open in this step: the adapter registry (targets as plugins, today the GitHub and npm ports are built in), `installed()` joined with source plugins, the contract in `acryl_verify_plugin`, the routed "Add plugin" box (D7).
3. Share and List publicly through `@webboxes/app-persistence` (secret check, visibility guard, release tarball, topics), and pull from `github:` with sha512. Real case: quick-notes 0.2.2 shared by the command instead of by hand. Built 2026-10-16: `sharePlugin` in the core over ports for the user's own `gh` and `git` (`/plugin share <name> [public] [owner/repo]`, `acryl plugin share <plugin> [--to owner/repo] [--public]`), exactly the packed files committed, tagged and released; tested against local bare repositories. The contract reader moved into the core (`contract.ts`, the pack re-exports it) and now also writes `acryl.slots: { offers, fills }` (D9 option D).
4. The faces: `/plugin` chat command, the agent tools with confirmation cards, the Plugins page Save / Share / List publicly menu and "Add from...". Update the skill `acryl-share-extension` to the methods above (problem 4).
5. Catalogs: done 2026-10-16 for both registries. acryl.dev (`acryldev/acryldev.github.io` `8d6c3afdb82d6de52b6c7f2dec70c97ba246c433`, issue 1 closed): the sync also lists public repositories with the topic `acryl-package` from their latest release tarball, with its sha512, contract and an install line stock DSH accepts (the tarball URL). cordisplugins.github.io (`cordisplugins/cordisplugins.github.io` `fe16af8609b866b686647121561a8397eebb8f6a`): a sync replaces the hand-only list (hand entries stay and win), from the topic `cordis-plugin`, with provides and consumes from the contract, the slots a plugin fills, the version, and compatibility computed (ACRYL / Both / DSH stock without a contract); hourly and on every push. First live run: acryl-quick-notes 0.2.2 on both sites, plus 29 released community DSH plugins on cordisplugins.github.io, shown as DSH stock. Was: acryldev/acryldev.github.io issue 1 (GitHub topic `acryl-package`, release tarball, sha512, contract); a sync for cordisplugins.github.io (topic `cordis-plugin`, contract into its `provides`/`consumes`) in place of the hand-written list; `--available` search. Then S8.
6. npm publish and pull: built 2026-10-16 (`d72ff2d9809d23b214144aa0827900c65e82a370`). `publishToNpm` in the core (`npm-publish.ts`) over a port for the user's own `npm` (`npm-cli.ts`; no token is read or kept, a missing npm or login says how to fix it): the same guards as a share (the contract and labels written, the secret check over exactly the packed files, `license` for public), plus npm's own rules (a private plugin needs a scope and is published `restricted`; `"private": true` is refused), a version already on the registry is refused, and the hub's deterministic tarball is what is sent, so the registry's integrity equals the store's. Pull of `npm:<name>` asks the public registry anonymously first, then the user's npm, so a private registry or scope in `.npmrc` works. Faces: `acryl plugin share <plugin> --npm [--registry <url>] [--public]`, `/plugin share <name> npm [public] [registry URL]`, and the agent tool's `to: "npm"` or `"npm:<registry URL>"` (asks the user first). Share and npm publish both refuse a plugin no app could install (no `dsh.bundle.patch`, or the patch left out of the packed files), found in the end-to-end run, where DSH's installer refused such a plugin only after it had been published. **Run 2026-10-16** against a local Verdaccio on scratch homes: a private scoped plugin published `restricted` (anonymous reads refused), the same version again refused, the registry's integrity the same as the store's, then pulled as `npm:@hubtest/tool.hello` in a fresh app home through a scoped registry line in `.npmrc`, installed by DSH and listed `on`. The public npm registry is not used without the owner's approval.
