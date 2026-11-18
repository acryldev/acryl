# Publishing the frame's packages (slice 1's last item)

`acrylblends init --desktop` installs the frame's packages from npm by the names and versions in `frame/packages.json`, which the CLI bundles at build.
`ACRYLBLENDS_FRAME_PACKAGES` overrides them: a JSON set of `file:` specs for a checkout's unpublished build (what the frame gates use,
`scripts/lib/ide-specs.mjs`), or `none` for a desktop app on the framework alone. This page is the pipeline that turns the packages into npm tarballs and
proves them, and the one file the owner's naming decision moves. The release order is `docs/plans/release-1.2.0.md`.

**Dry run only.** The pipeline runs `npm pack` and stops: it never publishes, never logs in, and never writes outside its scratch folder. `npm publish` is
the owner's step: `@acrylblends/*` publishes into the npm org **`acrylblends`**, which the owner created on 2026-11-05 (webboxescom is its owner).
The publish is one `npm publish <tarball> --access public` per tarball, in dependency order, which `docs/plans/release-1.2.0-publish-frame.sh` runs.

## The one file

`frame/packages.json` holds the scope, the DSH release the packages are built against, and each package folder's short name and version:

```json
{ "scope": "@acrylblends", "dshVersion": "0.2.0-rc.2", "packages": { "acryl-ui": { "name": "ui", "version": "0.3.0" }, ... } }
```

A published name is `<scope>/<name>`. The set is exactly the closure of the frame's rows (`FRAME_PACKAGES` in `packages/cli/src/ide-profile.ts` and
their workspace dependencies), and each version is its folder's `package.json` version; the CLI tests (`packages/cli/test/init-frame.test.ts`) and the
pipeline fail when either drifts. A frame package's version bump is therefore a line here too.

| Folder | Published as | What it is |
| --- | --- | --- |
| `acryl-ui` | `@acrylblends/ui` | the design: themed components, semantic colour roles |
| `dsh-client-ui-brand-acryl` | `@acrylblends/brand-client` | the DSH client brand plugin that paints the mark |
| `acryl-app-shell` | `@acrylblends/app-shell` | the frame: three columns, collapsible and resizable panels, layout state, theme |
| `acryl-workspace` | `@acrylblends/workspace` | Projects, sessions, terminal tabs, the right panel's files and changes |
| `acryl-settings` | `@acrylblends/settings` | the Settings surface and its sections |
| `acryl-sign-in` | `@acrylblends/sign-in` | connect a provider by account |
| `acryl-control` | `@acrylblends/control` | the host control surface the frame talks to |
| `acryl-diagnostics` | `@acrylblends/diagnostics` | diagnostics and support bundles |
| `acryl-plugin-admin` | `@acrylblends/plugin-admin` | plugin lifecycle and architecture routes |
| `acryl-support` | `@acrylblends/support` | support routes and the diagnostics download |
| `acryl-loopback-http` | `@acrylblends/loopback-http` | the loopback HTTP helper the host uses |
| `acryl-web` | `@acrylblends/web` | the web host surface the frame mounts on |
| `acryl-system-prompt` | `@acrylblends/system-prompt` | the agent's prompt, as ACRYL IDE's agent has it |
| `acryl-app-context` | `@acrylblends/app-context` | the app builder's docs and verified example plugins |
| `acryl-versions` | `@acrylblends/versions` | Versions: the branch's commits as save points |
| `acryl-blends-frame` | `@acrylblends/blends-frame` | the Blends frame, the page's root |

The owner confirmed these names on 2026-11-05 (`brand-client` because there are two brand packages, `versions` and `blends-frame` added with the
frame, the rest dropping the `acryl-` prefix). After the first publish a rename is a new package on npm, not a one-line change. `acryl-brand` and `acryl-shortcuts` are not published: the frame mounts
neither and no frame package depends on them.

## What the pipeline checks

`node --import ./scripts/workspace-source.mjs scripts/verify-frame-publish.mjs` (add `--skip-tests` to iterate, `--only <short>` for one package, `--keep`
to keep the scratch folder). For every package:

1. **Built**: `ide/<folder>/lib` exists (the gate's `pnpm run build` makes it).
2. **The original tests**: the package's own `test` script, which is the ported suite, unchanged.
3. **Provenance**: `provenance.json` with `source.repository`, `source.commit`, `ported` and `unchanged`.
4. **Packed**: a staged copy whose `package.json` carries the published name and no `workspace:` range (workspace ranges become `^<version>`), packed with
   `npm pack --json`; every entry of the package's `files` is in the tarball, and the packed name and version are the published ones.
5. **Peers**: `acrylblends`, `@deepseek-ai/cordis` and the `@deepseek-ai/dsh-*` services are peers, never dependencies, so one copy is shared with the host.
   Libraries such as `@deepseek-ai/schemastery` stay ordinary dependencies. Frame packages depend on each other (they ship together).

Then the whole set is installed into a fresh app made the way a person makes one: the built CLI's `init --desktop` with no `ACRYLBLENDS_FRAME_PACKAGES`,
checked to ask for every row by its published name at `^<version>`, the framework at `^<this release>` and DSH at `dshVersion`. Each of those specs is
then pointed at its tarball, and `acrylblends` at this checkout's packed `packages/cli`, so the install is the release itself. The tree must hold one
`@deepseek-ai/cordis` and one `acrylblends`. The app is booted through the host launcher of [the host inversion](ide-host-inversion.md)
(`npm run dev` -> `scripts/ide-host.mjs` on the framework's node server, no DSH profile) on a free port from `ACRYLBLENDS_PORT`: the frame page answers 200
and the app answers at `/app`. Every server is stopped with its process group, its port is checked free, and the gate fails if a process survives.

## What a rename touches in the artifact

The source keeps ACRYL's package names (the port rule); the published artifact carries the configured ones everywhere a name is a module specifier:

- `package.json`: the published `name`, and every dependency/peer/optional/dev entry renamed, with `workspace:` ranges turned into `^<that package's version>`.
- the built JavaScript and declarations: import and export specifiers of a frame package are rewritten (a package built against `acryl-loopback-http` imports
  `@acrylblends/loopback-http` in the tarball), so source maps point at the original source lines.
- `cordis.patch.yml`: the row's `name:` is the published name, quoted because a scoped name starts with `@` (YAML reserves it).
- Loader row ids stay the source package names (`- id: acryl-web` with `name: '@acrylblends/web'`). A row id cannot contain `@` or `/` (DSH refuses to
  parse the overlay), and keeping the source name means a checkout app and a published app have the same rows, so an upgrade between them renames nothing
  and the rows that key on an id (the Blends frame's `appPage`) keep working. The launcher's development hook imports the Blends frame by the name it is
  installed as (`@acrylblends/blends-frame/app-generation`).

Three packages listed `LICENSE` in `files` without carrying the file (`acryl-workspace`, `acryl-plugin-admin`, `acryl-support`); they now carry the source's MIT
notice (WebBoxes s.r.o.), like the other ports.

### One Cordis (settled 2026-11-05)

The framework's `cordis-plugin-include` asks for `~4.0.5`, DSH 0.2.0-rc.2's rows for `~4.0.4`, the frame packages for `^4.0.4`. 4.0.5 satisfies all of
them, and the tree has one copy at runtime: the publish check counts every installed `@deepseek-ai/cordis` (and `acrylblends`) in the fresh app and fails
on more than one. Measured on the tarball install: with the app's generated pin (`4.0.5`, from `ideProfilePlan`) one copy, 4.0.5; without any pin, also
one copy, 4.0.5. Pinning `4.0.4` is not a silent second copy but a refused install (npm ERESOLVE: DSH's own `cordis-plugin-group` 1.0.5 asks `~4.0.5`).
The exact pin stays so that a later 4.0.x on npm is a decision, not an install-time surprise.

Packages written in this repository rather than ported (`acryl-versions`, `acryl-blends-frame`) carry `provenance.json` as
`{original: {repository, commit}, written}`; the pipeline accepts that shape beside the ported ones.

## After the host inversion

The app is hosted by our framework (docs/plans/ide-host-inversion.md): `npm run dev` boots `scripts/ide-host.mjs`, which serves the document and the app's
routes at `/app` on `acryl-node-server` and mounts only DSH's chat/session driver rows, with DSH's client packages as libraries. The published packages keep
their provenance and names; the peer set stays what section "What a rename touches" says (the framework and DSH services are peers, util libraries are
dependencies), and the frame's packages still depend on each other because they ship together.
