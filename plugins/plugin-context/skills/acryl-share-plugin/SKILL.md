---
name: acryl-share-plugin
description: Use when the user wants to save, share, publish, list publicly or version a plugin, or pull one from GitHub, npm, a file or the plugin store.
---
# Save, share and pull plugins

A plugin travels as one tarball with a sha512. Where it can go: the plugin store on this machine, the user's own GitHub repository (one per
plugin, private unless they list it publicly), an npm registry (the public one, or a private one the user names; a private plugin needs a
scope, @owner/name). Catalogs (acryl.dev, cordisplugins.github.io, dshfind) list a public repository
by its labels; nobody submits anything.

1. Make sure it works first: installed with acryl_install_plugin and verified with acryl_verify_plugin.
2. For anything public it needs a "license" in package.json. A fix needs a new version first (acryl_plugins action version, bump patch).
3. Your tool is acryl_plugins. Its actions saved, save and version run directly (they stay on this machine); share, and pull from anywhere
   but store:, ask the user in the app first, because they send the user's work or
   install code that runs with their permissions; if the user does not allow it, do not retry: tell them the command they can type instead.
   Never ask for or handle a token (git and gh use the user's own login). Share writes the service contract, the labels and the repository
   into package.json, runs the secret check over exactly the files it sends, and refuses a version that is already released. To publish to
   npm instead of GitHub, share with to "npm" (or "npm:<registry URL>"); it uses the user's own npm login.
4. The user's own commands, the same operations: in the chat `/plugin save | share <name> [public] [owner/repo] | share <name> npm [public]
   [registry URL] | pull <source> | version patch <name> | list | saved`; on the command line `acryl plugin save | share [--npm] | pull |
   saved | version`. A source is
   `github:<owner>/<repo>[@version]`, `npm:<name>`, `store:<name>`, a .tgz file or https URL.
