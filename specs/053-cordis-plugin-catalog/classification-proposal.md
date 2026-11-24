# Spec 053 B: classification proposal

Status: proposal only. The owner has not approved it and nothing here is live. The registry site reads package keywords and shows plugins without them as Unclassified; the override file is not wired.

The registry has 75 entries today (13 official, 62 community). The plan's 84 was the 2026-11-24 snapshot; this table covers every entry in the registry on 2026-11-25.

## How each row was chosen

- **Kind:** one of the 22 the owner decided in 053 (themes, ui, sessions, tools, memory, models, usage, identity, channels, integrations, web, vision, voice, docs, git, workflow, dev, remote, platform, markets, agents, fun).
- **Primary domain:** one v04 subcategory (`NN-SS`), the capability area the plugin serves. The kind is the main filter; the domain is the shared browse tree.
- **Component:** optional v04 component (`NN-SS-EE`), only where the plugin implements that component directly. A dash means none was clear.
- The release description was read for every entry; the repository README was read for the workshop hello and ws test plugins, whose descriptions are thin.

## The table

| Plugin | Kind | Primary domain (NN-SS) | Component (NN-SS-EE) | Reason |
| --- | --- | --- | --- | --- |
| `cordis-plugin-market` | Plugin Markets & Managers | 95-01 Catalog and listing management | - | In-instance catalog that browses, inspects and installs plugins from a running Cordis instance. |
| `dsh-client-ui-brand-acryl` | Themes & Appearance | 64-01 Web application modules | - | Swappable ACRYL brand for the DSH Web client's sidebar and conversation hero. |
| `dsh-community-fabric` | Integrations | 96-01 Extension APIs and contribution points | - | Documentation-first interoperability standard for community DSH plugins; not yet loadable. |
| `acryl-development-canvas` | Development & Runtime | 63-02 Window, menu, and workspace management | - | Adds a multi-PTY canvas with agent launch and a browser to ACRYL Desktop. |
| `acryl-development-canvas-web` | Development & Runtime | 64-01 Web application modules | - | Web-surface counterpart of the ACRYL Development Canvas. |
| `acryl-dsh-editor-plugin` | Development & Runtime | 04-01 Code editors and repository views | 04-01-01 Monaco editor integration | Monaco-based code editor for ACRYL Desktop. |
| `acryl-dsh-editor-plugin-web` | Development & Runtime | 64-01 Web application modules | - | Web-surface counterpart of the Monaco code editor. |
| `acryl-dsh-editor-plugin-cli` | Development & Runtime | 65-05 TUI frameworks and terminal utilities | - | Terminal-surface counterpart of the code editor. |
| `cordis-plugin-graph` | Development & Runtime | 04-05 Testing and debugging | - | Zoomable graph of loaded plugins, dependencies and the Loader tree. |
| `dsh-cordis` | Development & Runtime | 96-03 Loading, lifecycle, and runtime registration | - | Core Cordis integration and plugin lifecycle for DeepSeek Harness. |
| `pi-cordis` | Development & Runtime | 58-05 Agent and task execution runtimes | - | Cordis integration for the Pi coding-agent runtime. |
| `@a42null/dsh-opencode-zen-plugin` | Models & Providers | 05-01 Model provider adapters | 05-01-01 Chat-completion adapter | OpenCode Console models as a selectable DSH provider. |
| `@anonyjcy/dsh-j-space` | Agent Architecture & Research | 05-04 Agent planning and execution | - | J-Space cognition agent preset for DSH. |
| `@deepdeck/dsh-hackernews-reader` | Browser & Web | 12-03 Search and discovery integrations | - | Hacker News reader with app-scoped AI conversations. |
| `@dsh-external/dsh-client-ui-skin-deep-space-command-bridge` | Themes & Appearance | 64-01 Web application modules | - | Independent cockpit theme for the DSH Web client. |
| `@dsh-external/dsh-cluster-preset` | Agent Architecture & Research | 05-05 Multi-agent collaboration | 05-05-02 Task delegation broker | Cluster-mode preset that delegates to five named experts. |
| `@feiyu999/dsh-prompt-optimizer` | Agent Tools & Skills | 05-03 Prompt and structured output | 05-03-03 Prompt fragment composer | Rewrites the composer text into a well-formed prompt. |
| `@flowingspring/dsh-workspace-memory` | Memory & Context | 06-04 Memory and retrieval stores | 06-04-01 Conversation memory store | Workspace-scoped durable memory for DSH. |
| `@wizzy-1547/dsh-updater` | Development & Runtime | 94-03 Updates and release channels | - | Checks for and installs DeepSeek Harness updates. |
| `@zekilou/dsh-sidebar-session-tabs` | Sessions & Messages | 02-06 Application shell components | - | Filter tabs and tags for the sidebar session list. |
| `acryl-quick-notes` | UI Panels & Views | 02-02 Personal information tools | - | TopBar notebook with each note stored as a text file on the host. |
| `dsh-acp-server` | Integrations | 60-02 Platform and service SDK adapters | - | ACP server that lets Zed and other ACP clients drive DSH agents. |
| `dsh-agent-ping` | Sessions & Messages | 02-04 Communication clients and bridges | 02-04-02 Chat conversation adapter | Cross-session @ that wakes and delivers after user approval. |
| `dsh-agent-profiles` | Agent Architecture & Research | 05-04 Agent planning and execution | - | Per-conversation agent profiles with memory injection and import/export. |
| `dsh-as-mcp` | Integrations | 60-02 Platform and service SDK adapters | - | Exposes DSH workspaces, sessions, files and commands as an MCP server. |
| `dsh-bite` | Memory & Context | 06-07 Memory models and lifecycle | 06-07-01 Working-memory buffer | Pins key turns and reinjects them after context compression. |
| `dsh-bug-gps` | Development & Runtime | 04-05 Testing and debugging | 04-05-02 Browser test recorder | Records browser bugs and verifies fixes against the original source. |
| `dsh-call-session` | Agent Architecture & Research | 05-05 Multi-agent collaboration | 05-05-03 Shared blackboard/task state | Peer session calls, a shared blackboard and a topology canvas. |
| `dsh-calm` | Sessions & Messages | 05-06 AI safety, evaluation, and observability | - | Emotional checkpoint and context repair for heated exchanges. |
| `dsh-codex-official-adapter` | Models & Providers | 05-01 Model provider adapters | 05-01-01 Chat-completion adapter | ChatGPT subscription as a DSH model provider. |
| `dsh-deepseek-web-login` | Models & Providers | 05-01 Model provider adapters | 05-01-01 Chat-completion adapter | DeepSeek web chat models as a provider with browser login. |
| `dsh-done-alert` | Channels & Notifications | 02-04 Communication clients and bridges | 02-04-04 Unified notification inbox | Completion chime and a colored taskbar badge. |
| `dsh-doudizhu` | Fun | 41-04 Multiplayer and live operations | 41-04-02 Matchmaking queue connector | Three-player LAN Doudizhu card table with computer levels. |
| `dsh-facet` | Docs & Rendering | 07-04 Dashboards and reporting | - | Turns a model name or arXiv link into 2D and 3D architecture diagrams. |
| `dsh-file-opener` | OS & Platform Interop | 63-03 Native OS and filesystem integration | - | Opens file and folder paths from the chat in the sidebar or the OS. |
| `dsh-github-gate` | Git & Code Review | 04-03 Git and code review | 04-03-03 Pull-request review adapter | Nine guarded GitHub tools with a confirm gate and human approval. |
| `dsh-image-viewer-pro` | Vision & Multimodal | 76-04 File inspection and comparison | - | Zoom, pan, rotate, download and gallery browsing for chat images. |
| `dsh-immune-system` | Memory & Context | 06-07 Memory models and lifecycle | 06-07-04 Procedural memory library | Captures failed-then-fixed episodes as reusable antibodies. |
| `dsh-johnny` | Fun | 05-04 Agent planning and execution | - | Playful informant agent mode with hidden money-channel triggers. |
| `dsh-knowledge` | Memory & Context | 88-03 Knowledge and metadata governance | - | Per-project knowledge base of pitfalls and reusable practices. |
| `dsh-long-term-memory` | Memory & Context | 06-07 Memory models and lifecycle | 06-07-02 Episodic memory store | Injects remembered requirements into every new session. |
| `dsh-memory-forge` | Memory & Context | 06-07 Memory models and lifecycle | 06-07-04 Procedural memory library | Recalls turns and forges procedures into SKILL.md files. |
| `dsh-memory-hub` | Memory & Context | 06-04 Memory and retrieval stores | - | Local memory helper that syncs between clients and an own AI. |
| `dsh-nga-reader-plugin` | Browser & Web | 12-03 Search and discovery integrations | - | Persistent NGA forum reader with app-scoped AI conversations. |
| `dsh-plugin-discovery` | Plugin Markets & Managers | 95-02 Search, ranking, and discovery | - | Browses the full DSH plugin market from the sidebar. |
| `dsh-plugin-dot` | Agent Architecture & Research | 05-04 Agent planning and execution | - | Chief-of-staff agent preset with memory, tasks and reminders. |
| `dsh-plugin-message-edit` | Sessions & Messages | 02-06 Application shell components | - | Edits past prompts to rewind, branch and switch message versions. |
| `dsh-plugin-rea` | Integrations | 60-02 Platform and service SDK adapters | - | Provisions REA's tools and registers its MCP server in DSH. |
| `dsh-plugin-rollout-scout` | Models & Providers | 05-02 Model routing and inference controls | 05-02-05 Provider capability matcher | Detects which conversation model the account is served. |
| `dsh-plugin-smooth-stream` | UI Panels & Views | 02-06 Application shell components | - | Paragraph-batched streaming animations and scroll follow. |
| `dsh-public-edge` | Remote & Mobile | 10-02 Proxy, tunnel, and secure connectivity | 10-02-04 Reverse tunnel agent | One-click Cloudflare tunnel, public link and LAN bridge. |
| `dsh-qwen-mode` | Models & Providers | 05-01 Model provider adapters | 05-01-01 Chat-completion adapter | Qwen, GenieX and QwenCloud providers for DSH. |
| `dsh-session-remover` | OS & Platform Interop | 63-03 Native OS and filesystem integration | - | Deletes conversations and subagent sessions to the Windows recycle bin. |
| `dsh-session-wake` | Sessions & Messages | 05-04 Agent planning and execution | 05-04-03 Agent session manager | Wakes a running session from an external process. |
| `dsh-startup-command` | Workflow & Automation | 85-01 Workflow definition and execution | - | Runs PowerShell, CMD, Bash and Python presets at startup. |
| `dsh-super-wechat-bot` | Channels & Notifications | 02-04 Communication clients and bridges | - | OCR-driven WeChat auto-replies in the user's voice. |
| `dsh-t3-model-picker` | Models & Providers | 05-02 Model routing and inference controls | 05-02-01 Model router | Provider-grouped model picker with favorites and shortcuts. |
| `dsh-team-chat` | Channels & Notifications | 02-05 Collaboration surfaces | 02-05-02 Comment and mention system | Realtime Agent Teams room with mailbox, avatars and @ dispatch. |
| `dsh-tide` | Workflow & Automation | 85-04 Durable execution and recovery | - | Graceful pause, budget fallback and watchdog resume with handoffs. |
| `dsh-update-center` | Development & Runtime | 94-03 Updates and release channels | - | Checks and updates plugins and the desktop client. |
| `dsh-web-api-balance` | Usage & Billing | 07-03 Cost and performance analytics | 07-03-04 Budget/quota monitor | Shows DeepSeek API balance and the conversation's cost. |
| `dsh-wechat` | Channels & Notifications | 02-04 Communication clients and bridges | - | Connects DSH to WeChat for tasks, results and approvals. |
| `dsh-whale-eyes` | Vision & Multimodal | 05-07 Computer-use and multimodal interaction | 05-07-02 Screen observation and region capture | Screen-sense summary of the foreground app and open windows, no screenshots. |
| `dsh-yanfield` | Docs & Rendering | 86-01 Document viewing and editing | - | Long-form fiction writing desk with manuscript, outline and revisions. |
| `dsh-yizi-themes` | Themes & Appearance | 64-01 Web application modules | - | 19 theme styles, a theme studio and WCAG contrast checks. |
| `hello-1118` | Development & Runtime | 04-05 Testing and debugging | - | Workshop hello test plugin. |
| `hello-ana` | Development & Runtime | 04-05 Testing and debugging | - | Workshop hello test plugin. |
| `hello-ben` | Development & Runtime | 04-05 Testing and debugging | - | Workshop hello test plugin. |
| `hello-cleo` | Development & Runtime | 04-05 Testing and debugging | - | Workshop hello test plugin; its release has no description. |
| `hello-cycle` | Development & Runtime | 04-05 Testing and debugging | - | Workshop hello test plugin. |
| `hello-w2350` | Development & Runtime | 04-05 Testing and debugging | - | Workshop hello test plugin. |
| `hello-walk-2215` | Development & Runtime | 04-05 Testing and debugging | - | Workshop hello test plugin. |
| `office-preview` | Docs & Rendering | 86-04 Conversion, rendering, and signatures | - | Opens Word, Excel and PowerPoint files as PDF in the document preview. |
| `skill-mcp-manager` | Agent Tools & Skills | 05-04 Agent planning and execution | - | Settings page to list, add, switch and test skills and MCP servers. |
| `ws-ana-clock` | Development & Runtime | 04-05 Testing and debugging | - | Workshop clock test plugin. |

## The override file

The same rows are in the registry repo at `src/data/classification-overrides.json` as the override file for plugins whose authors have not added keywords. It is deliberately not imported by the site or the sync; the owner's approval comes first. The author's own `cordis-kind-*`, `cordis-domain-*` and `cordis-component-*` keywords win once they exist.

## Notes

- The seven `hello-*` entries and `ws-ana-clock` are workshop test plugins; they are classified as Development & Runtime / Testing and debugging so the catalog still covers every registry entry.
- `dsh-community-fabric` is a documentation scaffold, not a loadable plugin; its domain is the extension-contribution area.
