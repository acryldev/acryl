# ACRYL Blends — Batch 04 (Categories 31–40)

Ten independent application mockups, each designed around its own category-specific primary workflow.

| # | Category | Proposed Blend | Mockup | UX form |
|---:|---|---|---|---|
| 31 | Sales software | `acrylblends.quote-builder` | [Preview](mockups/31-quote-builder.html) | A two-pane document workspace: editable commercial line items on the left, a polished quote preview on the right. Treat the quote document—not a dashboard—as the primary workspace. |
| 32 | Customer service software | `acrylblends.helpdesk` | [Preview](mockups/32-helpdesk.html) | Three-pane support inbox: compact navigation rail, searchable ticket queue, central email-style conversation thread and ticket properties panel. The conversation is the primary canvas. |
| 33 | Logistics software | `acrylblends.shipments` | [Preview](mockups/33-shipments.html) | Operations control tower: shipment table on the left, selected shipment route and milestone history on the right. Prioritise scan status and exceptions over a generic analytics dashboard. |
| 34 | Travel software | `acrylblends.trip-planner` | [Preview](mockups/34-trip-planner.html) | Travel journal / itinerary composition: trip collection on the left, scenic trip header and day tabs in the centre, essentials and packing list in a side rail. The day timeline is the core interaction. |
| 35 | Hospitality software | `acrylblends.reservations` | [Preview](mockups/35-reservations.html) | Restaurant floor plan is the centre of the application. Clickable tables show capacity and seating state; a right-hand service list shows upcoming bookings. This is a spatial seating workflow, not a calendar dashboard. |
| 36 | Real-estate software | `acrylblends.listings` | [Preview](mockups/36-listings.html) | Consumer-facing listing catalogue with a narrow filter rail and image-led property cards. A property detail drawer provides facts and enquiry action. It should look like a listings product, not an agent CRM. |
| 37 | Architecture / construction software | `acrylblends.site-diary` | [Preview](mockups/37-site-diary.html) | Digital site notebook with dated entries in a left rail and a report sheet in the main panel. Tabs switch between activity, issues and deliveries. The report itself is the product. |
| 38 | Agriculture software | `acrylblends.field-planner` | [Preview](mockups/38-field-planner.html) | Interactive parcel map as the primary surface, with a right-side field dossier showing crop plan, observations and tasks. The map selects the active parcel; the side panel changes to its agronomic record. |
| 39 | Energy software | `acrylblends.energy-tracker` | [Preview](mockups/39-energy-tracker.html) | Energy operations console with a deep-colour consumption headline, period selector, hourly usage chart and end-use breakdown. The chart is the main analytical surface. |
| 40 | Telecom software | `acrylblends.sim-inventory` | [Preview](mockups/40-sim-inventory.html) | High-density inventory table as the primary surface, with a SIM profile drawer for assignment and suspend/reactivate actions. This is an asset register, not a subscriber-facing portal. |

## Agent handoff specs

- [31 — Quote Builder](specs/31-quote-builder.md)
- [32 — Helpdesk](specs/32-helpdesk.md)
- [33 — Shipments](specs/33-shipments.md)
- [34 — Trip Planner](specs/34-trip-planner.md)
- [35 — Reservations](specs/35-reservations.md)
- [36 — Listings](specs/36-listings.md)
- [37 — Site Diary](specs/37-site-diary.md)
- [38 — Field Planner](specs/38-field-planner.md)
- [39 — Energy Tracker](specs/39-energy-tracker.md)
- [40 — SIM Inventory](specs/40-sim-inventory.md)

## Package contents

- `mockups/` — ten standalone HTML prototypes
- `specs/` — ten implementation specifications with acceptance criteria and agent briefs
- `blueprints-31-40.json` — structured metadata for agent handoff
- `index.html` — gallery preview

## Notes and boundaries

- Shipments use an illustrative route and synthetic tracking events; no live carrier APIs are connected.
- Travel weather, travel times and bookings are illustrative; no live booking or mapping APIs are connected.
- Real-estate inventory and imagery are fictional/CSS-generated placeholders.
- Construction diary, farm and energy data are synthetic. The energy cost is indicative, not a bill.
- Telecom phone numbers and ICCIDs are demo placeholders and are not provisioned.
- No external service credentials or paid APIs are required to preview any prototype.

## Review status

This package is a design prototype batch, not implemented production apps. It does not create GitHub repositories, publish registry records or deploy services. Stop after this batch for user review before beginning Batch 05.
