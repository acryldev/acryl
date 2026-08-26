# Research: ACRYL-2 — External PTY agent provider as a room peer

**Status**: Required before planning

Map `ctx.subagents`, `ctx.terminals`, `ctx.subprocess`, `ctx.sandbox`, ACP,
and DSH-native agents onto the `acrAgentControl` contract. Do not hide PTY in
UI. Record which transports can truthfully provide structured messages,
tool-call events, acknowledgement, continuation, or resume, and which expose
only raw terminal bytes.

Record facts this milestone's plan waits on. Prefer DSH source and
`docs/acryl/ACRYL_DSH_GAP_ANALYSIS.md` over new abstractions.

Finish with the Cordis mini-design and a provider replacement test plan. The
current `CANVAS_PTY_COMMAND_IDS` / `planCanvasPtyCommand` path is evidence for
PTY feasibility only; it is not the final provider registry.
