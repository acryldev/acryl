# Research: ACRYL YLY pet + branding

## Decision

Port the mascot as ANSI terminal pixels compiled from the sprite board at build
time, rendered/animated by a native `pi-tui` `Component`. No runtime image
decoder; no new animation library. Brand ACRYL, not DeepSeek.

## Verified facts (inspection 2026-08-29, C1)

- pi-tui 0.84.2 (pinned) exposes `HStack`, `VStack`, `TuiAltScreen`,
  `setLayoutRoot`, `requestRender`, and the `Component` contract
  (`render(width): string[]`, `invalidate()`). `Spinner` shows the self-driven
  animation pattern: own `tui` + `setInterval` + `requestRender()`.
- Sprite board `yly_animation_sprite_board.png.png` = 1448x1086 RGBA; cropping as
  a 4(col) x 3(row) grid of 362px cells yields 12 coherent character frames
  (compile script ascii preview confirms a head/face shape with ears/eyes).
- `sharp` is available in `acryl-tui/node_modules` (build-time only; the npm
  `@img/sharp-*` prebuilds are the runtime-native set the desktop packaging pulls).
- Current branding to replace: `logoArt.generated.ts` (DeepSeek whale
  `LOGO_HALF_BLOCK`), `bannerText.ts` ("DeepSeek Harness", "dsh-tui v…"),
  `TuiApp` OSC 9 wait message ("dsh-tui is waiting…"), `commands.ts` ("Exit
  dsh-tui"), `liveText.ts` `buildTerminalTitle` ("dsh-tui") + update-hint.

## Assumptions

- The 12 frames are a sufficient idle/blink/talk/work set; mode→frame mapping is
  heuristic and adjustable in `yly-programs.ts`.
- Showing the pet only when terminal width >= 65 keeps the coding area usable on
  narrow SSH terminals.
