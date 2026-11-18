# ACRYL Blends — Batch 07 (61–70)

Ten category-specific application mockups and agent-ready blueprint specifications.

## Included
- `index.html` — gallery linking each prototype and spec
- `mockups/` — 10 standalone interactive HTML prototypes
- `specs/` — 10 product and implementation specifications
- `blueprints-61-70.json` — structured agent handoff
- `INDEX.md` — file-by-file index

## Categories
61 Integration software — Relaycraft
62 Mobile software — Mobiary
63 Desktop software — Canvasmith Desktop
64 Web software — Pagefoundry
65 Terminal software — Termforge
66 Extended reality software — Luma Space
67 Human-computer interaction software — Sensepath Lab
68 Localization software — LingoDesk
69 Accessibility software — Clearpath Audit
70 Backup / recovery software — Restorepoint

## Design and implementation principles
- Each concept has a purpose-built layout and core interaction, not a shared dashboard with swapped labels.
- Each prototype runs as a standalone HTML file with local seeded data.
- No paid API keys or external services are needed.
- Prototypes are references for future Blueprint implementations, not completed production applications.
- Build each implementation in its own repository as required by the ACRYL Blends category blueprint initiative.

## Run
Open `index.html` in a browser, or open any file under `mockups/` directly. No build step is required.

## Safety and fidelity notes
Terminal commands are simulated from an explicit allowlist and never reach a host shell. XR and HCI device signals are simulated; no camera, microphone, eye tracking, BCI or haptic hardware is accessed. Accessibility findings are sample heuristics, not a WCAG conformance certificate. Backup and restore actions operate on seeded metadata only and do not touch real data. Integration runs and web publishing are local simulations.
