# @acryldev/desktop-web

Run a plain Acryl app (`export default app`) as a desktop app: an Electron window on the app's own server. `npm run desktop`; the app's code never imports electron. `acrylblends add desktop` picks this one for an app without the Blend plugins.

## Install

```sh
npm install @acryldev/desktop-web
```

It is a Cordis plugin: its peer dependency is `@deepseek-ai/cordis`, and an app registers it as a row of its `blend.yaml`.

## Source and license

Part of [ACRYL](https://github.com/acryldev/acryl): [`plugins/desktop-web`](https://github.com/acryldev/acryl/tree/main/plugins/desktop-web). MIT license.
