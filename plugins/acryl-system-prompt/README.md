# acryl-system-prompt

ACRYL's shaping of the system prompt, in the shape pi.dev builds its own (`packages/coding-agent/src/core/system-prompt.ts`): one identity line, then
every section as a tagged block. It is a pass-through on the harness's `system-prompt/assemble` waterfall: only the identity line is replaced, sections
are tagged and empties dropped, and every other section keeps its upstream text, so harness updates still reach the model. It records what upstream
contributed so a harness update shows exactly what changed (`drift/`). See `docs/system-prompt/README.md` in the repository for where the whole prompt
comes from and how to change it.

Config (row `acryl-system-prompt`): `identity`, `tagSections`, `dropEmpty`.
