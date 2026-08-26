# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those
roles to the strings used in this repo's tracker (`Status:` line on markdown
issues, or GitHub labels if a ticket is promoted).

| Label in mattpocock/skills | Label in our tracker | Meaning |
| --- | --- | --- |
| `needs-triage` | `needs-triage` | Maintainer needs to evaluate this issue |
| `needs-info` | `needs-info` | Waiting on reporter for more information |
| `ready-for-agent` | `ready-for-agent` | Fully specified, ready for an AFK agent |
| `ready-for-human` | `ready-for-human` | Requires human implementation |
| `wontfix` | `wontfix` | Will not be actioned |

Wayfinder tickets use a separate `Status:` vocabulary (`open` / `claimed` /
`resolved`) and a `Type:` of `research` / `prototype` / `grilling` / `task`.
That is claim state, not triage.

When a skill mentions a role (for example "apply the AFK-ready triage label"),
use the corresponding string from the table above.
