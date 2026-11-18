# 011 plan

- `packages/cli`: `src/templates.ts` (which templates exist, where), `src/project.ts` (name rules, refuse-if-not-empty,
  copy with substitution), `src/init.ts` (the `init` use case and its flags), `src/io.ts` (terminal, prompts, `pnpm
  install`, replaceable in tests), `src/cli.ts` (dispatch, help, exit codes).
- `packages/cli/templates/app` and `agent`: Cordis only, `node:http`.
- Delete `packages/{core,loader,http,hono,fastify,effect,unplugin,testing}`, `plugins/`, `examples/`, the scripts that
  checked them, and their docs. Archive specs 000 to 010 and the original brief.
- Docs: `docs/README.md`, `docs/getting-started.md`, `docs/cordis.md`; `docs/test/docs.test.ts` runs the examples.
- Constitution 3.0.0.
