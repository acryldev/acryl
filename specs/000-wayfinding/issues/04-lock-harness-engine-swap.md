# Lock the interchangeable harness-engine destination (DSH <-> pi)

Type: grilling
Status: open
Unlocks: M9 - Interchangeable harness engine; `specs/028-acryl-harness-engine-swap/`

## Context

Today ACRYL has exactly one engine: DeepSeek Harness run in CLI mode, composed
in-process as the single Cordis root by `acryl-harness-runtime` (`startDirectHost()`).
pi-tui is only a rendering library, not the engine.

The goal for M9 is that a user can choose the **engine** - the thing that owns
the agent loop, sessions, tools, models, approvals - as DSH **or** pi
(`pi.dev` / prime-agent), and later a DSH+pi combo, without changing the ACRYL
room, context relay, task artifacts, or worker/session identity.

This is a roadmap-level boundary change touching the "one writable runtime
owner per profile" and "one Cordis lifecycle system" invariants, so it needs a
sharp decision before `/speckit-specify`.

## Questions (speak for yourself; do not let the agent answer)

1. **What is "pi" as an engine here?** The upstream `pi` / prime-agent CLI
   proper, consumed as a library and composed in-process, or driven as an
   external subprocess/protocol the way M4 providers are? If in-process, does
   pi get its own Cordis root or run without Cordis?

2. **Engine-neutral boundary.** Should `acryl-harness-runtime` become an
   interface that both a DSH adapter and a pi adapter implement (engine is a
   provider), with `acryl-control` as the only thing surfaces call? Does this
   milestone therefore hard-depend on M2 (normalized shared capability API)
   landing first?

3. **Canonical durable state across a swap.** Does the durable session/event
   record stay ACRYL-owned (both engines write into the ACRYL room, ACRYL
   projects it), or does each engine keep its native store and ACRYL projects
   whichever is active? A session started under DSH - can it be resumed under
   pi, or is continuity only at the room/task level, not the session?

4. **The DSH+pi combo.** What split do you actually want - e.g. pi drives
   TUI + planning, DSH executes tools? Two live engines in one profile breaks
   "one writable runtime owner." Is the combo a v1 goal, or a follow-on once
   single-engine swap is proven?

5. **Selection mechanism.** Engine chosen per launch (`acryl tui --engine pi`),
   per profile config, or a Loader row? Can it change mid-project, and if so is
   that HOT / WARM / COLD?

6. **Scope of the first slice.** Smallest proof: `acryl tui --engine pi` runs a
   prompt end-to-end through pi while the same room/task state a DSH session
   produced is still visible. Is that the right walking skeleton, or narrower
   (headless `--json` readiness probe against pi only) / wider?

7. **HMR, sandbox, approvals.** These are DSH/Cordis capabilities today. Does pi
   have to match their contracts to be a valid engine, or is honest degradation
   (documented lower fidelity) acceptable for the pi engine at first?
