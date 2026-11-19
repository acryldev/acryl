# 65. Terminal software — Termforge

## Product intent
A terminal-native workspace prototype combining a simulated shell, command history, task shortcuts and a compact system status panel.

**Audience:** Developers, platform engineers and technical users who prefer keyboard-driven interfaces.

**Positioning:** A command workspace for repeatable work, not just a prompt.

## UX architecture
A terminal-first dark TUI with split panes: command console, task launcher and session metadata.

### Screens and regions
1. Terminal session and prompt
2. Command history and reusable snippets
3. Task launcher for build, test and deploy routines
4. Session and environment status

## Core workflows
1. Run safe predefined commands from the prompt or shortcut list.
2. Use help, ls, pwd, git status, npm test and date to inspect seeded output.
3. Select a command snippet to populate the prompt.
4. Clear the terminal or switch between workspace tabs.

## Domain model
TerminalSession, CommandHistory, CommandSnippet, Workspace, EnvironmentStatus, CommandResult. Commands must be parsed against a strict demo allowlist.

## Interaction requirements
- The prototype must work with seeded data and without a server or paid third-party API.
- Every primary control shown in the mockup must have a meaningful local interaction or a clearly identified demo-only state.
- Keep the category's workflow and visual composition distinct from the other blueprints in this batch.
- Keep keyboard focus visible, use semantic HTML, and support a narrow viewport without horizontal page overflow.
- Persisted data, if implemented in the real app, must be separated from transient selection and editor state.

## Scope and safety boundary
This is a browser simulation. It must never invoke a host shell, execute arbitrary commands, read files, access SSH or expose real environment variables.

## Acceptance criteria
- A user can complete the key workflow in the seeded demo without external credentials.
- All shown primary states (empty, selected, in-progress, completed or error where relevant) have a defined UI representation.
- Domain logic is testable separately from rendering and uses deterministic fixtures.
- The README explains the product purpose, intended audience, local run command and three useful coding-agent prompts.
- The registry entry describes the category, app purpose and supported demo workflows.

## Coding-agent prompts
1. Implement a command parser with an explicit allowlist and deterministic output fixtures; reject all unknown commands.
2. Build a keyboard-accessible terminal history with command recall, clear and shortcut snippets.
3. Add multi-session persistence and tests proving that no command can reach host process execution.

## Prototype reference
- Standalone mockup: `../mockups/terminal-termforge.html`
- No external API keys are required.
- This mockup is a design and workflow reference, not a production-ready implementation.
