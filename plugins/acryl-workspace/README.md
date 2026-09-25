# acryl-workspace

ACRYL's first-party workspace shell (spec `040-agentic-multiplexer-ade`): a Projects and Chats left pane, a
tabbed canvas per git worktree with an optional split, and a right panel (Changes, Review, Checks, Files).
Required in advanced desktop mode.

## Code layout

Folders are named after the domain concept they own, not after a technical layer (see the engineering
standards in the repository `CLAUDE.md`). Each folder holds its model, its UI and its tests' vocabulary.

```text
src/                     Host half (Node)
  index.ts               registers the Host routes, owns their disposal
  http.ts                same-origin loopback checks and JSON helpers shared by the routes
  git/                   read-only git and one worktree-creating route: service, route, contract, checks
  pty/                   terminal processes: service, route, contract
  client/                Client half (browser)
    index.ts             composition root: wires the panes and tab plugins into the advanced shell
    styles.ts            all CSS of the package
    canvas/              the tab canvas: tiles, per-worktree groups, split, persistence
    worktrees/           the shared worktree shell state (selection, status, polling)
    projects/            the Projects left pane and its control
    sessions/            chat sessions: picking, navigating, sending a message to the agent
    terminal/            terminal client and agent launch commands
    git/                 typed client for the git routes
    changes/             right-panel Changes tab
    diff/                unified diff view, line comments, diff parsing
    review/              right-panel Review tab and the comment bookkeeping
    checks/              right-panel Checks tab
tests/                   mirrors src/ by domain
```

Rules of thumb: a new feature gets its own domain folder; the Host contract for a feature sits in the same
domain folder as its service and is imported by the Client (one shape, validated at the boundary); nothing
here depends on `apps/`.
