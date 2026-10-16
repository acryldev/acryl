// Example: client-slot.sidebar-tab  (host half)
// Type:     client-slot
// Surfaces: web desktop
// Teaches:  a UI-only plugin has an empty host `apply`; all behavior is in ./client.js.
// Expect:   row ACTIVE, nothing else on the host.
// Docs:     extending.client-slot
export const name = 'acryl-example-client-sidebar-tab'

export function apply() {}
