# Spec 057: Blends, Cordis plugins and ACRYL features - the ideas backlog

Status: backlog, written 2026-11-26 from the owner's ideas folder. Nothing here is built. Each idea becomes its own spec, or a task in an existing
one, when the owner picks it.

## The owner's words (2026-11-26)

> create spec 057-acryl-blends-plugins-features-ideas ... it must also contain "design" folder for mockups in lavish-axi but not right away all at
> once, we just create a few. important is to create spec with all tasks with all new blends ideas and cordis plugins ideas, as well as ACRYL features
> like for example ACRYL DURABLE where app/session runs in webboxes.ai and any authed client can connect to it and basically that's collaboration
> feature where many team members connect to same acryl blend app and it runs permanently in its sessions and self-improvement like pi-durable,
> persistent objects ACRYL. also ideas for cordis plugins - like Connect Telegram - make acryl blend connectable remote session from mobile telegram or
> whatsapp etc. and acryl blends ideas: where we take popular OSS projects MIT/apache and turn them into blends

## Sources

The owner's private R&D folder `docs-acryl-project-RnD-ideas-discussions-questions/acrylblends_apps_templates_and_plugins-features_ideas/` (outside
this repository, not copied here):

- `Inbox concpetsideas_misc to process&sort.md` (and its PDF copy): the ideas inbox of 2026-11-24, about 40 projects and feature notes.
- `EXAMPLE_blend_ai-video-editor-description.md`: a transcript describing an AI video editor ("Tyler"), the model for how a Blend idea is described.
- `Pi Durable Architecture & Implementation Guide for acryl.dev.md`: Pi Durable (Mario Zechner, Earendil) from a talk, articles and its code, with a
  mapping to ACRYL.

Every license below was read from GitHub on 2026-11-26 (`gh api repos/<repo>`, and the LICENSE file where GitHub says NOASSERTION).

## The three kinds of idea

1. **ACRYL features** change the platform: durable sessions, collaboration, Blends calling Blends, Acrylify. Tasks `T010`-`T049`.
2. **Cordis plugins** add one capability any Blend can mount: Connect Telegram, WhatsApp, a model router, browsing and scraping tools, skill packs.
   Tasks `T050`-`T079`.
3. **Blends** are whole apps, most of them an MIT or Apache open-source project turned into a Blend: the AI video editor, a voice studio, a RAG
   workbench, a design studio. Tasks `T080`-`T139`.

## The rule for open-source sources

A Blend or plugin may be built from an open-source project only when its license allows it to be reused and relicensed inside a Blend:

| License | Use |
| --- | --- |
| MIT, Apache-2.0, BSD | Yes. Keep the original copyright and NOTICE files (spec 040's MIT-copy rule). |
| AGPL, GPL | Reference only: read it for ideas, never copy code. A Blend may call it as a separate service the user runs. |
| Mixed (MIT with an enterprise folder, Polyform parts) | Only the MIT or Apache parts, and the task names the folders that are excluded. |
| No license, or custom terms | Not until the owner decides; the task says so. |

## The flagship feature: ACRYL Durable

A Blend's sessions keep running when every window is closed, in a WebBoxes.ai box, and any signed-in team member can attach to the same running app
from the desktop, the web, the CLI or a phone (Telegram or WhatsApp through the plugins below). It is the collaboration feature: many people, one
live app, one shared history.

Built on what Pi Durable shows works (MIT, `earendil-works/pi`, `packages/durable`):

- **Every step is written down before and after it runs** (intent, effect, result, advance), so a crash or a box restart resumes where it was instead
  of starting over.
- **Tools declare whether they are safe to repeat.** After a crash, a safe tool runs again; an unsafe one (sending an email, a payment) asks first.
- **Waiting costs nothing.** A task can park until a time or a signal (a reminder in 9 hours, a reply on Telegram); the process may stop meanwhile.
- **Submissions carry an id**, so the same message sent twice (a retry, two devices) is handled once.
- **Persistent objects**: typed, versioned JSON documents. Each change is a small patch, stored (so you can rewind) and broadcast (so every attached
  client updates live). This is the "ACRYL persistent objects" idea.
- **Forks**: a conversation can branch at any turn, either a frozen copy or sharing the parent's live state.

For ACRYL this is one Cordis service with providers, not a second runtime (repository rule: no parallel lifecycle). The mini-design (task `T012`)
answers the six Cordis questions before any code. Self-improvement is a durable task too: the app's own agent reviews what users did, proposes a
change as a version (spec 055 History), and an owner accepts it.

## Design

`design/` holds Lavish mockups (`npx -y lavish-axi <file>`), a few at a time:

| File | Idea |
| --- | --- |
| [design/acryl-durable.html](design/acryl-durable.html) | ACRYL Durable: one running Blend, many people attached, a crash that resumes |
| [design/connect-telegram.html](design/connect-telegram.html) | Connect Telegram: pair a Blend's session with a Telegram chat and drive it from the phone |
| [design/blend-ai-video-editor.html](design/blend-ai-video-editor.html) | The AI video editor Blend from the example description |

The other ideas get their mockup when they are picked (each task says "mockup" as its first step).

## Related specs

- 045 Software factory (profiles, moving sessions between agents)
- 052 AOS (the shared install, which is where "reduce size" lives)
- 053 Cordis plugin catalog (where new plugins are listed)
- 054 mobile apps (a native phone app; Telegram and WhatsApp are the no-install path)
- 055 Publish, Share, Git sync, History (versions that self-improvement proposes)
- 036/044 Blends registry and persistence; blueprints for Blend repositories (category-numbered repos)
