# Spec 053 B: classification of the live plugins, plus 1 private (approved 2026-11-25)

Status: approved by the owner on 2026-11-25. The registry reads the override file (`src/data/classification-overrides.json` in
cordisplugins.github.io, status "approved (owner 2026-11-25)"); nothing is live until the branch `053-catalog-verified` is merged to main.
The 10 test scaffolds below were removed from the table and from the catalog by the owner's decision (see "Hidden test scaffolds"). A plugin author's own `cordis-kind-*` / `cordis-domain-*` keywords win over this table.

Source of the list (before the scaffolds were removed): the live `https://cordisplugins.github.io/registry/index.json` of 2026-11-25, 84 entries (12 official, 72 community). Each row was
classified from the entry's description, and from the repository README where the description was thin or the purpose unclear
(j-space, calm, johnny, memory-hub, agent-profiles, nga-reader, rea, file-opener). The earlier worker's table was used only as a
comparison: every row below was decided again, and the rows that differ are listed in "Rows changed from the first proposal".

## How a row is chosen

- **Kind** (one of the 22 decided in plan.md): what the plugin does for an app. **Domain** (`NN-SS`, a v04 subcategory): the capability it serves, never the
  surface it runs on (a Web or CLI counterpart gets the same domain as its Desktop plugin; the surface is a facet).
- **Component** (`NN-SS-EE`): only where the plugin is exactly that v04 component; otherwise none.

## Counts

Kinds: Development & Runtime 10, Integrations 8, Agent Architecture & Research 7, Sessions & Messages 7, Models & Providers 6, Memory & Context 6, Vision & Multimodal 5, Docs & Rendering 4, Themes & Appearance 3, Plugin Markets & Managers 3, Channels & Notifications 3, UI Panels & Views 2, Fun 2, Remote & Mobile 2, Agent Tools & Skills 2, Workflow & Automation 2, OS & Platform Interop 1, Git & Code Review 1, Usage & Billing 1.
Kinds with no plugin yet (not shown as chips until a plugin uses them): Identity & Communication, Browser & Web, Voice & Audio.
Domains used: 44 of 513 subcategories.

## The table

| Plugin | Kind | Domain (NN-SS) | Component | Reason |
| --- | --- | --- | --- | --- |
| `@a42null/dsh-opencode-zen-plugin` | Models & Providers | 05-01 Model provider adapters | 05-01-01 Chat-completion adapter | OpenCode Zen chat models as a DSH model provider. |
| `@anonyjcy/dsh-j-space` | Agent Architecture & Research | 05-04 Agent planning and execution | - | Agent preset that adds J-Space's way of splitting a problem, analysing a repo and keeping a task ledger. |
| `@deepdeck/dsh-hackernews-reader` | Integrations | 43-01 Social platform connectors | - | Reader for Hacker News, an outside community site, with app-scoped AI conversations. |
| `@dsh-external/dsh-client-ui-skin-deep-space-command-bridge` | Themes & Appearance | 02-06 Application shell components | - | Cockpit theme for the DSH client. |
| `@dsh-external/dsh-cluster-preset` | Agent Architecture & Research | 05-05 Multi-agent collaboration | 05-05-02 Task delegation broker | Agent preset: one lead plans, five named experts work in parallel, results are checked. |
| `@feiyu999/dsh-prompt-optimizer` | Sessions & Messages | 05-03 Prompt and structured output | - | Rewrites what you type in the composer into a well-formed prompt before the model sees it (a message tool, not a tool the agent calls). |
| `@flowingspring/dsh-workspace-memory` | Memory & Context | 06-04 Memory and retrieval stores | 06-04-01 Conversation memory store | Durable memory scoped to a workspace. |
| `@wizzy-1547/dsh-updater` | Development & Runtime | 94-03 Updates and release channels | - | Detects new DSH releases and upgrades DSH itself (npm install and restart). |
| `@zekilou/dsh-sidebar-session-tabs` | Sessions & Messages | 02-06 Application shell components | - | Filter tabs and tags for the sidebar session list. |
| `acryl-development-canvas` | Development & Runtime | 65-04 Terminal multiplexing and session persistence | - | Canvas with several PTYs, quick launch of coding agents and a browser. |
| `acryl-development-canvas-web` | Development & Runtime | 65-04 Terminal multiplexing and session persistence | - | The Web-surface counterpart of the Development Canvas; the surface is a facet, the job is the same. |
| `acryl-dsh-editor-plugin` | Development & Runtime | 04-01 Code editors and repository views | 04-01-01 Monaco editor integration | Monaco code editor inside ACRYL Desktop. |
| `acryl-dsh-editor-plugin-cli` | Development & Runtime | 04-01 Code editors and repository views | - | The terminal-surface counterpart of the code editor. |
| `acryl-dsh-editor-plugin-web` | Development & Runtime | 04-01 Code editors and repository views | - | The Web-surface counterpart of the code editor. |
| `acryl-quick-notes` | UI Panels & Views | 02-02 Personal information tools | - | Notebook icon in the top bar that opens a list of quick notes, one file each. |
| `cordis-plugin-graph` | Development & Runtime | 96-03 Loading, lifecycle, and runtime registration | - | Relation graph of every loaded plugin: dependencies, resolved providers and the Loader tree (a view on loading and lifecycle). |
| `cordis-plugin-market` | Plugin Markets & Managers | 95-03 Installation and dependency resolution | - | Browses, inspects and installs plugins from inside a running Cordis instance. |
| `dsh-acp-server` | Integrations | 93-02 API and protocol translation | - | Translates the Agent Client Protocol so Zed and other ACP clients can drive DSH agents. |
| `dsh-agent-ping` | Sessions & Messages | 05-05 Multi-agent collaboration | - | Cross-session @ call: with the user's approval it wakes and delivers a message to another session. |
| `dsh-agent-profiles` | Agent Architecture & Research | 05-04 Agent planning and execution | - | Several agent profiles (role, personality, rules, memory) per conversation. |
| `dsh-as-mcp` | Integrations | 93-02 API and protocol translation | - | Exposes DSH as an MCP server: workspaces, sessions, worktrees, commands, usage receipts. |
| `dsh-bite` | Memory & Context | 06-07 Memory models and lifecycle | 06-07-01 Working-memory buffer | Pinned key turns are re-injected after context compaction. |
| `dsh-bug-gps` | Development & Runtime | 04-05 Testing and debugging | 04-05-02 Browser test recorder | Records a browser bug, pins the expected result and verifies the fix against independent source. |
| `dsh-call-session` | Agent Architecture & Research | 05-05 Multi-agent collaboration | 05-05-03 Shared blackboard/task state | Peer session calls, a shared blackboard and a read-only topology canvas. |
| `dsh-calm` | Sessions & Messages | 05-06 AI safety, evaluation, and observability | - | Detects heated exchanges, soothes, folds the argument out of the context and resumes cleanly. |
| `dsh-client-ui-brand-acryl` | Themes & Appearance | 02-06 Application shell components | - | ACRYL's brand for the client's sidebar and conversation hero slot. |
| `dsh-codex-official-adapter` | Models & Providers | 05-01 Model provider adapters | 05-01-01 Chat-completion adapter | Uses a ChatGPT subscription as a DSH model provider. |
| `dsh-cordis` | Development & Runtime | 96-03 Loading, lifecycle, and runtime registration | - | The core Cordis integration every DSH-hosted plugin builds on. |
| `dsh-cortex-extractors` | Docs & Rendering | 86-02 OCR and document extraction | - | Optional OCR and speech-to-text adapter with layout-aware extraction; runs local commands, never downloads a model. |
| `dsh-deepseek-web-login` | Models & Providers | 05-01 Model provider adapters | 05-01-01 Chat-completion adapter | Uses chat.deepseek.com web models as a DSH provider (browser login capture, streaming). |
| `dsh-done-alert` | Channels & Notifications | 56-04 Notification delivery channels | - | Chime and taskbar badge when a session finishes or needs an answer. |
| `dsh-doudizhu` | Fun | 41-04 Multiplayer and live operations | - | Three-player LAN card game (Doudizhu) in a floating window. |
| `dsh-facet` | Docs & Rendering | 14-02 Diagram and visualization components | - | /visualize a model name or arXiv link and get 2D (SVG) and 3D (three.js) architecture diagrams. |
| `dsh-file-opener` | OS & Platform Interop | 63-03 Native OS and filesystem integration | - | Turns file and folder paths in chat into buttons that preview or open with the system default app. |
| `dsh-github-gate` | Git & Code Review | 04-03 Git and code review | - | Nine guarded github_* tools; every state-changing action needs confirm plus human approval. |
| `dsh-image-viewer-pro` | Vision & Multimodal | 13-01 Image input and processing | - | Image viewer for the chat: zoom, pan, rotate, copy, gallery. |
| `dsh-johnny` | Fun | 41-02 Gameplay and simulation modules | - | A small pet game: "Johnny" feigns ignorance until you feed the fish; no model calls. |
| `dsh-knowledge` | Memory & Context | 50-01 Wiki and knowledge-base modules | - | A per-project knowledge base of pitfalls and good practices the agent records itself. |
| `dsh-lan-bridge` | Remote & Mobile | 53-05 Multi-device control and collaboration | - | Sends a task and files to another computer's DSH on the LAN; the result returns to the conversation. |
| `dsh-long-term-memory` | Memory & Context | 06-07 Memory models and lifecycle | - | A long-term memory box injected into every new session's system prompt, with requirement expansion. |
| `dsh-memory-forge` | Memory & Context | 06-07 Memory models and lifecycle | 06-07-04 Procedural memory library | Captures turns, recalls them and forges procedures into SKILL.md files. |
| `dsh-memory-hub` | Memory & Context | 06-04 Memory and retrieval stores | - | Local memory helper for AI characters across clients. |
| `dsh-nga-reader-plugin` | Integrations | 43-01 Social platform connectors | - | Reader for the NGA forum, an outside community site, with app-scoped AI conversations. |
| `dsh-plugin-discovery` | Plugin Markets & Managers | 95-02 Search, ranking, and discovery | - | Browse the full GitHub catalog of DSH plugins from the sidebar, with categories and sorting. |
| `dsh-plugin-dot` | Agent Architecture & Research | 05-04 Agent planning and execution | - | Personal chief-of-staff agent preset: memory, reminders, rules and an on-screen pet. |
| `dsh-plugin-message-edit` | Sessions & Messages | 05-04 Agent planning and execution | - | Edit a past prompt to rewind and branch the conversation; browse branches as a tree. |
| `dsh-plugin-rea` | Integrations | 61-01 Application and SaaS connectors | - | Provisions Node, REA, JDK and Ghidra and registers the REA MCP server as tools. |
| `dsh-plugin-reply-with-images` | Vision & Multimodal | 13-06 Media generation and composition | - | Adds real, context-aware reference images and collages to replies. |
| `dsh-plugin-rollout-scout` | Models & Providers | 05-06 AI safety, evaluation, and observability | - | Probes which conversation model your account is served by scoring live reasoning (evaluation and observability). |
| `dsh-plugin-smooth-stream` | UI Panels & Views | 02-06 Application shell components | - | Paragraph-batched streaming reveals, 8 animations and smooth scroll-follow. |
| `dsh-plugin-socratic-tutor` | Agent Tools & Skills | 22-02 Tutoring and learning assistants | - | Socratic tutoring, diagnostic placement and skill-map tracking. |
| `dsh-public-edge` | Remote & Mobile | 10-02 Proxy, tunnel, and secure connectivity | 10-02-04 Reverse tunnel agent | Public access panel: start and stop a Cloudflare tunnel, copy the link with QR, built-in LAN bridge. |
| `dsh-qwen-mode` | Models & Providers | 05-01 Model provider adapters | 05-01-01 Chat-completion adapter | Qwen, GenieX and QwenCloud providers with thinking, sampling and per-turn statistics. |
| `dsh-session-remover` | Sessions & Messages | 05-04 Agent planning and execution | - | Adds Delete and Batch delete to the session menu, moving sessions to the Windows Recycle Bin. |
| `dsh-session-wake` | Sessions & Messages | 05-04 Agent planning and execution | 05-04-03 Agent session manager | Wakes a running session from an external process (HTTP and a file queue). |
| `dsh-shiori-bridge` | Agent Architecture & Research | 05-05 Multi-agent collaboration | - | Orchestration across sessions: list, read, relay, dispatch to subagents and a small project board. |
| `dsh-shiori-shore` | Integrations | 43-01 Social platform connectors | - | 59 Bilibili tools (danmaku, DMs, feed, video frames) through a self-contained Python MCP server. |
| `dsh-startup-command` | Workflow & Automation | 85-01 Workflow definition and execution | - | Runs PowerShell, CMD, Bash and Python presets when DSH starts, with live output. |
| `dsh-super-wechat-bot` | Channels & Notifications | 02-04 Communication clients and bridges | - | Replies to WeChat in the user's own voice (screen OCR and human pacing). |
| `dsh-t3-model-picker` | Models & Providers | 05-02 Model routing and inference controls | - | T3 Code's model picker: provider rail, grouped search, favourites, shortcuts. |
| `dsh-team-chat` | Agent Architecture & Research | 05-05 Multi-agent collaboration | - | Realtime room for Agent Teams: mailbox timeline, member avatars and @ dispatch. |
| `dsh-tide` | Workflow & Automation | 85-04 Durable execution and recovery | - | Graceful pause at peak/off-peak switches and low balance, with watchdog resume. |
| `dsh-update-center` | Plugin Markets & Managers | 94-03 Updates and release channels | - | Checks plugins and the desktop client for updates with a one-click update in the sidebar. |
| `dsh-videocall` | Vision & Multimodal | 13-05 Video and streaming | 13-05-04 Live media session adapter | Browser-to-browser WebRTC video call: avatar on one side, camera on the other. |
| `dsh-web-api-balance` | Usage & Billing | 07-03 Cost and performance analytics | 07-03-04 Budget/quota monitor | DeepSeek API balance and this conversation's spend next to the composer. |
| `dsh-wechat` | Channels & Notifications | 02-04 Communication clients and bridges | - | Connects DSH to WeChat: scan to bind, dispatch work, receive results, approve. |
| `dsh-whale-eyes` | Vision & Multimodal | 05-07 Computer-use and multimodal interaction | 05-07-02 Screen observation and region capture | A screen-sense tool: foreground app, window title and focused control as text, no screenshots. |
| `dsh-whale-gaze` | Vision & Multimodal | 13-02 Vision and image understanding | - | Always-on cheap vision: watches a camera or video window locally and freezes interesting moments. |
| `dsh-whale-live` | Integrations | 13-05 Video and streaming | - | Live-stream console: session records, Bilibili danmaku, speech, VTube Studio avatar bridge. |
| `dsh-yanfield` | Docs & Rendering | 45-01 Editorial and manuscript management | - | Long-form fiction writing desk: manuscript, outline, notes and reviewable AI revisions. |
| `dsh-yizi-themes` | Themes & Appearance | 02-06 Application shell components | - | YiziMarkdown theme pack: 19 themes, Theme Studio, custom brand, contrast checks. |
| `office-preview` | Docs & Rendering | 86-04 Conversion, rendering, and signatures | - | Word, Excel and PowerPoint files open as PDF in the frame's document preview. |
| `pi-cordis` | Development & Runtime | 58-05 Agent and task execution runtimes | - | Cordis integration for the Pi coding-agent runtime. |
| `skill-mcp-manager` | Agent Tools & Skills | 05-04 Agent planning and execution | - | Settings page that lists, adds, switches and tests skills and MCP servers. |

## Rows changed from the first proposal (worker DS2): 35 of the 73 rows that are still live

| Plugin | First proposal | Now | Why it changed |
| --- | --- | --- | --- |
| `@deepdeck/dsh-hackernews-reader` | Browser & Web / 12-03 Search and discovery integrations | Integrations / 43-01 Social platform connectors | A reader of an outside community site is an integration; 12-03 is search, and this is not a search tool. |
| `@dsh-external/dsh-client-ui-skin-deep-space-command-bridge` | Themes & Appearance / 64-01 Web application modules | Themes & Appearance / 02-06 Application shell components | A theme is not a "web application module"; 02-06 (application shell) is the nearest home, v04 has no theming subcategory. |
| `@feiyu999/dsh-prompt-optimizer` | Agent Tools & Skills / 05-03 Prompt and structured output | Sessions & Messages / 05-03 Prompt and structured output | It rewrites the user's composer text; the agent never calls it, so not "Agent Tools". |
| `acryl-development-canvas` | Development & Runtime / 63-02 Window, menu, and workspace management | Development & Runtime / 65-04 Terminal multiplexing and session persistence | Several PTYs is terminal multiplexing; 63-02 is window management. |
| `acryl-development-canvas-web` | Development & Runtime / 64-01 Web application modules | Development & Runtime / 65-04 Terminal multiplexing and session persistence | A Web counterpart does the same job; the surface is not a domain. |
| `acryl-dsh-editor-plugin-cli` | Development & Runtime / 65-05 TUI frameworks and terminal utilities | Development & Runtime / 04-01 Code editors and repository views | Same: it is a code editor, not a TUI framework. |
| `acryl-dsh-editor-plugin-web` | Development & Runtime / 64-01 Web application modules | Development & Runtime / 04-01 Code editors and repository views | Same: it is a code editor, not a "web application module". |
| `cordis-plugin-graph` | Development & Runtime / 04-05 Testing and debugging | Development & Runtime / 96-03 Loading, lifecycle, and runtime registration | It shows the Loader tree and resolved providers, a view on plugin loading, not testing. |
| `cordis-plugin-market` | Plugin Markets & Managers / 95-01 Catalog and listing management | Plugin Markets & Managers / 95-03 Installation and dependency resolution | Its main act is installing from inside an instance (95-03). |
| `dsh-acp-server` | Integrations / 60-02 Platform and service SDK adapters | Integrations / 93-02 API and protocol translation | It translates the ACP protocol for editors; that is protocol translation, not an SDK adapter. |
| `dsh-agent-ping` | Sessions & Messages / 02-04 Communication clients and bridges | Sessions & Messages / 05-05 Multi-agent collaboration | A cross-session call is multi-agent collaboration, not a chat client. |
| `dsh-as-mcp` | Integrations / 60-02 Platform and service SDK adapters | Integrations / 93-02 API and protocol translation | Same reason: it exposes DSH through MCP. |
| `dsh-client-ui-brand-acryl` | Themes & Appearance / 64-01 Web application modules | Themes & Appearance / 02-06 Application shell components | Same, a brand slot of the client shell. |
| `dsh-done-alert` | Channels & Notifications / 02-04 Communication clients and bridges | Channels & Notifications / 56-04 Notification delivery channels | A chime and a taskbar badge are a notification channel (56-04), not a chat client. |
| `dsh-facet` | Docs & Rendering / 07-04 Dashboards and reporting | Docs & Rendering / 14-02 Diagram and visualization components | It produces architecture diagrams (14-02); 07-04 is analytics dashboards. |
| `dsh-image-viewer-pro` | Vision & Multimodal / 76-04 File inspection and comparison | Vision & Multimodal / 13-01 Image input and processing | It views images (13-01); 76-04 is file inspection and comparison. |
| `dsh-johnny` | Fun / 05-04 Agent planning and execution | Fun / 41-02 Gameplay and simulation modules | A pet mini-game, not agent planning. |
| `dsh-knowledge` | Memory & Context / 88-03 Knowledge and metadata governance | Memory & Context / 50-01 Wiki and knowledge-base modules | A project knowledge base (50-01); 88-03 is metadata governance. |
| `dsh-nga-reader-plugin` | Browser & Web / 12-03 Search and discovery integrations | Integrations / 43-01 Social platform connectors | Same as the Hacker News reader. |
| `dsh-plugin-message-edit` | Sessions & Messages / 02-06 Application shell components | Sessions & Messages / 05-04 Agent planning and execution | Rewind and branch is session handling, not shell chrome. |
| `dsh-plugin-rea` | Integrations / 60-02 Platform and service SDK adapters | Integrations / 61-01 Application and SaaS connectors | It provisions tools and registers an MCP server (61-01), not an SDK adapter. |
| `dsh-plugin-rollout-scout` | Models & Providers / 05-02 Model routing and inference controls | Models & Providers / 05-06 AI safety, evaluation, and observability | It evaluates which model the account is served (05-06), it does not route. |
| `dsh-session-remover` | OS & Platform Interop / 63-03 Native OS and filesystem integration | Sessions & Messages / 05-04 Agent planning and execution | It deletes sessions, so its kind is Sessions; the Recycle Bin is only how it deletes. |
| `dsh-team-chat` | Channels & Notifications / 02-05 Collaboration surfaces | Agent Architecture & Research / 05-05 Multi-agent collaboration | A room for Agent Teams is multi-agent (05-05); the plugin is not a chat channel to people. |
| `dsh-update-center` | Development & Runtime / 94-03 Updates and release channels | Plugin Markets & Managers / 94-03 Updates and release channels | It updates plugins and the client: a plugin manager. |
| `dsh-yanfield` | Docs & Rendering / 86-01 Document viewing and editing | Docs & Rendering / 45-01 Editorial and manuscript management | A fiction writing desk is manuscript management (45-01); 86-01 is a generic document editor. |
| `dsh-yizi-themes` | Themes & Appearance / 64-01 Web application modules | Themes & Appearance / 02-06 Application shell components | Same. |

## New rows (live in the registry, missing from the first proposal): 11

`dsh-cortex-extractors`, `dsh-lan-bridge`, `dsh-plugin-reply-with-images`, `dsh-plugin-socratic-tutor`, `dsh-shiori-bridge`, `dsh-shiori-shore`, `dsh-videocall`, `dsh-whale-gaze`, `dsh-whale-live`.

## In the first proposal but not in the live registry: 2

- `dsh-community-fabric`: a private documentation scaffold (`private: true` in the registry's own entries); it never reaches index.json.
- `dsh-immune-system`: its repository (meat-daemon-404/agent-immune) is still public with the topic, but its latest release v4.1.0 carries no .tgz
  file, so the sync skips it ("its latest release has 0 .tgz files"). It was in the stale committed file of 2026-11-18 only. Proposed placement if the
  release returns: Memory & Context, 06-07 Memory models and lifecycle.

Neither row is in the override file, which covers exactly the live entries.

## Hidden test scaffolds

The owner decided on 2026-11-25 to hide our own test plugins from the catalog: `hello-1118`, `hello-ana`, `hello-ben`, `hello-cleo`, `hello-cycle`,
`hello-w2350`, `hello-walk-2215`, `sh-guide-clock`, `sh1121-ana`, `ws-ana-clock`, plus `hello-share` (no release yet). They are on the registry's
`blocklist.json` by repository; only their listing is hidden, their repositories and releases are untouched. The site then shows 75 entries (74 in index.json).

## Decided by the owner / still open

1. The table above: approved (2026-11-25).
2. v04 has no theming subcategory (themes, brand, skins sit in 02-06 Application shell components for now). Add one, or accept 02-06.
3. Decided: the 10 scaffolds are not classified; they are on blocklist.json (see below).
4. Kinds with no plugin yet (listed under Counts) are not shown as chips until a plugin uses them.
