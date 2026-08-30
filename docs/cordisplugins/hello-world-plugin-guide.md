# Hello World: a Cordis plugin for this DSH Desktop repository

> **Status:** R&D learning fixture and coding-agent onboarding material. This
> is not an ACRYL product feature or milestone.

This guide is the smallest practical path from one JavaScript module to a
profile-installed DSH plugin. It targets the versions pinned by this checkout:
DSH Desktop `2.0.2` and `@deepseek-ai/cordis` `4.0.1` (see the
[Desktop package manifest](../../acryl-desktop/package.json)). The pinned
DeepSeek Harness source is the authority when an ecosystem tutorial disagrees
with this guide.

That distinction matters: Harness vendors and locally hardens Cordis, and
renames its packages into the `@deepseek-ai/*` scope. Do not mechanically copy
examples that import `cordis`, import `@cordisjs/*`, or use an older `ctx.use`
API. The fork provenance and local modifications are recorded in the pinned
[vendor manifest](../../deepseek-harness/vendor/README.md); this checkout is at
[Harness source commit `b150a551b8d4`](https://github.com/deepseek-ai/deepseek-harness/tree/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e).

## The model in one minute

A **plugin** is a lifecycle-managed module. In the common module form it
exports `apply(ctx, config?)`; the Loader calls `apply` when the plugin's hard
dependencies are available. A **bundle** is the installable npm package that
ships one configuration patch which inserts that plugin into a DSH
composition. A **profile** is the user's runnable, ordered list of bundles plus
its own final patch.

For an ordinary installable third-party plugin, these are separate things:

```text
profile
  -> lists bundle package in dsh.profile.bundles
     -> bundle declares dsh.bundle.patch
        -> cordis.patch.yml inserts a Loader row
           -> Loader imports the plugin module
              -> Cordis calls apply(ctx)
```

Desktop uses the same bundle and Loader contracts, but its launcher inserts the
Desktop-owned layer into each generation instead of persisting that package in
the user's bundle list. The three registration paths below must not be mixed.

## Path 1: one-off source overlay for learning

The [current official first-plugin tutorial](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/)
creates a TypeScript source module and a separate overlay file:

```yaml
# scratch-plugin/cordis.yml
- insert:
    - id: hello-world
      name: '/absolute/path/to/acryl/scratch-plugin/src/my-plugin.ts'
```

From the pinned `deepseek-harness/` source workspace, the tutorial launches the
Web profile with:

```sh
corepack pnpm dsh web --patch /absolute/path/to/acryl/scratch-plugin/cordis.yml
```

This is an ephemeral development overlay. It does not create a package, does
not add a dependency to a profile, and does not edit
`dsh.profile.bundles`. The module path must be absolute: the patch file's
location does not change the profile directory from which Loader module names
resolve. The pinned source says the same in the
[first Harness plugin walkthrough](../../deepseek-harness/docs/user/develop/basic/index.md).

Use this path to prove `apply(ctx)` runs. Use Path 2 when the plugin should be
installed, removed, updated, or shared.

## Path 2: ordinary third-party bundle and profile registration

Use plain ESM JavaScript for the first exercise. It avoids a build step and
makes the actual runtime contract visible.

```text
dsh-hello-world/
├── package.json
├── index.js
└── cordis.patch.yml
```

`package.json`:

```json
{
  "name": "dsh-hello-world",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./index.js",
  "exports": "./index.js",
  "files": ["index.js", "cordis.patch.yml"],
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml"
    }
  }
}
```

`index.js`:

```js
export const name = 'hello-world'

export function apply(ctx) {
  ctx.logger.info('[hello-world] Hello from Cordis!')
}
```

`cordis.patch.yml`:

```yaml
- insert:
    - id: hello-world
      name: dsh-hello-world
```

That is a complete Host plugin bundle. `name` in `index.js` is optional
diagnostic metadata. The row's `name` is the package specifier that the Loader
imports. Keep the row `id` stable and distinctive so later patches and HMR can
identify it. The exact three-file shape is also the one taught by the pinned
[DSH publishing tutorial](../../deepseek-harness/docs/user/develop/basic/publish.md).

Do not omit `dsh.bundle.patch`. A package without that declaration can be
installed as a plain dependency, but `dsh plugin` will not add it as an active
profile layer. Also ship the referenced patch in `files`; a manifest that
points at a file excluded from the tarball is not a usable bundle.

### Run it in the current Desktop setup

The outer repository is a Yarn 4 workspace; the pinned
`deepseek-harness/` checkout remains its own pnpm workspace. From the repository
root, prepare the supported toolchains and build Desktop with the root scripts:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm upstream:install
corepack pnpm upstream:build
corepack pnpm build
```

Start the graphical application only when you intend to open it:

```sh
corepack pnpm dev
```

In DSH Desktop, choose **Open DSH Terminal**. That terminal supplies the pinned
`dsh`, `pnpm`, and Node shims and defaults bare plugin commands to the active
profile. From the directory containing `dsh-hello-world/`, run:

```sh
dsh plugin add ./dsh-hello-world
dsh --dump-config
```

The dump should contain the `dsh-hello-world` layer and the `hello-world` row.
Restart Desktop after adding, removing, or updating a bundle; bundle membership
is fixed for a running generation. Then inspect the Desktop log for
`[hello-world] Hello from Cordis!`. Remove the exercise with:

```sh
dsh plugin remove dsh-hello-world
```

An explicit profile is equivalent when using an ordinary DSH terminal:

```sh
dsh plugin --profile desktop add ./dsh-hello-world
dsh --profile desktop --dump-config
dsh plugin --profile desktop remove dsh-hello-world
```

The product command deliberately forwards package work to pnpm in the selected
profile and reconciles `dsh.profile.bundles`; do not replace it with `pnpm add`
in the outer PNPM workspace. Relative `file:`/`link:` paths are anchored to the
directory in which `dsh plugin` was invoked. The implementation is documented
in the pinned [CLI reference](../../deepseek-harness/apps/cli/reference/README.md)
and [plugin command source](../../deepseek-harness/apps/cli/src/plugin.ts).

For a headless repository confidence check, run the existing complete profile
Loader smoke (it uses a real profile-local third-party package fixture and does
not open Electron):

```sh
corepack pnpm --filter acryl-desktop run build
corepack pnpm --filter acryl-desktop run verify:profile
```

That smoke validates the current Desktop composition and public Host services;
it does not replace a focused test for the behavior of your own plugin. See the
[fixture](../../acryl-desktop/tests/fixtures/desktop-host-services-smoke-plugin/index.js)
and [smoke runner](../../acryl-desktop/scripts/verify-profile-boot.mjs).

## Path 3: ACRYL Desktop's built-in registration

This repository's Desktop shell is not discovered through a special Electron
plugin registry. It is registered through normal DSH package and Cordis
surfaces:

1. The package export `acryl-desktop` maps to `lib/index.js`, whose source
   is [src/index.ts](../../acryl-desktop/src/index.ts) and exports the Host
   plugin's `name`, `inject`, schema, and `apply(ctx, config)`.
2. The package manifest declares
   `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }` and ships the
   patch; see [package.json](../../acryl-desktop/package.json).
3. [cordis.patch.yml](../../acryl-desktop/cordis.patch.yml) inserts the
   `desktop-shell` row with `name: acryl-desktop`, plus the Desktop-owned
   Hello World, terminal, development-canvas, diagnostics, notification, pnpm,
   profile, and update rows through exported package subpaths. The learning
   proof is implemented by
   [src/hello-world.ts](../../acryl-desktop/src/hello-world.ts), exported
   as `acryl-desktop/hello-world`, and registered under the stable
   `desktop-hello-world` row.
4. During profile preparation, the launcher reads that patch and inserts it
   immediately after `@deepseek-ai/dsh-web-app`; it does not persist the
   Desktop package into the selected profile's bundle list. See the exact
   composition in [profile.ts](../../acryl-desktop/src/profile.ts).

The Host row is part of both compatibility and advanced generations. The
package also declares an ordinary Web Client face exported at `./client`.
Its [Client entry](../../acryl-desktop/src/client/index.ts) registers the
shared Desktop contributions in both modes and mounts the Desktop-owned layout
and root presentation only when `environment.mode === 'advanced'`. Thus mode
changes presentation composition, not the Cordis plugin contract.

Electron changes the **launch path**: it selects a profile, provides
generation-scoped native services, boots the Host root, and loads the ordinary
loopback Web surface in a sandboxed BrowserWindow. It does not change how a
plugin declares `apply`, config, `inject`, services, effects, package exports,
or Loader rows. Third-party Host plugins and Web Client modules therefore keep
using standard DSH contracts in both modes. The repository
[Desktop architecture](../architecture.md) and
[package architecture](../../acryl-desktop/README.md) own this boundary.

### Compatibility requirements for a future ACRYL rename

A future product/package rename should treat the DSH composition format as a
compatibility contract, not as branding to rewrite freely. Retain:

- the `dsh.bundle.patch` manifest shape and a shipped patch file;
- loadable package exports for every module specifier named by patch rows;
- coherent `dsh.client` metadata and a loadable `./client` export for the
  browser face;
- stable Loader row ids, because user and home patches address those ids;
- `dsh.profile.bundles`, profile-local dependencies, layer order, and ordinary
  `dsh plugin` reconciliation semantics;
- migration or compatibility aliases for persisted old package names and patch
  module specifiers if the npm identity changes;
- compatibility exports for the public `profile-service` and `pnpm` contract
  paths while third-party consumers migrate.

In other words, ACRYL may rename the application and its package, but an existing
profile must still resolve its recorded bundle identities and every exported
specifier referenced by the effective patch—or be migrated explicitly before
boot. Do not invent an ACRYL-only plugin manifest. The pinned
[profile implementation](../../deepseek-harness/packages/boot/app-boot/src/profile.ts),
[plugin command](../../deepseek-harness/apps/cli/src/plugin.ts), and
[publishing tutorial](../../deepseek-harness/docs/user/develop/basic/publish.md)
define the compatibility surface to preserve.

## Lifecycle rule: every effect must reverse

The Hello World module acquires no external resource, so it needs no disposer.
As soon as a plugin starts a timer, watcher, socket, subprocess, external
subscription, or native registration, acquire it inside `ctx.effect()` and
return its cleanup:

```js
export const name = 'hello-heartbeat'

export function apply(ctx) {
  ctx.effect(() => {
    const timer = setInterval(() => {
      ctx.logger.info('[hello-heartbeat] still active')
    }, 5_000)

    return () => clearInterval(timer)
  }, 'hello-world heartbeat')
}
```

Cordis-owned registrations such as `ctx.on(...)`, child plugins created with
`ctx.plugin(...)`, and services are already effects. Raw platform resources are
not. A plugin can unload during HMR, a patch edit, generation shutdown, or loss
of a required service; cleanup must work in every case. If teardown operations
must be ordered, keep them in one async disposer and await them in sequence,
because separate async disposers may run concurrently. The pinned
[lifecycle tutorial](../../deepseek-harness/docs/cordis-tutorial/02-lifecycle-and-effects.md)
defines these semantics.

## Services and `inject` are different concepts

A **service** is a named callable capability supplied by a provider. `inject`
is a consumer's declaration that one or more services are hard dependencies.
It is not a startup-order hint.

```js
// Consumer plugin
export const name = 'hello-consumer'
export const inject = ['greeter']

export function apply(ctx) {
  ctx.logger.info(ctx.greeter.greet('ACRYL'))
}
```

Cordis keeps this consumer `PENDING` until a provider registers `greeter`.
Inside `apply`, `ctx.greeter` is therefore available. If the provider later
unloads, Cordis unloads the consumer and reverses its effects; if the service
returns, the consumer activates again. Loader row order does not provide this
guarantee—service availability does. For a capability the plugin can live
without, omit it from `inject` and probe it at the use site:

```js
export function apply(ctx) {
  const metrics = ctx.get('metrics')
  metrics?.record('hello_world_loaded', 1)
}
```

Use a service when another plugin needs to invoke a stable capability. Use an
event when other plugins only need to observe or intercept something without a
direct capability call. Prefer a `Service` subclass when publishing a typed,
callable API; declaration merging supplies TypeScript safety, while the runtime
service registration supplies the capability. The complete provider/consumer
pattern is in the pinned [services tutorial](../../deepseek-harness/docs/cordis-tutorial/03-services.md).

Do not access `ctx.someService` without declaring it as a hard injection.
Cordis's guard may reject undeclared service access. Conversely, do not add an
optional service to `inject` merely to avoid an `undefined` check: doing so can
turn an otherwise healthy plugin into a permanently pending one.

## Optional typed configuration

The zero-config Hello World is the right first plugin. When deployments need a
tunable greeting, export a TypeScript `Config` type and a same-named
Schemastery schema; Cordis validates the row config and fills schema defaults
before `apply` runs:

```ts
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

export interface Config {
  greeting: string
}

export const Config: Schema<Config> = Schema.object({
  greeting: Schema.string().default('Hello from Cordis!'),
})

export function apply(ctx: Context, config: Config): void {
  ctx.logger.info(`[hello-world] ${config.greeting}`)
}
```

```yaml
- insert:
    - id: hello-world
      name: dsh-hello-world
      config:
        greeting: Hello from ACRYL!
```

Do not export a plain object under `Config`; Cordis expects a Standard
Schema-compatible schema. A TypeScript package must publish built JavaScript
and declarations. A Git install fetches source, so its `prepare` build requires
an explicit pnpm `allowBuilds` grant; an npm release or built tarball avoids
that install-time build. See the pinned
[configuration guide](../../deepseek-harness/docs/user/develop/basic/config.md)
and [publishing guide](../../deepseek-harness/docs/user/develop/basic/publish.md).

## `cordis.patch.yml`, bundles, and profile layers

For an installed plugin, `cordis.patch.yml` belongs to the **bundle** and the
bundle's `package.json` points to it through `dsh.bundle.patch`. `dsh plugin`
then adds the package to the selected profile's ordered
`dsh.profile.bundles`. The effective DSH configuration applies:

1. bundle patches in profile order;
2. the profile's own `cordis.patch.yml`;
3. `$DSH_HOME/cordis.patch.yml`;
4. explicit `--patch` overlays in command-line order.

Later layers win per Loader row. A patch replaces a row's complete `config`
value rather than deep-merging it, so an override must restate every config key
that row still needs. In this Desktop, the launcher prepares the chosen Web
profile, keeps third-party bundle order, inserts the Desktop layer into the
generation, and boots from an empty include root; the exact implementation is
in [profile.ts](../../acryl-desktop/src/profile.ts).

## Failure diagnostics

### The plugin prints nothing

First run `dsh --dump-config` for the active profile.

- No bundle layer: verify `package.json` contains a valid `dsh.bundle.patch`,
  the patch is shipped, and the package appears in the profile's
  `dsh.profile.bundles`. Install through `dsh plugin`, not raw root PNPM.
- Layer exists but row is absent: check the YAML patch shape and row `id`.
- Row exists but module is unresolved: check the exact package/path spelling
  and package exports. A resolution error can occur before a console logger is
  observing startup, so “no message” is not proof the module loaded.
- Row is disabled: inspect later profile, home, and `--patch` layers.
- Bundle was just added/removed/updated: restart the profile generation.

### The fiber is `PENDING`

`PENDING` is a valid lifecycle state: at least one hard injected service is not
available yet. It is not fixed by moving the row earlier in YAML. Compare every
name in `inject` with an actual provider in the same service realm. Remove an
injection only if the capability is truly optional; otherwise mount the correct
provider. A pending fiber does not keep Node alive, so an otherwise empty
headless composition can exit successfully without running `apply`.

For a focused diagnosis, temporarily add a diagnostic plugin that enumerates
`ctx.registry`, checks `fiber.state === FiberState.PENDING`, and prints the
fiber names. The pinned
[composition/HMR tutorial](../../deepseek-harness/docs/cordis-tutorial/06-composition-and-hmr.md)
contains a runnable diagnostic. In an agent profile that explicitly composes
the optional Cordis inspection toolset, use its advertised read-only inspect
providers; do not assume those tools exist in every shipped profile.

### The fiber is `FAILED`

`apply` threw, configuration validation failed, a service name collided, or
the composed rows are invalid. Read the first cause, not only the later
dependent `PENDING` symptoms. Common causes are a plain-object `Config`, an
undeclared `ctx.service` access, duplicate Loader row ids, or two providers
publishing the same non-isolated service name. Desktop rejects duplicate row
ids before boot; choose a package-qualified id rather than overwriting another
plugin accidentally.

### It works once, then duplicates behavior after reload

The plugin created process/page state outside `apply`, or acquired an external
resource without an effect disposer. Move acquisition into `ctx.effect()` and
make cleanup idempotent. Never retain a Desktop service, BrowserWindow, timer,
or subprocess handle across a generation restart.

### It works in Desktop but not ordinary DSH—or the reverse

The only supported third-party Desktop Host services are `desktopProfiles` and
`desktopPnpm`, exported by `acryl-desktop/profile-service` and
`acryl-desktop/pnpm`. A Desktop-only plugin may hard-inject them. A plugin
that must also run under ordinary DSH should detect `desktopProfiles` with
`ctx.get(...)` and mount its Desktop adapter inside a nested
`ctx.inject(['desktopPnpm'], ...)`, while retaining an ordinary DSH fallback.
Do not infer the Desktop profile from argv, settings, a URL, or `$DSH_HOME`.
The exact supported boundary and teardown semantics are in the
[Desktop plugin-service contract](../../acryl-desktop/docs/plugin-services.md)
and the repository's [plugin-development note](../plugin-development.md).

## Current contracts versus proposals

Safe dependencies for a plugin in this checkout are:

- the pinned `@deepseek-ai/cordis` plugin, lifecycle, service, injection,
  event, and Loader contracts;
- DSH package contracts documented by the pinned source;
- normal `dsh.bundle`, profile, and patch semantics;
- for Desktop-specific Host code, only `desktopProfiles` and `desktopPnpm` as
  documented above;
- for browser UI, ordinary DSH Host routes/RPC plus Web Client metadata,
  services, and slots—not Electron APIs or a new renderer IPC system.

Do **not** code against the proposed Community Fabric manifest, Host Descriptor,
capability negotiation, unified event vocabulary, compatibility badge, effect
ledger, or conformance API. Community Fabric is currently a documentation-only
RFC with no runtime, SDK, or released schema in this workspace; working plugins
still use existing DSH/Cordis APIs. See its explicit
[status statement](../../dsh-community-fabric/README.md).

The Community Market is a real Desktop component, but catalog membership is
discovery metadata—not proof of safety or compatibility. Its current boundary
and the reviewed dshfind/1024Store adapters are documented in the
[Market README](../../dsh-community-market/README.md). The public
[dshfind repository](https://github.com/hikariming/dshfind) describes a catalog
generated from the `dsh-plugin` GitHub topic, while
[DSH 1024Store](https://github.com/imsai-sh/awesome-deepseek-harness-plugins)
checks basic repository structure such as `package.json`, `dsh.bundle`, and the
declared patch path. Its own contribution contract explicitly describes this
as static validation rather than runtime or security validation
([catalog contribution rules](https://github.com/imsai-sh/awesome-deepseek-harness-plugins/blob/90e3f5852663daa116ca310518eb8c01dec56151/CONTRIBUTING.md)).
Use [dshfind.com](https://dshfind.com/en) and
[deepseek1024.com](https://deepseek1024.com) to discover candidates, then
inspect the candidate's source, exact version, lifecycle scripts, bundle
manifest, patch, dependencies, and compatibility before installing it.
Directory inclusion is neither a security audit nor a replacement for the
pinned DSH contracts. In particular, dshfind learning material currently
contains examples from a different Cordis/API snapshot; treat it as conceptual
secondary reading and translate every technical detail back to the pinned DSH
source.

## Primary references used

- [Current official first-plugin tutorial](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/)
- [Pinned first Harness plugin](../../deepseek-harness/docs/user/develop/basic/index.md)
- [Pinned package-and-profile tutorial](../../deepseek-harness/docs/user/develop/basic/publish.md)
- [Pinned Cordis first-plugin tutorial](../../deepseek-harness/docs/cordis-tutorial/01-first-plugin.md)
- [Pinned lifecycle/effects tutorial](../../deepseek-harness/docs/cordis-tutorial/02-lifecycle-and-effects.md)
- [Pinned services tutorial](../../deepseek-harness/docs/cordis-tutorial/03-services.md)
- [Pinned Loader implementation notes](../../deepseek-harness/vendor/loader/README.md)
- [Repository Cordis architecture specification](../cordis/cordis_spec.md)
- [Desktop public plugin services](../../acryl-desktop/docs/plugin-services.md)

Repository discovery for this guide used direct source reads because the
codebase knowledge graph was unavailable. No file under the pinned
`deepseek-harness/` checkout was modified.
