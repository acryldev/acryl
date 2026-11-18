# 20 · Aerospace / Aviation — Flight Logbook

**Blueprint ID:** `acrylblends.flight-logbook`  
**Category:** `aerospace-aviation`  
**Reference concept:** Flight Logbook

## Product job
Record pilot flights, aircraft, routes, roles, duration and experience totals, with informational recency summaries.

## UX direction
Aviation logbook/EFB-inspired interface: navy and chart-table styling, pilot summary and hours, flight record table on the left, route and flight detail on the right.

## Screens and routes
1. Logbook: totals, recent flights and aircraft/role filters. 2. Flight detail: departure/arrival aerodromes, aircraft registration/type, date, times, duration, PIC/dual role, landings and remarks. 3. Experience summary: hours by aircraft class, role, day/night and period.

## Domain model
Flight(id, date, departure, arrival, aircraftId, role, takeoffTime, landingTime, durationMinutes, dayNight, landings, remarks); Aircraft(id, type, registration, class, operator); Pilot(id, name, licenceType); Endorsement(id, pilotId, class, issuedAt, expiresAt).

## Primary interactions
Add flight; edit draft record; select flight to inspect route; filter by aircraft; calculate cumulative hours; export logbook records.

## Seed data
Provide enough realistic fixture data that the first screen is useful immediately: at least 5 records in the primary collection, 3 related records, meaningful dates/statuses, and one non-empty detail view. Do not rely on external API keys or paid services.

## States to implement
- First-run state with seeded content visible.
- Empty state for a genuinely empty filtered result.
- Validation state for invalid input.
- Success feedback after a local mutation.
- Error state for a failed persistence or import operation.

## Boundaries and safety
This is a personal recordkeeping mockup, not an operational flight-planning or air-traffic tool. Currency summaries are informational only and must not certify legal privileges. Use sample aerodrome codes and clearly labelled demo data.

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
