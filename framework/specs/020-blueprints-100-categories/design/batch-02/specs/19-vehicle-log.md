# 19 · Automotive — Vehicle Log

**Blueprint ID:** `acrylblends.vehicle-log`  
**Category:** `automotive`  
**Reference concept:** Vehicle Log

## Product job
Maintain a personal vehicle record including mileage, service history, fuel, expenses and upcoming reminders.

## UX direction
Owner-oriented garage app. A vehicle identity/hero panel is the visual anchor, followed by running-cost metrics, dated maintenance history, cost trend and quick fuel entry.

## Screens and routes
1. Vehicle profile: vehicle identity, registration, odometer, consumption and reminder status. 2. Service history: service and repair entries with mileage, provider, parts and costs. 3. Expenses: fuel, insurance, tax, inspection and cost-per-kilometre breakdown.

## Domain model
Vehicle(id, make, model, year, registration, vinMasked, fuelType, odometerKm, averageConsumption); ServiceRecord(id, vehicleId, date, odometerKm, type, provider, description, cost); FuelEntry(id, vehicleId, date, odometerKm, litres, totalCost); Reminder(id, vehicleId, title, dueDate, dueOdometerKm, status).

## Primary interactions
Add fuel entry; add service record; calculate cost per km; update odometer; mark reminder complete; filter vehicle events by type.

## Seed data
Provide enough realistic fixture data that the first screen is useful immediately: at least 5 records in the primary collection, 3 related records, meaningful dates/statuses, and one non-empty detail view. Do not rely on external API keys or paid services.

## States to implement
- First-run state with seeded content visible.
- Empty state for a genuinely empty filtered result.
- Validation state for invalid input.
- Success feedback after a local mutation.
- Error state for a failed persistence or import operation.

## Boundaries and safety
Do not claim live vehicle telemetry or automatic inspection/regulatory compliance. Mask VIN by default. Currency, fuel units and date format should be configurable.

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
