# acryl-app-context

The app builder's own docs, as ACRYL IDE's agent has its plugin docs. Ported from ACRYL's Extension Context Pack
(`plugins/acryl-plugin-context`, spec 037; see `provenance.json`).

- `docs/` - a routed index (`docs.json`, with a generated `docs/README.md`): what a Blends app is made of, how a feature becomes a plugin
  (`plugins/<name>/` plus its row in `blend.yaml`), pages and routes, home widgets, state, verifying, switching off and sharing. Every page says
  when to read it.
- `example-plugins/` - verified plugins the docs point at. `tests/examples.spec.ts` mounts each one in a throwaway app with the app's router and
  home page and runs its scenario (`scenarios.json`).
- `src/` - the Cordis plugin the frame mounts (row `acryl-app-context`): one prompt section, `acryl:plugin-router`, that routes the agent to the
  docs before it builds anything, the way pi.dev's system prompt routes its agent to its own docs. It never puts the docs into the prompt.
  `ACRYL_PLUGIN_DOCS=off` leaves it out (for comparing the same task with and without the docs).

Edit `docs/docs.json` and the pages, then `pnpm run build:manifest` to regenerate the indexes; `pnpm test` fails while they are stale.
