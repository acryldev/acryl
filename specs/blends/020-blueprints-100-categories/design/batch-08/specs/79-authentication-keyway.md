# 79. Authentication software — Keyway Auth Lab

## Product intent
A safe authentication UX lab demonstrating password, MFA, passwordless, passkey and hardware-key sign-in flows with risk signals and recovery states.

**Audience:** Product designers, application developers and security teams evaluating login experiences.

**Positioning:** Test the sign-in journey, not just the credential.

## UX architecture
A split-screen sign-in simulator: selectable authentication method on the left, interactive device/verification ceremony in the center and a risk/explanation panel on the right.

### Screens and regions
1. Authentication method chooser
2. Password and MFA challenge simulation
3. Passkey / hardware-key ceremony
4. Risk review and recovery flow

## Core workflows
1. Choose an authentication method.
2. Complete the simulated challenge using clearly marked demo codes.
3. Inspect the session risk context and device trust explanation.
4. Try a recovery route and inspect the resulting authentication state.

## Domain model
AuthMethod, AuthAttempt, Challenge, DeviceContext, RiskSignal, Session, RecoveryEvent.

## Interaction requirements
- The prototype must work with seeded data and without a server or paid third-party API.
- Every primary control shown in the mockup must have a meaningful local interaction or a clearly identified demo-only state.
- Keep this category's workflow and visual composition distinct from the other blueprints.
- Use semantic HTML, visible keyboard focus and responsive layouts with no horizontal page overflow.
- Separate persisted domain data from transient selection and editor state in a production implementation.

## Scope and safety boundary
No real authentication, password collection, biometric capture, passkey creation or hardware access. Use fake demo codes and fictional identities. Never present a demo sign-in as secure or production-ready.

## Acceptance criteria
- A user can complete the key workflow in the seeded demo without external credentials or services.
- Primary success, empty, selected, in-progress and error states are represented where relevant.
- Domain logic is testable separately from rendering and uses deterministic fixtures.
- The README explains purpose, audience, local run command and three coding-agent prompts.
- The registry entry describes the category, app purpose and supported demo workflows.

## Coding-agent prompts
1. Implement an authentication state machine for password, MFA, passkey and recovery demos.
2. Build risk explanations from synthetic device and attempt signals without opaque scoring claims.
3. Add scenario tests for successful, failed, expired and recovered authentication journeys.

## Prototype reference
- Standalone mockup: `../mockups/authentication-keyway.html`
- No external API keys are required.
- This mockup is a design and workflow reference, not a production-ready implementation.
