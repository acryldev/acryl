# The terminal UI (CLI): pi-tui components, theming and branding

Working example, copy from it: `../examples/packages/tui-overlay-themed/` (themed `SelectList` overlay; a test renders it at five widths
and checks no line overflows). Basic command registration: `../examples/packages/tui-command-basic/` and `tui-command.md`.

## What a plugin can do in the terminal

Exactly one presentation seam: `ctx.get('tuiCommands')?.register({ command: '/name', description, packageName, overlay?, open({ tui, close }) })`.
`open` returns a pi-tui `Component`. The overlay is full screen by default; pass `overlay: { width: '60%', anchor: 'center', margin: 2 }`
for a popup. The command list refreshes live when a plugin registers or removes a command, so a newly installed command works without restarting the TUI. The built-in overlays
(`/model`, `/plugins`, `/tools`, `/trajectory`, ...) and the chat view are not replaceable. Everything else works through tools,
commands (`ctx.commands`) and prompts, which have no visual design.

## pi-tui in one page

`@earendil-works/pi-tui` (pinned by the CLI; list it as a dependency of your plugin) renders to native terminal scrollback. A
**Component** is `{ render(width): string[], handleInput?(keyData): void, invalidate(): void }`:

- `render(width)` returns one string per line. **No line may be wider than `width`** (visible columns, ANSI colors not counted).
  Use `truncateToWidth(line, width)`, `wrapTextWithAnsi(text, width)` and `visibleWidth(text)` from pi-tui; never rely on `.length`.
- `handleInput(keyData)` receives raw key data; match with `matchesKey(data, Key.enter)`, `Key.escape`, `Key.up`, ...
- Built-ins: `Container` (children), `VStack`/`HStack` (layout), `Box` (padding, background), `Text`, `TruncatedText`, `Markdown`,
  `SelectList` (choose from items; `onSelect`, `onCancel`), `SettingsList`, `Input`, `Editor` (multi-line), `ScrollView`,
  `Loader`/`CancellableLoader`, `Spacer`, `Image`.
- Colors are functions `string -> string` that wrap ANSI escapes. The built-in components take theme objects of such functions
  (`SelectListTheme`, `EditorTheme`, `MarkdownTheme`, `SettingsListTheme`).

## Theming in the terminal

- The terminal owns its background and default foreground; color FOREGROUNDS for brand, state and emphasis only. Do not paint
  panel backgrounds.
- Keep a semantic `PALETTE` (primary, secondary, muted, success, warning, error, info) in one object and build the theme
  objects from it (the example does). Use 24-bit color (`\x1b[38;2;r;g;bm`); do not assume a light or dark terminal.
- The CLI's own palette lives in `apps/acryl-cli/src/tui/theme.ts` (`primary #4F6BFE`, `secondary #38BDF8`, `accent #818CF8`,
  `reasoning #A855F7`, `success #34D399`, `warning #FBBF24`, `error #F87171`, `muted #94A3B8`) and is adapted to pi-tui in
  `tui/piTheme.ts`. It is compiled in and NOT exposed to plugins: a plugin cannot read or change it, so it carries its own.

## Branding in the terminal (source change and rebuild)

Banner and wordmark: `apps/acryl-cli/src/tui/acrylMark.ts` (half-block art), `bannerText.ts`, `logoArt.generated.ts`, the mascot in
`apps/acryl-cli/src/yly/`, the palette in `tui/theme.ts`. Changing these means editing the repository and rebuilding
(`corepack pnpm run tui` runs the dev build). Only when working inside the ACRYL repository; an installed CLI cannot be restyled by a
plugin. Say that, and offer a themed overlay instead.

## Rules

1. Width safety first: test `render` at several widths (12, 24, 40, 80, 200). Wide characters (CJK, emoji) need `visibleWidth`.
2. Handle Escape and Enter; always call `close()`; never leave the terminal in raw state.
3. Keep overlays small and fast; no network in `render`.
4. Do not write to stdout directly; return lines.
5. State honestly that you could not see it: ask the user to run the command in a real terminal.
6. Reference: `reference/subsystems/commands.md` (chat commands, a different seam), the pi-tui typings in `node_modules/@earendil-works/pi-tui/dist`.
