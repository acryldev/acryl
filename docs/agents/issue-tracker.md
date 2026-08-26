# Issue tracker: specs/ (local Spec Kit + Wayfinder)

Issues, specs (PRDs), and Wayfinder maps for this repo live as markdown under
`specs/`. GitHub remote is `acryldev/acryl`; GitHub Issues are an
optional promotion surface, not the default store.

This is intentional: ACRYL is built by many coding agents, some without `gh`
auth, and the user asked for a `specs/` tree as the feature-block store.

## Conventions

- One **implementation milestone** per directory: `specs/<NNN-slug>/`
- Spec Kit artifacts in that directory:
  - `spec.md` — feature specification (`/speckit-specify`, also a Matt Pocock PRD)
  - `plan.md` — technical plan (`/speckit-plan`)
  - `tasks.md` — ordered implementation tasks (`/speckit-tasks`)
  - `research.md` — facts the plan waits on
- Do **not** collapse implementation tickets into one mega file once a
  milestone is being built. If `/to-tickets` runs, write
  `specs/<NNN-slug>/issues/<NN>-<slug>.md`, numbered from `01`.
- Triage state is a `Status:` line near the top of each issue file (see
  `triage-labels.md`).
- Comments append under a `## Comments` heading.

## When a skill says "publish to the issue tracker"

Create or update a file under `specs/<feature-slug>/` (creating the directory
if needed). Prefer `spec.md` for a full PRD.

## When a skill says "fetch the relevant ticket"

Read the referenced path. The user will normally pass the path or the
`NNN-slug` / issue number.

## Wayfinding operations

Used by `/wayfinder`. The map is a file with one child file per ticket.

- **Map**: `specs/000-wayfinding/map.md` — Destination / Notes /
  Decisions-so-far / Not yet specified / Out of scope.
- **Child ticket**: `specs/000-wayfinding/issues/NN-<slug>.md`, numbered from
  `01`. Body holds `## Question`. Header lines:
  - `Type: research | prototype | grilling | task`
  - `Status: open | claimed | resolved`
  - `Blocked by: [ticket title](relative/path.md)` (optional; never a bare ID)
- **Blocking**: a ticket is unblocked when every file listed in `Blocked by`
  is `Status: resolved`.
- **Frontier**: scan `specs/000-wayfinding/issues/` for files that are not
  `resolved`, have no unresolved blockers, and are not `claimed`. Lowest
  number wins.
- **Claim**: set `Status: claimed` and save **before** any work.
- **Resolve**: append the answer under `## Answer`, set `Status: resolved`,
  then append a one-line gist + relative link to the map's Decisions-so-far.

## GitHub promotion (optional)

If a ticket later needs a GitHub issue, create it with `gh` / `gh-axi` and
record the URL on the local file. Do not make GitHub the only copy.
