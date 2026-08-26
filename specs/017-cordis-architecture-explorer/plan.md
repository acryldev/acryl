# Implementation Plan

1. Add a bounded renderer-safe contract for Host and Client Cordis plane snapshots.
2. Project live state from Registry Fibers, `inject`, Reflect service implementations, Loader ownership, and `getEffects()`.
3. Expose the Host projection through a strict same-origin loopback GET route.
4. Build the Client projection directly inside the renderer context.
5. Register an Architecture tab before the existing Lifecycle tab.
6. Render independent Host and Client sections with searchable expandable Fiber cards.
7. Keep mutations in the existing Loader-oriented lifecycle controller and explicit safety policy.
8. Add inspector, route, parser, boundary, and deterministic-order tests.
9. Verify build, typecheck, full Desktop tests, Loader boot, and headed rendering.

## Deferred upstream work

- Live Client graph add/remove reconciliation without renderer reload
- stable public failure diagnostics for failed Fibers
- resource/disposer types and effect history beyond current effect labels
- exact provider resolution diagnostics for every isolation scope and pending state
