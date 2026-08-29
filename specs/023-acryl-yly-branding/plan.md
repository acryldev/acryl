# Implementation Plan: ACRYL YLY pet + branding

**Design.** Compile sprites -> `yly-frames.generated.ts` (ANSI half-block frames).
`YlyPet implements Component` animates via timer + `requestRender` (Spinner
pattern), with `setMode(mode)` driving a per-mode frame sequence. TuiApp gains a
fixed `HStack` header (`YlyPet` + ACRYL brand/model/cwd) above the scrollable
transcript; the whale banner is removed. User-facing strings rebranded to ACRYL.

**Order.**
1. `scripts/compile-yly-sprites.mjs` (sharp) -> `src/yly/yly-frames.generated.ts`.
2. `src/yly/yly-programs.ts` (mode->frames+interval), `src/yly/yly-pet.ts`
   (`YlyPet`) + unit test.
3. TuiApp: add `YlyPet` to a fixed header, remove the whale banner, wire
   `setMode` from the store (status/pendingTools/streaming), start/stop with TUI.
4. Rebrand banner/terminal-title/help/update strings to ACRYL.
5. Build + PTY smoke + commit; record evidence.

**Boundaries.** No DeepSeek orientation; pi-tui stays the only UI dep; no runtime
image decoder. Generated frames are committed build output.

**Acceptance.** `acryl tui` shows the animated pet + ACRYL header; transcript
scrolls below; smoke + tests + typecheck + build green.
