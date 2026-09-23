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
  the first `div` among their own siblings. **The same trap bit again in a second shape**: the navigation
  menu's triggers each sit inside their own `<li>`, so every one of them is *the first button among its own
  siblings* and `:nth-of-type(2)` matched nothing - the check silently moved the pointer to nowhere and
  reported a component bug that was not there. Index the NodeList (`[...querySelectorAll(slot)][i]`).
- **A roving focus must skip what cannot take focus.** The Calendar's keyboard walk advanced its own state to a disabled (weekend) button, whose element refuses
  focus - so the state had moved and the reader's focus had not, which looks exactly like a dead key. Step past anything the predicate disables, in the
  direction of travel, and only then move both.
- **When focus is part of the state, focus from an effect keyed on that state**, never from a node captured in the handler: a node captured before the commit
  is what left the Calendar's keyboard in the previous day (Popover's port hit the same rule with its panel's first focus).
- **A parent cannot measure a child in the same effect pass that mounts the child**: the child publishes
  the attribute the parent's query looks for only after its own state lands, one commit later. The
  navigation menu's shared surface kept a `visibility: hidden` box until a window resize forced it to
  re-measure; it now measures itself on the next frame and follows the panel with a resize observer. If a
  measurement depends on another component's commit, schedule it (frame or observer) rather than taking it
  in the effect.

## Per-item deltas

| item | what it actually is | expected delta |
|---|---|---|
| `carousel` | self-contained: scroll-snap track, prev/next buttons, dots, keyboard | DONE - ported and verified in the browser (16/16 assertions); the design notes below are what shipped |
| `resizable` | self-contained: pointer-drag handles between panels | DONE - ported and verified in the browser (18/18 assertions); see the notes at the end |
| `calendar` | self-contained: month grid, date arithmetic, single and range selection | DONE - ported and verified in the browser (15/15 assertions) |
| `menubar` | a bar of menus: several anchored panels, open/switch on hover and arrows | DONE - ported and verified in the browser (23/23 with navigation-menu) |
| `navigation-menu` | same family as menubar with a viewport-wide panel and delayed hover | DONE - ported and verified in the browser; see the notes at the end |
| `sidebar` | many parts (provider, collapsible rail, mobile sheet, persistence) | **largest remaining**; decide the partial explicitly and record it |
| `questionnaire` | only exists in the `base-nova` style family, deps `@shadcn/react` | BLOCKED - see below |
| `message-scroller` | deps `@shadcn/react` | BLOCKED - see below |

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
## ResizablePanelGroup: what shipped (ported, verified, committed)

`ResizablePanelGroup`, `ResizablePanel`, `ResizableHandle` (plus the `ResizableOrientation`, `ResizableLayout` and
`ResizableBounds` types). The contract key is the export that is the item's root, because shadcn's `resizable`
item exports no component called `Resizable` and a contract key has to be a real runtime export - the rename
`DirectionProvider` already took for shadcn's `direction` item. The catalogue's category stays `Resizable`.

- **Drop `react-resizable-panels` for arithmetic on the group's own rect.** The group owns the layout as a map
  of panel id to percentage and renders a flex container; the panels register their own sizes and limits, and
  one pass in a layout effect turns those declarations into a normalised layout (panels without a declared size
  share what the others leave). A size prop is a percentage in every form (`"50%"`, `"50"`, `50`); the upstream
  library reads a bare number as pixels, which is why its own docs write `defaultSize="50%"`.
- **Drag**: pointer capture on the divider (the Drawer port's precedent), projecting the movement onto the
  group's own rect as a percentage of the pair's total. **Keyboard**: the source's own steps - 5 percent per
  arrow on the group's axis, Home/End to the end of what the pair allows, Enter to collapse the panel *before*
  the divider. The pair's total is kept constant, so the neighbour can never be pushed past its own limits.
- **Reading the pair from the DOM, not from a registry**: React runs child effects in tree order, so a registry
  built from them is bottom-up. A divider reads its own `previousElementSibling`/`nextElementSibling`, which is
  correct whatever order the children mounted in.
- **`aria-valuemin`/`aria-valuemax` are pair-aware**, as the source's delta simulation is: the divider cannot
  move a panel past what its neighbour can give up.
- The browser check asserted 18 things and passes 18: the measured layout, the divider being the element at its
  own centre, a real pointer drag moving the panel by the distance dragged, `aria-valuenow` following the drag,
  the arrow key moving 5 points, Home/End stopping at the floor and at what the pair allows, four cases of Enter
  (no-op when the panel before it cannot collapse, collapse, and restore), and the same drag and arrow key on
  the vertical axis. The demo grew a third group (a collapsible panel before the divider) when the first run of
  the check showed Enter correctly doing nothing on a group whose collapsible panel sat *after* the divider.

Partial (recorded in manifest.yml): pixel sizes, `collapsedThreshold`, `groupResizeBehavior`, `defaultLayout`,
`disabled`, `resizePreviewMode`/`SeparatorOverlay`, the imperative handles, `useDefaultLayout` persistence, the
`isUserInteraction` argument, F6 between separators, the double-click reset, and RTL mirroring.

## Menubar and NavigationMenu: what shipped (ported, verified, committed)

Both bars restate the anchored-listbox shape (`docs/pattern-anchored-listbox.md`) for their panels and add the
one thing a bar has that a menu does not.

- **Menubar** - roving focus, so the bar is a single Tab stop and the arrow keys plus Home/End walk its
  triggers and open the one they land on when a menu is already open, and hover intent, so a pointer sliding
  onto a sibling switches menus. The panel closes when focus leaves the bar entirely, which works only because
  the panel is a child of the bar element rather than a portal. `MenubarPortal` and the submenu family
  (`MenubarSub`, `MenubarSubTrigger`, `MenubarSubContent`) are recorded partials, the same calls Sheet,
  Popover and ContextMenu already took.
- **NavigationMenu** - delayed hover (150 ms), because a pointer crossing a bar should not flash panels, an
  immediate switch once one is open, and a close grace period (250 ms) measured from bar and panel together so
  a pointer crossing the gap between them does not dismiss it. Every item's panel is placed at the same
  coordinates under the whole list, so switching does not move the panel a reader is looking at; upstream
  achieves that by moving the open panel into one viewport box, which needs a portal, so
  `NavigationMenuViewport` paints the same surface at the open panel's own box instead and a panel draws no
  surface while a viewport is in play. `NavigationMenuIndicator`, the panel morph animation, and
  `navigationMenuTriggerStyle` as a `cva` string are recorded partials.
- Verified in the running app, 23/23 across both: one Tab stop each, ArrowRight/ArrowLeft walking the menubar,
  ArrowDown opening a menu with focus inside and the panel below its trigger, the arrow keys walking the rows,
  a real click re-opening a menu and a row activation running it and closing, a pointer sliding onto a sibling
  switching menus, Escape closing; and for the navigation bar, no panel on a 60 ms pass-through hover, the
  panel opening after the hover rests with its own links and the shared surface exactly on its box, an
  immediate switch on the sibling, the panel surviving 120 ms away and closing after the grace period, the
  arrows opening the trigger they land on, and Escape taking the surface with it.

## Blocked, with the evidence (questionnaire, message-scroller)

Both are the same class as `chart` (recharts) and `form` (react-hook-form): the registry item is a set of thin
wrappers over a primitive that carries the substance.

- `message-scroller` is 131 lines of Tailwind class strings over `@shadcn/react/message-scroller`, and it
  re-exports that primitive's own hooks (`useMessageScroller`, `useMessageScrollerScrollable`,
  `useMessageScrollerVisibility`). The behaviour - auto-scroll pinning, scroll anchors, the pending-scroll and
  autoscrolling states - lives in the primitive; the wrapper alone does nothing, and hand-porting it would be
  reimplementing a scroll-anchoring engine, not porting this item.
- `questionnaire` is 333 lines of the same shape over `@shadcn/react/questionnaire` (Root, Progress, Item,
  Title, Description, Choices, ...), **plus two extra reasons**: it exists only in the `base-nova` style family
  rather than new-york-v4 (`/r/styles/new-york-v4/questionnaire.json` returns the docs page, not an item), and
  its own source imports `@/app/(create)/components/icon-placeholder`, a private module of the docs site that
  is not published at all.

## Calendar: what shipped (ported, verified, committed)

`react-day-picker` and `date-fns` are dropped and the month grid is hand-rolled, because the item upstream is a theme over a date-picker engine and the engine is
the part this library can write with the platform's own date arithmetic and `Intl` for the names - the same call ScrollArea made for the platform's scroller and
Carousel for CSS scroll snap.

- One month at a time, built from `startOfMonth`/`daysInMonth` and a `weekStartsOn` week layout; a real `<table role="grid">` with a column per weekday, one
  `aria-selected` per cell, and each day button's accessible name is its full date through `Intl`.
- Selection is controlled: `single` or `range`, with the range's edges and the days between them published as `data-range-start`/`-middle`/`-end`. `today` is
  marked, `showOutsideDays` decides whether the neighbouring months' days are shown, and a day-level `disabled` predicate is honoured.
- The keyboard model a date grid needs: a roving tab stop, arrows by day and by week, Home/End to the week's ends, PageUp/PageDown by month, Enter or Space to
  choose, the displayed month following the focused day, and `addMonths` clamped so that 31 March plus a month is not 1 May.
- **Two bugs only the browser could show**: the walk could land on a disabled day (its button refuses focus, so the state advanced while the reader's focus
  did not - it now steps past anything the predicate disables), and focusing a node captured before the commit left the keyboard in the previous day (it now
  focuses from an effect keyed on the focused day).
- The browser check asserted 15 things and passes 15: the grid's shape, the chosen day as the only tab stop, the weekend predicate disabling exactly the
  Sundays and Saturdays on screen, a real click choosing and reporting, the arrow key skipping the weekend with state and real focus together, ArrowDown by a
  week, Home/End landing on the first and last day they can reach (and the grid following into the next month), PageDown/PageUp turning the month and skipping
  a disabled landing day, Enter and Space choosing the focused day, and a range's second press closing it with the middle shaded rather than chosen.

Partial (recorded in manifest.yml): multi-month, the dropdown caption layout, week numbers, the `formatters`/`classNames`/`components` extension points,
uncontrolled `defaultSelected`, react-day-picker's rich disabled matchers (dates, ranges, day-of-week sets - this port takes a predicate), and its
`CalendarDayButton` export.
