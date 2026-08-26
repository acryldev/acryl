<p align="center">
  <img src="assets/acr-logo.svg" alt="ACR logo" width="128" height="128">
</p>

<h1 align="center">ACR - Agent Context Relay</h1>

<p align="center">
  <strong>One persistent development environment. One persistent project context. Any coding agent.</strong><br>
  Agents may come and go. The work continues.
</p>

<p align="center">
  <a href="https://agentcontextrelay.com/">Website</a> ·
  <a href="https://agentcontextrelay.com/docs">Documentation</a> ·
  <a href="https://discord.com/invite/r7j5PMWv4">Discord</a> ·
  <a href="https://github.com/AgentContextRelay/acr">GitHub</a>
</p>

<p align="center">
  <a href="https://github.com/AgentContextRelay/acr"><img src="https://img.shields.io/github/stars/AgentContextRelay/acr?style=flat&amp;label=stars" alt="GitHub stars"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-2EA44F?style=flat" alt="MIT License"></a>
  <a href="https://discord.com/invite/r7j5PMWv4"><img src="https://img.shields.io/badge/Discord-5865F2?style=flat&amp;logo=discord&amp;logoColor=white" alt="Join Discord"></a>
  <img src="https://img.shields.io/badge/status-early%20development-F59E0B?style=flat" alt="Early development">
</p>

> [!IMPORTANT]
> ACR is in active early development. Interfaces, workflows, and packaging may change while the first public foundation is established.

## What is ACR?

ACR is an agent-agnostic Agentic Development Environment and continuity layer for software work.

The project does not belong to Claude Code, Codex, OpenCode, Pi, Gemini CLI, DeepSeek, or any other individual agent. ACR owns the persistent workspace, project context, tasks, artifacts, and handoffs. Coding agents are replaceable workers that enter and leave the same development scene.

```text
Same project
Same context
Same work
Different agents
```

ACR is being designed to support native and external coding agents through capability-based providers, including:

- Claude Code
- Codex
- OpenCode
- Pi
- Gemini CLI
- DeepSeek Harness native agents
- ACP-compatible agents
- PTY and CLI agents
- future agents that do not know ACR exists

## Core principles

1. **Agent sessions are disposable. Project context is persistent.**
2. **ACR owns continuity. Agents perform work.**
3. **Canonical state is durable and agent-independent.**
4. **Agent-specific context is a projection, not the source of truth.**
5. **Everything practical is a plugin or replaceable capability.**
6. **Generated capabilities live outside the stable kernel.**
7. **Every runtime effect must be reversible.**
8. **Capabilities are versioned, permissioned, testable, and auditable.**

## Built on Cordis

ACR is built around [Cordis](https://github.com/cordiverse/cordis), the **Meta-Framework of Spatiotemporal Composability**.

Cordis provides the runtime foundation for:

- lifecycle-managed plugins
- named services and replaceable providers
- reactive dependency injection
- typed events and interception
- reversible effects
- scoped composition and isolation
- configuration-driven application profiles
- hot activation and replacement

This lets ACR treat agents, models, memory systems, code graphs, tools, workflows, terminals, and UI surfaces as composable capabilities rather than hardcoded subsystems.

```text
                       ACR
                        |
          +-------------+-------------+
          |             |             |
       Desktop         TUI           CLI
          |             |             |
          +-------------+-------------+
                        |
                  ACR capabilities
                        |
                      Cordis
                        |
       +----------+-----+-----+----------+
       |          |           |          |
     Agents     Context     Tools       UI
```

## DeepSeek Harness lineage

ACR continues important architectural ideas and implementation lessons from [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), especially its use of Cordis, durable session events, capability seams, agent runtime services, tools, subprocesses, PTYs, sandboxing, and Web UI composition.

DeepSeek Harness is a reference runtime and a reusable substrate, not ACR's product identity. ACR is an independent project with a broader goal: persistent, cross-agent development continuity. The pinned upstream checkout remains unmodified and isolated in `deepseek-harness/`.

ACR is not affiliated with, authorized by, or endorsed by DeepSeek.

## Development Canvas

The Development Canvas is becoming ACR's primary working surface. It replaces the main content area with a composable workspace where users can open:

- native PTY terminals
- coding-agent sessions
- files and editors
- browser tabs
- future capability-provided tools and views

The canvas follows the same plugin philosophy as the runtime. UI contributions must control real capabilities and must appear and disappear with their owning plugin lifecycle.

## Architecture direction

```text
Persistent ACR project
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
dsh-plugin-desktop/     Cordis Host, Client, Electron bootstrap, and Desktop UI
dsh-community-fabric/   Community interoperability RFCs and capability contracts
dsh-community-market/   Community capability-market implementation
deepseek-harness/       Pinned, read-only upstream source submodule
docs/                   Architecture, onboarding, Cordis, and product documentation
assets/                 ACR brand assets
```

## Run from source

### Requirements

- Node.js `^22.19.0` or `>=24.0.0`
- Corepack
- Yarn `4.18.0`, pinned by the repository

### Start ACR

```sh
git submodule update --init --recursive
corepack yarn install --immutable
corepack yarn dev
```

### Development scripts

Run root package scripts through `corepack yarn <script>`. Corepack selects the
repository-pinned Yarn 4 release; do not use `npm run` or install dependencies
with npm in this workspace.

#### Daily development session

- `corepack yarn dev` — recommended local development entry point. It builds
  `dsh-community-market`, builds and starts `dsh-plugin-desktop`, and launches
  with isolated ACR state: `DSH_HOME=~/.dsh-acr` plus a separate Electron
  `userData` directory. This keeps development profiles and settings away from
  the installed DSH Desktop application and seeds advanced mode so Development
  Canvas is visible.
- `corepack yarn dev:local` — explicit spelling of `dev`; use it in notes or
  automation when the isolated-local behavior should be obvious.
- `corepack yarn local` — short alias for the same isolated build-and-launch
  workflow.
- `corepack yarn start:local` — starts the isolated local application with
  `--skip-build`. Use it only when the market and Desktop artifacts are already
  current; it is faster but can otherwise launch stale output.
- `corepack yarn lifecycle` — runs the focused development verification suite
  and launches the isolated application only after it passes. Use this for a
  verify-then-exercise session.
- `corepack yarn dev:shared` — builds the market and runs the Desktop package's
  ordinary development command without the isolated ACR home/user-data wrapper.
  Use it only when intentionally exercising the normal shared profile state.
- `corepack yarn start` — starts the already-built Desktop package without
  rebuilding it and without the local isolation wrapper.

Quit an installed DSH Desktop instance before starting a local graphical
session, because the installed and development applications may otherwise
compete for process or desktop resources.

#### Build and focused verification

- `corepack yarn build` — builds the community market first, then the Desktop
  package that consumes it. Use it to refresh runnable/packageable artifacts.
- `corepack yarn typecheck` — runs TypeScript checks for Desktop and the
  community market without emitting build output.
- `corepack yarn test` — runs the Desktop and community-market unit test suites.
- `corepack yarn verify` — runs `typecheck`, `test`, and the tests for the
  isolated local launcher. This is the focused gate for an ordinary development
  session; it is intentionally smaller than the complete repository check.
- `corepack yarn test:bilingual-docs` — unit-tests the bilingual-document hash
  and record validator itself.
- `corepack yarn check:bilingual-docs` — tests that validator and then checks
  every tracked bilingual pair against its recorded Git blob hashes.
- `corepack yarn test:architecture-gates` — unit-tests the market dependency
  direction rules used by the architecture gate.
- `corepack yarn check:architecture` — runs the architecture-gate tests and
  verifies the current package dependency direction.
- `corepack yarn check:layout` — combines bilingual-document and architecture
  checks with repository-layout verification, including the pinned workspace and
  upstream boundaries.
- `corepack yarn check` — runs the complete headless repository gate:
  `check:layout`, the Fabric checks, the Market checks, and the full Desktop
  package check. Use this before handing off or submitting changes.

#### Packaging and distribution

These commands build the community market first so Desktop packaging consumes
current artifacts:

- `corepack yarn package:dir` — creates an unpacked application directory for
  inspecting packaged contents without producing a platform installer.
- `corepack yarn dist:mac` — builds the macOS distribution artifacts.
- `corepack yarn dist:mac-smoke` — creates the macOS smoke-test package used to
  validate the local release path.
- `corepack yarn dist:win` — builds the Windows installer distribution.
- `corepack yarn dist:win-portable` — builds the portable Windows distribution.

#### Pinned DeepSeek Harness workspace

The `deepseek-harness/` submodule is an independent pnpm workspace. Root wrapper
scripts enter it before invoking its pinned pnpm release:

- `corepack yarn upstream:update` — fetches the remote default branch, verifies
  it is a fast-forward from the current clean pin, moves the Harness checkout
  to that exact commit, initializes nested submodules, and synchronizes
  `upstream.json`. It refuses to overwrite local Harness or pin-metadata
  changes. Review the result, then stage `deepseek-harness` and `upstream.json`
  together in a dedicated pin-update commit.
- `corepack yarn upstream:version` — prints the pnpm version selected inside the
  upstream checkout; use it to verify the package-manager boundary.
- `corepack yarn upstream:install` — installs upstream dependencies from its
  frozen lockfile without converting or modifying the workspace for Yarn.
- `corepack yarn upstream:build` — runs the upstream Harness build through pnpm.

These wrappers do not authorize edits inside the pinned submodule. Update its
pin separately from ACR/Desktop behavior changes.

### Verify the repository

```sh
corepack yarn check
```

The outer ACR workspace uses Yarn. The pinned `deepseek-harness/` submodule remains an independent upstream pnpm workspace and must not be edited from an ACR feature branch.

## Project links

- Website: [agentcontextrelay.com](https://agentcontextrelay.com/)
- Documentation: [agentcontextrelay.com/docs](https://agentcontextrelay.com/docs)
- Source: [github.com/AgentContextRelay/acr](https://github.com/AgentContextRelay/acr)
- Discord: [discord.com/invite/r7j5PMWv4](https://discord.com/invite/r7j5PMWv4)
- Cordis: [github.com/cordiverse/cordis](https://github.com/cordiverse/cordis)
- DeepSeek Harness: [github.com/deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)

## Contributing

ACR welcomes contributors interested in agent interoperability, persistent context, Cordis plugins, developer tooling, terminals, editors, dynamic UI, security, and self-extensible software.

Before contributing, read [`AGENTS.md`](AGENTS.md), the [ACR orientation](docs/onboarding/orientation_spec_acr.md), and the [Cordis specification](docs/cordis/cordis_spec.md).

Join the [Discord community](https://discord.com/invite/r7j5PMWv4) to discuss the project and the ACR kickoff.

## License

ACR is licensed under the [MIT License](LICENSE).

## Acknowledgements

ACR builds on the work of the [Cordis](https://github.com/cordiverse/cordis) community and continues architectural inspiration from [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). We are grateful to both projects and to the broader open-source coding-agent ecosystem.
