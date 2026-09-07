# Lock the interchangeable harness-engine destination (DSH <-> pi)

Type: grilling
Status: resolved 2026-09-07
Unlocks: M9 - Interchangeable harness engine; `specs/028-acryl-harness-engine-swap/`

## Resolution (user, 2026-09-07)

1. **pi as engine**: upstream `pi` / prime-agent consumed as a **library,
   composed in-process**, with its **own Cordis root**. Exposed as
   `ctx.runtime` valued `'dsh'` or `'pi'`.
2. **Boundary**: `acryl-harness-runtime` becomes an interface with a DSH adapter
   and a pi adapter. **Hard-depends on M2.** Note: pi.dev ships an unfinished
   composition runtime of their own, `@earendil-works/chord`
   (github.com/earendil-works/pi/tree/main/packages/chord) - conceptually
   parallel to Cordis (plugins/facets/services/replicated-state/delta/remote
   boundaries, Go-like context). ACRYL keeps **one Cordis lifecycle system**;
   Chord is a source to mine / a compatibility reference, not a second runtime
   to adopt. The pi engine adapter maps pi's loop onto Cordis seams.
3. **Durable session across a swap**: a DSH-created session **can be resumed
   under pi**. Users try different engines against the same session. Canonical
   record stays ACRYL-owned; engine-native stores project into it.
4. **DSH+pi combo**: **follow-on** after single-engine swap works. Out of scope
   for the first ledger.
5. **Selection**: `--engine pi` bound to a **Loader row**. Mid-project change is
   **HOT** - `/reload` makes it immediately effective.
6. **First slice**: `acryl tui --engine pi` runs a prompt end-to-end through pi
   while prior DSH room state stays visible. Confirmed walking skeleton.
7. **HMR / sandbox / approvals**: the pi engine **must match** the Cordis
   contracts (no degradation shortcut).

Next: read the Cordis system guide, write the six-part mini-design into
`specs/028-acryl-harness-engine-swap/plan.md` + `research.md`, then
`/speckit-specify`.


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
