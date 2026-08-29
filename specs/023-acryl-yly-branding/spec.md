# Feature Specification: ACRYL YLY pet + branding

**Feature Directory**: `specs/023-acryl-yly-branding`
**Created**: 2026-08-29 (C1). **Status**: in progress.
**Input**: user direction — replace the DeepSeek whale branding with the ACRYL
"YLY" (ACRYLY) pet, and name ACRYL throughout the terminal.

## Objective

The ACRYL terminal client shows its own friendly mascot, the **YLY/ACRYLY** pet,
in the top-left header (a Claude-Code-style animated character, not the DeepSeek
whale). The tool is branded **ACRYL** everywhere user-facing, without a DeepSeek
orientation, and stays multiplatform.

## Requirements

- Compile the YLY sprite board into stable ANSI terminal frames at build time
  (no runtime image decoder; works over SSH/tmux).
- Render + animate the pet as a native `pi-tui` `Component` in a fixed header
  region, left of the brand/session info, while the transcript scrolls.
- The pet reacts to the agent lifecycle (idle / thinking / tool / streaming).
- Replace the DeepSeek whale logo and "DeepSeek Harness"/"dsh-tui" strings with
  ACRYL branding (banner, terminal title, status/help/update text).
- No DeepSeek-only assumption: the tool targets any LLM provider.

## Acceptance criteria

`acryl tui` shows the animated YLY pet + "ACRYL" header; the transcript scrolls
underneath; `--version`/`--json` smoke still pass; tests + typecheck + build
green; the generated pet frames are a build artifact (no image decoder at runtime).

## Non-goals

No GUI/Web branding parity, no new animation library, no runtime sprite/image
dependencies. Keep pi-tui as the only UI dependency.
