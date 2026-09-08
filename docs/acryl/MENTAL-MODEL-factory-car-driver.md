# Mental model: the factory, the car, and the driver

**Status:** canonical framing. Non-normative (the constitution and specs are the
law); this doc exists so everyone pictures the same thing.

**Related:** [constitution](../../.specify/memory/constitution.md) Principles I,
II, IV, V; [orientation](../onboarding/orientation_spec_acryl.md) §1, §3;
[roadmap](../ACRYL-ROADMAP.md) M9; `specs/028-harness-engine-swap/`;
`specs/000-wayfinding/issues/06-zero-harness-driver.md`.

---

## The picture

- **A factory** — deterministic walls, fixed rails, an assembly logbook.
- **A car** driving *inside* the factory, on the rails, its whole life.
- **A driver** in the car — the brain deciding where to turn.

Three things swap, at three rates. The factory does not.

| Layer | ACRYL reality | Swap tier | Cadence | Owns |
| --- | --- | --- | --- | --- |
| **Driver / brain** | The LLM model (Claude, DeepSeek, GPT, local) via `ModelRuntime` / provider | Tier 1 | per turn, trivial | token-by-token decisions |
| **Car subsystems** (steering, dashboard, tools module, memory module, panels) | Cordis plugins mounted by Loader rows - "everything is a plugin" | Tier 2 | HOT remount, no engine change | one bounded capability each |
| **The whole car** (chassis + engine block + every subsystem) | The **harness engine** - `AcrylEngine` adapter, `ctx.runtime.engine` = `'dsh'` \| `'pi'` | Tier 3 | HOT / WARM / COLD - **M9** | the agent loop, engine-native sessions, tool + model wiring, approvals plumbing for one profile episode |
| **The factory** | **ACRYL** | Tier 0 | never | the room, canonical chat + context, context relay, task artifacts, worker identity, the canonical durable session record, capability-package format + provenance, git worktrees, review flow, approval policy |

## Closed vs open harness

- **Closed-source harness** = a vendor CLI whose runtime you cannot open
  (Claude Code and similar). Fixed system, not easily changed. ACRYL can still
  *drive* one as an opaque worker (provider capabilities, not agent names,
  decide what ACRYL may do with it).
- **Open-source harness** = **DSH + Cordis** and **pi**. The hood opens; Tier 2
  subsystems come out and go back independently. These are the two engines M9
  makes interchangeable.

## Two philosophies, both inside the factory

- **DSH / Cordis philosophy** - the car is *modular* (Tier 2). You do not swap
  the whole car to change the tools module. Composable subsystems, reversible
  effects, stable service contracts across provider replacement.
- **pi.dev philosophy** - the engine block is *minimal and efficient* (the
  "same model" core). Small transport-neutral primitives, tree-shakeable
  providers, a clean embedding SDK.

ACRYL keeps **one** lifecycle system (Cordis) and maps every engine onto it.
It does not run a second composition runtime (`@earendil-works/chord` is a
reference to mine, not a runtime to adopt).

## What "swap the driving agent" means - and does not

"Swap the driving agent" = **swap the car** (Tier 3: the entire harness
runtime, `dsh` -> `pi`). It does **not** mean swap the model.

The exploded-view diagram this doc is based on labels the engine block
"**model**". ACRYL's "model" is the **driver** (the LLM). Whenever that diagram
is shown, state this explicitly: *engine swap is the car, never the brain.*

## Where the car analogy misleads

In a real factory the car rolls off the line and the factory never touches it
again. **ACRYL is not like that.** The factory stays wrapped around the running
car for its entire life. Every turn, the car writes into the factory's canonical
record ("model-visible means logged"). The car runs on rails *inside* the
building, always.

That is the ACRYL thesis: **continuity is not handed between cars - it is
retained by the building the cars drive through.** Swap the car mid-drive
(`/reload`), and the odometer, the logbook, the cargo, and the destination are
all factory-owned and untouched (FR-008 in `specs/028-harness-engine-swap`).

Second caveat: "deterministic and reliable factory" does not mean "frozen
code". ACRYL itself is Cordis plugins (Principle I). The determinism lives in
the **contracts and the durable record**, not in ACRYL being unchangeable.

## The three-plus-one swap tiers, restated

```text
Tier 0  Factory (ACRYL)          never swapped        the invariant
Tier 1  Brain (LLM model)        per turn             trivial
Tier 2  Subsystem (Cordis row)   HOT remount          one capability at a time
Tier 3  Car (harness engine)     HOT / WARM / COLD    M9 - dsh <-> pi <-> (combo / zero-harness, later)
```

Future Tier 3 cars: the DSH+pi combo engine (ticket 04 follow-on) and the
Zero-Harness composable driver (ticket 06). Both are post-M9; both are still
just cars driving inside the same factory.

## External positioning: DSH gave the direction; ACRYL builds the product

DataCamp's *DeepSeek Harness vs Claude Code*
(<https://www.datacamp.com/blog/deepseek-harness-vs-claude-code>, developer
preview review) describes DSH as *"not a finished product"* but *"a configurable
infrastructure platform"* where the agent loop *"can be replaced through
`cordis.patch.yml`"* and *"the runtime itself is the project"*. It lists the
friction: hand-authored config, manual credentials / model IDs / endpoint rules,
*"updates may break existing setups"*, single-surface CLI, a broken Windows
sandbox, steeper onboarding.

That review is the case for ACRYL. DSH demonstrated the direction - loop as a
plugin, model-agnostic, append-only event-stream sessions, replaceable
sandboxes. ACRYL turns the direction into something a person starts and uses:
choose an engine, run on a real project, across CLI / GUI / Web, with the room
and continuity constant.

| Layer | Owner | Swap unit | Review's framing |
| --- | --- | --- | --- |
| Fixed loop, one model | Claude Code | nothing (skills/hooks wrap a constant) | *"packages its built-in loop"* |
| Loop as a plugin, many models | **DSH** | the loop, via `cordis.patch.yml` | *"the loop itself can be replaced"* |
| Harness as a plugin, many harnesses | **ACRYL** (M9) | the whole engine (`dsh` <-> `pi` <-> ...), via a Loader row + `/reload` | not in the review - the gap ACRYL fills |
| Continuity above all harnesses | **ACRYL factory** | never swapped | - |

The review's line *"Harness can host Claude, but Claude Code cannot host
DeepSeek"* is the asymmetry ACRYL generalizes: **ACRYL can host any harness; no
harness hosts ACRYL.**

Two findings from the review that shape M9:

- The hands-on test produced **byte-identical patches**; the 55s vs 125s gap was
  **approval friction + a broken sandbox**, not loop or model quality. Engines
  are more interchangeable than they look. The engine adapter's real job is the
  fidelity contract - approvals, sandbox, HMR (028 FR-012 / SC-008) - and ACRYL
  owning the approval / sandbox UX so every car rides smoothly.
- DSH ships a **"Minimal" runtime mode** (persistent bash + string-replace
  only). It is a proto-form of the Zero-Harness driver (ticket 06).

**Calibration:** "start ACRYL, choose engine, go" is the destination, not the
current state. Absorbing the config complexity the review describes is M2 + M3 +
`specs/024-acryl-cli-login` + the 028 engine adapters. M9 wires only `acryl-cli`;
Electron and Web adopt the engine-neutral path in later slices. State the
external claim to match the built state, per the constitution.
