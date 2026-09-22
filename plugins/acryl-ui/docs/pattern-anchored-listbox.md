# The anchored-listbox shape

A written-down pattern, not a module. **No item may import another item's file** — the registry's
ingest gate (`scripts/validate-registry.mjs`) rejects a cross-item import, and that rule is absolute.
So the shape below is *restated* by each item that needs it, and each such item's doc comment must
cite this file from its first line, the way `ButtonGroupSeparator` and `ItemSeparator` already cite the
one-rule-divider shape they restate. Duplication with acknowledged lineage is a cost we accept;
duplication nobody can trace is not.

Items that restate it today: `Command` (filtering listbox), `Popover` (anchoring without a list).
Expected next: `Combobox`, which is both halves at once.

## The parts

1. **Open state lives in a root.** Controlled `open` plus `defaultOpen` for uncontrolled, and
   `onOpenChange` called from one place. Children read it through a React context; nothing else holds
   a copy. Provider values are rebuilt with `useMemo` on the state they close over.
2. **The trigger is a real `<button>`** carrying `aria-haspopup="dialog"` (or `"listbox"`) and
   `aria-expanded`. `asChild`/Slot is not ported — it needs Radix — so a consumer styles the button
   with their own class.
3. **The panel is positioned, never portalled.** Compute from the trigger's own
   `getBoundingClientRect()` in viewport coordinates, flip when the panel would overflow the bottom,
   re-measure on `resize` and on `scroll` (capture). A portal is impossible here: a client bundle may
   require only `react`, `react/jsx-runtime` and the app primitives, and `react-dom`'s
   `createPortal` is outside that set — `tests/built-bundle.spec.ts` fails the build if anything else
   is required. Consequence to state in the item's own docs: an ancestor with `overflow: hidden` or a
   `transform` can clip the panel.
4. **Focus moves in and back.** Focus the panel once it is *visible*, not when it is created. If the
   panel starts `visibility: hidden` and the first measure clears that through a state update, a
   `focus()` in the same commit is a silent no-op on a hidden element — focus has to run from an
   effect keyed on the applied position. On close, focus returns to the trigger for Escape; for an
   outside press it stays where the user pressed.
5. **Dismissal is Escape (on `document`) plus an outside `pointerdown`.** Escape is the innermost
   layer's to claim, but note that a surrounding app view listening on `document` will also act on it.
6. **A filtering listbox keeps a registry, and judges by "unknown means visible".** The root holds
   `{ text, disabled, onSelect }` per mounted item; an item that has *not* registered yet is visible,
   or every row would be `display-none` on the first paint and a server render would show an empty
   menu. Filtered-out rows get `display: none`, so they leave the accessibility tree as well as the
   layout, and the empty state waits until something has registered.
7. **Keyboard walks the DOM, not a state array.** Read the surviving items with
   `root.querySelectorAll('[data-slot="…-item"]')` at key time and filter out the hidden and disabled.
   Tracking order in state gets it *reversed*, because React registers children bottom-up. Arrows move,
   Home/End jump, Enter chooses, and the chosen row gets `scrollIntoView({ block: 'nearest' })`.
8. **The ARIA is the contract.** Root `role="combobox"` with `aria-controls` naming the listbox; the
   input carries `aria-activedescendant` pointing at the active option and `aria-autocomplete="list"`;
   every row is `role="option"` with `aria-selected`. Verify the input's `aria-activedescendant` equals
   the active option's id — that is the cheapest browser check that the whole chain is wired.

## What does not transfer

- Radix's `--radix-*-content-transform-origin`, and enter/exit animations. These ports animate nothing
  rather than inventing keyframes; say that in the item's docs instead of quietly dropping it.
- The source's `*.Portal` exports, for the reason in (3).
- A focus trap over the rest of the page. `Sheet`/`Drawer` wrap Tab inside the panel and say plainly
  that the page behind is not inert; a real trap needs either the app's `Modal` (centred by design, so
  it cannot become a side sheet) or an inert pass over the app root — a product decision.

## Checking it

Static markup can assert the ARIA shape and the slots, and cannot assert filtering or selection,
because both depend on mount effects. Filtering, arrow movement and Enter belong in the real-browser
check (see the CDP recipe in project memory: cached Chromium driven over `Runtime.evaluate` and
`Input.dispatchKeyEvent`, no npm install). Clearing a controlled input in such a check needs React's
own value setter — setting `.value` directly silently concatenates the next query instead.