# Delivering through the marketplace

Local install (`delivery.local-live`) is the default: the plugin is live immediately. Use the marketplace path
only when the user wants to share the plugin.

1. Make sure the plugin works locally first (installed, live, verified).
2. Add catalog metadata to `package.json`: `"keywords": ["acryl-package"]` (exact), a GitHub `repository`,
   a `license`, a `version`, no `"private": true`, and optionally
   `"acryl": { "schemaVersion": 1, "artifacts": { "plugins": ["./index.js"] } }`.
3. Call `acryl_prepare_publish` with the ABSOLUTE package directory. It runs the install checks, the catalog
   checks and `npm pack --dry-run` (no credentials, nothing uploaded) and returns the exact errors to fix, or
   `readyForHumanPublish: true`.
4. Tell the user it is ready. **You cannot publish and must not try**: the user runs `npm publish --access public`
   with their own npm login. The marketplace lists it after its next catalog refresh.

Never put tokens or credentials in the package or in a chat message.
