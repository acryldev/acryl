# Phase 10 design: plugin tab types (T125)

Owner request (2026-09-27): "add your own tab type", for example an Excalidraw tab for quick brainstorming, managed in
Settings > Tabs like agents in Settings > Agents. This note answers the questions that had to be settled before code.

## Cordis mini-design

1. **Capability and boundary.** A registry of tab types that other plugins contribute to, with its own lifecycle: a plugin
   registers a type while it is active and the type disappears with it. It lives in `acryl-workspace` (the only owner of
   tabs), not in a new package: nothing else needs to replace it.
2. **Provides and consumes.** Provides the client service `workspaceTabs` (`register`, `get`, `getSnapshot`, `subscribe`) with
   `ctx.reflect.provide`, the same way `layout` is provided. A tab-type plugin depends on it with a hard `inject`, so it is
   PENDING (valid, not failed) until the workspace is present, and re-registers when the workspace reloads.
3. **Effects and disposal.** The provider registration is one owned effect. Each tab type is registered inside the consumer's
   own `ctx.effect`; the disposer removes exactly that registration (idempotent), so disabling the plugin removes the type
   from the menu, the palette and Settings immediately.
4. **Configuration and composition.** No Loader row of its own. Enabling and disabling a type in Settings > Tabs is a
   per-viewer preference (the same remembered set as the built-in types, key `custom:<kind>`), separate from disabling the
   plugin, which is the Loader's job.
5. **Events and durability.** No events. Durable facts: a tab of a plugin type is a `custom` tile that saves its `customType`
   (the kind) and `customState` (text, at most 200,000 characters) with the workspace layout.
6. **Verification.** Registry rules (namespacing, duplicates, disposal, subscription), the pane in both directions (plugin
   present, plugin absent then returning), save and restore of a plugin tab, the + menu, Settings and the palette following
   the registry. Not verified: a real plugin loaded through the Loader in a real browser (needs the owner).

## Decisions

- **State is text**, not an object. The workspace cannot validate a plugin's structure, and text keeps saving simple and
  bounded. JSON is the convention.
- **A missing plugin keeps the tab.** T012: the tab shows a note and keeps its state, so turning the plugin off and on again
  loses nothing. Saved tabs whose kind is not even well-formed are dropped when loading.
- **Kinds are namespaced** (`owner.name`) so two plugins cannot collide by accident, and a duplicate is refused loudly.
- **No sandbox.** A tab component runs in the page like any client plugin. Plugins are installed by the user through the
  plugin system; the docs say plainly that only trusted plugins should be installed. A sandboxed (iframe) tab type is a
  separate future decision, and would be a different contract, not a change to this one.
- **Built-in types stay in code.** T011 asked to move them behind the registry with no behavior change; that is a large
  refactor with no user value now, so built-in types are listed by Settings > Tabs from a table and plugin types from the
  registry. Revisit when a second reason to unify them appears.

## The agent's path

`plugins/acryl-extension-context/docs/extending/workspace-tab.md` and the worked example
`example-plugins/packages/client-workspace-tab/` (a whiteboard) are routed from the docs index, so the agent asked for "an
Excalidraw tab" reads them and writes a package. An embedded Excalidraw itself needs its bundle; the whiteboard example shows
the contract with no dependency.
