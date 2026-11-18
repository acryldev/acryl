# 28 — Point of Sale

**Taxonomy:** Retail  
**Blueprint ID:** `acrylblends.pos`  
**Repository target:** `28-pos`

## Product job
Cashier-first checkout for a small shop, with product catalogue, current basket, tax calculation, test payment and stock decrement.

## UX direction
Full-screen till / product picker. This should not inherit a generic admin-dashboard layout. The mockup is the visual source of truth for hierarchy, composition, navigation and interaction.

## Primary data model
Product, category, stock, cart line, sale, receipt, tax rate.

## Core user flows
Filter/search items; add product; change quantities; remove line; calculate subtotal and VAT; complete test sale; create receipt and decrement sample stock.

## Implementation notes
Use decimal-safe minor currency units and a configurable tax profile. Payment is simulated; no payment processor or card data. Stock changes only after a completed test sale.

## Required screens / states
1. **Primary workspace:** the main layout shown in the mockup, populated with meaningful seeded data on first launch.
2. **Record or item detail:** inspection and editing surface for the selected domain object.
3. **Create / update flow:** a focused form or direct manipulation action appropriate to the category.
4. **Supporting view:** calendar, report, public reference, collection or settings surface as applicable.

Implement only the smallest useful app described here. Use the framework's Cordis plugin and `blend.yaml` conventions. Keep external systems behind injected ports/config so tests can use fakes. Use local seed data; do not require paid APIs, API keys or external sign-in.

## Acceptance checklist
- [ ] First page opens with seeded records and the category's core job is immediately obvious.
- [ ] Core flow works end-to-end with local data.
- [ ] Detail and create/update interactions have validation and clear feedback.
- [ ] Empty, loading, error and success states are defined.
- [ ] Domain logic and every route have tests.
- [ ] README describes audience, purpose and three next prompts.
- [ ] No secrets, external credentials or unsafe production claims.
