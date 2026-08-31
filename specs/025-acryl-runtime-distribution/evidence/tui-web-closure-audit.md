# TUI and shared Web-host closure audit

## Entry paths

- `acryl` / `acryl tui` runs `acryl-tui/src/host/direct.ts` -> `bootAcrylHarnessProfile()`.
- `acryl web` runs `serveWeb()` -> `bootAcrylWebProfile()`.
- The npm publish build bundles internal `acryl-control`, `acryl-harness-runtime`, and Cordis code into `lib-publish/bin.js`.

## Required dynamic profile bundles

- TUI initializes a named ACRYL profile from `DEFAULT_PROFILE_BUNDLES`: `@deepseek-ai/dsh-base`.
- Web boots the Harness `web` profile, whose shipped template is `@deepseek-ai/dsh-base` plus `@deepseek-ai/dsh-web-app`.
- ACRYL adds `@deepseek-ai/dsh-system-prompt`, `@deepseek-ai/dsh-agent-presets`, `@deepseek-ai/dsh-session-stats`, and `@deepseek-ai/dsh-authorization` rows to terminal boot.

## Required external imports in the publish bundle

`tsdown.publish.config.ts` emits these package imports from `lib-publish/bin.js`:

- `@deepseek-ai/dsh-app-boot`
- `@deepseek-ai/dsh-compaction`
- `@deepseek-ai/dsh-goal`
- `@deepseek-ai/dsh-llm`
- `@deepseek-ai/dsh-session`
- `@earendil-works/pi-tui`
- `diff`

## Exclusions to prove during clean install

The shared CLI does not import Electron/Desktop shell code, `acryl-development-canvas`, `dsh-community-market`, or `pnpm`. They must not be added to the explicit publish manifest unless the final packed-install smoke identifies a transitive Loader requirement.

This audit is the input to the smallest possible replacement for maximal deployed-manifest flattening. The packed candidate smoke, not a static guess, is the final authority for dynamic Loader resolution.
