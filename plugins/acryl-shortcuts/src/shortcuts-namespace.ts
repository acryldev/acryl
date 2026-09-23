/**
 * The one namespace string, with no other imports of its own, so both the Host schema
 * registration (`shortcuts-settings.ts`, which also pulls in schemastery) and the browser scope
 * (`client/shortcuts-service.ts`) can share the exact same constant without the client bundle
 * inlining schemastery just to read a string.
 */
export const SHORTCUTS_SETTINGS_NAMESPACE = 'acryl-shortcuts'
