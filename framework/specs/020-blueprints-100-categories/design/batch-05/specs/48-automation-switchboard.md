# 48. Switchboard

**Category:** Automation software  
**Blueprint ID:** `acrylblends.automation.switchboard`  
**Mockup:** `mockups/48-automation-switchboard.html`

## Product purpose
A trigger-condition-action automation builder with an execution monitor for inspecting and testing integration workflows.

## Primary audience
Small teams automating cross-app business processes

## UX direction
Dark node canvas with connected trigger, condition and action steps, workflow list and live execution log. Distinct from low-code UI composition.

## Primary data model
Workflow, WorkflowVersion, Trigger, Condition, Action, Connector, CredentialReference, Run, RunStep, ExecutionLog

## Core user flows
Inspect workflow; append a step; test a sample execution; pause/resume automation; view execution outcomes.

## Implementation constraints and boundaries
All connectors are simulated; no credentials or real actions are executed. Production requires secret management, retries, idempotency, rate limits, sandboxing, run cancellation and audit logs.

## Suggested implementation slices
1. Define typed domain models and seed a compact, realistic demo dataset.
2. Implement the primary workflow and its state transitions without requiring third-party credentials.
3. Add route/domain tests for the core transitions and validation rules.
4. Add responsive empty, loading, error and success states; document all demo-only behavior.
5. Add a README explaining the app, intended user, local run steps and three useful coding-agent prompts.

## Acceptance criteria
- The primary workflow can be completed with seeded local data.
- The interface has distinct, category-appropriate information architecture rather than a generic dashboard template.
- Core actions produce visible state changes and handle invalid or empty input.
- No paid API key or external account is required for the demo.
- Domain behavior is covered by focused tests and the README documents limitations.
