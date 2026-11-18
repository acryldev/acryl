# 74. Peer-to-peer software — Swarmdrop

## Product intent
A peer-to-peer transfer-room prototype showing peer discovery, chunk availability, transfer progress and integrity verification using synthetic local state.

**Audience:** Teams sharing large files, distributed compute groups and P2P product developers.

**Positioning:** Transfer large files through cooperating peers.

## UX architecture
A transfer-first swarm console: large file manifest at the top, chunk map in the center, peer strip below and a live transfer event feed. It emphasizes how pieces move through the swarm.

### Screens and regions
1. Transfer room and share-code summary
2. Chunk availability map and peer contribution
3. Peer details with latency and upload/download rate
4. Integrity verification and completed transfer receipt

## Core workflows
1. Create or join a seeded transfer room.
2. Inspect which peers have each file chunk.
3. Pause or resume the local transfer simulation.
4. Run integrity verification and inspect the completion receipt.

## Domain model
TransferRoom, FileManifest, Chunk, Peer, PeerConnection, TransferSample, IntegrityCheck.

## Interaction requirements
- The prototype must work with seeded data and without a server or paid third-party API.
- Every primary control shown in the mockup must have a meaningful local interaction or a clearly identified demo-only state.
- Keep this category's workflow and visual composition distinct from the other blueprints.
- Use semantic HTML, visible keyboard focus and responsive layouts with no horizontal page overflow.
- Separate persisted domain data from transient selection and editor state in a production implementation.

## Scope and safety boundary
Simulation only: do not expose real IP addresses, create network sockets or transfer user files. Use synthetic peer IDs, synthetic rates and a fake share code.

## Acceptance criteria
- A user can complete the key workflow in the seeded demo without external credentials or services.
- Primary success, empty, selected, in-progress and error states are represented where relevant.
- Domain logic is testable separately from rendering and uses deterministic fixtures.
- The README explains purpose, audience, local run command and three coding-agent prompts.
- The registry entry describes the category, app purpose and supported demo workflows.

## Coding-agent prompts
1. Implement a deterministic chunk/peer availability model for seeded transfer rooms.
2. Build a peer contribution view that derives rates and progress from local fixtures.
3. Add pause/resume and integrity-verification states with edge-case tests.

## Prototype reference
- Standalone mockup: `../mockups/p2p-swarmdrop.html`
- No external API keys are required.
- This mockup is a design and workflow reference, not a production-ready implementation.
