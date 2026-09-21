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
(artifact kinds: plugins, extensions, adapters, skills, workflows, blueprints, stemcells; paths relative,
no `..`). Only the marketplace catalog reads these.

A **generated capability** (written by the agent) also records, in the entry file header: what it does,
its permissions (network, filesystem, shell, secrets; least privilege), who generated it and from which
examples, and its mutation class: HOT (a remount is enough), WARM (needs a generation restart) or COLD
(a native swap). The agent only delivers HOT and WARM; it tells the user about COLD.

## Manifest fields for local extensions

Add to the `acryl` block of `package.json` (created for the marketplace catalog, see `../delivery/marketplace.md`):

```json
"acryl": { "schemaVersion": 1, "artifacts": { "plugins": ["./index.js"] }, "apiVersion": 1, "permissions": ["fs.write", "ui"] }
```

`apiVersion` is the ACRYL extension API the code was written against (currently 1); an extension that needs a newer one is refused with a message that says so. `permissions` are drawn from
`fs.read`, `fs.write`, `net`, `shell`, `secrets`, `ui`; an unknown word is a lint error so a typo cannot pass as declared. They are shown to the human before a new extension is installed
(`/reload`), and `acryl_install_plugin` returns them. Declare honestly: they are not enforced by a sandbox, they inform the human's decision.

