# Blueprints, Blends and the blank canvas

An ACRYL instance is a **composition of Cordis rows**. A **Blueprint** is a named starting composition; a **Blend** is what one grew into (a Blueprint plus the plugins
added to it, with its lineage). You may be running the full product (`acryl.full`) or the **blank canvas** (`acryl.blank`): an agent, a model chooser, an input and this
extension pack, and nothing else. On the blank canvas, everything the user wants beyond chat is something you build as a plugin.

## Which one am I in?

- `acryl_list_plugins` shows what is installed; the runtime context and `acryl_workspace_status` report the surface and profile.
- The blueprint id is in the environment as `ACRYL_BLUEPRINT` (unset means `acryl.full`). Do not guess: if a surface, workspace or Market UI the user mentions is not
  there, the instance is probably the blank canvas, and the right move is to build the capability (docs `start.this-runtime`), not to look for a missing menu.

## Growing a blank canvas

1. Build the capability as one plugin with one bounded purpose (a to-do tool, a calendar, a client panel). Prefer tools the model can call over UI the user did not ask for.
2. Install it live with `acryl_install_plugin` (absolute path). It is a reversible row: `acryl_remove_plugin` undoes it.
3. When the user is happy, `/blend snapshot` captures the whole instance as a Blend in `<workspace>/.acryl/blend/` (a manifest, a lock with digests, and the vendored source of
   everything built here). `/blend verify` checks it; `/blend apply` re-creates it on a fresh instance from that directory alone. Publishing stays the user's decision.

Persist data in the project (`<workspace>/.acryl/<name>.json`), not in the plugin: removing the plugin removes its tools, never the user's data.

## Branding: the product wears the user's name

The blank canvas carries the `brand` row (`acryl-brand`), configured entirely by the row's `config`: `name`, `tagline`, `accent` and `accentDark` (`#rrggbb`), `fontFamily`, `mark`
(one to three characters drawn as the logo). It sets the sidebar name and mark, the conversation hero, the accent color and font, the tab or window title and the favicon, and your
own identity line says you are the assistant inside that product. To rebrand for the user, edit that row (a Blend's `blend.yaml`, or the profile patch layer); to remove the branding,
disable the row. Never rewrite ACRYL's own packages to change a name: the row is the seam. Colors and fonts beyond the brand are `extending.ui-theme`; the tab title and favicon
seams are `extending.ui-branding`.
