---
name: acryl-share-extension
description: Use when the user wants to save, share, publish, list publicly or version a plugin, or pull one from GitHub, npm, a file or the plugin store.
---
# Save, share and pull plugins

A plugin travels as one tarball with a sha512. Where it can go: the plugin store on this machine, the user's own GitHub repository (one per
plugin, private unless they list it publicly), npm (optional). Catalogs (acryl.dev, cordisplugins.github.io, dshfind) list a public repository
by its labels; nobody submits anything.

1. Make sure it works first: installed with acryl_install_plugin and verified with acryl_verify_plugin.
2. For anything public it needs a "license" in package.json. A fix needs a new version: suggest `/plugin version patch <name>`.
3. These commands are the user's, typed in the chat, because they send their work or install code that runs with their permissions. Tell the
   user the exact command and what it will do; never run them yourself and never ask for or handle a token (git and gh use the user's own login):
   - `/plugin save <name>`: keep this version in the plugin store.
   - `/plugin share <name>`: release it to their own GitHub repository (private). `/plugin share <name> public` lists it publicly.
     Optional `<owner>/<repo>` names the repository. Share writes the service contract, the labels and the repository into package.json,
     runs the secret check over exactly the files it sends, and refuses a version that is already released.
   - `/plugin pull <source>`: `github:<owner>/<repo>[@version]`, `npm:<name>`, `store:<name>`, a .tgz file or https URL.
   - `/plugin list`, `/plugin saved`: what is installed, what is kept.
4. The same verbs exist on the command line: `acryl plugin save | share | pull | saved | version`.
