---
name: acryl-build-extension
description: Use when the user asks you to add a feature, tool, panel, command or integration to ACRYL itself (build a plugin or extension). The end-to-end workflow, from reading the docs to a live plugin.
---
# Build an ACRYL extension

1. Read {{pack}}/docs/start-here/this-runtime.md completely (contracts, delivery).
2. Pick the plugin type(s) the feature needs and open the matching doc from {{pack}}/docs/README.md
   (tool, service, event hook, config, prompt, client UI, host route, tui command). Read it completely and
   follow its cross-references.
3. Open the closest working example in {{pack}}/examples/README.md and read every file of it. Copy it into a
   NEW directory outside the pack and change it. Never guess a plugin's shape from memory.
4. Write the package (package.json, cordis.patch.yml, index.js, and client.js for UI).
5. Call the acryl_install_plugin tool with that directory. Read its result. Fix the named cause and call it
   again if it fails; it undoes failed installs.
6. Tell the user what you built, whether it is live, and (for UI) that they should reload the page or window.
   Do not claim it works before the tool result says so. You cannot publish to the marketplace; say what
   remains if the user wants that.
