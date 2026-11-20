# @acryldev/agent-panel

A chat panel inside the running app: the person writes what they want, the app's own agent (or Claude Code, Codex or pi started in the app folder) builds it through the same door, and the page reloads when a plugin was installed, with no restart. Development only; opt-in with acrylblends add agent-panel.

## Install

```sh
npm install @acryldev/agent-panel
```

It is a Cordis plugin: its peer dependency is `@deepseek-ai/cordis`, and an app registers it as a row of its `blend.yaml`.

## Source and license

Part of [ACRYL](https://github.com/acryldev/acryl): [`plugins/agent-panel`](https://github.com/acryldev/acryl/tree/main/plugins/agent-panel). MIT license.
