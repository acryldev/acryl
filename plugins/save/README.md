# @acryldev/save

Save the app to its own git repository, and share it: a repository of its own on GitHub, created and pushed only after a person confirms the plan. Refuses a file that holds a secret, and a private app going to a public remote.

## Install

```sh
npm install @acryldev/save
```

It is a Cordis plugin: its peer dependency is `@deepseek-ai/cordis`, and an app registers it as a row of its `blend.yaml`.

## Source and license

Part of [ACRYL](https://github.com/acryldev/acryl): [`plugins/save`](https://github.com/acryldev/acryl/tree/main/plugins/save). MIT license.
