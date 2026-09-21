# Evals: does the pack help?

Opt-in, spends real tokens, never part of the required gate. Same tasks, two variants:

- **full**: the pack as shipped.
- **without_docs**: `ACRYL_EXTENSION_DOCS=off` removes the prompt router, the skills and the installed-extensions note; the install, verify, list, remove and
  prepare-publish tools stay (the agent can still act, it just is not told where the knowledge is).

```bash
cd runtime/acryl-harness-runtime
ACRYL_E2E_KEY_FILE=~/.secure-storage/llmproviders/deepseek/deepseek.json ACRYL_E2E_LOG=/tmp/full.jsonl \
  ACRYL_E2E_PROMPTS="$(node -e "console.log(require('../../plugins/acryl-extension-context/evals/tasks.json').tasks.map(t=>t.prompt).join('||'))")" \
  corepack pnpm exec vitest run tests/e2e-real-model.spec.ts
ACRYL_EXTENSION_DOCS=off ACRYL_E2E_LOG=/tmp/without.jsonl ... same command
node ../../plugins/acryl-extension-context/evals/summarize.mjs /tmp/full.jsonl
```

`summarize.mjs` reads the session events and reports steps, tool calls, reads of the pack's docs and examples, verify and install outcomes. Judge on those (outcome and
effort), not on the model's prose. Results of runs are recorded in `specs/037-guardrailed-self-extension/PI-PARITY.md`.

## Results

**2026-09-21, DeepSeek v4 flash, Web surface, `standard` preset, 3 tasks (`tasks.json`), one run per task and variant.**

| | full | without_docs |
| --- | --- | --- |
| Tasks with verify ok and install ok | 3 of 3 | 3 of 3 |
| Steps (model requests) | 31 | 85 |
| Tool calls | 51 | 104 |
| Reads of the pack's docs | 13 | 16 |
| Reads of the pack's examples | 16 | 4 |
| Tool errors | 0 | 0 |

Reading: both variants finished every task, so the pack is not what makes the loop possible (the install, verify and remove tools and the agent's own file and shell
tools are). What the router, skills and installed-extensions note buy is effort: about 2.7 times fewer steps and 2 times fewer tool calls, and the agent goes to the
verified examples instead of exploring. Caveats: one run per cell (no variance), one model, and "without_docs" is not a true no-docs baseline because the agent can
still find the pack by exploring the repository (16 doc reads even without the router). Treat it as a directional measurement, not a benchmark.

**2026-09-21 (later), same model and tasks, router slimmed from 919 to about 600 tokens (one absolute pack root, at most three docs per route), paired run the same day.**

| | old router (919 tokens) | slim router (about 600) |
| --- | --- | --- |
| Tasks with verify ok and install ok | 3 of 3 | 3 of 3 |
| Steps | 51 | 54 |
| Tool calls | 77 | 80 |
| Reads of the pack's docs / examples | 13 / 16 | 15 / 19 |
| Tool errors | 0 | 0 |

Reading: no measurable loss from the smaller router (3 steps apart, tasks differ in both directions, one run per cell). Note the same old router measured 31 steps and 51 tool calls
on the earlier run above, so run-to-run variance is larger than the difference: never read a single-run gap as a regression or a win.
