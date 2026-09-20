# Packaging a plugin, and generated capabilities

Example: `../examples/packages/generated-capability-template/`.

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
