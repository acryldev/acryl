# 10 — Networking: Uptime Checker

**Blueprint id:** `acrylblends.uptime`  
**Concept:** A lightweight availability monitor for HTTP endpoints and hosts, with status history, response-time charts and incident records.

## Intent
An availability monitor focused on targets, check history and incident timelines. It is endpoint-first, not a general infrastructure dashboard.

## Primary
Grouped monitor list with health dot, target/protocol/path, latest latency and 30-day uptime. Selecting a monitor opens detail with response-time chart, 90-day status bars and recent checks.

## Support
Add/edit monitor; HTTP/TCP check config; check interval and expected status; incident detail; group management; status page and alert destinations.

## Visual
Technical status monitor with dark top rail, strong green/amber operational states, dense endpoint list and response-time detail plot.

## Flows
Add URL/host → configure protocol/path/interval/timeout → run scheduled checks → record latency/status → raise incident after threshold → resolve when healthy again.

## Data
Monitor(id,name,target,protocol,path,intervalSeconds,timeoutMs,expectedStatus,groupId); Check(id,monitorId,checkedAt,statusCode,latencyMs,result); Incident(id,monitorId,startedAt,resolvedAt,severity,summary); MonitorGroup(id,name).

## Seed
10 monitors in Web Services and Infrastructure groups, 9 healthy, one degraded endpoint, 24h latency series and 90-day status history.

## States
No monitors, DNS failure, timeout, invalid URL, degraded latency, down incident, recovered incident and paused monitor.

## Routes
`/monitors`; `/monitors/new`; `/monitors/:id`; `/incidents`; `/groups`; `/status-page`.

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
