# Docs coverage: every feature and capability, and whether acryl.dev shows it

Spec 001 T091 (`specs/001-acryl-refactor-improvements-and-tech-debt/tasks.md`). The owner, 2026-10-18: "on docs we need to check coverage and really list every single feature and capability and keep track of what is covered / not yet covered in long lists for general overview to not lose anything".

**How to keep it:** a feature that ships, changes or goes away updates its row in the same change. A row is covered when https://acryl.dev/docs explains it **and** shows a current screenshot (or terminal capture for a CLI feature). Screenshots come from an isolated Desktop (`scripts/live-run.mjs desktop --no-key --inspect <port>`, then `scripts/inspect-page.mjs --port <port> shot <file>`), never from the owner's own app.

**Sources of this list (2026-10-18):** the development log's 298 entries, the spec folders, `runtime/acryl-harness-runtime/src/coding-capabilities.ts`, the `acryl` CLI grammar (`apps/acryl-cli/src/cli/grammar.ts`), the chat commands the plugins register, Settings' sections and the feature check (`scripts/check-features.mjs`).

**What acryl.dev has today:** the home page (marketing text, no screenshots of the app) and `/docs`, one page last changed 2026-08-26 with four sections: install a DSH package, publish an ACRYL package to npm, the compatibility contract, the runtime layers. Plus `/packages` (the plugin catalog) and `/ui` (the UI library gallery).

Columns: **Built**: `yes`, `partly`, `no` (described somewhere but not built). **Site**: `docs` (explained on /docs), `home` (mentioned on the home page only, no screenshot), `catalog` / `ui` (its own site page), `-` (nowhere). **Shot**: a current screenshot on the site, `yes` or `-`.

Totals at the end of the file, counted from the rows.

## 1. Install, surfaces and updates

| # | Feature | Surfaces | Spec / where | Built | Site | Shot |
|---|---|---|---|---|---|---|
| 1.1 | macOS app (DMG, one CPU per build, about 0.7 GB installed) | Desktop | 027, release 0.2.x | yes | home | - |
| 1.2 | Windows installer (NSIS), clean uninstall | Desktop | 027, 001 T090 | yes | - | - |
| 1.3 | Linux package (.deb) | Desktop | 027 | yes | - | - |
| 1.4 | CLI from npm (`npm i -g acryl`) | CLI | 025 | yes | home | - |
| 1.5 | Local Web (`acryl web`), same runtime and plugins | Web | 034 | yes | home | - |
| 1.6 | Serve from a container, agents keep working with the browser closed | Web | release 0.2.5 | yes | - | - |
| 1.7 | "Update available" notice from ACRYL's own release feed | Desktop | 2026-10-09 | yes | - | - |
| 1.8 | Nix flake (CLI and Desktop) | CLI, Desktop | 2026-08-31 | yes | - | - |
| 1.9 | Compatibility mode (stock DSH client) and advanced mode | Desktop | 040 | yes | - | - |
| 1.10 | One shared workspace for Web and Desktop | Web, Desktop | 040 Phase 7 | yes | - | - |

## 2. Workspace tree, projects and workspaces

| # | Feature | Surfaces | Spec / where | Built | Site | Shot |
|---|---|---|---|---|---|---|
| 2.1 | Project tree: projects, git worktrees, folders that are not git | Web, Desktop | 040 T128-T135 | yes | home | - |
| 2.2 | Add a project with the system folder picker (macOS, Windows, Web chooser) | Web, Desktop | 040 T134, T143 | yes | - | - |
| 2.3 | New worktree from the tree | Web, Desktop | 040 | yes | - | - |
| 2.4 | Chats per branch, bound to their worktree | Web, Desktop | 040 T142 | yes | - | - |
| 2.5 | Open chats only, the rest behind "N earlier chats" | Web, Desktop | 040 T087 | yes | - | - |
| 2.6 | Rename a chat or tab from the tree or the tab strip | Web, Desktop | 040 T140 | yes | - | - |
| 2.7 | Hide a chat (hover ×), remove a project, survives a reload | Web, Desktop | 040 T136-T138 | yes | - | - |
| 2.8 | Workspaces: named sets of projects, switched from the strip under the tree, own tabs each | Web, Desktop | 043 | yes | - | - |
| 2.9 | Shared Context workspace: a brief every agent reads (chat, Claude Code, Codex, Pi) | Web, Desktop | 043 | yes | - | - |
| 2.10 | Agent lists, switches, creates and adds to workspaces after asking | all | 043 | yes | - | - |
| 2.11 | Board cards name their chats and worktrees | Web, Desktop | 040 | yes | - | - |

## 3. The canvas: tabs and layout

| # | Feature | Surfaces | Spec / where | Built | Site | Shot |
|---|---|---|---|---|---|---|
| 3.1 | Tab strip with the "+" menu | Web, Desktop | 040 | yes | home | - |
| 3.2 | Chat tab (DSH's agent, AcrylDSH Chat) | Web, Desktop | 040 T132 | yes | home | - |
| 3.3 | Terminal tab (a real PTY) | Web, Desktop | 040 | yes | home | - |
| 3.4 | Agent tabs: Claude Code, Codex and other CLI agents in a terminal | Web, Desktop | 040 | yes | home | - |
| 3.5 | Browser tab (any HTTP or HTTPS address) | Web, Desktop | 040 | yes | home | - |
| 3.6 | File tab (CodeMirror editor) | Web, Desktop | 040 | yes | home | - |
| 3.7 | Diff tab (git changes, comment on a line) | Web, Desktop | 040 | yes | home | - |
| 3.8 | Board tab (kanban, drag cards) | Web, Desktop | 040 | yes | home | - |
| 3.9 | Doc tab | Web, Desktop | 040 | yes | - | - |
| 3.10 | Tab types added by plugins | Web, Desktop | 040 | yes | - | - |
| 3.11 | Split view with a draggable divider, fullscreen | Web, Desktop | 040 | yes | - | - |
| 3.12 | Terminal panel in three modes (stacked, bottom, side by side) | Web, Desktop | 040 | yes | - | - |
| 3.13 | Attention queue: an agent that needs you is flagged (Claude Code hooks) | Web, Desktop | 040 T127 | partly (Claude Code only) | home | - |

## 4. Files, editor and comments

| # | Feature | Surfaces | Spec / where | Built | Site | Shot |
|---|---|---|---|---|---|---|
| 4.1 | Files tab: ACRYL's file tree (T3 Code style) in DSH's Files tab | Web, Desktop | 040 | yes | - | - |
| 4.2 | Clickable breadcrumbs in the editor | Web, Desktop | 040 | yes | - | - |
| 4.3 | Line comments: "+" on a line, a note with Comment to clipboard, All comments to clipboard, × | Web, Desktop | 040 T145 | yes | - | - |
| 4.4 | Comments page: every comment of the worktree, copy, send to a terminal or agent, one or all | Web, Desktop | 040 T145 | yes | - | - |
| 4.5 | Diff comments like file comments | Web, Desktop | 040 T146 | no | - | - |
| 4.6 | A picked element becomes a comment | Web, Desktop | 040 T147 | no | - | - |
| 4.7 | A file opened from a chat link opens in ACRYL's editor | Web, Desktop | 001 T086 | no (DSH's preview) | - | - |

## 5. Right panel and git

| # | Feature | Surfaces | Spec / where | Built | Site | Shot |
|---|---|---|---|---|---|---|
| 5.1 | Start page (the guide), scrolls when tall | Web, Desktop | 040 | yes | - | - |
| 5.2 | Review tab (comments sent from diffs) | Web, Desktop | 040 | yes | home | - |
| 5.3 | Checks tab | Web, Desktop | 040 | yes | - | - |
| 5.4 | Comments tab | Web, Desktop | 040 T145 | yes | - | - |
| 5.5 | Changes and the commit box | Web, Desktop | 040 | yes | - | - |

## 6. Agents and models

| # | Feature | Surfaces | Spec / where | Built | Site | Shot |
|---|---|---|---|---|---|---|
| 6.1 | Settings > Models: providers, keys, choose a model | all | 2026-09-08, 2026-10-11 | yes | - | - |
| 6.2 | Sign in with an account (Claude, ChatGPT, DeepSeek) on Web, Desktop and the terminal | all | 035, 2026-10-11/12 | yes | - | - |
| 6.3 | Agent presets (`/presets`, Settings > Agent presets) | all | 2026-08-29 | yes | home ("33-agent roster") | - |
| 6.4 | Custom agents (Settings > Agents) | Web, Desktop | 040 Phase 9 | yes | home | - |
| 6.5 | Interactive authorization prompts (approve a tool call) | all | 2026-08-31 | yes | - | - |
| 6.6 | Swap agents mid-project keeping context, structured handoffs | - | 004 | no (home page claims it) | home | - |

## 7. Command palette, shortcuts, Settings

| # | Feature | Surfaces | Spec / where | Built | Site | Shot |
|---|---|---|---|---|---|---|
| 7.1 | Command palette (Cmd/Ctrl+Shift+P) | Web, Desktop | 040 | yes | - | - |
| 7.2 | Settings > Shortcuts lists every command and its keys | Web, Desktop | 2026-10-13 | yes | - | - |
| 7.3 | Settings opens with Cmd/Ctrl+, | Web, Desktop | 2026-10-13 | partly (fails in the feature check) | - | - |
| 7.4 | Settings sections: General, Models, Built-in plugins, Agent presets, Agents, Tabs, Command palette, Shortcuts, Agent Control, Desktop | Web, Desktop | `acryl-settings` | yes | - | - |
| 7.5 | Settings > Tabs (which tab types the "+" menu offers) | Web, Desktop | 040 | yes | - | - |

## 8. Pointing at the screen and Agent Control

| # | Feature | Surfaces | Spec / where | Built | Site | Shot |
|---|---|---|---|---|---|---|
| 8.1 | Element picker (Cmd+Shift+.): outline an element, copy its selector and text | Web, Desktop | 039 | yes | - | - |
| 8.2 | Agent Control: the agent reads the window, clicks, types, opens panels, switches plugins, each step approved and logged | Web, Desktop | 041 | yes (Scope A) | home | - |
| 8.3 | `acryl control`: drive a running app from the terminal | CLI | 041 Scope B | yes | home | - |
| 8.4 | `acryl doctor` and repair with undo (rescue a broken install) | CLI | 041 | yes | home | - |

## 9. Plugins

| # | Feature | Surfaces | Spec / where | Built | Site | Shot |
|---|---|---|---|---|---|---|
| 9.1 | DSH's Plugins page: Add plugin from `github:owner/repo`, on/off, uninstall | Web, Desktop | 044 D7 | yes | - | - |
| 9.2 | Lifecycle tab: every plugin row, version, disable, reload | Web, Desktop | 016 | yes | home | - |
| 9.3 | Architecture tab: the Cordis plugin graph | Web, Desktop | 017 | yes | - | - |
| 9.4 | One on/off store for both pages | Web, Desktop | 001 T089 | yes | - | - |
| 9.5 | Hot reload: a plugin installed or changed works without a restart | all | 032 | yes | - | - |
| 9.6 | The agent builds plugins (self-extension): docs, examples, verify, `/reload` | all | 037 | yes | home | - |
| 9.7 | Save a plugin to the app's store, version it | all | 044 | yes | - | - |
| 9.8 | Share a plugin to GitHub (private or public, secret check) | all | 044 | yes | - | - |
| 9.9 | Share a plugin to npm (private scoped or public) | all | 044 | yes | partly (docs: npm publish by hand) | - |
| 9.10 | Pull a plugin from GitHub, npm, the store or a file; checksum and service contract checked | all | 044 | yes | partly (docs: DSH's install command) | - |
| 9.11 | Update a pulled plugin, roll back to a kept version | all | 044 | yes | - | - |
| 9.12 | The agent's plugin tool (asks before sharing or pulling) | all | 044 | yes | - | - |
| 9.13 | Service contract (needs and adds) in each plugin | all | 044 | yes | docs (contract, older form) | - |
| 9.14 | Dotted plugin names (`app.sidebar.date-filter`) | all | 044 D9 | yes | - | - |
| 9.15 | Catalogs: acryl.dev/packages and cordisplugins.github.io | site | 044 | yes | catalog | - |
| 9.16 | Market plugin (optional, off by default) | Desktop, Web, CLI | 030, 034 | yes | - | - |
| 9.17 | Plugin buttons on each plugin's page; every plugin listed by origin | Web, Desktop | 040 T148 | no | - | - |

## 10. Blends (the whole app)

| # | Feature | Surfaces | Spec / where | Built | Site | Shot |
|---|---|---|---|---|---|---|
| 10.1 | `acryl new <dir>`: a new app with the builder inside, its own home, port and data | CLI | 036 | yes (framework checkout only, T013) | - | - |
| 10.2 | Blueprints: Blank and starters; the registry at acrylblends.github.io | CLI, site | 036 T014a | yes | - | - |
| 10.3 | `blend.yaml` and `blend.lock.json` | all | 036 | yes | - | - |
| 10.4 | `/blend snapshot`, `verify`, `apply`, `ledger` | all | 036 | yes (pulled plugins missing, T026) | - | - |
| 10.5 | `acryl save`, `acryl remote connect`, `/app save`, `/app connect` | all | 036 | yes | - | - |
| 10.6 | `acryl new --from <git URL or registry id>` | CLI | 036 | yes | - | - |
| 10.7 | Apps are isolated (two apps never share a home, port or data) | all | 036 | yes | - | - |
| 10.8 | A configurable brand for an app | all | 036 | partly (T015) | - | - |
| 10.9 | Settings, workspaces, pull with a diff, share to git or registry, the Blends page | Web, Desktop | 036 T026-T031 | no | - | - |

## 11. Terminal (CLI) app

| # | Feature | Surfaces | Spec / where | Built | Site | Shot |
|---|---|---|---|---|---|---|
| 11.1 | `acryl` terminal app (pi-tui), durable sessions | CLI | 019 | yes | home | - |
| 11.2 | `/login`, `/logout`, `/model`, `/presets`, `/clear` | CLI | 024 | yes | - | - |
| 11.3 | `/files`, `/plugins` (fuzzy search), `/market` | CLI | 034 | yes | - | - |
| 11.4 | `acryl plugin list`, `enable`, `disable`, `doctor` | CLI | 034, 044 | yes | - | - |
| 11.5 | YLY, the terminal pet | CLI | 023 | yes | - | - |
| 11.6 | Session stats | CLI | 2026-08-29 | yes | - | - |

## 12. UI library and look

| # | Feature | Surfaces | Spec / where | Built | Site | Shot |
|---|---|---|---|---|---|---|
| 12.1 | `@acryl/ui`: one component set for Web, Desktop and the terminal | all | 038 | yes | ui | yes (live gallery) |
| 12.2 | Terminal UI layer and themes | CLI | 038 | yes | - | - |
| 12.3 | ACRYL brand on every surface | all | 023 | yes | - | - |

## 13. For plugin authors and contributors

| # | Feature | Surfaces | Spec / where | Built | Site | Shot |
|---|---|---|---|---|---|---|
| 13.1 | Plugin docs and verified examples for every plugin type (`acryl-plugin-context`) | repo | 037 | yes | - | - |
| 13.2 | The system prompt as a plugin, generated copies per surface | repo | 037 | yes | - | - |
| 13.3 | Publish an ACRYL package (npm keyword, manifest) | site | 2026-08-26 | yes | docs | - |
| 13.4 | Runtime layers (ACRYL, DeepSeek Harness, Cordis) | site | 2026-08-26 | yes | docs | - |
| 13.5 | Build and run from source, isolated dev home | repo | README | yes | - | - |

## Totals (2026-10-18)

| | Rows |
|---|---|
| Features listed | 101 |
| Built (yes or partly) | 95 |
| Not built yet (decided or claimed) | 6 (4.5, 4.6, 4.7, 6.6, 9.17, 10.9) |
| Explained on /docs | 3 (9.13 in an older form, 13.3, 13.4) |
| Partly on /docs | 2 (9.9, 9.10) |
| Mentioned on the home page only | 23 |
| On their own site page (catalog, UI gallery) | 2 (9.15, 12.1) |
| On no page at all | 71 |
| With a current screenshot | 1 (12.1, the live UI gallery) |
| Claimed on the home page but not built | 1 (6.6) |
