# T045: the remaining items, with their deltas worked out

Written while handing over with 8 items left (`menubar`, `navigation-menu`, `calendar`, `carousel`,
`resizable`, `sidebar`, `questionnaire`, `message-scroller`; plus `chart` and `form`, already recorded as
blocked on `recharts` and `react-hook-form`). Everything else in T045 is committed and verified.

The point of this file is that the pipeline below is mechanical and most of what is left is a
restatement, so a fresh pass should not need a design conversation per item. Read
`docs/pattern-anchored-listbox.md` first; it holds the shape these items restate.

## The pipeline, in order

1. Fetch the item's real source: `https://ui.shadcn.com/r/styles/new-york-v4/<slug>.json` (MIT, cite the
   docs URL and fetch date in the manifest entry).
2. Write `src/client/registry/<Name>/<Name>.tsx` and `<Name>.module.css`. Drop Radix/Base UI/vaul/cmdk;
   port onto `--dsw-alias-*` tokens; no hex colours; no theme selectors; no cross-item imports; require
   nothing but `react`, `react/jsx-runtime` and the app primitives (the built-bundle test enforces it).
3. Integrate **in one burst**: `registry-manifest.yml` (a `ported` entry with `from` and `changed` -
   avoid a plain `": "` in prose, it breaks YAML), `contracts/components.json`, `contracts/categories.json`
   (both sites only render a component inside a category, so no category means invisible), `src/client/index.ts`
   (import + export + `export type`), `tests/built-bundle.spec.ts` (composite sub-exports),
   `tests/library.spec.tsx` (markup assertions). A directory with no manifest entry fails the quality
   test - there is no safe partial state, so never stop between step 2 and step 3.
4. `pnpm run check` (manifest guard → build → artifact freshness → seed + ingest gate → typecheck → tests).
5. Add a demo section to the gallery example and verify in a real browser - see below.
6. Commit locally. Do **not** push: the operator does steps 9-11 (registry, both sites, all pushes).

## The browser check, and how to avoid wasting a pass on it

Recipe and traps are in `docs/pattern-anchored-listbox.md` and in project memory (cached Chromium over
CDP, no npm install). The expensive mistakes, all made repeatedly:

- **Stop the previous scratch server before booting a new one.** Two servers on 3099 means the second
  fails to boot, prints no token, and the check silently measures a blank page. Symptom: every field
  reads `null`. Stop first, then boot, then wait ~30s, then read the token from *that* log.
- Patch every staged `client.js` copy (`patch-gallery.sh` in the session scratch dir) and restart the
  server; a `client.js` change is not picked up otherwise.
- Clearing a controlled input needs React's own value setter; setting `.value` silently concatenates.
- `element.click()` produces no `pointerdown`, so anything closing on an outside press needs CDP
  `Input.dispatchMouseEvent`. Keystrokes need `Input.dispatchKeyEvent` - and note they do *not* reach the
  `sc browser` pane at all.
- In the running app, Escape also closes the surrounding Settings view (both listen on `document`), so
  put any Escape step last.

## Per-item deltas

| item | what it actually is | expected delta |
|---|---|---|
| `carousel` | self-contained: scroll-snap track, prev/next buttons, dots, keyboard | **smallest of the eight** - no overlay, no anchor, no registry |
| `resizable` | self-contained: pointer-drag handles between panels | small; the Drawer port's pointer-capture maths is the precedent |
| `calendar` | self-contained: month grid, date arithmetic, single and range selection | medium; `react-day-picker` is dropped, so the grid is hand-rolled |
| `menubar` | a bar of menus: several anchored panels, open/switch on hover and arrows | restatement plus a hover-intent delta |
| `navigation-menu` | same family as menubar with a viewport-wide panel and delayed hover | restatement plus hover-intent; read its source before assuming |
| `sidebar` | many parts (provider, collapsible rail, mobile sheet, persistence) | **largest remaining**; decide the partial explicitly and record it |
| `questionnaire` | only exists in the `base-nova` style family, deps `@shadcn/react` | read the source first |
| `message-scroller` | deps `@shadcn/react` | read the source first - if the primitive is the substance, it is blocked like `chart`/`form` |

Default per the operator's standing ruling: **ship the narrower verified core and record the rest in
`manifest.yml` as a deliberate partial**, unless something about the item makes that wrong - and if so,
say so rather than deciding silently.