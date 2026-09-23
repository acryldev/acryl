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
  reads `null`. Stop first, then boot, then wait ~30s, then read the token from *that* log. A server
  started as a plain background job of a shell that then exits dies with that shell - use the managed
  background mode, or the port is free again by the time the check runs.
- Patch every staged `client.js` copy (`patch-gallery.sh` in the session scratch dir) and restart the
  server; a `client.js` change is not picked up otherwise.
- **A change under `plugins/acryl-ui/src` needs `pnpm run build` before the check, and the demo change
  needs the patch script**: the app loads the built `lib/client.js`, and the gallery from the profile's
  own copies of `client.js`. Rebuilding is also what keeps `verify-artifact` green.
- Clearing a controlled input needs React's own value setter; setting `.value` silently concatenates.
- `element.click()` produces no `pointerdown`, so anything closing on an outside press needs CDP
  `Input.dispatchMouseEvent`. Keystrokes need `Input.dispatchKeyEvent` - and note they do *not* reach the
  `sc browser` pane at all.
- In the running app, Escape also closes the surrounding Settings view (both listen on `document`), so
  put any Escape step last.
- **Measure the box; do not assume it.** This library ships no global `box-sizing` reset, so an element
  that sets a size *and* padding or a border comes out bigger than asked for. Carousel's slides were
  426px inside a 410px viewport (and a vertical slide 136px around 120px), because `flex-basis: 100%`
  excludes the element's own padding under `content-box`; a demo slide with a 1px border added the other
  2px seen in `scrollHeight`. Every module that sizes itself declares `box-sizing: border-box`, as
  AppearanceCubes and SidebarRow already did, and a demo's own boxes need it too.
- **Anything positioned outside the component's own box needs room outside it.** Carousel's arrows sit
  `48px` out from the track's edges, so a caller gives the component *margin*, not padding - with padding
  the arrows land outside the padded box anyway and were clipped by the Settings pane, which looks
  exactly like "the button does nothing". Scroll the component into view before clicking its arrows, the
  way a reader would, and assert the point being clicked really is the button.
- **A poll that waits for a scroll to settle must sleep before its first sample**, or two identical
  pre-scroll reads look settled and the assertion fails on a component that works.
- A selector like `[data-slot="carousel"]:nth-of-type(1)` does not mean "the second carousel" - both are
  the first `div` among their own siblings. Index the NodeList instead.

## Per-item deltas

| item | what it actually is | expected delta |
|---|---|---|
| `carousel` | self-contained: scroll-snap track, prev/next buttons, dots, keyboard | DONE - ported and verified in the browser (16/16 assertions); the design notes below are what shipped |
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

## Carousel: what shipped (ported, verified, committed)

Six exports: `Carousel`, `CarouselContent`, `CarouselItem`, `CarouselPrevious`, `CarouselNext`, plus the
`CarouselApi` type. Self-contained - no overlay, no anchor, no registry, and no `:has()` state rules, so
this one is mostly platform behaviour.

- **Drop `embla-carousel-react` for CSS scroll-snap.** The track is `overflow: auto` +
  `scroll-snap-type: x mandatory`, each item `flex: 0 0 100%` + `scroll-snap-align: start`. Prev/Next
  scroll by one item (measured from the first item, so a caller who gives every slide `basis-1/2` gets
  half-viewport steps), and `canScrollPrev`/`canScrollNext` come from the scroller's own
  `scrollLeft`/`scrollTop` against `scrollWidth`/`scrollHeight` minus `clientWidth`/`clientHeight`,
  recomputed on `scroll`, on resize, on a `ResizeObserver` of the viewport and after every render (a
  resize observer sees the viewport, not the content, so a caller adding slides would otherwise leave the
  arrows stale). This is the same call ScrollArea made (the platform already does what the library
  reimplemented).
- **The API surface shrank, and the manifest records it.** Embla's api (`reInit` events, `scrollTo` with
  options, drag physics, plugins) is not reproduced. The local `CarouselApi` publishes `scrollPrev`,
  `scrollNext`, `scrollTo(index)`, `canScrollPrev()`, `canScrollNext()`, `selectedIndex()` and keeps the
  `setApi` prop, so a caller can still drive it. Same shape of decision as vaul's velocity flick in
  Drawer and Base UI's positioner variables in Combobox.
- **`CarouselPrevious`/`Next` restate shadcn's Button locally** (outline, icon, round, absolutely placed
  at the track's sides) - a cross-item import is not available, and this is the same restatement
  `PaginationLink` and `AttachmentAction` already do.
- Kept from the source: `role="region"` with `aria-roledescription="carousel"` on the root, `role="group"`
  with `aria-roledescription="slide"` per item, `ArrowLeft`/`ArrowRight` handled on the root (capture, so
  a focused button inside still moves the track), a screen-reader-only label on each arrow, `disabled`
  from the can-scroll state, both orientations and the `data-slot` names. Orientation travels as a
  `data-orientation` attribute instead of the source's conditional class strings.
- No `:has()`-driven state and no transition on a property a `:has()` rule sets, so nothing here is
  exposed to the engine split that InputGroup hit. The markup test covers roles, slots, disabled state,
  the api's orientation attribute and the absence of Tailwind leakage.
- **Two deltas the port needed, both found only in the browser**: the module declares its own
  `box-sizing: border-box` (without it a slide is 16px wider than the viewport it should fill, and a
  vertical slide 16px taller than the height its caller set), and the gap moved to the trailing edge so
  one item's border box is exactly one viewport. The demo gives the component *margin*, because the
  arrows sit outside it.
- The browser check asserted 16 things and passes 16: the snap type applied to the real scroller, one
  slide per viewport, a real click on Next moving exactly one item and flipping `canScrollPrev`, Previous
  returning and re-disabling itself, the arrow key working from a focused arrow, the end clamping and
  disabling Next, and the vertical track scrolling on the other axis with an item height that resolves
  against the height the caller set.