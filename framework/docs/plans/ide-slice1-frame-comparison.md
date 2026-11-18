# Slice 1 against ACRYL's own desktop: the frame comparison, first run

Date: 2026-10-30. Candidate: a fresh `boot` app on the integrated slice-1 branches (`101-ide-slice1-integration`), its DSH profile created by the app's own script, booted with a throwaway DSH home. Reference: `scripts/frame-reference`, ACRYL Desktop at 37f4dd9c.

Run (the app kept by the boot gate, then restarted by hand on its own home):

```sh
VERIFY_KEEP=1 pnpm run verify:ide-profile
# in the kept app folder, with DSH_HOME and ACRYLBLENDS_HOME as the gate set them:
npm run dev
node scripts/frame-compare.mjs check scripts/frame-reference "<url with token>" /tmp/framecmp --max 2
```

| View | Differing | Result |
| --- | --- | --- |
| settings-shortcuts@1440x900 | 3.41% | closest view; the dialog's rows and sections match |
| settings-shortcuts@1024x768 | 4.05% | |
| settings-models@1024x768 | 13.86% | |
| settings-general@1024x768 | 15.13% | |
| settings-models@1440x900 | 20.07% | |
| settings-general@1440x900 | 21.74% | |
| left-panel-collapsed@1440x900 | 17.51% | |
| left-panel-collapsed@1024x768 | 23.05% | |
| frame-dark@1440x900 | 22.02% | |
| frame-light@1440x900 | 23.16% | |
| frame@1440x900 | 28.69% | |
| frame-dark@1024x768 | 31.28% | |
| frame@1024x768 | 31.28% | |
| frame-light@1024x768 | 31.46% | |
| right-panel-open (both) | MISSING | needs slice 2's right-panel tiles |
| terminal-tab (both) | MISSING | needs slice 2's terminals |

None of the 18 views is within 2% yet. The comparison is still useful: it shows exactly what differs and why.

## What matches

Settings > Shortcuts at 3-4% (image beside the reference: [frame-compare-settings-shortcuts.png](frame-compare-settings-shortcuts.png)): the same sections, rows, shortcuts, toggles and layout, offset only because the frame's left column shows different content (below). Settings renders in ACRYL's frame, not a look-alike.

## What differs, and where each difference belongs

1. **DSH's first-run dialogs covered the frame, and are now off.** The first run showed "Add an API key to get started" over the main surface: the view steps click "Configure later", but the dialog reappears after the click in this build, so the screenshot catches it. The generated overlay now carries DSH's own switch (`- id: ui-settings-models` with `credentialOnboarding: false`), covered by a generator test; on the second run `frame@1440x900` went from 28.69% to 22.02% and no dialog is on any view.
2. **The left column's content.** The reference shows Projects and Workspaces with a project row; the candidate shows DSH's session list (New Session, Plugins, Default workspace). Projects and the workspace are slice 2 (`acryl-workspace`); until then the frame is right and its content is not.
3. **The main surface.** The reference's conversation area is ACRYL's, the candidate's is DSH's conversation UI: that is the intended composition (the chat is DSH's), so those pixels will never match by design. A strict whole-page comparison of `frame*` is the wrong gate; the gate should compare the frame chrome (panels, Settings) and accept the chat surface as the design.
4. **Right panel and terminals** do not exist yet (slice 2), so two views have no candidate.

## The reference set's own two defects (found on the slice 2 candidate)

- **A transparent reference pixel is not a black one.** ACRYL's Desktop page is transparent over the native window material, and its sidebar is alpha 0 in every non-Settings view; `frame-compare` drew the reference over black, so an opaque browser page differed by the whole sidebar (about 19-21% of a 1440x900 view). The harness now skips reference pixels with alpha 0, exactly as it skips masked ones, and marks them in the difference image.
- **`left-panel-collapsed`'s reference still carries DSH's "Add an API key to get started" dialog**, which slice 1 deliberately switched off; it alone adds about 9-11% to that view. The set is recaptured from ACRYL with an opaque background.

## What would make the gate meaningful at slice 1

- Suppress DSH's first-run dialogs in the profile the generator writes (a settings-models row config, not a page hack), then re-run the `frame` views.
- Add a mask for the main-surface region to `frame-views.json`, or a `--views` subset (left-panel-collapsed, settings-*) so slice 1's gate measures what slice 1 adds.
- Keep the full set for slice 2, when projects, the right panel and terminals exist.
