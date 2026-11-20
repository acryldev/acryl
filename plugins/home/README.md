# @acryldev/home

The app's home page as a place plugins put their widgets: a plugin registers a widget in ctx.effect, the page renders it, and it leaves with the plugin.

## Install

```sh
npm install @acryldev/home
```

It is a Cordis plugin: its peer dependency is `@deepseek-ai/cordis`, and an app registers it as a row of its `blend.yaml`.

## Source and license

Part of [ACRYL](https://github.com/acryldev/acryl): [`plugins/home`](https://github.com/acryldev/acryl/tree/main/plugins/home). MIT license.
