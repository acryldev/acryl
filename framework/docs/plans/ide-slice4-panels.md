# Slice 4: files, the editor, Changes and Review

Slice 2 ported the right panel's tiles with the workspace; slice 4 adds the comparison views for them, the fixture
that makes those views comparable, and the tests are the workspace's own. Nothing in the product changed except the
fixture scripts and the comparison view list.

## The views

`scripts/frame-views.json` gains four views, each captured at 1440x900 and 1024x768:

- `right-panel-files`: the fixture worktree selected, the right panel open on its Files tree.
- `file-editor`: the same, with README.md opened in the code editor.
- `changes`: the right panel's Changes list for the fixture (one modified tracked file, +2 -1, and one untracked file).
- `review`: the same diff's "Comment on new line 2" composer, a comment sent with "Send to agent", then the right
  panel's Review tab showing the thread. The shot activates the diff tab so no live chat timestamps are in it.

Every view resets scroll to the top before the shot. The click matcher now also accepts `[role=treeitem]`, because the
Files tree's rows are tree items rather than buttons (`scripts/frame-compare.mjs`).

## The fixture

`scripts/frame-fixtures/review-fixture/` is committed: fixed file contents and modes (README.md, src/a.ts, the base
tracked.txt), the modified tracked.txt and the untracked file, and `setup.mjs`, which materializes a git repository with
a fixed author, committer and dates and the commit `59c6a00c21af85cbb7dcb19e1c5a05c3a8ceb93e`. Running it twice
produces the same commit; the script refuses to finish if the hash differs. The materialized state lives at
`<repo>/.frame-fixture/review-fixture` (gitignored) and is the run's only project.

Why a fixture at all: the Files, Changes and Review surfaces need a project with a known file tree and git state. A
fixture folder under /tmp could not be reviewed; a committed one with a deterministic git state gives the reference
and the candidate byte-identical inputs.

## How both surfaces got the same state

- The candidate: the app is started with `FRAME_FIXTURE=<materialized fixture>`; the run script seeds the app's
  `acryl-settings.yaml` with the fixture as Default's only project (`adopted: true`), so the app-folder first-project
  seeding does not fire. The dev process runs with `HOME` in its throwaway root, as ACRYL's own live run does, so the
  terminal prompt is the plain default prompt on both surfaces.
- The reference: the same isolated ACRYL desktop run at `37f4dd9c`, with a pre-seeded ACRYL home
  (`acryl-settings.yaml` with the same fixture project) passed with `--copy-home`, a fake provider key (a local test
  value) and `DEEPSEEK_BASE_URL` pointing at a local Anthropic-Messages mock. The mock makes the diff's "Send to
  agent" prompt acceptable, so the Review thread is recorded on both sides; the same comment text, file and line are
  used.
- Both captures use the same view file, viewports, theme, waits and scroll reset; the reference run keeps its own
  HOME.

## Numbers

The four new views against the new references (frame-compare compare, 2% threshold):

| View | 1440x900 | 1024x768 |
| --- | --- | --- |
| right-panel-files | 0.94% pass | 1.36% pass |
| file-editor | 1.50% pass | 2.02% |
| changes | 1.05% pass | 1.46% pass |
| review | 1.29% pass | 1.65% pass |

Seven of eight new views are within 2%. `file-editor@1024x768` is 2.02%, a 0.02-point miss: the whole editor text sits
about one pixel higher in the desktop reference than in the headless capture at that width, which doubles the
anti-aliased text edges. The same view at 1440 passes at 1.50%, and every other surface of the editor matches; this is
reported as the number it is, not masked. All four views are reachable with the frame's own controls.

The full comparison runs over the whole set (18 existing references + 8 new). The candidate images come from two
fresh apps: the existing 18 from an app started without the fixture flag (its own folder is the first project, the
state slice 3's baseline used), and the four new views from an app started with `FRAME_FIXTURE`; the two capture
folders are combined. Both runs use the isolated HOME. The combined result is 20 of 26 views within 2%: 13 of the 18
existing views (the same set as slice 3's baseline, one of them `settings-models@1440` passing at 1.45%) and 7 of the 8
new views. The one new-view miss is `file-editor@1024x768` at 2.02%, above.

## Tests

The workspace suite already covers these surfaces, so no new tests were needed: `tests/files/panes.spec.tsx` (the tree
lists, opens a file into the editor, edits and saves with conflicts), `tests/files/file-edit.spec.ts`,
`tests/files/code-editor.spec.tsx`, `tests/changes/changes-tab.spec.ts`, `tests/changes/changes-commit.spec.tsx`,
`tests/diff/git-diff-pane.spec.tsx`, `tests/panes-render.spec.tsx` (the diff's line-comment composer, "Send to agent",
and the Review tab with a thread), `tests/review/review-store.spec.ts`, `tests/review/review-tab.spec.ts`. The package
check runs all of them (98 spec files, 817 passed, 1 skipped at slice 3).

## Evidence

- `ide-slice4-panels-evidence/right-panel-files@1440x900.compare.png`
- `ide-slice4-panels-evidence/file-editor@1440x900.compare.png`
- `ide-slice4-panels-evidence/file-editor@1024x768.compare.png` (the 2.02% number)
- `ide-slice4-panels-evidence/changes@1440x900.compare.png`
- `ide-slice4-panels-evidence/review@1440x900.compare.png`

Each image is reference | candidate | difference (red where a pixel differs).
