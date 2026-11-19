# 73. Decentralized software — Federary Network

## Product intent
A federation administration console for inspecting trusted instances, federation links, moderation queues and decentralized identity handshakes.

**Audience:** Operators of federated communities, decentralized services and self-hosted networks.

**Positioning:** See the shape and health of a federated network.

## UX architecture
A network-first federation map with instance cards, trust edges and a moderation queue. Selecting a node opens its federation policy and peering history.

### Screens and regions
1. Federation graph and instance health
2. Instance profile with software, policy and peer list
3. Inbound/outbound federation queue
4. Moderation and trust-rule review

## Core workflows
1. Select an instance on the federation graph.
2. Inspect its published policy and peer relationships.
3. Review an incoming federation request or content report.
4. Approve, quarantine or block a peer using a reversible demo action.

## Domain model
Instance, FederationLink, TrustRule, FederationEvent, ContentReport, ModerationDecision, IdentityAssertion.

## Interaction requirements
- The prototype must work with seeded data and without a server or paid third-party API.
- Every primary control shown in the mockup must have a meaningful local interaction or a clearly identified demo-only state.
- Keep this category's workflow and visual composition distinct from the other blueprints.
- Use semantic HTML, visible keyboard focus and responsive layouts with no horizontal page overflow.
- Separate persisted domain data from transient selection and editor state in a production implementation.

## Scope and safety boundary
Use fictional instances and synthetic identities. No deanonymization, scraping of real communities, impersonation or collection of sensitive personal data. Federation and trust actions are simulated.

## Acceptance criteria
- A user can complete the key workflow in the seeded demo without external credentials or services.
- Primary success, empty, selected, in-progress and error states are represented where relevant.
- Domain logic is testable separately from rendering and uses deterministic fixtures.
- The README explains purpose, audience, local run command and three coding-agent prompts.
- The registry entry describes the category, app purpose and supported demo workflows.

## Coding-agent prompts
1. Model federated instances, signed assertions and directional peer relationships.
2. Build a graph selection view with trust policy and peer status inspection.
3. Implement a moderation queue with reversible decisions and audit history tests.

## Prototype reference
- Standalone mockup: `../mockups/decentralized-federary.html`
- No external API keys are required.
- This mockup is a design and workflow reference, not a production-ready implementation.
