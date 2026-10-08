# 042 dependency cut: what ships, what a session loads, what is really removable

**Date**: 2026-10-08. **Status**: measured on this machine (macOS arm64); every number below comes from the three probes in `probes/`
(`dep-inventory.mjs`, `packaged-inventory.mjs`, `dep-trace.mjs`) and can be rerun. **Builds on**: [deno-findings-and-plan.md](./deno-findings-and-plan.md)
(F1 said the 263 MB of dependencies is a long tail and that Option B needs "a dependency cut to about 100 MB"; this page measures how much of it can go).

## Method and its limits

1. **Dev closure** (`dep-inventory`): `pnpm --filter acryl-desktop list --prod --depth Infinity --json` gives 788 packages and 894 MB, but that is *every platform's*
   native files at once (both macOS architectures of `libreoffice-kit` 316 MB and `sherpa-onnx` 72 MB, six `sharp` libvips builds, five `ripgrep` builds). It is not
   what ships; the packager prunes to one platform.
2. **Shipped set** (`packaged-inventory`): the installed `ACRYL.app`'s `app.asar.unpacked/node_modules`: 697 packages, 214 MB of package files (about 265 MB on disk).
   **Limit**: the installed app is the older 0.1.5-alpha release, not the 0.2 branch; names are joined with the trace by package name.
3. **Load trace** (`dep-trace`): a Node preload (`module.registerHooks` plus `process.dlopen`) records every module the process loads. Scenario: isolated home, the web
   server boots the real profile, one real DeepSeek turn that calls a tool, then the Plugins page is opened. 1,777 files from 377 packages.
   **Limits**: one provider only; browser-side packages (React, shiki, xterm, CodeMirror, lexical, katex) are served as files and never imported by Node, so they are
   counted as "client-side, assumed needed"; ACRYL's own packages load from workspace paths and are counted as "own".

## Result: the 214 MB shipped set

| Class | MB | Note |
|---|---|---|
| Loaded by Node in the traced session | 75.6 | includes `sharp` and its libvips (17.8), `node-pty`, the OpenTelemetry convention and metrics packages (about 10), `pi-ai` |
| Client-side (served to the browser) | 37.0 | assumed needed |
| ACRYL's own packages | 19.6 | the workspace client bundle is 11.5 of it |
| `pnpm` | 13.2 | spawned for plugin installs, never imported: **essential to self-extension** |
| **Not loaded, not client, not ACRYL's** | **69.0** | the candidates below |

The 69 MB of candidates, by family:

| Family | MB | Why it is there |
|---|---|---|
| Google / genai stack and its HTTP polyfills (`web-streams-polyfill` 9.0 arrives only through `@google/genai`, then `gaxios`, `node-fetch`) | about 28 | `pi-ai` |
| `openai` SDK | 7.6 | `pi-ai` |
| `@anthropic-ai/sdk` | 7.1 | `pi-ai` |
| ACP and MCP SDKs | 5.9 | agent providers, MCP clients |
| AWS Bedrock stack (`@aws-sdk`, `@smithy`) | 3.0 | `pi-ai` |
| `koffi` native | 2.2 | Windows interop |
| long tail (239 packages, none above 2.2 MB; `dshmarket` 2.2, `typebox` 1.4, `hono` 1.0) | 13.8 | no single win |

## What this means

- **The removable part is provider SDKs: about 50 MB (23% of the shipped dependencies), and all of it comes through one upstream package, `@earendil-works/pi-ai`
  (via `@deepseek-ai/dsh-llm-pi-ai`).** `pi-ai` imports each SDK lazily, which is why a DeepSeek session never loads them. They would be fetched on demand by the
  install machinery ACRYL already ships (bundled `pnpm`, `acryl_install_plugin`), which also fits "DeepSeek Harness is one of several providers".
  **Unverified**: that `pi-ai` can be installed without them and pull them in when a provider is chosen. The DSH submodule cannot be edited, so this is a packaging
  and composition question (a provider replacement through the profile), not a patch.
- **`sharp` (17.8 MB) is loaded at boot**, from ACRYL's own market (`plugins/cordis-plugin-market/src/media/normalize-image.ts`). A lazy `import()` plus an on-demand
  install would take it out of the shipped set. ACRYL-owned, so no upstream dependency.
- **OpenTelemetry (about 10 MB) is loaded although telemetry is disabled** (`DSH_TELEMETRY_DISABLED`): upstream imports it unconditionally. Not ours to change.
- **The long tail has no easy cut.** 239 packages, 13.8 MB, nothing above 2.2 MB.

## The size goal, with the arithmetic

| Shape | Projection |
|---|---|
| Today (Electron 228 + dependencies 265 on disk) | 500 MB (measured) |
| Provider SDKs and `sharp` on demand (about 68 MB of package files, about 80 MB on disk) | about 420 MB with Electron |
| Same, Deno desktop shell (65 MB) with the host still on a bundled Node (about 110 MB) | about 370 MB |
| Same, host also on Deno | about 330 MB, **and the host gaps in F3/F4 open** |

**Dependency cuts alone do not reach 100 to 200 MB under any runtime**: the dependencies that remain after every cut found here are about 120 to 150 MB on disk by
themselves. The 042 projection of "about 165 MB" assumed a cut to 100 MB that this measurement does not support. The cheap and safe step (provider SDKs and `sharp` on
demand, about 80 MB) is worth doing for its own sake and for the provider story; the 100 to 200 MB target needs the shell **and** host decisions, which is where the Deno
risk sits (F3, F4).

## Rerun

```bash
corepack pnpm --filter acryl-desktop list --prod --depth Infinity --json > deps.json
node specs/042-acrylruntime-optimization-deno-experimental/probes/dep-inventory.mjs deps.json
node specs/042-acrylruntime-optimization-deno-experimental/probes/packaged-inventory.mjs <app>/Contents/Resources/app.asar.unpacked/node_modules --json packaged.json
# traced, isolated session (HOME, ACRYL_HOME and the port are throwaway; see the probe safety rules in deno-findings-and-plan.md)
DEP_TRACE_OUT=loaded.json node --import specs/042-.../probes/dep-trace.mjs apps/acryl-web/lib/bin.js --no-open --port <spare>
```
