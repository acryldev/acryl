# 18 · Embedded / IoT — Sensor Dashboard

**Blueprint ID:** `acrylblends.sensor-dashboard`  
**Category:** `embedded-iot`  
**Reference concept:** Sensor Dashboard

## Product job
Monitor device telemetry, device health and thresholds from sensors sending readings to an HTTP ingestion endpoint.

## UX direction
IoT operations dashboard: teal/navy palette, clear online/offline indicators, live values with small trend plots, device inventory, historical chart and threshold editor.

## Screens and routes
1. Site dashboard: active devices, ingestion rate, alerts, telemetry cards and history. 2. Device detail: metadata, last heartbeat, readings chart and thresholds. 3. Alert log: threshold crossing, acknowledged state and timestamps.

## Domain model
Device(id, code, name, kind, site, zone, unit, status, lastSeenAt); Reading(id, deviceId, value, unit, recordedAt); Threshold(id, deviceId, warning, critical, comparison); Alert(id, deviceId, readingId, severity, state, occurredAt, acknowledgedAt).

## Primary interactions
Simulate/refresh readings; open device; change time range; set warning/critical thresholds; acknowledge alert; filter offline devices.

## Seed data
Provide enough realistic fixture data that the first screen is useful immediately: at least 5 records in the primary collection, 3 related records, meaningful dates/statuses, and one non-empty detail view. Do not rely on external API keys or paid services.

## States to implement
- First-run state with seeded content visible.
- Empty state for a genuinely empty filtered result.
- Validation state for invalid input.
- Success feedback after a local mutation.
- Error state for a failed persistence or import operation.

## Boundaries and safety
Define a simple HTTP ingest contract and validate device identity, timestamp and unit. Sample stream is simulated; do not imply real sensor connectivity until endpoint and device credentials are configured.

## ACRYL implementation handoff
- Start from the published `acrylblends` blank template unless the feature genuinely requires the agent template.
- Implement the domain capability as one focused Cordis plugin, with domain logic separated from route rendering.
- Keep external effects behind injected/configured interfaces so route and domain tests can use fakes.
- Keep the first page at `/`; use the additional routes listed above only where they provide a distinct workflow.
- Use the existing ACRYL Blends router, state and database ports. Do not add a second application framework.
- Add domain tests and route tests; assert the seed data and important workflow transitions.
- No third-party sign-in, external account requirement or mandatory API key.

## Acceptance checklist
- [ ] First page loads with useful seeded data.
- [ ] Main task can be completed without setup or external credentials.
- [ ] The primary interaction is implemented, not just styled.
- [ ] Domain operations are tested independently from the UI.
- [ ] Every route and validation state is tested.
- [ ] README includes purpose, audience, setup and three example prompts for extending the app.
- [ ] Screenshot shows the distinctive primary workflow.
