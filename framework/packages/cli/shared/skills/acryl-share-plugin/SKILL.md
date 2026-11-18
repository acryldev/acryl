---
name: acryl-share-plugin
description: Use when the person wants to share, publish or version a plugin of __APP_NAME__, save or restore a version of the app, or make a blueprint of it.
---
# Share a plugin, versions and blueprints

`<docs>` is the builder docs folder that the `acryl_plugin_docs` section of your prompt names (paths below are under it). Read `<docs>/docs/delivery/share-and-snapshot.md`.

The app is `blend.yaml` + `plugins/` + `src/`, and every way it is kept or passed on reads exactly that. A version is a commit the frame
makes after a turn that changed files; the left panel lists and restores them. A plugin is shared from Settings > Plugins > Share on its row: it is
packaged for the CordisPlugins registry and published to a GitHub repository of the person's own account, with their own `gh` login.

1. Make sure it works first (`<docs>/docs/start-here/verify-before-done.md`) and give it a doc comment whose first sentence says what it does.
2. Sharing sends the person's work out under their name: never share, push or publish yourself. Tell them to press **Share** on the plugin's row.
   Never ask for or handle a token.
3. A fix to a plugin that was already shared needs a new version: Share again offers the next patch version and asks first.
