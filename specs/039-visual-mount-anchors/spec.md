# Visual mount anchors: point at a running screen, hand an agent the real location

**Tracking:** to be filed (`acryldev/acryl` issue) when this moves to `ready-for-agent`

**Feature Directory**: `specs/039-visual-mount-anchors`
**Created**: 2026-09-22
**Status**: idea captured, not started. Parked deliberately while `specs/038-ui-component-library`
(a directed agent porting the remaining shadcn/ui components, T045) has priority. This file exists
so the idea survives until someone picks it up - it is a stub, not a plan.
**Authority**: `specs/038-ui-component-library` (the registry and its provenance mechanism Scope A
would read from), DSH `packages/client/modules` (the client-module loader whose `data-plugin`/
`data-plugin-css` markers Scope A reads), DSH `packages/client/ui-slots` (the slot registration
Scope A would extend), the ACRYL BLENDS "agent builds the app from inside out" model (`CLAUDE.md`
section 1) that Scope B belongs to.
**Input**: user direction 2026-09-22, in conversation, after seeing two third-party tools
(`kunchenguid/lavish-axi`, `stablyai/orca`'s Design Mode) that let a person click an element in a
running preview and send that location to a coding agent. First framing: "when we tell agent to
add new feature we need to find a way to attach reference pointing anchor to pinpoint exact
location where we wanna attach/mount the new feature component to." Second, broader framing, same
day: is this "planned for both web and desktop surfaces," and - the bigger point - could the same
mechanism apply when "ACRYL BLEND agentic IDE is used by user to build something in web (some web
app) and our users ask ACRYL IDE to open browser and pinpoint on webpage something, or if it's
HTML summary spec or UX mockup, so users can annotate and comment where EXACTLY TO CHANGE, like
Orca and lavish-axi are doing it."

## Two scopes, not one - Scope B is the bigger one

**Scope A - pointing at ACRYL's own UI**, to direct an agent extending ACRYL itself (mount a new
plugin into the right Cordis slot). Narrow, ACRYL-internal, resolves to a real slot + source file.

**Scope B - pointing at whatever a user is building *through* ACRYL Blends** - a running preview of
their own in-progress web app, or a static HTML mockup/spec they're reviewing before building -
so they can annotate "change exactly this" the way Orca's Design Mode and Lavish already do. This
is the actual Orca/Lavish use case, generalized to ACRYL Blends' whole premise (a blank canvas the
agent builds from the inside out, per `CLAUDE.md` section 1): most of what a Blend produces has no
Cordis slots at all, so there is nothing ACRYL-specific to resolve to - the anchor stops at the DOM
(a CSS selector, the element's HTML/CSS, a cropped screenshot), exactly like the two prior-art tools.

The two scopes likely share the same plumbing (a point-mode cursor in a browser pane, click →
capture → package as an anchor, hand to the agent) and differ only in what the anchor resolves to:
Scope A resolves further, to a slot + source file; Scope B stops at the DOM, because for an
arbitrary user-built app that is all there is.

## Surfaces (Web and Desktop), for Scope A

Both, and it is close to free: Desktop's renderer is not a separate implementation - it is the same
DSH client bundle running inside Electron, which is Chromium underneath. The DOM/class-hash
resolution this spec depends on (see "What ACRYL already has, for free" below) therefore works
unmodified on both surfaces; there is no second implementation to build for Desktop.

## The problem

Today, directing an agent (human or automated) to add a UI feature "here, in this exact spot" means
describing the spot in words, or pasting a screenshot the agent has to guess a location from.
Neither survives well: a screenshot has no stable identity once the layout changes, and a verbal
description ("the button next to the sidebar toggle") is exactly the kind of ambiguity that produces
a plugin mounted into the wrong slot (Scope A), or a change landing on the wrong element of a
generated app (Scope B).

## Prior art (read only, no code or assets taken)

- **Lavish** (`github.com/kunchenguid/lavish-axi`): click an element or select a text range in a
  live preview; captures a CSS locator (plus row/column identity for table cells, range anchors for
  text) and delivers it to the agent via `lavish-axi poll`. This is Scope B's model almost exactly.
- **Orca** (`github.com/stablyai/orca`, Design Mode): click an element in a real Chromium window;
  sends its HTML, CSS and a cropped screenshot straight into the agent's prompt. Also Scope B's
  model; also integrates with multiple agent backends running in parallel worktrees, a pattern
  worth a look if Scope B's task-attachment story gets designed later.

Both resolve to the *rendered DOM*, not to *source*, and neither knows what a Cordis slot is - which
is exactly right for Scope B (there is no slot to resolve to) and exactly the gap for Scope A.

## What ACRYL already has, for free (Scope A)

Checked in-session, not assumed:

- Every component the UI library (`@acryl/ui`) builds is wrapped by DSH's own CSS Modules step,
  which stamps a `<style data-plugin="<package>" data-plugin-css="<package>/<File>.module.css">` tag
  and gives every class name a per-file hash (`_7N2zKq_card`). A clicked element's own class,
  cross-referenced against the loaded `data-plugin-css` tags, already resolves to **the exact
  component file** that rendered it - not just the package. This exists today; nothing to build.

## What's missing (the real gap, Scope A)

`packages/client/ui-slots`' `register(options, component)` never marks the DOM boundary it renders
into with the slot's own `name`/`id` (checked: no `data-slot`-equivalent attribute exists at the
slot-boundary level; `data-slot` attributes seen elsewhere are shadcn-ported components' own internal
styling hooks, unrelated to Cordis slots). So today you can resolve "this exact file rendered this
pixel" but not "this is the `sidebar.footer.action` slot, filled by plugin X." That is the one thing
genuinely worth building for ACRYL specifically - most apps have no slot system at all, so this isn't
something to copy from Lavish or Orca, it has no equivalent there.

## Proposed shape (not designed in depth - a stub)

Shared plumbing (both scopes):

1. A "pick" step: a point-mode cursor over a browser pane (the app's own, or a preview of whatever
   a Blend is building), click an element, capture it. This could start as nothing more than a
   documented recipe using existing browser automation (Claude in Chrome's `computer`/`read_page`/
   `find`, or the app's own `sc browser eval`), not new product code, for a first version of either
   scope.
2. Package the result as a small anchor and attach it to whatever task/context file the agent reads
   before building (fits the same "structured artifact, not free chat history" principle
   `specs/037-guardrailed-self-extension` already uses for everything else an agent is handed).

Scope A only, on top of the shared plumbing:

3. Small addition to `ui-slots`: wrap each registered slot's rendered boundary in an element (or a
   marker attribute on the existing wrapper) carrying `data-acryl-slot="<name>"` and
   `data-acryl-slot-id="<id>"`.
4. Resolve: walk up from the clicked element to the nearest `data-acryl-slot` ancestor, read the
   clicked element's own hashed class, cross-reference it against loaded `data-plugin-css` tags to
   name the source file. Anchor shape: `{ slot, slotId, filledBy, component, sourceFile }`.

Scope B only, on top of the shared plumbing:

5. No slot resolution - the anchor is the DOM-level capture itself: a CSS selector, the element's
   HTML/CSS, optionally a cropped screenshot (Lavish/Orca's own shape). Applies equally to a live
   preview (a dev server the Blend is running) and a static document (an HTML mockup/spec a user is
   reviewing before anything is built).

## Open questions (not answered here)

- Scope B first, or Scope A first? Scope B is the bigger, more central case (it serves every Blend,
  not just ACRYL's own UI), but Scope A is smaller and already has half its resolution mechanism
  built - worth weighing effort against value before picking an order.
- Does the Scope A marker belong on the slot's own wrapper element (simplest) or does it need to
  survive a slot with no wrapper of its own (some slots may render children directly with no
  boundary node)?
- Where does the anchor get attached - a new task-file field, a chat attachment, something else? For
  Scope B specifically: does it attach to a Blend's own task/context files the same way, or does a
  user-built app (which may have no `.allagent`-style structure at all) need a different home for it?
- Does this need a UI of its own (a literal "point" mode/cursor in a dedicated browser pane), or is
  a documented click-and-read recipe against existing browser tooling enough for a first version of
  either scope?
- Worth a spike on Scope B against one real Blend-in-progress preview, and separately a spike on
  Scope A against one real slot (e.g. `settings.section`), before committing to a design for either.
