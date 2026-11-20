# @acryldev/desktop-shell

Run the app as a desktop app: an Electron window on the app's own server. `npm run desktop`; the app's code never imports electron.

## Install

```sh
npm install @acryldev/desktop-shell
```

It is a Cordis plugin: its peer dependency is `@deepseek-ai/cordis`, and an app registers it as a row of its `blend.yaml`.

Its `electron` peer dependency is installed by the app that opens the window.

## Source and license

Part of [ACRYL](https://github.com/acryldev/acryl): [`plugins/desktop-shell`](https://github.com/acryldev/acryl/tree/main/plugins/desktop-shell). MIT license.
