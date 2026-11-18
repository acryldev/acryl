# 012 plan

## Phase 1: the framework is `@deepseek-ai/cordis` (extraction)

- Templates: dependency `@deepseek-ai/cordis` 4.0.4 in place of `cordis`; imports updated.
- CLI dev dependency and the docs test: the same package, so docs examples run against it.
- Verify script and CLI test: the single allowed runtime dependency is `@deepseek-ai/cordis`.
- Constitution 3.1.0: principle III names the package.

## Phase 2: the builder

- `workspace` service: the project root and `src/plugins/`; refuses paths outside it.
- `files` plugin registers `list_files`, `read_file`, `write_file` in `tools`.
- `mount` plugin registers `mount_plugin`: fresh import (cache-busting query), `ctx.plugin`, settle, report state.
- `app.mjs` mounts every `src/plugins/*.mjs` after the built-in plugins.
- Mock model scripted: "build a plugin that answers GET /hello" writes `hello.mjs`, mounts it, answers.
- Optional `openai-compatible` model plugin using `fetch`, off by default.

## Phase 3: persistence and reload (only if Phase 2 shows the need)

- Loader and `include` for a `cordis.yml` of mounted plugins; `hmr` for edits. Adds `chokidar`, `js-yaml`,
  `picomatch`, which do not duplicate Cordis.
