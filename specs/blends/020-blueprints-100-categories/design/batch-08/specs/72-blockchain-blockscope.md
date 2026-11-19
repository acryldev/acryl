# 72. Blockchain software — Blockscope Explorer

## Product intent
A read-only blockchain explorer prototype for searching seeded blocks, transactions, addresses and smart-contract events.

**Audience:** Developers, analysts and operators inspecting public chain activity.

**Positioning:** Inspect blocks, transactions and contract activity.

## UX architecture
A data-dense chain explorer with a live-feeling block ticker, searchable transaction ledger and right-hand detail inspector. The home view prioritizes chain health and block progression over wallet actions.

### Screens and regions
1. Network overview with chain height and finality indicators
2. Block list and block detail
3. Transaction search and decoded event detail
4. Contract activity and log topics

## Core workflows
1. Search a seeded block, transaction hash or address label.
2. Select a block and inspect included transactions.
3. Open a transaction to inspect status, fees and event logs.
4. Filter contract events by event name and time range.

## Domain model
Network, Block, Transaction, AddressLabel, Contract, EventLog, ValidatorSummary. Values are synthetic and explicitly labeled demo data.

## Interaction requirements
- The prototype must work with seeded data and without a server or paid third-party API.
- Every primary control shown in the mockup must have a meaningful local interaction or a clearly identified demo-only state.
- Keep this category's workflow and visual composition distinct from the other blueprints.
- Use semantic HTML, visible keyboard focus and responsive layouts with no horizontal page overflow.
- Separate persisted domain data from transient selection and editor state in a production implementation.

## Scope and safety boundary
Read-only explorer. No wallet connection, signing, transaction submission, token purchase, private keys or real financial advice. Do not imply the demo data reflects a live chain.

## Acceptance criteria
- A user can complete the key workflow in the seeded demo without external credentials or services.
- Primary success, empty, selected, in-progress and error states are represented where relevant.
- Domain logic is testable separately from rendering and uses deterministic fixtures.
- The README explains purpose, audience, local run command and three coding-agent prompts.
- The registry entry describes the category, app purpose and supported demo workflows.

## Coding-agent prompts
1. Create a typed read-only explorer domain model with block-to-transaction relationships.
2. Implement deterministic block, transaction and event search across seeded data.
3. Add transaction detail parsing, pagination and tests for pending, failed and finalized states.

## Prototype reference
- Standalone mockup: `../mockups/blockchain-blockscope.html`
- No external API keys are required.
- This mockup is a design and workflow reference, not a production-ready implementation.
