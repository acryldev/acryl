// Example: ui-library.gallery  (host half)
// Type:     client-slot
// Surfaces: web desktop
// Teaches:  a UI-only plugin has an empty host `apply`; the UI is in ./client.js and is built from the ACRYL UI library.
// Expect:   row ACTIVE; a "UI library" page in Settings after a reload.
// Docs:     extending.ui-library
export const name = 'acryl-example-ui-library'

export function apply() {}
