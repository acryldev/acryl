# Slice 2: the frame comparison

The ACRYL frame after slice 2's client half is wired: the workspace canvas, the Projects left pane, the right panel
and real terminal tabs, on the same page DSH serves. This note records the comparison with the ACRYL reference set
and its numbers. The gate is `node scripts/frame-compare.mjs check scripts/frame-reference <url> <out> --max 2`
against an app booted from this checkout (18 views: 9 names at 1440x900 and 1024x768).

The reference set was recaptured on 2026-10-30 with an opaque background, a readiness wait for the ACRYL workspace
client and DSH's first-run API-key dialog switched off; the method and the history are in
[`scripts/frame-reference/README.md`](../../scripts/frame-reference/README.md). `frame-compare` also now launches its
browser with notifications disabled: an unset notification permission adds a 24px "Enable notifications" status
line to the workspace, which the desktop reference does not have, and that line shifts the centred conversation up by
half its height.

## Numbers, 2026-10-30

All 18 views were captured. 13 of 18 are within 2%.

| View | 1440x900 | 1024x768 |
| --- | --- | --- |
| frame | 0.47% pass | 0.76% pass |
| frame-dark | 0.47% pass | 0.76% pass |
| frame-light | 0.47% pass | 0.73% pass |
| left-panel-collapsed | 0.34% pass | 0.50% pass |
| right-panel-open | 1.80% pass | 2.28% |
| terminal-tab | 0.30% pass | 0.52% pass |
| settings-general | 2.99% | 3.95% |
| settings-models | 1.32% pass | 2.68% |
| settings-shortcuts | 1.76% pass | 2.22% |

Two of the three target views pass at both viewports: `left-panel-collapsed` (0.34%, 0.50%) and `terminal-tab`
(0.30%, 0.52%). `right-panel-open` passes at 1440 (1.80%) and misses at 1024 by 0.28 points.

`right-panel-open@1024x768` is expected to miss by about 0.3 points: DSH's right Sidebar Browser tab exists only in
the desktop profile (`ui-sidebar-browser` is disabled unless `profileContext.name === 'desktop'`, in
`@deepseek-ai/dsh-web-app`'s `cordis.patch.yml`), so the reference has a Browser row where a web profile has the
next row, and every row below shifts. The fix, when it matters, is a web-profile reference set for the web
comparison, which is slice 5/6 work, not this branch. The threshold and the masks are unchanged.

The four settings views miss by 0.2-1.95 points: they capture DSH's own Settings dialog over the frame and are not
slice 2 targets.

## What the numbers show

The frame renders identically enough to ACRYL's own page to pass every frame view, both themes, both viewports, plus
the collapsed sidebar, the real-PTY terminal tab and two of the Settings views. The candidate images show the
workspace canvas with the conversation, the Projects tree, the right panel with Files, Changes, Review, Checks and a
running terminal, and real terminal tabs; the boot gate separately asserts the rendered frame, the Projects panel and
the door's page script in a real browser.

## Evidence

- `ide-slice2-frame-evidence/frame@1440x900.compare.png`
- `ide-slice2-frame-evidence/left-panel-collapsed@1440x900.compare.png`
- `ide-slice2-frame-evidence/right-panel-open@1440x900.compare.png`
- `ide-slice2-frame-evidence/right-panel-open@1024x768.compare.png` (the Browser-row miss)
- `ide-slice2-frame-evidence/terminal-tab@1440x900.compare.png`

Each image is reference | candidate | difference (red where a pixel differs).
