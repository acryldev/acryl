# The ACRYL reference set for the frame comparison

The screenshots each slice is compared with: ACRYL's own page at the views and viewports of `../frame-views.json`,
named `<view>@<width>x<height>.png`.

## The current set: recaptured 2026-10-30, with an opaque background

The first set captured ACRYL's Electron page with its transparent background. The frame's sidebar surface is
deliberately transparent (`--dsw-specific-sidebar-fill: transparent` in the shell) and the desktop window material
showed through it, so those pixels had alpha 0. `frame-compare` can only skip an alpha-0 pixel, and the sidebar's
anti-aliased text had been drawn against transparency, which no opaque browser page can match. That set also caught
DSH's "Add an API key to get started" dialog reappearing after "Configure later" in its `left-panel-collapsed` view.

The set was recaptured from the same ACRYL worktree at `37f4dd9c`, with the same isolated run and the same view list,
steps and waits:

- The run: `node scripts/live-run.mjs desktop --no-key --keep --inspect 9333`, the app given its own throwaway root
  (its own HOME, ACRYL home, engine home and Electron user data). No model key was injected.
- The capture: the view list and steps of `../frame-views.json`, at both viewports (`1440x900`, `1024x768`), with
  `prefers-color-scheme` set per view and `localStorage`/`sessionStorage` cleared before each view, driven through the
  Electron inspector at `9333`.
- `Emulation.setDefaultBackgroundColorOverride` per view theme: `#121212` for dark/default and `#ffffff` for light,
  the frame's own web background, the colour a browser paints behind the transparent sidebar.
- A readiness wait before each shot for the ACRYL workspace client (`data-dsh-desktop-mode=advanced`,
  `.dshDesktopFrame`, `.dshWorkspaceTabstrip`), so no view can catch DSH's stock sidebar while the client is still
  registering.
- A user patch layer in the isolated engine profile (`acryl-home/.dsh/profiles/desktop/cordis.patch.yml`):
  `ui-settings-models` with `credentialOnboarding: false`, so the first-run API-key dialog is absent from every view.
  This is the same switch the generated acrylblends profile writes.

All 18 views were captured. The run roots were deleted afterwards, the desktop's port was confirmed free and the real
homes were untouched (the live run's own check on exit). The view list uses ACRYL's own labels for the two panel
controls (`Collapse sidebar`, `Show right panel`); the terminal views were given a neutral prompt before the shot, and
the terminal view's changing region is masked in `frame-views.json`.

## Slice 4 additions: Files, the editor, Changes and Review (2026-10-30)

Four views capture the right panel's Files tree, a file open in the code editor, the Changes list and a Review thread.
They need a project and a known git state, so both surfaces open the committed fixture at
`../frame-fixtures/review-fixture`: its `setup.mjs` materializes a git repository with the fixed commit
`59c6a00c21af85cbb7dcb19e1c5a05c3a8ceb93e` (author, committer and dates fixed), one modified tracked file
(`tracked.txt`, +2 -1) and one untracked file. The fixture is the only project in the run's registry.

- The ACRYL run: the same isolated desktop live run at `37f4dd9c`, with a fake provider key (a local test value) and
  `DEEPSEEK_BASE_URL` pointing at a local Anthropic-Messages mock, so the diff's "Send to agent" prompt is accepted and
  the Review thread is recorded. A pre-seeded ACRYL home (`acryl-settings.yaml` with the fixture as Default's only
  project and `adopted: true`) is passed with `--copy-home`. The run keeps its own HOME, so the terminal prompt is the
  plain default one.
- The candidate run: the app is started with `FRAME_FIXTURE=<materialized fixture>` (the registry is seeded with the
  fixture only, so the app-folder first-project seeding does not fire), the same fake key and mock URL, and the dev
  process runs with HOME in its throwaway root so the terminal prompt matches.
- The review views create the same comment through the UI on both surfaces: "Please explain this change." on
  `tracked.txt`, new line 2, sent from the diff; the thread then shows in the right panel's Review tab. The view then
  activates the diff tab, so the shot has no live chat timestamps; the tab strip and left pane still show the session
  the send created.
- Every view resets scroll to the top before the shot.

The existing 18 references are untouched. Their candidate views are captured the way slice 3 captured them: a fresh
app whose own folder is the first project, no fixture flag. The four new views are captured from a second fresh app
started with the fixture flag; the two candidate folders are combined for the comparison. The fixture path appears in
the Changes panel and in the terminal prompt; the reference and candidate must materialize the fixture at the same path
(the default is `<repo>/.frame-fixture/review-fixture`) or both captures must be redone.

## History: the first set (superseded)

Taken 2026-10-30 by the ACRYL side from the framework's own desktop at `37f4dd9c`, with the same live-run method but
without the opaque background override, the readiness wait or the onboarding switch. It established the comparison
method and the view mapping, and its transparent sidebar made the alpha-0 comparison rule necessary.

## Refreshing the set

Refreshing after ACRYL's frame changes is the same procedure: an isolated live desktop run at the ACRYL commit, the
view list and steps of `../frame-views.json`, `setDefaultBackgroundColorOverride` to the frame's background, the
readiness wait, onboarding off, then replace the PNGs here and update this file with the commit and the date. The
slice 4 views additionally re-materialize the fixture, seed the run's registry with it, and use the fake key and local
mock model described above.
