# Ticket: `plugin pull` right after a change under plugins/ fails with "inactive context"

Status: needs-triage. Seen 2026-11-18 (acrylblends 1.5.18, a Blank app made with create-acrylblends 1.5.16 and upgraded) while testing
skill-mcp-manager.

## What happened

1. The app ran (`npm run dev`), with `cordisplugins/skill-mcp-manager` pulled into it.
2. Its folder under `plugins/` was moved away and back (to test a re-pull).
3. Straight after, `npm run acryl -- plugin pull github:cordisplugins/skill-mcp-manager` failed with:

   ```
   acryl-door: failed to run the door verb plugin-pull: cannot get required service appInstance in inactive context
   ```

4. The same command a few seconds later succeeded.

## Likely shape (not verified)

A change under `plugins/` restarts or reloads part of the host, and for a moment the door's verb runs on a context that has already been
disposed. A Cordis context that is unloading or disposed refuses `ctx.get`/`inject`, which is that message. The pull should either wait for the
host to be ready again, or say "the app is reloading, try again in a moment", rather than fail with an internal message.

## Done when

- A test reproduces it: a door verb that needs `appInstance`, run while the owning fiber reloads, either waits and succeeds or fails with a
  message a person understands.
- Reproduced on a real app by hand (move a folder under `plugins/`, pull at once), then fixed, then the same steps pass.
