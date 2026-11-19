# Plan: Documentation

`docs/test/docs.test.ts` is the harness. Snippets are written to `docs/.generated/` (git-ignored) and imported through the same
workspace aliases as the unit tests, so they run against the source. Snippets that need third-party packages (valibot, Effect,
Hono, Fastify) are plain `ts` blocks and are not executed; the reference and the examples cover those.
