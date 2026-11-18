# acryl-system-prompt

Ported from ACRYL (`plugins/acryl-system-prompt`, see `provenance.json`): the frame's agent gets the prompt shape ACRYL IDE's agent has.

The shaping of the system prompt in the shape pi.dev builds its own (`packages/coding-agent/src/core/system-prompt.ts`): one identity line, then
every section as a tagged block. It is a pass-through on the harness's `system-prompt/assemble` waterfall: only the identity line is replaced, sections
are tagged and empties dropped, and every other section keeps its upstream text, so harness updates still reach the model. It records what upstream
contributed (`acrylSystemPrompt.lastUpstream()`), so a harness update shows exactly what changed.

It adds one section of its own right after the identity, the reply style (`<reply_style>`): plain, short sentences and never an em dash or en dash
in replies, comments or files, a plain `-` instead.

Config (row `acryl-system-prompt`): `identity`, `style` (empty leaves the reply style out), `tagSections`, `dropEmpty`. `acryl-app-context` contributes the `acryl:plugin-router` section this
plugin tags `<acryl_plugin_docs>`.
