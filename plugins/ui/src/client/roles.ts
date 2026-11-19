import tokens from '../../contracts/tokens.json' with { type: 'json' }

const kebab = (role: string): string => role.replace(/[A-Z]/gu, c => `-${c.toLowerCase()}`)

/**
 * The semantic roles as CSS values a consumer can use for its own colors. Roles that map to an app token resolve to it directly (`var(--dsw-alias-*)`); accent and
 * reasoning resolve to the tokens this library registers with the theme service. `secondary` is terminal-only and absent here.
 */
export const roles: Readonly<Record<string, string>> = Object.freeze(Object.fromEntries(
  Object.entries(tokens.roles as Record<string, { web: string | null }>)
    .filter(([, value]) => value.web !== null)
    .map(([role, value]) => [role, role === 'accent' || role === 'reasoning' ? `var(--acryl-${kebab(role)})` : String(value.web)]),
))
