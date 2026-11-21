# @acryldev/blends 1.7.14

Released 2026-11-21.

## Changed

- `npm run share` in an app releases the next version by itself when the app changed since its last release (v1.2.0 tagged, saved
  since: the share tags v1.2.1 and writes it into package.json and blend.yaml). People who made an app from it bring it in with
  `npx acrylblends update`. A release tag is still never moved. (@acryldev/save 0.1.6, @acryldev/app-persistence 0.1.6)
- `acrylblends update` makes the new release with the create of its own version (@acryldev/create-blends 1.7.14), so the app's
  `metadata.from` record is kept across updates.
- The app's terminal and agent tabs (Terminal, Claude Code, Codex, Pi) work in a hosted app (a WebBox) behind its trusted front
  (@acryldev/workspace 0.2.3, @acryldev/loopback-http 0.2.1, @acryldev/blends-frame 0.2.10).
