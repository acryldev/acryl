# @acryldev/system-prompt

ACRYL's shaping of the system prompt, in the shape pi.dev builds its own (`packages/coding-agent/src/core/system-prompt.ts`): one identity line, then
every section as a tagged block. It is a pass-through on the harness's `system-prompt/assemble` waterfall: only the identity line is replaced, sections
are tagged and empties dropped, and every other section keeps its upstream text, so harness updates still reach the model. It records what upstream
contributed so a harness update shows exactly what changed (`drift/`). See `docs/system-prompt/README.md` in the repository for where the whole prompt
comes from and how to change it.

It also adds one section of its own, the reply style (`acryl:reply-style`, tagged `<reply_style>`): plain, short sentences and no em dash.

Config (row `@acryldev/system-prompt`): `identity` (the opening line; ACRYL's by default, and every ACRYL Blends app's composition sets the Blends
one), `style` (the reply style; empty leaves it out), `tagSections`, `dropEmpty`.

Source: `src/index.ts` (the plugin) and `src/transform.ts` (the pure shaping, also exported as `@acryldev/system-prompt/transform`). One package
for ACRYL and for the Blends frame, which publishes it as `@acryldev/system-prompt` (spec 051).
