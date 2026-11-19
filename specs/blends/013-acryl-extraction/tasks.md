# 013 tasks

A task closes when its evidence is on `main`.

- [x] T200 Deno work moved to branch `012-deno-runtime-experiment` (pushed); `main` reverted to Node (`ef1612f`,
  `129a201`); gate green: 22 tests, `verify-scaffolder: OK`.
- [x] T201 Spec 013 and constitution 5.0.0.
- [x] T202 P1: library shape (`plugins/{instance,http,server,agent}` with `plugin.json`), TypeScript templates on Node
  (`node:http`, `node:test`, no build), `aimbrace add`, `aimbrace plugins`. Evidence: 11 library tests, 17 CLI tests;
  verify: both templates npm-installed, type-checked, tested, booted in a pinned home and stopped. Docs still describe
  the old `.mjs` templates until T208.
- [x] T203 P2: settings, ported from `acryl-settings` (layers, atomic ordered writes, watch, `settings/updated`, settle
  on dispose). Evidence: 6 tests; verify adds it to a fresh app, installs and type-checks.
- [x] T204 P3: extensions, ported from `acryl-extension-context` without pnpm: checks, content-hashed staging and fresh
  import, real fiber state (active, pending with missing services, failed with the error), rollback to the previous
  version on a failed update (and an untouched old version on an import error), remove, reload, ledger, startup pass with
  trust rules, a public `module.registerHooks` resolver for staged imports. Evidence: 9 tests, including two real defects
  found and fixed (an empty staging folder left by remove; mounted extensions not disposed with the plugin).
- [x] T205 P4: builder and agent. `tools` is a lifecycle-owned registry, the scripted model learns commands from other
  plugins (`teach`), runs carry a tool-call trace; `builder` gives the agent confined `write_plugin`, `install_plugin`,
  `read_plugin`, `list_plugins`, `remove_plugin`. Evidence: 7 agent and builder tests; verify, against `npm start`:
  create, update, a broken update that keeps the old version, type check of the agent's code with the app, restart,
  removal.
- [x] T205a P4b (from the Pi Durable comparison): `tasks` plugin (durable records appended before the call returns,
  ownership and cancellation, `interrupted` after a crash, never re-run); agent runs are tasks owning one task per tool
  call; an extension's own `check` must pass before an install counts (stage `verify`, rollback like a failed start);
  the builder's route plugins check their own route; `GET /tasks`, `POST /tasks/cancel`. Evidence: 4 task tests, 1 new
  agent test, 1 new extensions test; verify reads the task records back after a restart.
- [x] T206 P5: manifest, ported from Blends: `aimbrace.yaml` rows (`id`, `use`, `config`, `disabled`), typed parameters
  with `{{parameters.name}}`, diagnostics with a code and a path, `compose` in order with runtime overrides, `npm run
  lock` (manifest digest, rows, values, a digest per plugin folder). Both templates compose from it. A `digest` plugin
  holds the one folder-digest definition that staging and the lock share. Evidence: 5 manifest tests, 1 digest test,
  1 template test; verify runs `npm run lock` in both apps.
- [x] T207 P6: save, ported from `app-persistence`: the use case over git and hosting ports, the secret scan, private apps
  never pushed to a public remote, `npm run save`, a `save_app` tool for the agent. Evidence: 4 tests (one on a real git
  repository); verify saves a scaffolded app, then refuses a file holding an AWS key with nothing left staged.
- [x] T208 P7: docs rewritten for what exists: getting started, the plugin library, extending a running app (the
  extension contract, install stages, trust, the builder), the manifest. The docs test installs the documented example
  extension through the real `extensions` plugin. Evidence: 28 Vitest tests.
- [x] T209 CI green on Node 22 and 24 (`fa4a60e`). It had been red since `611a5d2`: on Linux `/bin/sh` does not pass
  SIGINT to node, so the verify script now interrupts the app's process group, as Ctrl+C does.

- [x] T210 A real model: the `openai` plugin (any OpenAI-compatible API over fetch, tool calls, no SDK), swapped in by
  `AIMBRACE_MODEL_URL`/`AIMBRACE_MODEL`/`AIMBRACE_MODEL_KEY`. Evidence: 3 plugin tests; a template test where a model API
  writes and installs a plugin no scripted command knows, and the app serves it.
- [x] T211 Internal and external plugins: `package_plugin` makes an extension a standalone package (Cordis as a peer);
  `aimbrace add <folder>` brings an external plugin into an app's `extensions/`. Evidence: builder and CLI tests; verify
  packages the agent's plugin in one app and serves it from a second app.

- [x] T212 Proven with a real model (DeepSeek, `deepseek-flash`, run once by hand with the key in the environment only):
  from "build a plugin named clock that adds GET /time", the agent listed plugins, wrote the plugin, installed it, got
  `state: active` from the plugin's own check in about 5 s, and `GET /time` answered; all four task records `completed`.
  The run found a real gap that the fake API could not: a thinking model returns `reasoning_content` with a tool call and
  refuses the next request unless it comes back, even when empty. The run now keeps it per call and sends it back.
  A local `qwen2.5` through Ollama returned empty replies and was not pursued: a small model, not the framework.

Open, recorded (each needs a real app that asks for it): an execution-policy service for
generated code (Gondolin-style isolation); a workflow engine (Absurd-style); the website, which still describes the old
runtime.
