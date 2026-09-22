# Visual mount anchors: point at a running screen, hand an agent the real location

**Tracking:** to be filed (`acryldev/acryl` issue) when this moves to `ready-for-agent`

**Feature Directory**: `specs/039-visual-mount-anchors`
**Created**: 2026-09-22
**Status**: idea captured, not started. Parked deliberately while `specs/038-ui-component-library`
(a directed agent porting the remaining shadcn/ui components, T045) has priority. This file exists
so the idea survives until someone picks it up - it is a stub, not a plan.
**Authority**: `specs/038-ui-component-library` (the registry and its provenance mechanism this
feature would read from), DSH `packages/client/modules` (the client-module loader whose error
messages and `data-plugin`/`data-plugin-css` markers this feature reads), DSH `packages/client/ui-slots`
(the slot registration this feature would extend).
**Input**: user direction 2026-09-22, in conversation, after seeing two third-party tools
(`kunchenguid/lavish-axi`, `stablyai/orca`'s Design Mode) that let a person click an element in a
running preview and send that location to a coding agent: "when we tell agent to add new feature we
need to find a way to attach reference pointing anchor to pinpoint exact location where we wanna
attach/mount the new feature component to."

## The problem

Today, directing an agent (human or automated) to add a UI feature "here, in this exact spot" means
describing the spot in words, or pasting a screenshot the agent has to guess a location from.
Neither survives well: a screenshot has no stable identity once the layout changes, and a verbal
description ("the button next to the sidebar toggle") is exactly the kind of ambiguity that produces
a plugin mounted into the wrong slot, or a hand-styled element bolted on beside the real UI instead
of composed into it.

## Prior art (read only, no code or assets taken)

- **Lavish** (`github.com/kunchenguid/lavish-axi`): click an element or select a text range in a
  live preview; captures a CSS locator (plus row/column identity for table cells, range anchors for
  text) and delivers it to the agent via `lavish-axi poll`.
- **Orca** (`github.com/stablyai/orca`, Design Mode): click an element in a real Chromium window;
  sends its HTML, CSS and a cropped screenshot straight into the agent's prompt.

Both resolve to the *rendered DOM*, not to *source*. Neither is ACRYL-specific, and neither knows
what a Cordis slot is.

## What ACRYL already has, for free

Checked in-session, not assumed:

- Every component the UI library (`@acryl/ui`) builds is wrapped by DSH's own CSS Modules step,
  which stamps a `<style data-plugin="<package>" data-plugin-css="<package>/<File>.module.css">` tag
  and gives every class name a per-file hash (`_7N2zKq_card`). A clicked element's own class,
  cross-referenced against the loaded `data-plugin-css` tags, already resolves to **the exact
  component file** that rendered it - not just the package. This exists today; nothing to build.

## What's missing (the real gap)

`packages/client/ui-slots`' `register(options, component)` never marks the DOM boundary it renders
into with the slot's own `name`/`id` (checked: no `data-slot`-equivalent attribute exists at the
slot-boundary level; `data-slot` attributes seen elsewhere are shadcn-ported components' own internal
styling hooks, unrelated to Cordis slots). So today you can resolve "this exact file rendered this
pixel" but not "this is the `sidebar.footer.action` slot, filled by plugin X." That is the one thing
genuinely worth building for ACRYL specifically - most apps have no slot system at all, so this isn't
something to copy from Lavish or Orca, it has no equivalent there.

## Proposed shape (not designed in depth - a stub)

1. Small addition to `ui-slots`: wrap each registered slot's rendered boundary in an element (or a
   marker attribute on the existing wrapper) carrying `data-acryl-slot="<name>"` and
   `data-acryl-slot-id="<id>"`.
2. A "pick" step: click an element in a running session, walk up to the nearest
   `data-acryl-slot` ancestor, read the clicked element's own hashed class, cross-reference it
   against loaded `data-plugin-css` tags to resolve the source file. This could start as nothing
   more than a documented recipe using existing browser automation (Claude in Chrome's `computer`/
   `read_page`/`find`, or the app's own `sc browser eval`), not new product code.
3. Package the result as a small anchor - `{ slot, slotId, filledBy, component, sourceFile }` - and
   attach it to whatever task/context file the agent reads before building (fits the same "structured
   artifact, not free chat history" principle `specs/037-guardrailed-self-extension` already uses for
   everything else an agent is handed).

## Open questions (not answered here)

- Does the marker belong on the slot's own wrapper element (simplest) or does it need to survive a
  slot with no wrapper of its own (some slots may render children directly with no boundary node)?
- Where does the anchor get attached - a new task-file field, a chat attachment, something else?
- Does this need a UI of its own (a literal "point" mode/cursor), or is a documented click-and-read
  recipe against existing browser tooling enough for a first version?
- Worth a spike against one real slot (e.g. `settings.section`) before committing to a design.
