# acryl-workspace

ACRYL's first-party workspace shell (spec `040-agentic-multiplexer-ade`): a Projects and Chats left pane, a
tabbed canvas per git worktree with an optional split, and a right panel (Changes, Review, Checks, Files).

**One implementation for Web and Desktop.** The shell (frame, layout, slots) and the workspace live here and are
composed for both surfaces from one declaration in `acryl-harness-runtime`'s `coding-capabilities.ts`
(`workspace` and `advanced-shell`, `surfaces: ['desktop', 'web']`). Web always runs the ACRYL shell; Desktop
lets the user pick it or the stock frame. What differs is behind small seams: the platform (`shell/environment.ts`:
Electron marks the page URL, a plain page is `web`), native window chrome metrics (`shell/chrome-metrics.ts`, only
Electron platforms reserve space), and adding a project (`projects/projects-control.ts`: Desktop's window folder
picker on Windows, otherwise the upstream Add workspace flow, which browses the server's folders on Web).
Nothing here may import Electron or a Desktop-only service.

## Code layout

Folders are named after the domain concept they own, not after a technical layer (see the engineering
standards in the repository `CLAUDE.md`). Each folder holds its model, its UI and its tests' vocabulary.

```text
src/                     Host half (Node)
  index.ts               registers the Host routes, owns their disposal
  http.ts                same-origin loopback checks and JSON helpers shared by the routes
  git/                   read-only git and one worktree-creating route: service, route, contract, checks
  files/                 confined browse, read and atomic save of files inside a worktree: service, route, contract
  pty/                   terminal processes: service, route, contract
  client/                Client half (browser)
    index.ts             composition root: wires the panes and tab plugins into the advanced shell
    styles.ts            all CSS of the package
    shell/               the ACRYL frame shared by Web and Desktop: slots, layout state and service, theme, environment
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
    files/               right-panel Files tab and the CodeMirror editor tab (drafts, save, conflict handling)
tests/                   mirrors src/ by domain
```

Rules of thumb: a new feature gets its own domain folder; the Host contract for a feature sits in the same
domain folder as its service and is imported by the Client (one shape, validated at the boundary); nothing
here depends on `apps/`.

## Editor

The editor tab is CodeMirror 6 (MIT). Syntax highlighting for the file's language loads on demand from
`@codemirror/language-data`, which covers the major languages. The Module Loader evaluates a single
`client.js`, so the build inlines those on-demand packs (`inlineDynamicImports` in `tsdown.config.ts`); that
makes `client.js` about 3.3 MB. If size ever matters, replace `language-data` with a curated list of language
packages.

Saving is the only place this package writes user files. The Host confines every path to a git worktree root
(relative, no `..` or `.git` segments, real path inside the worktree), refuses files over 2 MB, writes through a
temp file and rename, and answers 409 when the file changed on disk since it was read.

