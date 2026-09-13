# ACRYL

**A persistent, agent-agnostic coding environment.**

Keep your project, context, and workflow while changing coding agents.

ACRYL owns the persistent development environment - workspace, context, tasks, artifacts, sessions, and handoffs - while coding agents remain replaceable workers. Use Claude Code, Codex, OpenCode, Pi, Gemini CLI, DeepSeek, ACP-compatible agents, or your own agent without tying your project to any one of them.

**Same project. Same context. Same work. Different agents.**

ACRYL is built to adapt to your workflow, not lock you into an agent. Extend it with agents, tools, context systems, memory, workflows, terminals, UI capabilities, and Cordis plugins.

## Install

```bash
npm install -g acryl
```

## Run

```bash
acryl           # terminal client (default)
acryl web       # serve the local ACRYL web runtime
```

A standalone Desktop application is distributed separately.

## Why ACRYL?

Coding agents are temporary. Your development context shouldn't be.

Most coding agents own their own sessions, context, tools, and history. Switching agents usually means starting over, copying context manually, or maintaining several disconnected development environments.

ACRYL reverses that relationship:

```text
Project and context
        ↓
      ACRYL
        ↓
  Coding agents
```

The project belongs to ACRYL. Agents enter, work, and leave.

## Make it yours

ACRYL is built around composable capabilities rather than a sealed application.

Agents, models, tools, memory systems, context engines, terminals, workflows, editors, and UI surfaces can be provided as replaceable capabilities.

Underneath, ACRYL uses Cordis for lifecycle-managed plugins, replaceable services, reactive dependency injection, typed events, scoped composition, and reversible effects.

The goal is simple:

**Change the agent, extend the environment, keep the work.**

## Links

- Website: https://acryl.dev
- Source: https://github.com/acryldev/acryl
- Discord: https://discord.gg/cY9KXMex69

## License

MIT
