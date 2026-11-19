// Example: skill-provider.basic
// Type:     skill-provider
// Surfaces: tui web desktop
// Teaches:  a SkillProvider lists candidates (name + description only) and loads the full body on demand.
// Expect:   ACTIVE; the skill appears in the catalog.
// Docs:     extending.skill-provider
// Pattern:  deepseek-harness packages/skill/skill-badge
export const name = 'acryl-example-skill'
export const inject = ['skills']

const CANDIDATE = {
  name: 'example-checklist',
  description: 'A short pre-merge checklist. Load it when asked to review or ship a change.',
  invocation: { modelInvocable: true, userInvocable: true },
  provider: 'acryl-example-skill',
  source: 'bundled',
  rank: 600,
}

const provider = {
  name: 'acryl-example-skill',
  list: () => Promise.resolve([CANDIDATE]),
  get: async () => ({
    ...CANDIDATE,
    content: '# Pre-merge checklist\n\n1. Tests pass.\n2. No secrets in the diff.\n3. Docs updated.\n',
  }),
}

export function apply(ctx) {
  ctx.skills.registerProvider(() => provider)
}
