# 01 — System: System Monitor

**Blueprint id:** `acrylblends.system-monitor`  
**Concept:** Live CPU, memory, disk and process load for one machine, with safe inspection of runaway processes.

## Intent
Answer in seconds: is the host healthy, which resource is constrained, and which process is responsible. Telemetry-first operations UI, not a general admin dashboard.

## Primary
Host overview: live resource cards, sparklines, CPU-sorted process table, memory composition and contextual process inspector. Termination is a guarded secondary action.

## Support
Process detail with command/owner/parent/resource history; disk and mount detail; host thresholds and refresh settings.

## Visual
Dark live telemetry console, compact technical typography, green normal state, amber warning, blue storage, monospace system values.

## Flows
Choose host → inspect resource → filter process list → open process details → request stop → confirm exact PID and command → record result.

## Data
Host(id,hostname,os,arch,uptime,load); Metric(hostId,key,value,timestamp); Process(pid,ppid,name,command,user,cpuPct,memoryBytes,state); Mount(path,totalBytes,usedBytes).

## Seed
One local host, five processes, short resource histories and two volumes. Seed telemetry if native process data is unavailable.

## States
Live/paused refresh, stale data, no search results, process exited, permission denied, termination confirmation; never stop on one click.

## Routes
`/` overview; `/processes/:pid`; `/storage`; `/settings`.

## Build notes for the agent
- Start from the published `acrylblends` blank template and follow `specs/020-blueprints-100-categories/spec.md` plus `cloud-brief.md`.
- Implement domain logic in a focused Cordis plugin; keep the domain separate from the route/view.
- Show useful local seed data on first launch. No required outside account, paid service, or API key.
- Keep external effects behind injected adapters; use fake adapters in tests.
- Implement the screen composition in the mockup; do not replace it with a generic dashboard.
- Cover domain logic and every route with `node:test`; include README, three follow-up prompts and screenshot.

## Acceptance checklist
- [ ] Main screen clearly expresses the category's core job.
- [ ] Primary workflow works with seed data.
- [ ] Appropriate create/edit/search and state transitions work.
- [ ] Empty, validation, success and failure states are handled.
- [ ] `npm test`, `npm run check` and `npm start` pass.
- [ ] Registry metadata and category placement match the task plan.
