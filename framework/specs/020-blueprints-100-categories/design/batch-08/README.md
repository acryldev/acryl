# ACRYL Blends — Batch 08 (71–80)

Ten standalone, responsive HTML application mockups and ten agent-ready implementation specifications. These are design/workflow references, not implemented products. All data is fictional and actions are local simulations.

## Included concepts

- **71. Compliance / governance software — Northstar GRC**: Make controls, risks and evidence traceable.
- **72. Blockchain software — Blockscope Explorer**: Inspect blocks, transactions and contract activity.
- **73. Decentralized software — Federary Network**: See the shape and health of a federated network.
- **74. Peer-to-peer software — Swarmdrop**: Transfer large files through cooperating peers.
- **75. Content management — Strata CMS**: Structure content once. Publish it anywhere.
- **76. File software — Filewell**: Find, organize and understand your files.
- **77. Digital asset management — Musevault DAM**: Keep creative assets searchable, approved and licensed.
- **78. Identity software — Identra Directory**: Manage the lifecycle behind every digital identity.
- **79. Authentication software — Keyway Auth Lab**: Test the sign-in journey, not just the credential.
- **80. Cryptographic software — Cipherdesk**: Operate keys, certificates and signing workflows with care.

## Package structure

- `index.html` — visual gallery with links to each prototype and specification
- `mockups/` — 10 standalone HTML mockups
- `specs/` — 10 implementation briefs with workflows, model, safety boundaries and agent prompts
- `blueprints-71-80.json` — structured blueprint handoff data
- `INDEX.md` — navigation index

## Run locally

Open `index.html` or any file under `mockups/` in a modern browser. No build step, server, API key or external service is required.

## Implementation guardrails

Use deterministic fixtures, isolate domain logic from UI state, retain keyboard focus visibility, and test the core workflow plus empty/error states. Treat every action that implies external access (federation, file operations, authentication, keys, publishing) as a local simulation until a real integration is explicitly designed and secured.
