# 08 — Cloud: Cloud Costs

**Blueprint id:** `acrylblends.cloud-costs`  
**Concept:** A FinOps cost explorer that reconciles imported provider exports, attributes spend to services and flags budget drift.

## Intent
A FinOps cost-management surface. The core task is understanding cloud spend by provider/service, forecasting month-end cost and managing budgets.

## Primary
Spend overview with month-to-date total, budget utilisation gauge, forecast, stacked daily spend chart and ranked service breakdown table.

## Support
Cost explorer with dimensions and filters; budgets/alerts; provider import status; allocation rules; cost recommendations.

## Visual
Dark finance summary band, warm amber cost accent, provider identity chips and budget progress bars. Not a generic KPI dashboard: all measures are monetary and budget-relative.

## Flows
Import provider CSV export → map columns/provider → reconcile period → attribute service spend → set budgets → inspect forecast/alerts → export cost report.

## Data
Provider(id,name,sourceType); BillingImport(id,providerId,period,fileName,status,importedAt); CostLine(id,providerId,service,account,region,day,amount,currency,tags); Budget(id,name,scope,limit,period,alertThreshold); Alert(id,budgetId,forecast,triggeredAt,status).

## Seed
AWS and Google Cloud sources, EUR Nov spend of €18,462.80, €25k budget, service-level costs and one near-limit network egress row.

## States
No imports, duplicate billing file, unclassified service, currency mismatch, budget at risk, forecast over limit and provider disconnected.

## Routes
`/costs`; `/explorer`; `/budgets`; `/alerts`; `/imports`; `/allocation-rules`.

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
