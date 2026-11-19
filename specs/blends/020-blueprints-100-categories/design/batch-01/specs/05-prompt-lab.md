# 05 — AI: Prompt Lab

**Blueprint id:** `acrylblends.prompt-lab`  
**Concept:** A prompt engineering workbench with a reusable library, variable inputs and side-by-side model runs.

## Intent
An experimentation bench for reusable prompts. The user edits a prompt and inputs, runs controlled comparisons and evaluates outputs; this is not a conversational chat screen.

## Primary
Three-column lab: prompt library; prompt editor with system/user templates and variable inputs; comparison results with two model outputs.

## Support
Version history, evaluation set, model configuration, run duration/token counts, quick qualitative ratings and save-as-version.

## Visual
Soft lavender lab surface with purple controls, paper-like prompt editor, output comparison cards. Clear separation of experimental inputs and generated outputs.

## Flows
Choose prompt → edit instructions → fill variables → select model(s) and temperature → run variants → compare outputs → rate → save winning version.

## Data
Prompt(id,name,description,systemText,userTemplate,variables[],tags[],version); PromptVersion(id,promptId,revision,content,createdAt); Run(id,promptVersionId,model,inputs,output,tokens,duration,cost,status); Evaluation(id,runId,criterion,rating,note).

## Seed
Five prompts, product-description prompt with three variables, and two seeded comparison outputs with different strengths.

## States
Unsaved changes, missing variable, model not configured, run pending/failed, token limit warning, side-by-side comparison and saved revision.

## Routes
`/prompts`; `/prompts/:id`; `/runs/:id`; `/evaluations`; `/settings/models`.

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
