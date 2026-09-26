# ACRYL system prompt and tool size: measurements and proposal

Measured 2026-09-26 with `docs/system-prompt/budget.md` (regenerate with the command in `docs/system-prompt/README.md`). Sizes are exact characters; tokens are an estimate at 3.4 characters per token, calibrated on the tool definitions against the owner's measurement (29,208 characters were 8.7K tokens in the UI). The UI's system-prompt figure (about 4.6K tokens) is larger than the captured system message (10,221 characters, about 3.0K tokens) because the UI also counts what the workspace adds (instruction files, skill catalog); the capture does not see those.

## What ACRYL adds on top of stock DSH (Web, standard preset)

| Item | Chars | Est. tokens |
| --- | ---: | ---: |
| Section `acryl_extension_docs` (the extension router) | 2,404 | 707 |
| Section `app_web-surface` | 1,029 | 303 |
| Identity line (replaces the stock one) | 276 | 81 |
| Tool `acryl_install_plugin` | 550 | 162 |
| Tool `acryl_verify_plugin` | 443 | 130 |
| Tool `acryl_extension_lookup` | 430 | 126 |
| Tool `acryl_prepare_publish` | 408 | 120 |
| Tool `acryl_list_plugins` | 345 | 101 |
| Tool `acryl_workspace_status` | 320 | 94 |
| Tool `acryl_remove_plugin` | 313 | 92 |
| **ACRYL total** | **6,518** | **about 1,900** |

This matches the owner's observation (about 1K more tokens of tools and 1K more of prompt than stock). The larger cost is upstream's own: the whole tool list is 8.6K tokens, led by `workflow` (3,986 chars, 1.2K tokens) and `bash` (3,242 chars, 0.95K tokens), which ACRYL does not own.

## Proposal (nothing applied yet; each change is independent)

| # | Change | Expected saving | Behaviour risk |
| --- | --- | ---: | --- |
| 1 | Drop `acryl_workspace_status`: the working directory is already in `<cwd>` and the surface in `app_web-surface`. | about 94 tokens | Low. The tool answers questions the prompt already answers. |
| 2 | Shorten the extension router from 2,404 to about 900 characters: keep the "call `acryl_extension_lookup` first" rule and the plugin-type list, move the examples behind the lookup tool. | about 440 tokens | Low to medium. Routing quality must be re-checked with a few extension requests. |
| 3 | Expose the five plugin-management tools (`install`, `verify`, `prepare_publish`, `remove`, `list`) only after `acryl_extension_lookup` has been called in the session, instead of on every turn. | about 600 tokens (2,039 chars) | Medium. Needs the tool registry to add tools mid-session; if it cannot, keep them and skip this. |
| 4 | Tighten `app_web-surface` (1,029 chars) to the facts the model acts on. | about 120 tokens | Low. |
| 5 | A lean agent preset that leaves out rarely used upstream tools (`ralph`, `workflow`, the goal trio, `subagent_fork`, `interrupt_agent`, `send_message`, `list_agents`), chosen by the user. | up to about 3,500 tokens | Medium. Loses features unless chosen deliberately; must be opt-in, and needs a check of how presets pick tools. |

Changes 1 to 4 together save about 1,250 tokens (roughly two thirds of ACRYL's own overhead) at low to medium risk. Change 5 is the only large lever and belongs to a product decision (a preset the user selects).

## Guard

`plugins/acryl-system-prompt/drift/budget.json` holds a ceiling for the system prompt (machine-specific sections excluded) and for the tool definitions, per surface. `runtime/acryl-harness-runtime/tests/system-prompt-shape.spec.ts` fails, naming what grew, when either passes its ceiling. Raise it on purpose with `ACRYL_UPDATE_DRIFT=1` after reading `docs/system-prompt/budget.md`.
