// Example: client-workspace-tab.whiteboard  (host half)
// Type:     client-slot
// Surfaces: web desktop
// Teaches:  a UI-only plugin has an empty host `apply`; all behavior is in ./client.js.
// Expect:   row ACTIVE, nothing else on the host.
// Docs:     extending.workspace-tab
export const name = 'acryl-example-workspace-tab'

export function apply() {}
