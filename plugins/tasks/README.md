# @acryldev/tasks

Durable task records: id, owner, input, status, result, trace; appended to a log in the app's home and readable after a restart.

## Install

```sh
npm install @acryldev/tasks
```

It is a Cordis plugin: its peer dependency is `@deepseek-ai/cordis`, and an app registers it as a row of its `blend.yaml`.

## Source and license

Part of [ACRYL](https://github.com/acryldev/acryl): [`plugins/tasks`](https://github.com/acryldev/acryl/tree/main/plugins/tasks). MIT license.
