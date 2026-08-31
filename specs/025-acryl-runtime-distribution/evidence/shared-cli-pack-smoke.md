# Shared CLI packed-install smoke

## Reproduction

The publish assembler materializes a production deployment. In this workspace, restore the immutable development dependency graph before independently rebuilding a candidate:

```sh
CI=true corepack pnpm install --frozen-lockfile
OUT=$(mktemp -d /private/tmp/acryl-shared-cli.XXXXXX)
node scripts/publish-npm-cli.mjs --pack-only "$OUT"
WORK=$(mktemp -d /private/tmp/acryl-shared-smoke.XXXXXX)
npm i -g "$OUT/acryl-0.1.17.tgz" --prefix "$WORK/prefix" --cache "$WORK/cache" --ignore-scripts --no-audit --no-fund
"$WORK/prefix/bin/acryl" --version
"$WORK/prefix/bin/acryl" tui --json
"$WORK/prefix/bin/acryl" web --json
```

`CI=true corepack pnpm install --frozen-lockfile` is only a local workspace restoration prerequisite. It is not part of the published user installation.

## Candidate manifest

The packed `acryl@0.1.17` candidate declares 23 direct dependencies:

```text
@deepseek-ai/cordis
@deepseek-ai/cordis-plugin-group
@deepseek-ai/cordis-plugin-hmr
@deepseek-ai/cordis-plugin-include
@deepseek-ai/cordis-plugin-loader
@deepseek-ai/cordis-plugin-timer
@deepseek-ai/dsh
@deepseek-ai/dsh-agent-presets
@deepseek-ai/dsh-app-boot
@deepseek-ai/dsh-authorization
@deepseek-ai/dsh-base
@deepseek-ai/dsh-compaction
@deepseek-ai/dsh-goal
@deepseek-ai/dsh-llm
@deepseek-ai/dsh-sandbox-local
@deepseek-ai/dsh-session
@deepseek-ai/dsh-session-stats
@deepseek-ai/dsh-subprocess-local
@deepseek-ai/dsh-system-prompt
@deepseek-ai/dsh-typert-loader
@deepseek-ai/dsh-web-app
@earendil-works/pi-tui
diff
```

It does not declare `acryl-development-canvas`, `dsh-community-market`, or `pnpm`.

## Result

The clean install completed with no `ERESOLVE` or conflicting-peer warnings after direct pinning of the workspace-compatible `@deepseek-ai/cordis-plugin-group@1.0.1`.

```text
acryl --version  -> 0.1.17
acryl tui --json -> {"mode":"direct","profile":"acryl",...}
acryl web --json -> http://127.0.0.1:3080
```
