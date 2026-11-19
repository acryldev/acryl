# 80. Cryptographic software — Cipherdesk

## Product intent
A cryptographic operations workbench for reviewing key inventory metadata, certificate chains, signing requests and HSM/enclave status using synthetic fixtures.

**Audience:** Platform security engineers, PKI operators and teams managing certificate lifecycles.

**Positioning:** Operate keys, certificates and signing workflows with care.

## UX architecture
A security operations console with a key-custody inventory, certificate-chain viewer and signing request queue. The interface focuses on lifecycle, ownership and auditability—not exposing key material.

### Screens and regions
1. Key inventory with purpose, owner and rotation date
2. Certificate chain and expiry view
3. Signing request review and status
4. HSM / secure-enclave health and audit events

## Core workflows
1. Select a synthetic key record and inspect metadata and rotation status.
2. Open a certificate and inspect its parent/issuer chain.
3. Review a signing request and approve or reject the demo operation.
4. Inspect HSM health and a non-sensitive audit event trail.

## Domain model
KeyRecord, KeyVersion, Certificate, CertificateAuthority, SigningRequest, HsmDevice, RotationEvent, CryptoAuditEvent.

## Interaction requirements
- The prototype must work with seeded data and without a server or paid third-party API.
- Every primary control shown in the mockup must have a meaningful local interaction or a clearly identified demo-only state.
- Keep this category's workflow and visual composition distinct from the other blueprints.
- Use semantic HTML, visible keyboard focus and responsive layouts with no horizontal page overflow.
- Separate persisted domain data from transient selection and editor state in a production implementation.

## Scope and safety boundary
No actual encryption keys, private key bytes, certificates trusted by browsers, signing operations, wallet secrets or cryptographic claims. All operations are simulated with clearly labeled placeholder material.

## Acceptance criteria
- A user can complete the key workflow in the seeded demo without external credentials or services.
- Primary success, empty, selected, in-progress and error states are represented where relevant.
- Domain logic is testable separately from rendering and uses deterministic fixtures.
- The README explains purpose, audience, local run command and three coding-agent prompts.
- The registry entry describes the category, app purpose and supported demo workflows.

## Coding-agent prompts
1. Implement key metadata and lifecycle models while ensuring secret material is never serialized to UI state.
2. Build a certificate-chain inspector with expiry and issuer relationships using synthetic certificates.
3. Add a signing-request queue and rotation policy simulator with tests for approval and expiry states.

## Prototype reference
- Standalone mockup: `../mockups/cryptography-cipherdesk.html`
- No external API keys are required.
- This mockup is a design and workflow reference, not a production-ready implementation.
