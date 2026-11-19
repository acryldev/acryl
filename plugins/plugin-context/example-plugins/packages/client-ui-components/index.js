// Example: ui-components.shared-primitives  (host half)
// Type:     client-slot
// Surfaces: web desktop
// Teaches:  a UI-only plugin has an empty host `apply`; the UI is in ./client.js.
// Expect:   row ACTIVE; a "Quick notes" button in the sidebar footer after a reload.
// Docs:     extending.ui-components
export const name = 'acryl-example-ui-components'

export function apply() {}
