# 053 Cordis plugin catalog: categories, and browsing plugins in Control Center

Status: decided by the owner (2026-11-24), building in the order A-F.

## The owner's words (2026-11-24)

"also cordis plugins, we never touched anything recently. also it should be in control center browsable like blends registry with
categories and sub-categories ... we can take ideas from catalog deepseek1024.com/plugins, dshfind.com/en/plugins ... i had already some 4
iterations in attempt to form such categories based on what we have 100 in Blends ... use that and assess and come back to me with a plan
... review and check how practical it is, i wanna have also useful categories in cordis plugins"

## What we already have (earlier findings first)

- The owner's taxonomy v04 (`docs-acryl-project-RnD-ideas-discussions-questions/cordisplugins_strategic_direction_steering/`, md + json):
  100 domains, 513 capability families, 2,286 concrete components, append-only IDs `NN`, `NN-SS`, `NN-SS-EE`, scope and boundary notes,
  related domains, cross-cutting facets (platform, protocol, permissions, lifecycle, trust, audience), and a separate technical axis
  (Services, Tools, UI/Client, Providers, Editors/Canvas, Brand/Theming, Market/Registry, Community/Interop).
- Its 100 top-level names and order are the Blends store's 100 categories (`acrylblends.github.io/src/lib/content.ts`), checked one by one.
  The second level differs, rightly: Blends subcategories (416) are kinds of apps ("AI assistants", "ADE"), v04's (513) are kinds of
  capability ("Model provider adapters", "Agent planning and execution").
- The registry (`cordisplugins.github.io`, last change 2026-11-20): 84 plugins, 12 official and 72 community. Its only category field is the
  technical axis, and it does not sort anything: services 68, providers 7, editors-canvas 5, ui-client 2, market-registry 1, brand-theming 1.
- Commit 5ba2653 (2026-11-20) already reads `acrylblends-category-<slug>` / `acrylblends-subcategory-<slug>` package keywords and shows a
  Blends category on the card. No plugin uses them yet (0 of 84).
- Control Center has the Blends store with categories and subcategories. Plugins appear only in Settings, Plugins (the open app's own
  plugins) and are pulled by address (`/plugin pull github:...`); there is no plugin catalog to browse.
- The large catalogs: dshfind.com lists 34,767 plugins in 9 flat categories (Skins & Themes, Panels & Views, Agent Boosters, Memory &
  Context, Clients, Channels & Notify, Tools & Integrations, Fun, Resources) plus tags, a language filter, grades and sorting by stars,
  downloads, score and date. deepseek1024.com lists 14,214 in 11 flat categories (UI Enhancements, Themes & Appearance, Sessions & Messages,
  Memory, Tools & Capabilities, Skills, Workflow & Automation, Notifications & Integrations, Models & Providers, Development & Runtime,
  Just for Fun).

## Assessment: how practical v04 is

- **Right as the shared backbone.** One top level for Blends and plugins means one mental map, one categories file, one browse component,
  and a Blend's page can list "plugins in this category". Append-only IDs make it safe to grow.
- **Too deep to navigate.** With 84 plugins, 100 domains leave about 85 empty, and 2,286 components are more than ten times the plugins
  that exist. Catalogs 150-400 times our size still use 9-11 flat categories, because people look for "what it does for my app", not for an
  industry domain. A three-level menu of mostly empty shelves would feel abandoned (Pragmatic Programmer, broken windows).
- **The third level is good data, not navigation.** The 2,286 components with their implementation examples are what search, tags and an
  automatic classifier need; they also show plugin authors the gaps worth filling.
- **The current technical axis is not useful to people** (68 of 84 are "services").

## Plan

One taxonomy, two ways in (Clean Architecture: the categories are data in one owned place; the registry, the site and Control Center only
read it).

1. **Kind (the main filter, about 10, flat), named for what a plugin does for an app**, drawn from the two big catalogs and mapped onto
   v04's technical axis: Themes and brand; Panels and views; Agent tools and skills; Memory and context; Models and providers; Channels and
   notifications; Integrations (MCP, apps, services); Workflow and automation; Developer and runtime; Fun. One kind per plugin.
2. **Domain (browse, the shared 100, two levels):** v04 `NN` and `NN-SS`. Only categories with at least one plugin are shown, with counts,
   and an "all 100" view for authors. A plugin has one primary placement and may have more (v04's rule).
3. **Components and facets (search and tags):** v04 `NN-SS-EE` ids and facets (platform, protocol, surface, official/community) feed
   search and chips, never menus.

Where the data lives and how it gets on a plugin:

- `categories.json` v2 is generated once from v04's json into the registry repo (ids, names, slugs, scope, boundaries), with the kind list
  beside it. acrylblends.github.io keeps its own second level for Blends and reads the shared top level from the same file.
- A plugin declares its place in `package.json` (the 5ba2653 keyword mechanism, extended): `cordis-kind-<slug>`, `cordis-domain-NN-SS`,
  optional `cordis-component-NN-SS-EE`. The sync keeps reading old `acrylblends-category-*` keywords.
- The 84 existing plugins are classified once: a proposed table (kind, domain, reason) reviewed by the owner, then kept in the registry
  as an override file for plugins whose authors have not added keywords. Owner content is never changed without the owner's yes.
- Sharing a plugin (plugin-share, `npm run share`, the registry option) asks for kind and domain, suggesting both from the description
  against v04's component examples, and writes the keywords.

What people see:

- **cordisplugins.github.io/plugins:** kind chips across the top, the domain tree on the left (non-empty only, with counts), search over
  name, description and component tags, sort by newest, name and (later) downloads, official/community filter. Category pages
  `/plugins/<domain-slug>/<sub-slug>` like the Blends store's.
- **Control Center:** a Plugins tab beside the Blends store, the same layout and component as the store, reading the registry's
  `index.json`. Each plugin opens a detail page with Add to an app (choose the app; uses the existing pull path), the share/pull command,
  and its repository. The Control Center chat gets one launcher tool to search the catalog.
- **Blend pages:** "plugins for this category", from the shared top level.

## Order and proof

| Step | What | Proof |
|---|---|---|
| A | categories.json v2 from v04 + kind list, in the registry; a test that every id is unique and append-only | test |
| B | classify the 84 plugins; owner reviews the table | owner's yes |
| C | registry site: kind chips, domain tree, search, category pages | build, tests, screenshots at 1440 and 390 |
| D | plugin-share asks kind and domain, writes keywords | a shared test plugin lands in the right place |
| E | Control Center Plugins tab and detail page, Add to an app; chat search tool | AION walk: browse, add a plugin to an app, it loads; chat finds one |
| F | Blend pages list plugins of their category | site build |

## Decisions for the owner

1. The two-way model: about 10 kinds as the main filter plus the shared 100 domains, instead of browsing all three levels of v04.
2. The ten kind names above (or edits).
3. Show only non-empty domains in the browse view.
4. Classifying the 84 existing plugins in an override file (the authors' own keywords win when they add them).

## Decided (owner, 2026-11-24)

1. Kind plus domain, as planned; only non-empty domains are shown.
2. The kinds: the ten proposed, merged with deepseek1024.com's list the owner pasted (AGI Architecture Exploration, UI Enhancements,
   Usage & Billing, Themes & Appearance, Models & Providers, Identity & Communication, Sessions & Messages, Memory, Tools & Capabilities,
   WSL & Windows Interop, Browser & Web, Vision & Multimodal, Voice & Audio, Docs & Rendering, Workflow & Automation, Git & Code Review,
   Notifications & Integrations, Development & Runtime, Remote & Mobile, Plugin Markets & Managers, Just for Fun). The merged list, 22 kinds,
   slug in brackets:
   - Themes & Appearance (`themes`): themes, brand, icons, fonts.
   - UI Panels & Views (`ui`): panels, views, layout, UI enhancements.
   - Sessions & Messages (`sessions`): chat history, sessions, message tools.
   - Agent Tools & Skills (`tools`): tools and capabilities the agent calls, skills.
   - Memory & Context (`memory`): memory, context, retrieval for the agent.
   - Models & Providers (`models`): model providers, routing, local models.
   - Usage & Billing (`usage`): tokens, cost, quotas.
   - Identity & Communication (`identity`): accounts, sign-in, people, team presence.
   - Channels & Notifications (`channels`): chat channels, notifications, messengers.
   - Integrations (`integrations`): MCP, apps and outside services.
   - Browser & Web (`web`): browser use, web fetch, web pages.
   - Vision & Multimodal (`vision`): images, video, screen, multimodal input.
   - Voice & Audio (`voice`): speech in and out, audio.
   - Docs & Rendering (`docs`): documents, markdown, diagrams, rendering.
   - Git & Code Review (`git`): git, pull requests, review.
   - Workflow & Automation (`workflow`): workflows, schedules, automations.
   - Development & Runtime (`dev`): developer tools, runtimes, debugging.
   - Remote & Mobile (`remote`): remote access, phones, other devices.
   - OS & Platform Interop (`platform`): Windows, WSL, macOS, Linux integration (the owner's "WSL & Windows Interop", widened to all OSes).
   - Plugin Markets & Managers (`markets`): catalogs, installers, plugin managers.
   - Agent Architecture & Research (`agents`): agent architectures, multi-agent, AGI exploration.
   - Fun (`fun`): just for fun.
3. The existing 84 plugins: a worker proposes kind, domain and reason per plugin; the owner approves the table before it goes live.
4. Start now, A to F.

## Changed by the owner (2026-11-25)

The domain tree shows **all** 100 categories and their subcategories, each with its code (`01`, `02` ... and `01-01` ...) as on
acrylblends.github.io/blends. Empty categories and subcategories are greyed out a little but stay listed and clickable. This replaces
"only non-empty domains are shown" in point 1 of Decided, for the registry site and the Control Center Plugin catalog alike.
