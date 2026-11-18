# Building this app: the docs

<!-- Generated from docs.json by scripts/build-manifest.mjs. Do not edit here. -->

Read the file for your topic BEFORE implementing. Read it completely, follow its
cross-references and the example it names. Do not guess from memory of a similar
plugin. Verified working examples: `../example-plugins/README.md`.

The rule: every feature is a Cordis plugin of its own, `plugins/<name>/` plus its row in
`blend.yaml`. Never wire a feature into `src/frame.ts`, `src/app.ts` or `src/routes.ts`.

## Start here

| Doc | Read it when | Surfaces | Applies |
| --- | --- | --- | --- |
| [This app: what it is made of and how it runs](start-here/this-app.md) | Always first: blend.yaml and plugins/ are the app, the rule that every feature is a plugin, the frame and npm start, what reloads what, the imports a plugin may use. | frame standalone | all |
| [Verify before done](start-here/verify-before-done.md) | Before you tell the person a feature works: npm test, npm run check and the door's look must agree. | frame standalone | all |
| [Troubleshooting](start-here/troubleshooting.md) | A check failed, the top bar says "Not reloaded", or the feature does not show: the errors this app gives and their fixes. | frame standalone | all |

## Extending the app

| Doc | Read it when | Surfaces | Applies |
| --- | --- | --- | --- |
| [The feature plugin](extending/feature-plugin.md) | Any new feature: the plugins/<name>/ folder, name/inject/apply, its row in blend.yaml, its test. | frame standalone | all |
| [Routes and pages](extending/routes-and-pages.md) | The feature needs a page of its own or an API: an Acryl app on the router, paths and answers. | frame standalone | all |
| [A home widget](extending/home-widget.md) | The feature shows on the app's first screen (the canvas): a widget, its script, escaping. | frame standalone | all |
| [State: data that survives a restart](extending/state.md) | The feature keeps what the person makes (notes, items, settings): a JSON file in the app's home. | frame standalone | all |

## Delivering

| Doc | Read it when | Surfaces | Applies |
| --- | --- | --- | --- |
| [Switch off, change, remove](delivery/switch-and-remove.md) | Asked to switch a plugin off, change or fix one that exists, or remove one. | frame standalone | all |
| [Share, versions and blueprints](delivery/share-and-snapshot.md) | Asked to share or publish a plugin, save or restore a version, or make a blueprint of the app. | frame standalone | all |
