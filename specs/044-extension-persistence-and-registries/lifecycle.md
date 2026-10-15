# Spec 044 - Make, save, share, pull, list: one model for extensions

Status: decided 2026-10-15 (D1-D6 and D8 accepted by the owner; D7 open, explained in "Decisions"; targets made an open list, "Where an extension can live"). Every build step ends with its scenarios from "Verification" passing. It re-iterates the "Operations" and "Build order" sections of `spec.md` in this folder, on the owner's request ("lets re-iterate on that, it's important to get right": how Cordis plugins are created on the fly, published by different methods, pulled from different sources, and listed and controlled through the `acryl` CLI or predefined commands). The decisions 1-6 in `spec.md` (labels, GitHub owner as namespace, GitHub release enough, one repository per extension, service contract) are unchanged.

## Why re-iterate

`spec.md` planned a new ACRYL service `acrylExtensions` with `list`, `save`, `push`, `pull`, and a CLI noun `acryl ext`. An inventory of what already exists shows two problems with that plan:

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
| Save, share one extension | none; quick-notes was pushed by hand (`spec.md`, "Verified: the first push") | | | | |

## Problems found

1. **Three nouns**: "plugin" (CLI, tools), "extension" (docs, folders, the planned `acryl ext`), "package" (the `acryl-package` keyword). The user sees all three.
2. **Two enable/disable stores**: ACRYL's `plugin-lifecycle/state.json` (`runtime/acryl-harness-runtime/src/plugin-lifecycle-state.ts`, used by the CLI and Desktop's Lifecycle tab) and DSH's profile patch (`pluginManager.setPluginEnabled`, used by DSH's Plugins page). Turning a plugin off on one page does not show on the other. One state needs one source of truth.
3. **Three install paths into one profile**: ACRYL's staged install (`lib/install.js`), DSH's `installBundle`, and the Market's own pnpm wrappers (`web-market-install.ts`, `cli-market-install.ts`, Desktop's `pnpm.ts`).
4. **The publish story contradicts itself**: the agent skill `acryl-share-extension` says "npm publish is the user's step"; decision 3 says a GitHub release is enough and npm optional.
5. **No save, share or pull for one extension** on any face.
6. **DSH's "Add plugin" accepts raw git specs** (pnpm clones and builds), which decision 3 rules out as an install path in ACRYL.

## The model

### One unit: the tarball

Outside its source folder an extension is always the same thing: its `npm pack` tarball plus that tarball's sha512. Save puts it in the local store, Share attaches it to a GitHub release, npm publishes it, a person can send it as a file. Every pull, from any source, ends the same way: a checked tarball installed by `pluginManager.installBundle(<absolute path of the .tgz>)`. One artifact, one integrity rule, one install path.

### Two kinds of installed extension

- **Source extension** (editable): the agent or the user owns its folder (`<workspace>/.acryl-extensions/<name>/`, or global `<ACRYL home>/extensions/<name>/`). Installed and updated live by ACRYL's staged install, so the agent can iterate without restarts. `acryl_list_plugins` already calls this origin `local`.
- **Package** (pulled, read-only): installed from a tarball by `pluginManager`. Nobody edits it in place; updating means pulling a newer version. To change one, **Edit a copy** unpacks it into `.acryl-extensions/<name>/` as a new source extension, recording where it came from (`acryl.forkedFrom`).

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
| Source folder | `/abs/path/folder` | not a pull: installs it as a source extension, after the same review `/reload new` asks for | |
| Catalog result | chosen from search | resolves to GitHub or npm above | as above |

Refused: a raw git clone (`git+https://...`, `github:owner/repo` with no release): decision 3.

The pipeline is the same for every form: resolve, fetch the tarball into the store, check sha512, **check the contract** against the services the running app provides (a missing one is named, with the catalog's extensions that provide it, and nothing is installed), then `pluginManager.installBundle(<tarball path>)`, which brings DSH's own compatibility check and blocks install scripts unless the user approves them. The result is ACTIVE, or the reason it is not.

Pulled packages are kept in the store, so the same version installs offline into any app instance on the machine.

### Where an extension can live: an open list (owner, 2026-10-15)

The owner: "our users have to be able to choose how they persist: to a public registry, to their own git repo, to the DSH plugins market, to a private plugin registry, to a public git repo, etc. Just as many sources as possible, and keep the list and categories open; we might update it as we progress to add more."

So a target is not a fixed list in the service: it is an **adapter**, and each adapter is itself a Cordis plugin that registers with `acrylExtensions` (`acrylExtensions.targets.register({ kind, category, push?, pull?, resolve?, search? })`, disposed with its plugin). Adding a new place is installing a plugin, with the same machinery this spec builds; nothing in the service names a host. The faces list whatever adapters are registered, by category.

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

ACRYL adds only what the pinned Harness lacks, as one Host service `acrylExtensions` that **injects `pluginManager`** and never installs, lists installed rows, enables or removes by itself:

- `save(name)`, `share(name, { owner, public })`, `listPublicly(name)`, `publishNpm(name)`: the publish methods above.
- `pull(source)`: resolve, fetch, verify, contract check, then `pluginManager.installBundle`.
- `editCopy(name)`: package to source extension.
- `saved()`, `search(query)`, `installed()`: `installed()` is `pluginManager.listPlugins`/`listBundles` joined with ACRYL's source extensions, origins and contracts, so every face shows the same rows.
- The source-extension install (today's `lib/install.js`) stays ACRYL's, because live updates without restart are what make on-the-fly building work; whether it can become a thin layer over `installBundle` is D6.

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
| enable, disable | `acryl plugin enable\|disable <name>` | `/plugin enable\|disable <name>` | none | toggle | none |
| edit a copy | `acryl plugin edit-copy <name>` | | `acryl_edit_copy` | Edit a copy | none |
| remove | `acryl plugin remove <name>` | `/plugin remove <name>` | `acryl_remove_plugin` | Remove | none for source extensions; packages: the user |

The CLI is for people and scripts (and CI). The agent uses its tools, not the CLI through a shell, because tools pass the policy and approval pipeline and return typed results. The chat command is the user's shortcut inside a conversation and costs no model tokens. All four call the same service, so a result is identical whichever face asked.

"Proposes" means the tool returns a pending action that the app shows as a confirmation card; nothing leaves the machine and no remote code is installed until the user confirms there.

## Compatible with stock DSH (owner, 2026-10-15)

The owner: "of course we have to re-use what exists; as a bonus it'd be great if we are compatible with the large community of builders on stock DSH; at least, if our users build plugins that are also compatible with the DSH stock desktop app, it'd be beneficial for both communities."

Most of it follows from the model above:

- **The same package.** An ACRYL extension is a DSH bundle (`dsh.bundle.patch`, a Host entry, an optional `dsh.client` bundle, a peer range on `@deepseek-ai/dsh`). Stock DSH installs it with the same `pluginManager.installBundle`, so the GitHub release tarball URL pasted into stock DSH's "Add plugin" box installs it there too.
- **The same labels.** `dsh-plugin` is the topic dshfind.com and deepseek1024.com index (19,080 repositories on 2026-10-13); every shared ACRYL extension carries it, so DSH users find ours where they already look, and ACRYL's Market reads those catalogs, so ours find theirs.
- **The contract says which apps run it.** The services stock DSH provides are a fixed set read from the pinned Harness's own bundles. An extension whose `requires` is inside that set runs on stock DSH; one that needs an ACRYL service (`appInstance`, `desktopProfiles`, `acrylExtensions`...) runs on ACRYL only. The catalog shows it as **Both / ACRYL / DSH stock**, the field cordisplugins.github.io already has (`Compatibility` in `src/lib/registry-data.ts`), computed rather than typed.
- **Building for both by default.** `acryl_verify_plugin` reports "runs on stock DSH: yes", or "no, because it needs `appInstance`", and the authoring docs and examples prefer the DSH service when one exists (`dshHomePath` for a data folder, as quick-notes now does), so an agent-built plugin is stock-compatible unless it truly needs ACRYL. An ACRYL-only plugin is allowed; it is labelled, never hidden.
- **Pulling theirs.** A stock DSH plugin from those catalogs pulls into ACRYL through the same pipeline (release tarball or npm; the contract is read from its code when its `package.json` has none).

What can break it, and is tested (S11, S12): ACRYL's frame replaces DSH's sidebar, so a stock plugin that adds a DSH sidebar item may have no visible place in ACRYL; and the peer range on `@deepseek-ai/dsh` must cover the version stock DSH ships, not only ACRYL's pin.

### In the shipped app, not only in development (owner, 2026-10-15)

The owner: "when we solve this self-extensibility it has to work also in the shipped app (DMG, EXE or DEB on Linux), so that it's not only on the development server but also in normal ones."

What differs in an installed app, and what the build must handle:

- **No repository, no workspace tools.** Everything the operations need ships inside the app: the bundled pnpm (already required by the install, `SELF-EXTENSION-PERSISTENCE.md`, "Limits"), the read-only docs and examples (`resources/app.asar.unpacked/node_modules/acryl-extension-context/`), and the packing and checksum code. Nothing may import from the source tree or a dev dependency.
- **The user's machine may lack `git`, `gh` or `npm`.** Save, pull from the store, from a file and from a release URL need none of them. Share and npm publish need them; when one is missing or not signed in, the operation says which one and how to get it (`gh auth login`), and never falls back to asking for a token. Whether ACRYL should ship its own git or use GitHub's API through the user's sign-in is a later decision, measured on real installs.
- **Engine processes run inside Electron.** Any child process the operations start with `process.execPath` needs `ELECTRON_RUN_AS_NODE` (the Windows/Linux installer bug fixed on `main`, `dsh-engine-inside-electron`).
- **Paths and homes.** The store, staged versions and plugin data live under the app instance's home (`~/.acryl`, `C:\Users\<user>\.acryl`, `/home/<user>/.acryl`), chosen by the `AppInstance` family, never the install folder, so an app update or reinstall keeps every saved and pulled extension (as the installed snapshot already does).
- **Network as users have it**: proxies, offline, slow links; a pull that fails part-way leaves nothing half-installed.

So every scenario in "Verification" has a column for where it ran, and a build step is not done until its scenarios pass on **installed builds**: the macOS DMG (this Mac), the Windows EXE (mbpi9win) and the Linux DEB (z370n), each on a throwaway home, as well as in development.

## Verification: the real-case matrix (owner, 2026-10-15)

The owner: "it's one of the most important parts of our functionality, to be able to extend the core; this machinery has to work very well; we have to do extensive testing", naming the real case `https://github.com/inboxxobni/acryl-quick-notes` and each operation: pushing to it, pulling from it, updating the version (improving, committing to the remote source), sharing it, publishing to acryl.dev/packages and to cordisplugins.github.io.

### The registries today

- **acryl.dev/packages** (`acryldev/acryldev.github.io`): `scripts/sync-acryl-catalog.mjs` searches npm for the keyword `acryl-package` only. A GitHub-only extension such as quick-notes is not listed until issue 1 ("Catalog: list GitHub-only packages by repository topic acryl-package", open) is done.
- **cordisplugins.github.io** (`cordisplugins/cordisplugins.github.io`): the list is written by hand in `src/lib/registry-data.ts`; there is no sync. Its `Plugin` type already has `provides` and `consumes`, which are exactly the service contract's `provides` and `requires`. It needs a sync like acryl.dev's (GitHub topic `cordis-plugin` plus npm keyword, contract read from each release's `package.json`), so that listing there is a label too, not a pull request.

### The scenarios

Each runs on a throwaway home (`scripts/live-run.mjs` in development; a separate home on the installed builds), never a real one, in development and on the installed DMG, EXE and DEB. "Restart" means a full quit and relaunch, because a plugin that works only until restart is the failure this machinery exists to prevent.

| # | Scenario | Passes when |
| --- | --- | --- |
| S1 | **Create on the fly**: in a fresh app, ask the agent in chat for a notes panel | it builds a source extension from the examples, verify shows its contract, it is ACTIVE live, and after a restart |
| S2 | **Save**: `acryl plugin save`, `/plugin save`, the tool, the Plugins page | the same tarball and sha512 in the store from each face; `list --saved` shows it with its contract |
| S3 | **Pull from the store** into a second app instance with the network off | ACTIVE, and after a restart |
| S4 | **Share to the existing repository** `inboxxobni/acryl-quick-notes` (0.2.2) by the command, not by hand | commit, tag `v0.2.2`, release with the tarball, topics; the downloaded asset has the local sha512; nothing but the tarball's files was checked for secrets and pushed |
| S5 | **Share a new extension** (first share creates the repository) | a private repository in the chosen owner, with the same release shape; not listed anywhere |
| S6 | **Update the version**: improve quick-notes (or Edit a copy of the pulled one), bump, share 0.2.3 | a machine with 0.2.2 sees that 0.2.3 is available, updates, the notes stored in `plugin-data` survive, and the old version can still be pulled |
| S7 | **Pull from GitHub**: `github:inboxxobni/acryl-quick-notes` (latest) and `@0.2.1` (pinned), into clean homes, on Web, Desktop and CLI, on macOS (here), Linux (z370n) and Windows (mbpi9win) | ACTIVE, and after a restart, on every surface and system |
| S8 | **List publicly** | the repository turns public; acryl.dev/packages and cordisplugins.github.io list it on their next refresh with its contract; pulling from each catalog's search result installs it |
| S9 | **The same operation from every face** (CLI, chat command, agent tool, Plugins page) | identical result and identical list rows |
| S11 | **Stock DSH runs ours**: quick-notes' release tarball URL into the stock DSH Desktop app's "Add plugin", on a throwaway DSH home | ACTIVE, the panel works, survives a restart; the catalog shows it as Both |
| S12 | **ACRYL runs theirs**: three popular `dsh-plugin` repositories from dshfind, pulled into ACRYL | each ACTIVE, or the reason named (a missing service, or a DSH sidebar item with no place in ACRYL's frame), recorded as a compatibility gap to fix on our side |
| S10 | **Refusals**, each with a clear message and nothing left half-installed: a tarball whose sha512 does not match; an app missing a required service (the missing service named, with which extension provides it); a secret in the source; a private extension sent to a public target; no `license` on a public target; a raw git spec; an install script without approval; the network cut mid-pull; a version that already exists on the target; an agent push or remote pull without the user's confirmation | each refused as described |

### How the tests are built

- **Unit** (in the gate): the service with fake git, `gh`, fetch and `pluginManager`, for every rule and refusal in S10.
- **Integration** (in the gate, no network): a real engine in a throwaway home; the "remote" is a local bare git repository and a local HTTP server serving a GitHub-shaped release; covers S2, S3, S6, S9 and S10.
- **Installed builds** (before each step is called done): the step's scenarios on the DMG here, the EXE on mbpi9win and the DEB on z370n, from the release artifacts, each result recorded with the build version.
- **Live** (on demand, not in the gate, the owner's `gh` login, on the owner's instruction for each run): S4 to S8 against `inboxxobni`, including the three systems for S7. Each run is recorded in this folder with versions, hashes and timings, like "Verified: the first push" in `spec.md`.

## Decisions for the owner

Answered 2026-10-15: D1 yes, D2 yes, D3 yes, D4 yes, D5 yes, D6 yes, D8 yes. D7 asked for a fuller explanation before deciding.

- **D1. Build on DSH's `pluginManager`** for installing, listing installed plugins, enabling and removing; ACRYL's service adds save, share, pull (fetch, verify, contract) and edit-a-copy, and calls `pluginManager` to install. **Accepted.** It replaces the `acrylExtensions` list/pull design in `spec.md`.
- **D2. One noun: `acryl plugin`**, extended with the verbs above; no `acryl ext`. "Extension" stays only as the folder name `.acryl-extensions/`. **Accepted.**
- **D3. One chat command `/plugin <verb>`**, with `/reload` kept as the short form for source extensions. **Accepted.**
- **D4. The agent pulls from a remote only through a confirmation card.** Store pulls stay direct. **Accepted**; supersedes `spec.md`'s direct `acryl_extension_pull`.
- **D5. Pulled packages are read-only; changing one is "Edit a copy".** **Accepted.**
- **D6. One enable/disable store and one install path**, measured first. **Accepted**; build step 1.
- **D7. What DSH's own "Add plugin" box does inside ACRYL.** **Open.**
  - *Today*: DSH's Plugins page (shown in ACRYL's frame since `db2c496`) has an "Add plugin" box. Whatever is typed there goes to `pluginManager.installBundle`, which runs `pnpm add <what was typed>` in the profile. pnpm accepts a registry name, a folder, a tarball, and a git address (`github:owner/repo`, a repository URL); for a git address it clones the repository's current default branch and installs that. Install scripts wait for the user's approval (DSH's `allowBuilds`).
  - *The difference from ACRYL's pull*: a git address installs whatever the branch holds at that moment, not a released version; there is no checksum to compare; the repository often lacks the built files a plugin needs (they are produced at release time), so it fails or needs a build; and it skips ACRYL's steps (the store copy for offline reuse, the sha512, the service-contract check that names a missing service instead of leaving the plugin in PENDING).
  - *Option A, leave it*: two doors with two rules. ACRYL's pull refuses a raw git address; DSH's box, in the same window, accepts it.
  - *Option B, route it*: in ACRYL the same box sends what is typed to `acrylExtensions.pull`. A registry name, tarball or folder behaves as now plus ACRYL's checks; a git address is resolved to that repository's latest release tarball; a repository with no release is refused with "this repository has no release; ask its author to publish one, or pull a folder". Mechanism to prove first, without editing the submodule: ACRYL provides a `pluginManager` that wraps DSH's and forwards everything except the spec resolution (Cordis provider replacement through profile composition).
  - *Either way* stock DSH is unchanged, and S11 (stock DSH installing ours by release URL) holds.
  - Recommended: B.
- **D8. Stock DSH compatibility is a default, not a promise**: verify and the catalog report Both / ACRYL / DSH stock from the contract; the docs and examples prefer DSH services; ACRYL-only is allowed and labelled. **Accepted.**

## Build order (replaces `spec.md`'s steps 1-4)

0. Service contract: done (`66cf7d43`).
1. D6 investigation: the two enable/disable stores and the three install paths, measured in a throwaway home; decision recorded here.
2. `acrylExtensions` with the adapter registry (targets as plugins) and `save`, `saved()` and `pull` from the store and a tarball file; `installed()` joining `pluginManager` with source extensions; `acryl plugin list --saved`, `acryl plugin save`, `acryl plugin pull`; the contract in `acryl_verify_plugin`. Real case: save quick-notes, pull it into a second app instance offline.
3. Share and List publicly through `@webboxes/app-persistence` (secret check, visibility guard, release tarball, topics), and pull from `github:` with sha512. Real case: quick-notes 0.2.2 shared by the command instead of by hand.
4. The faces: `/plugin` chat command, the agent tools with confirmation cards, the Plugins page Save / Share / List publicly menu and "Add from...". Update the skill `acryl-share-extension` to the methods above (problem 4).
5. Catalogs: acryldev/acryldev.github.io issue 1 (GitHub topic `acryl-package`, release tarball, sha512, contract); a sync for cordisplugins.github.io (topic `cordis-plugin`, contract into its `provides`/`consumes`) in place of the hand-written list; `--available` search. Then S8.
6. npm publish and pull.
