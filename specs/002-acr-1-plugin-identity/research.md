# Research: ACR-1 — ACR Cordis plugin + project/room identity + durable state

**Status**: Required before planning

Unlock after Wayfinder tickets 01 and 02.

Record facts this milestone's plan waits on. Prefer DSH source and
`docs/acr/ACR_DSH_GAP_ANALYSIS.md` over new abstractions.

Research must map `ctx.sessions`, workspace identity, persistence backends,
Agent Teams, and session projection to the proposed room semantics. It must
decide ownership for the portable `.allagent/` record, total ordering,
single-writer behavior, crash recovery, and replay. Finish with the Cordis
mini-design: provides/consumes, effects/disposal, config/composition,
events/durability, provider replacement, and lifecycle tests.
