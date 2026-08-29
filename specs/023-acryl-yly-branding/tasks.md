# Tasks: ACRYL YLY pet + branding

- [x] B001 Compile the YLY sprite board into `src/yly/yly-frames.generated.ts`
  (ANSI half-block frames) via `acryl-tui/scripts/compile-yly-sprites.mjs` (sharp).
- [x] B002 Add `src/yly/yly-programs.ts` (mode->frames+interval) and
  `src/yly/yly-pet.ts` (`YlyPet` Component) with `tests/yly/yly-pet.spec.ts`.
- [x] B003 Integrate `YlyPet` into `TuiApp` as a fixed header (pet + ACRYL
  brand/model/cwd), remove the DeepSeek whale banner, wire `setMode` from the
  agent lifecycle (status/pending tools/streaming), start/stop with the TUI.
- [x] B004 Rebrand user-facing strings to ACRYL (banner, terminal title, OS C9
  message, /exit, update hint); keep pi-tui the only UI dep.
- [x] B005 Build + PTY smoke evidence + focused commit.

## Definition of done
`acryl tui` shows the animated ACRYL/YLY pet header; transcript scrolls; the
terminal-title/banner/status say ACRYL; 251 tests + typecheck + build green; the
generated frames are a build artifact (no runtime image decoder).
