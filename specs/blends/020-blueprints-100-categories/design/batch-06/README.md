# ACRYL Blends — Batch 06

Ten UX mockups for categories 51–60: Simulation software, Virtualization software, Remote computing, Storage software, Distributed systems software, Messaging infrastructure, Middleware, Runtime software, Libraries and frameworks, and API / SDK software.

## Open the package

Open `index.html` in a browser, then select any prototype. Each file in `mockups/` is a standalone HTML document with inline CSS and JavaScript. No build step, npm install, network access, credentials, paid services or external API keys are required.

## Contents

- `mockups/` — 10 distinct application prototypes.
- `specs/` — 10 implementation specifications with audience, UX direction, screen map, workflows, data model, acceptance criteria and three coding-agent prompts.
- `blueprints-51-60.json` — structured blueprint handoff.
- `index.html` — gallery.
- `INDEX.md` — category and file index.

## Prototype boundaries

All records and metrics are synthetic. These mockups demonstrate UX and local state only; they are not production-ready software.

- **Simulation:** Morrow Lab uses an illustrative local model and is not a validated engineering, climate, flight or safety simulator.
- **Virtualization / Remote computing:** Host and VM controls are local fixtures. Remote Relay runs only allowlisted canned terminal responses; it does not execute shell commands, connect over SSH/RDP or transfer files.
- **Storage:** Vaultline does not inspect disks, filesystems, object stores, NAS or backup targets.
- **Distributed systems / Messaging:** Failover, replay, publishing, acknowledgements and consumer state updates are visual fixture operations only; no broker, cluster or database is contacted.
- **Middleware / API SDK:** Request traces and responses use local fixtures; no traffic is proxied and no external API is called.
- **Runtime:** Process restart and rollout actions do not touch real hosts or processes.
- **Libraries / Frameworks:** Package catalogue metadata and version values are illustrative; no registry lookup or installation is performed.

## Recommended implementation workflow

Treat each concept as an independent Blueprint repository. Implement domain entities and seed fixtures, then primary flows, route/domain tests, responsive and accessible UI, README and screenshot. Add the Blueprint to the registry only after the app is implemented and validated. These mockups are design references, not published Blends or completed applications.

## Validation

The package should be checked for HTML parsing, inline JavaScript syntax, JSON integrity, local links and ZIP integrity. Full browser interaction testing is a separate QA step.
