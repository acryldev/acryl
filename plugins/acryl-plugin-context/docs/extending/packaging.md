# Packaging a plugin, and generated capabilities

Example: `../example-plugins/packages/generated-capability-template/`.

Every plugin ships as an npm package:

1. `package.json`: `type: module`, `exports` with `"."` (and `"./client"` for UI) **and
   `"./package.json"`**, `files` including everything referenced, and
   `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`.
2. `cordis.patch.yml`: `- insert: [{ id: <stable-id>, name: <package name> }]`.
3. Dependencies the code imports (`@deepseek-ai/dsh-tools`, `@deepseek-ai/schemastery`, ...).

For a package meant to be shared or published add `"keywords": ["acryl-package"]`, a GitHub
`repository`, a `license`, and `"acryl": { "schemaVersion": 1, "artifacts": { "plugins": ["./index.js"] } }`
(artifact kinds: plugins, extensions (an older name kept by the manifest format), adapters, skills, workflows, blueprints, stemcells; paths relative,
no `..`). Only the marketplace catalog reads these.

A **generated capability** (written by the agent) also records, in the entry file header: what it does,
its permissions (network, filesystem, shell, secrets; least privilege), who generated it and from which
examples, and its mutation class: HOT (a remount is enough), WARM (needs a generation restart) or COLD
(a native swap). The agent only delivers HOT and WARM; it tells the user about COLD.

## Manifest fields for local plugins

Add to the `acryl` block of `package.json` (created for the marketplace catalog, see `../delivery/marketplace.md`):

```json
"acryl": { "schemaVersion": 1, "artifacts": { "plugins": ["./index.js"] }, "apiVersion": 1, "permissions": ["fs.write", "ui"] }
```

`apiVersion` is the ACRYL plugin API the code was written against (currently 1); a plugin that needs a newer one is refused with a message that says so. `permissions` are drawn from
`fs.read`, `fs.write`, `net`, `shell`, `secrets`, `ui`; an unknown word is a lint error so a typo cannot pass as declared. They are shown to the human before a new plugin is installed
(`/reload`), and `acryl_install_plugin` returns them. Declare honestly: they are not enforced by a sandbox, they inform the human's decision.


## Generated fields: the service contract and slots

Three more fields of the `acryl` block are written from the code, never by hand: `requires` (each side's `inject`: the services the app must
provide), `provides` (services the plugin registers) and `slots` (UI places it declares with `children: { 'name': { kind } }` and fills with
`slots.register({ name })` or `slots.inject(name)`). `acryl_prepare_publish` and sharing write them; a catalog shows from them which apps run
the plugin and where it appears, and a pull refuses to install a plugin whose required host services the app lacks.

```json
"acryl": { "requires": { "host": ["connection", "dshHomePath"], "client": ["slots"] }, "provides": { "host": [] }, "slots": { "offers": [], "fills": ["sidebar.footer.action"] } }
```

Prefer a service stock DSH also provides (`dshHomePath` for a data folder) over an ACRYL-only one, so the plugin runs in both apps.

## Saving, sharing and pulling

A plugin's name may have levels separated by dots (`@owner/my-app.sidebar.date-filter`, lowercase, hyphens inside a level). The user saves,
shares and pulls with `/plugin save | share | pull` in the chat or `acryl plugin save | share | pull` on the command line; these send their
work or install code, so they are the user's to type. A fix is a new version (`/plugin version patch <name>`): a released version never changes.
