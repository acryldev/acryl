# acrylblends 1.5.21

Community plugins and Blends are labelled. Released with [create-acrylblends 1.5.21](create-1.5.21.md) and @acryldev/blends-frame 0.1.6 (frame/packages.json).

- **Official or Community in Settings > Plugins > Registry.** Each plugin carries the label the registry gives it: Official when its repository belongs to one of the project's organisations (acrylblends, acryldev, cordisplugins, by their GitHub ids), Community otherwise. A filter shows All, Official or Community; the list puts yours first, then official, then the newest.
- **The question before adding a community plugin says so**: "It is a community plugin: it runs code written by @owner, inside your app, and ACRYL has not reviewed it."
- An index without the label (one written before it) reads as community: nothing is called official that the registry did not call so.

The registries themselves: cordisplugins.github.io and acrylblends.github.io list community plugins and Blends from their own public repositories within the hour (topics `cordis-plugin` and `acrylblends-blend`), with the same labels and a filter. specs/023-community-registries/spec.md has the rules.

An app made with an earlier release gets these with `npx acrylblends upgrade`, then `npm install`.
