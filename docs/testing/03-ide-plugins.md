# 3. The IDE builds its own plugins

About 30 minutes. Start ACRYL Desktop from your clone (`corepack pnpm run dev`) or in the browser (`corepack pnpm run web`).

## 3.1 ACRYL as a daily IDE

1. **Add a project:** "+" next to PROJECTS (folder picker), or ask the chat "Add the folder <path> as a project in this workspace" (it asks first:
   **Allow once**). Expected: the project and its branch appear in the tree.
2. **New worktree:** "+" next to the project, type a branch name (for example `feature/test-run`), Enter. Expected: ACRYL creates the git worktree
   and opens a chat bound to it.
3. **Agents in tabs:** the arrow next to the tab strip's "+" lists Terminal, Browser, File, Diff, Board, Doc, Workspace brief and the agents
   (ACRYL's chat, Claude Code, Codex, Pi and others you have installed). Open two. Expected: each starts inside the worktree; the tree shows which
   agent works on which branch.
4. **Comments:** open a file, add a comment on a line ("+"), send it to an agent.
5. **Shared context:** create a workspace of kind **Shared Context** with two projects, open a **Workspace brief** tab and write a goal. Start Claude
   Code in one project, ask it to do something and then "append a handoff to the workspace brief". Start Codex or Pi in the other project and say
   "continue where the previous agent left off". Expected: the second agent names what the first one did and continues.

## 3.2 A UI plugin, built while the app runs

In ACRYL's chat, send:

> Build me a plugin that adds a Pomodoro timer to the top bar: one click starts 25 minutes and shows the time left, another click stops it. Install it
> so I can use it now.

Expected (about 90 s for the button, under 3 minutes for the whole turn):

- The agent reads ACRYL's plugin docs, writes the plugin, verifies it and installs it; a 🍅 25:00 button appears **without a restart**.
- It asks to click its own button to test it: **Allow once**. It may fix what it finds and reinstall while the timer runs.
- The plugin is a folder you can open: project plugins live in `<project>/.acryl-plugins/<name>/`, plugins for every project in the app's
  `plugins/` folder.

## 3.3 A tool for the agent itself

> Build a plugin that gives you a tool to list the open issues of any GitHub repository (title, number, labels, age). Install it, then use it to show
> me the 10 newest open issues of <a repository you know>.

Expected: under 3 minutes; it writes a tool plugin, installs it and calls it in the same turn.

## 3.4 Change it, remove it

- "Make the Pomodoro 50 minutes and add a short break after it." Expected: the plugin is updated in place, the button changes.
- Open **Plugins** (sidebar): your plugins are listed; turn one off and on. Expected: it disappears and comes back without a restart.

## 3.5 Your own idea

Ask for a plugin you would actually use in your work. Report what you asked for, how long it took, and whether it did what you meant.

Docs for writing plugins by hand: `plugins/acryl-plugin-context/docs/README.md` (routed guides) and
`plugins/acryl-plugin-context/example-plugins/README.md` (a verified example of every plugin type).
