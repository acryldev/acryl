# ACRYL ADE

**ACRYL ADE**, the Agent Development Environment: the ACRYL IDE (<https://github.com/acryldev/acryl>) as one Blend. Registry id `acryl.ade`. Source: <https://github.com/acrylblends/05-acryl-ade>. Page: <https://acrylblends.github.io/blends/ai/ade/acryl.ade>.

It opens the IDE's workbench, ported into the Blends framework as `@acrylblends/workspace`:

- **left:** your projects, each with its git branches and worktrees, and the chats and terminals open on each;
- **centre:** tabs: the agent's chat (DeepSeek Harness), terminals, files, diffs;
- **right:** what the agent changed, the review of a turn, and the project's files.

The chat is the same agent ACRYL IDE runs, with its shell, file tools and jobs. Claude Code, Codex or any other terminal agent runs in a terminal tab beside it.

## Start

```bash
npm create acrylblends@latest my-ade -- --from acryl.ade
cd my-ade && npm run dev
```

Or run it straight from this repository, <https://github.com/acrylblends/05-acryl-ade>:

```bash
git clone https://github.com/acrylblends/05-acryl-ade.git
cd 05-acryl-ade && npm install && npm run dev
```

The first screen asks for a model key (Settings > Models). Add a project with the `+` next to Projects.

## How it is made

ACRYL ADE is an ordinary Blend: `blend.yaml`, `src/`, `plugins/`, tests. The one difference from the blank app is its frame layer,
`cordis.patch.yml`: where every other Blend mounts the Blends frame (`@acrylblends/blends-frame`) at the page's root, ACRYL ADE mounts the
IDE's workbench (`@acrylblends/workspace`). The app's own pages still answer under `/app` (`/app/about`), and the agent can grow the app with
plugins like in every Blend.

## Commands

- `npm run dev`: the workbench, with the agent.
- `npm test`, `npm run check`: the app's tests and type checks.

## Forks

[ACRYL SDE](https://acrylblends.github.io/blends/ai/sde) (`acryl.sde`), the Synthetic Data Engine, is ACRYL ADE plus a pipeline that turns a
codebase into anonymized, reviewed training-data packages.

MIT licence.
