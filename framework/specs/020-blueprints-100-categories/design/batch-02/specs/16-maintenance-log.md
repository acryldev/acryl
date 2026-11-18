# 16 · Industrial — Maintenance Log

**Blueprint ID:** `acrylblends.maintenance-log`  
**Category:** `industrial`  
**Reference concept:** Maintenance Log

## Product job
Track machines, preventive maintenance schedules, work orders, downtime and service history for a facility.

## UX direction
Industrial maintenance control room: dark graphite/green palette, equipment register on left, work schedule in center, selected asset health and maintenance history on right.

## Screens and routes
1. Maintenance control: asset list, overdue PM, open work orders, downtime KPI and upcoming work. 2. Asset profile: operating hours, health indicators, service history and open tasks. 3. Work order detail: fault, priority, assigned technician, parts, checklist and close-out.

## Domain model
Machine(id, code, name, type, line, location, manufacturer, installedAt, operatingHours, status); WorkOrder(id, machineId, kind, priority, description, assignedTo, scheduledAt, status, downtimeMinutes); MaintenanceEvent(id, machineId, workOrderId, occurredAt, summary, cost, parts).

## Primary interactions
Select asset; filter by status; create work order; assign technician; schedule maintenance; record service; close work order with outcome and downtime.

## Seed data
Provide enough realistic fixture data that the first screen is useful immediately: at least 5 records in the primary collection, 3 related records, meaningful dates/statuses, and one non-empty detail view. Do not rely on external API keys or paid services.

## States to implement
- First-run state with seeded content visible.
- Empty state for a genuinely empty filtered result.
- Validation state for invalid input.
- Success feedback after a local mutation.
- Error state for a failed persistence or import operation.

## Boundaries and safety
Do not send commands to PLC/SCADA or control machinery. All machine states are seeded operational records. Maintenance completion must have a dated close-out note.

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
