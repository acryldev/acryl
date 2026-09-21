// Example: client-slot.header-action
// Type:     client-slot
// Surfaces: web desktop
// Teaches:  the HOST half of a client plugin is an empty apply(); the UI lives in client.js (see that file).
// Expect:   ACTIVE host row; a Notes button appears in the conversation header after a page reload.
// Docs:     extending.client-slot
// Pattern:  plugins/dsh-client-ui-brand-acryl (src/index.ts)
export const name = 'acryl-example-client-notes'

// Host half: this package contributes browser presentation only. The browser
// half ships through exports["./client"] (client.js), discovered because
// package.json declares "dsh.client".
export function apply() {}
