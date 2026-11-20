# @acryldev/sandbox

Run untrusted code (agent-written tools) in a child process under Node's permission model: read only its own folder, no child processes, no env, time and memory limits.

## Install

```sh
npm install @acryldev/sandbox
```

It is a Cordis plugin: its peer dependency is `@deepseek-ai/cordis`, and an app registers it as a row of its `blend.yaml`.

## Source and license

Part of [ACRYL](https://github.com/acryldev/acryl): [`plugins/sandbox`](https://github.com/acryldev/acryl/tree/main/plugins/sandbox). MIT license.
