# Real-agent runs against 1.0.0-rc.1 (M10 step g)

The gate is `scripts/verify-coding-agent.mjs <version> --agent <agent> ...` (manual: it uses real models). Each run makes a fresh app from the **published** `1.0.0-rc.1` (the notes and chat starters through the published `create-acrylblends`), gives a headless coding agent one task and only the docs inside the folder, in a scratch `HOME` with a minimal environment and a scrubbed `PATH`, and passes only when the app's own tests and type-check pass, a test was added, source changed, and the app answers the route (the notes probe signs up, logs in, creates, edits and deletes a note over HTTP; the desktop window opens on it). Run on 2026-10-28.

| App the agent gets | Task | codex | pi (deepseek-v4-pro) | claude |
| --- | --- | --- | --- | --- |
| `agent` template | add a `/customers/count` route with a test | **PASS**: 1 turn, 7 commands and edits, 21 s | **PASS**: 19 turns, 103 s | **FAIL**: 5 turns, 20 s. It asked which data source to use (a state cell, `db` or `kv`) and changed nothing: the task names no data. Not a quota stall |
| `notes` starter (with the desktop shell) | add tags to notes (a comma separated field, shown in the list, filter by tag, tests) | **PASS**: 1 turn, 11 commands and edits, 72 s | **PASS**: 40 turns, 327 s | not run |
| `chat` starter | add a `/customers/count` route with a test | **PASS**: 1 turn, 7 commands and edits, 36 s | **PASS**: 12 turns, 51 s | not run |
| `notes` starter | add `GET /customers/count` returning the number of rows in the `customers` table, with a test (the task names the data) | not run | not run | **PASS**: 15 turns, 62 s |

Claude was run twice and no more, because its account was close to its weekly limit. The first run (the `agent` template row) asked which data source to use and changed nothing. The second, the same day, used a task that names the data: it wrote `migrations/002-customers.sql` (a `customers` table), the route (`SELECT COUNT(*) ... FROM customers`) and a test that inserts two rows and asserts the count, and passed (the app's 16 tests pass; I read the code and ran the tests by hand because the gate does not run its HTTP route probe for this setup: its result says `route not probed`). No quota stop happened in either run. `isolation` for Claude is the real `HOME` for its login only, project settings only, and tools limited to npm, node, ls, cat and edits.

## What else was run, and what it showed

Two runs that do not belong in the table because the setup was wrong for the task, kept so the numbers are not cherry-picked:

- The same `notes` and `chat` presets with the starter as the app (`--setup notes`, `--setup chat`) ask the agent to *build* an app that already exists, so nothing changes and the gate fails "source changed false": a configuration mistake of mine, not a result.
- The `notes` and `chat` presets from the blank app (the agent builds the whole app from the docs): Codex built notes and passed every behaviour probe except `npm run desktop exists` (the blank setup has no desktop shell and the task does not ask for one); pi built notes in 129 turns and 1008 s, and the desktop window did not open (same reason); Codex did nothing for chat from blank (it ended after 13 commands without a source change), and pi hit the gate's 2400 s limit on chat from blank. Building a whole chat app from the docs alone, from nothing, is not something the 1.0 evidence claims.

## Reading the result

- On the tasks a user gives an existing app (add a route, add a feature to a starter), Codex and pi pass on all three starters with the published 1.0.0-rc.1, in 21 to 327 s.
- Each agent checked its own work through the app's own tests and type-check, which the gate then ran itself.
- Claude's first run showed the ambiguity of that task (no data source named), not a framework failure: the second, with the data named, passed in 62 s.
