# Prompt contributions

Example: `../example-plugins/packages/prompt-contribution-basic/`.

`ctx.systemPrompt.section({ name, order, text })` adds a section and returns its disposer (wrap in
`ctx.effect`). `text` may be a string or a function of the assembly context. Sections sort by
`order` (tools 1000-2900, SDK 5000, deliverables 9000, local paths 10000+). Names must be unique in a
scope. Keep text **static** so it stays in the cacheable prompt prefix; per-session facts belong in a
`PromptContext` (durable snapshot). Reference: `reference/subsystems/system-prompt.md`.
