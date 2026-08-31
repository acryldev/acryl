<p align="center">
  <img src="acryl-logo.png" alt="ACRYL logo" width="128" height="128">
</p>

<h1 align="center">ACRYL - Agent Context Relay Yielding Lifecycles</h1>

<p align="center">
  <strong>One persistent development environment. One persistent project context. Any coding agent.</strong><br>
  Agents may come and go. The work continues.
</p>

<p align="center">
  <a href="https://github.com/acryldev/acryl">⭐ Support ACRYL</a> ·
  <a href="https://acryl.dev/">Website</a> ·
  <a href="https://acryl.dev/docs">Documentation</a> ·
  <a href="https://github.com/acryldev/acryl/releases/tag/v0.1.16">Download v0.1.16</a> ·
  <a href="https://discord.gg/cY9KXMex69">Discord</a> ·
  <a href="https://github.com/acryldev/acryl">GitHub</a>
</p>

<p align="center">
  <a href="https://github.com/acryldev/acryl"><img src="https://img.shields.io/github/stars/acryldev/acryl?style=social" alt="Star ACRYL on GitHub"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-2EA44F?style=flat" alt="MIT License"></a>
  <a href="https://discord.gg/cY9KXMex69"><img src="https://img.shields.io/badge/Discord-5865F2?style=flat&amp;logo=discord&amp;logoColor=white" alt="Join Discord"></a>
  <img src="https://img.shields.io/badge/status-early%20development-F59E0B?style=flat" alt="Early development">
</p>

> [!IMPORTANT]
> ACRYL is in active early development. Interfaces, workflows, and packaging may change while the first public foundation is established.

## Install ACRYL v0.1.16

ACRYL has three surfaces that share the same project model, but they are deliberately separate installs. Installing one does not silently install or start the others.

### Desktop GUI

The GitHub Release assets below install the **ACRYL Desktop GUI**. The app carries the runtime it needs, but it does **not** add the `acryl` command to your shell PATH or leave a web server running after the app exits.

| Platform | Desktop download |
| --- | --- |
| macOS - Apple Silicon | [DMG](https://github.com/acryldev/acryl/releases/download/v0.1.16/acryl-desktop-mac-arm64.dmg) |
| macOS - Intel | [DMG](https://github.com/acryldev/acryl/releases/download/v0.1.16/acryl-desktop-mac-x64.dmg) |
| Windows - x64 | [Installer](https://github.com/acryldev/acryl/releases/download/v0.1.16/acryl-desktop-win-x64.exe) |
| Linux - x64 / Debian | [DEB](https://github.com/acryldev/acryl/releases/download/v0.1.16/dsh-plugin-desktop_0.1.9_amd64.deb) |
| Linux - arm64 / Debian | [DEB](https://github.com/acryldev/acryl/releases/download/v0.1.16/dsh-plugin-desktop_0.1.9_arm64.deb) |

### Terminal CLI

The recommended install is the standalone installer: no Node.js or npm required, no install warnings, and it adds `acryl` to your shell PATH automatically.

```bash
curl -fsSL https://acryl.dev/install | bash
```

This installs the prebuilt `acryl` binary to `~/.acryl/bin`, adds it to your PATH, and verifies the download against the release checksum. Open a new terminal (or run `source ~/.zshrc` / `source ~/.bashrc`) and start it:

```bash
acryl
```

Prefer npm? It works, but npm 11+ prints advisory `install-scripts` warnings for ACRYL's native dependencies (`node-pty`, `koffi`, and others). These are npm security notices, not ACRYL errors; the packages still install and run. To install without the warnings:

```bash
npm install -g acryl --allow-scripts=@deepseek-ai/dsh-subprocess-local,@google/genai,koffi,node-pty,protobufjs
acryl
```

The `acryl` command starts the TUI. It is separate from the Desktop app so terminal users do not need Electron, and desktop users do not receive an unexpected global executable.

### Local Web surface

Start the browser surface explicitly when you want it:

```bash
acryl web
```

This starts a local ACRYL web runtime, prints its local URL, and serves until you stop the command. It is not a hosted ACRYL cloud service and it does not run in the background by default.

> [!NOTE]
> `acryl gui` is reserved for a future CLI-to-Desktop handoff. For now, launch the installed Desktop app directly.

## What is ACRYL?

ACRYL is an agent-agnostic Agentic Development Environment and continuity layer for software work.

The project does not belong to Claude Code, Codex, OpenCode, Pi, Gemini CLI, DeepSeek, or any other individual agent. ACRYL owns the persistent workspace, project context, tasks, artifacts, and handoffs. Coding agents are replaceable workers that enter and leave the same development scene.

```text
Same project
Same context
Same work
Different agents
```

ACRYL is being designed to support native and external coding agents through capability-based providers, including:

- Claude Code
- Codex
- OpenCode
- Pi
- Gemini CLI
- DeepSeek Harness native agents
- ACP-compatible agents
- PTY and CLI agents
- future agents that do not know ACRYL exists

## Core principles

1. **Agent sessions are disposable. Project context is persistent.**
2. **ACRYL owns continuity. Agents perform work.**
3. **Canonical state is durable and agent-independent.**
4. **Agent-specific context is a projection, not the source of truth.**
5. **Everything practical is a plugin or replaceable capability.**
6. **Generated capabilities live outside the stable kernel.**
7. **Every runtime effect must be reversible.**
8. **Capabilities are versioned, permissioned, testable, and auditable.**

## Built on Cordis

ACRYL is built around [Cordis](https://github.com/cordiverse/cordis), the **Meta-Framework of Spatiotemporal Composability**.

Cordis provides the runtime foundation for:

- lifecycle-managed plugins
- named services and replaceable providers
- reactive dependency injection
- typed events and interception
- reversible effects
- scoped composition and isolation
- configuration-driven application profiles
- hot activation and replacement

This lets ACRYL treat agents, models, memory systems, code graphs, tools, workflows, terminals, and UI surfaces as composable capabilities rather than hardcoded subsystems.

```text
                       ACRYL
                        |
          +-------------+-------------+
          |             |             |
       Desktop         TUI           CLI
          |             |             |
          +-------------+-------------+
                        |
                  ACRYL capabilities
                        |
                      Cordis
                        |
       +----------+-----+-----+----------+
       |          |           |          |
     Agents     Context     Tools       UI
```

## DeepSeek Harness lineage

ACRYL continues important architectural ideas and implementation lessons from [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), especially its use of Cordis, durable session events, capability seams, agent runtime services, tools, subprocesses, PTYs, sandboxing, and Web UI composition.

DeepSeek Harness is a reference runtime and a reusable substrate, not ACRYL's product identity. ACRYL is an independent project with a broader goal: persistent, cross-agent development continuity. The pinned upstream checkout remains unmodified and isolated in `deepseek-harness/`.

ACRYL is not affiliated with, authorized by, or endorsed by DeepSeek.

## Development Canvas

The Development Canvas is becoming ACRYL's primary working surface. It replaces the main content area with a composable workspace where users can open:

- native PTY terminals
- coding-agent sessions
- files and editors
- browser tabs
- future capability-provided tools and views

The canvas follows the same plugin philosophy as the runtime. UI contributions must control real capabilities and must appear and disappear with their owning plugin lifecycle.

## Architecture direction

```text
Persistent ACRYL project
        |
        +-- canonical event stream
        +-- durable tasks and artifacts
        +-- agent identities and sessions
        +-- context projections
        +-- structured handoffs
        +-- workspaces and checkpoints
        |
        +-- Cordis capability graph
              |
              +-- agent providers
              +-- PTY / process providers
              +-- memory providers
              +-- code graph providers
              +-- workflow providers
              +-- UI contributions
```

The trusted kernel should remain small and stable. New functionality should normally arrive as a versioned capability package that can be validated, activated, observed, and rolled back without rewriting the application core.

## Repository layout

```text
acryl-desktop/     Cordis Host, Client, Electron bootstrap, and Desktop UI
dsh-community-fabric/   Community interoperability RFCs and capability contracts
dsh-community-market/   Community capability-market implementation
deepseek-harness/       Pinned, read-only upstream source submodule
docs/                   Architecture, onboarding, Cordis, and product documentation
assets/                 ACRYL brand assets
```

## Run from source

### Requirements

- Node.js `^22.19.0` or `>=24.0.0`
- Corepack
- Yarn `4.18.0`, pinned by the repository

### Start ACRYL

```sh
git submodule update --init --recursive
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

### Development scripts

Run root package scripts through `corepack pnpm <script>`. Corepack selects the
repository-pinned PNPM 11.7.0 release; do not use `npm run` or install dependencies
with npm in this workspace.

#### Daily development session

- `corepack pnpm dev` — recommended local development entry point. It builds
  `dsh-community-market`, builds and starts `acryl-desktop`, and launches
  with isolated ACRYL state: `DSH_HOME=~/.dsh-acryl` plus a separate Electron
  `userData` directory. This keeps development profiles and settings away from
  the installed ACRYL application and seeds advanced mode so Development
  Canvas is visible.
- `corepack pnpm dev:local` — explicit spelling of `dev`; use it in notes or
  automation when the isolated-local behavior should be obvious.
- `corepack pnpm local` — short alias for the same isolated build-and-launch
  workflow.
- `corepack pnpm start:local` — starts the isolated local application with
  `--skip-build`. Use it only when the market and Desktop artifacts are already
  current; it is faster but can otherwise launch stale output.
- `corepack pnpm lifecycle` — runs the focused development verification suite
  and launches the isolated application only after it passes. Use this for a
  verify-then-exercise session.
- `corepack pnpm dev:shared` — builds the market and runs the Desktop package's
  ordinary development command without the isolated ACRYL home/user-data wrapper.
  Use it only when intentionally exercising the normal shared profile state.
- `corepack pnpm start` — starts the already-built Desktop package without
  rebuilding it and without the local isolation wrapper.

Quit an installed DSH Desktop instance before starting a local graphical
session, because the installed and development applications may otherwise
compete for process or desktop resources.

#### Build and focused verification

- `corepack pnpm build` — builds the community market first, then the Desktop
  package that consumes it. Use it to refresh runnable/packageable artifacts.
- `corepack pnpm typecheck` — runs TypeScript checks for Desktop and the
  community market without emitting build output.
- `corepack pnpm test` — runs the Desktop and community-market unit test suites.
- `corepack pnpm verify` — runs `typecheck`, `test`, and the tests for the
  isolated local launcher. This is the focused gate for an ordinary development
  session; it is intentionally smaller than the complete repository check.
- `corepack pnpm test:bilingual-docs` — unit-tests the bilingual-document hash
  and record validator itself.
- `corepack pnpm check:bilingual-docs` — tests that validator and then checks
  every tracked bilingual pair against its recorded Git blob hashes.
- `corepack pnpm test:architecture-gates` — unit-tests the market dependency
  direction rules used by the architecture gate.
- `corepack pnpm check:architecture` — runs the architecture-gate tests and
  verifies the current package dependency direction.
- `corepack pnpm check:layout` — combines bilingual-document and architecture
  checks with repository-layout verification, including the pinned workspace and
  upstream boundaries.
- `corepack pnpm check` — runs the complete headless repository gate:
  `check:layout`, the Fabric checks, the Market checks, and the full Desktop
  package check. Use this before handing off or submitting changes.

#### Packaging and distribution

These commands build the community market first so Desktop packaging consumes
current artifacts:

- `corepack pnpm package:dir` — creates an unpacked application directory for
  inspecting packaged contents without producing a platform installer.
- `corepack pnpm dist:mac` — builds the macOS distribution artifacts.
- `corepack pnpm dist:mac-smoke` — creates the macOS smoke-test package used to
  validate the local release path.
- `corepack pnpm dist:win` — builds the Windows installer distribution.
- `corepack pnpm dist:win-portable` — builds the portable Windows distribution.

#### Pinned DeepSeek Harness workspace

The `deepseek-harness/` submodule is an independent pnpm workspace. Root wrapper
scripts enter it before invoking its pinned pnpm release:

- `corepack pnpm upstream:update` — fetches the remote default branch, verifies
  it is a fast-forward from the current clean pin, moves the Harness checkout
  to that exact commit, initializes nested submodules, and synchronizes
  `upstream.json`. It refuses to overwrite local Harness or pin-metadata
  changes. Review the result, then stage `deepseek-harness` and `upstream.json`
  together in a dedicated pin-update commit.
- `corepack pnpm upstream:version` — prints the pnpm version selected inside the
  upstream checkout; use it to verify the package-manager boundary.
- `corepack pnpm upstream:install` — installs upstream dependencies from its
  frozen lockfile without converting or modifying the upstream workspace.
- `corepack pnpm upstream:build` — runs the upstream Harness build through pnpm.

These wrappers do not authorize edits inside the pinned submodule. Update its
pin separately from ACRYL/Desktop behavior changes.

### Verify the repository

```sh
corepack pnpm check
```

The outer ACRYL workspace uses PNPM. The pinned `deepseek-harness/` submodule remains an independent upstream pnpm workspace and must not be edited from an ACRYL feature branch.

## Project links

- Website: [agentcontextrelay.com](https://acryl.dev/)
- Documentation: [agentcontextrelay.com/docs](https://acryl.dev/docs)
- Source: [github.com/acryldev/acryl](https://github.com/acryldev/acryl)
- Discord: [discord.gg/cY9KXMex69](https://discord.gg/cY9KXMex69)
- Cordis: [github.com/cordiverse/cordis](https://github.com/cordiverse/cordis)
- DeepSeek Harness: [github.com/deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)

## Contributing

ACRYL welcomes contributors interested in agent interoperability, persistent context, Cordis plugins, developer tooling, terminals, editors, dynamic UI, security, and self-extensible software.

Before contributing, read [`AGENTS.md`](AGENTS.md), the [ACRYL orientation](docs/onboarding/orientation_spec_acryl.md), and the [Cordis specification](docs/cordis/cordis_spec.md).

Join the [Discord community](https://discord.gg/cY9KXMex69) to discuss the project and the ACRYL kickoff.

## License

ACRYL is licensed under the [MIT License](LICENSE).

## Acknowledgements

ACRYL builds on the work of the [Cordis](https://github.com/cordiverse/cordis) community and continues architectural inspiration from [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). We are grateful to both projects and to the broader open-source coding-agent ecosystem.
