# @acryldev/harness-runtime

ACRYL's runtime around the DeepSeek Harness engine: resolves and composes each surface's profile (the harness plus every ACRYL plugin it runs - the composition root), the app instance and its homes, plugin lifecycle and doctor, the pinned pnpm, and the session bridge.

## Install

```sh
npm install @acryldev/harness-runtime
```

It is a Cordis plugin: its peer dependency is `@deepseek-ai/cordis`, and an app registers it as a row of its `blend.yaml`.

## Source and license

Part of [ACRYL](https://github.com/acryldev/acryl): [`runtime/harness-runtime`](https://github.com/acryldev/acryl/tree/main/runtime/harness-runtime). MIT license.
