# The app manifest

`blend.yaml` is the app as data: which plugins it mounts, in what order, with what config. It is written in ACRYL's own Blend
format (`blends.acryl.dev/v1alpha1`) and named the way ACRYL names an app definition, so an app can move into ACRYL without
conversion. The code an app can use stays in `src/app.ts` as a registry of imports (so it type-checks); the manifest chooses,
orders, configures and switches those plugins.

```yaml
apiVersion: blends.acryl.dev/v1alpha1
kind: Blueprint
metadata:
  id: acrylblends.my-app          # dotted id
  name: my-app
  version: 0.1.0
  visibility: private          # anything but public is private; save refuses a public remote
spec:
  runtime: cordis
  parameters:
    hostname: { type: string, default: 127.0.0.1 }
  rows:
    - id: http
      name: http               # id is the slot, name is the plugin it loads
    - id: routes
      name: routes
    - id: server
      name: server
      config:
        hostname: "{{parameters.hostname}}"
    - id: old-feature
      name: routes
      disabled: true           # switched off without touching code
```

- **Rows** mount in order. `id` names the slot; `name` is the registry entry it loads; `config` is the plugin's Cordis config;
  `disabled: true` skips the row.
- **Parameters** (`spec.parameters`) are typed (`string`, `number`, `boolean`). A config value that is exactly
  `{{parameters.x}}` keeps the parameter's type; inside a longer string it is text. `createApp(chosen, { values: { hostname:
  '0.0.0.0' } })` sets one.
- **Runtime values win**: `app.ts` passes what is only known at run time (the port, the extensions folder, the manifest's own
  digest) as overrides.

## Compatible with ACRYL

A test checks both templates' manifests, and a Blend, against ACRYL's own JSON schema (copied from `runtime/blends-core`), so what
this plugin accepts is a valid `blend.yaml`. The lock is ACRYL's own format (below).

## Blueprints and Blends

A **Blueprint** is a definition others build on. A **Blend** is an instance of one: it declares which Blueprint and version it was
made from, and resolves over it.

```yaml
apiVersion: blends.acryl.dev/v1alpha1
kind: Blend
metadata: { id: me.my-shop, name: my-shop, version: 0.1.0 }
spec:
  runtime: cordis
  lineage: { blueprint: acme.shop, blueprintVersion: 1.0.0 }   # which Blueprint, at which version
  overrides:                       # change inherited rows by id; a shallow merge, what you set wins
    - id: server
      config: { port: 8080 }
    - id: routes
      disabled: true
  rows:                            # your own rows, added after the inherited ones
    - id: cache
      name: cache
```

An app finds its Blueprint in `blueprints/<id>.yaml` (`blueprints/acme.shop.yaml`). The rules are ACRYL's: the parent is `extends`, or
a Blend's lineage Blueprint; a parent resolves with its own parameter defaults; an override must name a row the parent has
(`override-unknown-id`); an own row must not reuse a parent row's id (`insert-id-collision`); a missing parent, a cycle, a Blend
without lineage, a Blueprint with one, or overrides without a parent are each a diagnostic.

## Upgrading a Blend

ACRYL records a Blend's `lineage` but does not say what an upgrade is. The prototype's answer: **an upgrade is a plan before it is
an action.**

```sh
npm run upgrade -- --from blueprints/acme.shop.yaml --to acme.shop-1.1.yaml          # the plan
npm run upgrade -- --from blueprints/acme.shop.yaml --to acme.shop-1.1.yaml --apply  # and apply it, if it is safe
```

The plan resolves your Blend over the old and over the new Blueprint and reports:

```text
acme.shop: 1.0.0 -> 1.1.0
the Blueprint changed:
  added   metrics
  changed routes (config)
your overrides hide some of that:
  server: port
your app would change:
  added   metrics
  changed routes (config)
safe to apply
```

- **The Blueprint changed**: rows added, removed, or changed in name, config or disabled.
- **Your overrides hide**: Blueprint changes your overrides cancel, because you set the same key.
- **Your app would change**: the rows your app actually mounts, before and after, so you see the effect and not only the diff.
- **This Blend would break**: the conflicts, as the diagnostics above: an override of a row the new Blueprint removed, or an own row
  whose id the new Blueprint now uses. An upgrade with conflicts is not safe and `--apply` refuses it.

Applying a safe plan moves `spec.lineage.blueprintVersion` and nothing else (the file's comments stay), and puts the new Blueprint in
`blueprints/`. Run `npm run lock` afterwards: the lock records the Blueprint's digest, so an upgrade is a lock diff.

## Diagnostics

Every problem is reported at once, with a code and a path, before anything is mounted:

```text
blend.yaml is not a valid app manifest:
  spec.rows[1].name: no plugin 'ghost' in the app's registry (known: http, routes, server) [unknown-plugin]
  spec.rows[0].config.x: refers to undeclared parameter 'missing' [dangling-parameter-reference]
```

Codes: `parse-error`, `schema-error`, `unsupported`, `duplicate-row-id`, `unknown-plugin`, `dangling-parameter-reference`,
`unused-parameter`, `parameter-type-mismatch`, `parameter-override-unknown`.

## The lock

`npm run lock` writes `blend.lock.json`, formatVersion 3, the same lock ACRYL writes (generated by `@webboxes/blends-core`): the
manifest's id, kind, version and sha256, the Blueprint it was resolved over with that file's digest, the resolved parameter values and
rows, and a `local` module for every folder in `plugins/` (library copies and extensions alike), each with a content digest. The output
is byte-deterministic. Commit it. A diff of the lock is a review of what the app is built from.
