/**
 * Auth guidance strings for the ACRYL terminal client, modeled on Pi's
 * `auth-guidance.ts`: a single place that formats "no key / no model"
 * messages and points the user at `/login`.
 * @module @tomowang/dsh-tui/tui/auth-guidance
 */

export function loginHelp(): string {
  return 'No provider authentication configured. Run /login to add an API key, then /model to pick a model.'
}

export function noApiKeyMessage(provider: string): string {
  const display = provider.trim() === '' ? 'the selected provider' : provider
  return `No API key configured for ${display}. Run /login to add one.`
}
