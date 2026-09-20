# Skills: on-demand instructions

Example: `../examples/packages/skill-provider-basic/`. A skill is a name and description that sit in
the agent's context, with the full body loaded only when needed. Register a provider:
`ctx.skills.registerProvider(() => provider)` where `provider = { name, list(), get(candidate) }`.
`list()` returns candidates (`name` kebab-case, `description`, `invocation`, `provider`, `source`,
`rank`); `get()` returns the definition with `content`. Simplest for a project: put
`<name>/SKILL.md` under `.dsh/skills` or `.agents/skills`; a plugin provider is for shipping skills
with a package. Reference: `deepseek-harness/docs/subsystems/skills.md`.
