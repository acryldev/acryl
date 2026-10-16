// Example: client-chat-message-action  (host half)
// Type:     client-slot (chat message seam)
// Surfaces: web desktop
// Teaches:  a UI-only plugin has an empty host `apply`; the UI is in ./client.js.
// Expect:   row ACTIVE; a Bookmark action under each finished assistant message after a reload.
// Docs:     extending.client-slot
export const name = 'acryl-example-chat-message-action'

export function apply() {}
