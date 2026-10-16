// Example: ui-theme.override  (host half)
// Type:     client-slot (theme service, browser only)
// Surfaces: web desktop
// Teaches:  a UI-only plugin has an empty host `apply`; the restyling is in ./client.js.
// Expect:   row ACTIVE; colors and font change after a page (Web) or window (Desktop) reload.
// Docs:     extending.ui-theme
export const name = 'acryl-example-theme-override'

export function apply() {}
