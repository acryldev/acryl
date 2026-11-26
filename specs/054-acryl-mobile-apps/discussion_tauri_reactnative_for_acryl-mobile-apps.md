# Recall Acryl Project Context

---

**User**

Recall everything you know about our project that we’re building right now 

https://acryl.dev


https://acrylblends.github.io 


https://github.com/acryldev/acryl

Example blend 

https://acrylblends.github.io/blends/media/content-creation/acrylblends.content-machine 

And it’s repo https://github.com/acrylblends/13-content-machine 





---

**Assistant**

# ACRYL — Complete project context and current understanding

ACRYL is the software platform and ecosystem you're building around **AI-agentic applications that can extend, modify, and evolve themselves from inside the application**.

The central idea is bigger than an app framework, a collection of templates, or an AI coding assistant:

**ACRYL provides the runtime, composable capabilities, application blueprints, plugins, and agent infrastructure needed to build software that can continuously extend itself.**

The ecosystem has several interconnected parts:

1. **ACRYL** — the core platform, runtime, and development environment.
2. **ACRYL Blends** — a registry and ecosystem of composable application blueprints.
3. **Cordis** — the underlying plugin-oriented framework and composition architecture.
4. **Cordis Plugins** — reusable functional building blocks.
5. **Blends** — complete applications assembled from capabilities and plugins.
6. **Agents** — optional intelligent capabilities that can build, modify, and extend applications.
7. **ACRYL Store / Registry** — distribution and discovery of plugins, Blends, and related resources.

Your example, **ACRYL Content Machine**, is particularly useful because it demonstrates how the ecosystem moves from an abstract application blueprint to an actual implementation repository.

I'll distinguish established project context from architectural interpretations and details that still need verification.

## 1. The actual ACRYL platform

<row align="center" gap={3}>
  <AsyncImage query="ACRYL developer environment acryl.dev application desktop interface screenshot" aspectRatio="5:4" maxWidth="148px"/>
  <box flex="1" gap={1}>
    **<Entity value="ACRYL" category="software" disambig="Agentic development environment and runtime"/>**

    <Link url="https://acryl.dev" title="acryl.dev"/> · <Link url="https://github.com/acryldev/acryl" title="GitHub repository"/>

    <badge color="success">Active development</badge>
    <text color="secondary" size="xs">Agent Context Relay Yielding Lifecycles</text>
  </box>
</row>

The current GitHub project describes ACRYL as:

> One persistent workspace, one canonical context, any coding agent.

This is an important clarification compared with some of our earlier discussions: ACRYL has developed into a concrete Agentic Development Environment (ADE), not simply a framework for generating AI applications.

### The central problem ACRYL solves

Coding agents traditionally own their individual sessions, context, tools, and history.

When switching between Claude Code, Codex, OpenCode, Gemini CLI, or another agent, users lose continuity or must manually transfer context.

ACRYL reverses this relationship:

<box border radius="lg" padding={3} gap={2} align="center">
  <box background="surface-secondary" radius="md" padding={3} width="100%" align="center">
    **Persistent project**

    <text color="secondary" size="xs">Files · Tasks · Context · Decisions · Artifacts · History</text>
  </box>
  <icon name="arrow-down" color="secondary" size="lg"/>
  <box background="rgba(30,150,120,0.09)" border={{size:1,color:"rgba(30,150,120,0.4)"}} radius="md" padding={3} width="100%" align="center">
    **ACRYL**

    <text color="secondary" size="xs">Canonical state · Context relay · Workspace · Handoffs</text>
  </box>
  <icon name="arrow-down" color="secondary" size="lg"/>
  <grid columns={3} gap={2}>
    <grid-item background="surface-secondary" radius="md" padding={2}>
      <text weight="medium" textAlign="center">Claude Code</text>
    </grid-item>
    <grid-item background="surface-secondary" radius="md" padding={2}>
      <text weight="medium" textAlign="center">Codex</text>
    </grid-item>
    <grid-item background="surface-secondary" radius="md" padding={2}>
      <text weight="medium" textAlign="center">OpenCode</text>
    </grid-item>
  </grid>
  <text color="secondary" size="xs">Replaceable agents, shared persistent project context</text>
</box>

The governing principles are:

- Agent sessions are disposable; project context is persistent.
- ACRYL owns continuity; agents perform work.
- Canonical state is durable and agent-independent.
- Agent-specific context is a projection, not the source of truth.
- Practical functionality is delivered through replaceable plugins.
- Capabilities should be versioned, permissioned, testable, and auditable.

### Three product surfaces

The current architecture has three surfaces sharing the same runtime and project model:

<grid columns={3} gap={2}>
  <grid-item>
    <AsyncImage query="ACRYL agentic development environment desktop application screenshot" aspectRatio="5:4"/>
    **Desktop**

    <text color="secondary" size="xs">Electron GUI</text>
  </grid-item>
  <grid-item>
    <AsyncImage query="terminal developer TUI coding agent interface" aspectRatio="5:4"/>
    **CLI / TUI**

    <text color="secondary" size="xs">Terminal interface</text>
  </grid-item>
  <grid-item>
    <AsyncImage query="web based developer workspace IDE interface" aspectRatio="5:4"/>
    **Local Web**

    <text color="secondary" size="xs">Browser interface</text>
  </grid-item>
</grid>

These are not three separate products with separate business logic. They are different interfaces to the same ACRYL runtime.

### Development Canvas

One of the most important elements is the Development Canvas.

It is intended to be a composable working environment rather than a conventional chat interface.

It includes:

- Coding-agent sessions.
- Native terminals and PTYs.
- Files and editors.
- Git diffs and review comments.
- Browser tabs.
- Kanban boards, notes, documentation and checks.
- Plugin-contributed panels and tools.

Agents can operate ACRYL itself through Agent Control, including navigating the application, interacting with its UI, and enabling or disabling plugins, subject to user approval and audit logging.

### Agent ecosystem

The intended agent interoperability includes:

- Claude Code
- OpenAI Codex
- OpenCode
- Pi
- Gemini CLI
- DeepSeek Harness agents
- ACP-compatible agents
- Other CLI and PTY-based agents

An agent is a replaceable worker, not the owner of the workspace.

The current README also describes a catalog of 33 coding agents, custom agent definitions, and an attention queue.

Source: <Link url="https://github.com/acryldev/acryl" title="ACRYL repository and README"/>.

---

## 2. Cordis — the architectural foundation

<row align="center" gap={3}>
  <AsyncImage query="Cordis TypeScript plugin framework logo" aspectRatio="1:1" maxWidth="76px"/>
  <box flex="1" gap={1}>
    **<Entity value="Cordis" category="software" disambig="TypeScript plugin and composability framework"/>**

    <Link url="https://github.com/cordiverse/cordis" title="GitHub"/> · <Link url="https://cordisplugins.github.io" title="Plugin registry"/>
  </box>
</row>

Cordis is the architectural foundation that makes the ecosystem possible.

Our discussions described Cordis as a:

**Meta-Framework of Spatiotemporal Composability.**

The important idea is that applications are not built as monolithic collections of hardcoded features.

Instead, functionality is introduced through lifecycle-managed plugins.

Cordis provides:

| Mechanism | Purpose |
|---|---|
| Plugins | Encapsulated functionality |
| Services | Named, injectable capabilities |
| Dependency injection | Reactive service composition |
| Lifecycle | Initialization, activation and disposal |
| Events | Typed communication |
| Interceptors | Extensible execution pipelines |
| Scopes | Isolation and composition boundaries |
| Effects | Reversible runtime changes |
| HMR | Live plugin replacement |
| Configuration | Declarative application composition |

This means an application can gain or lose functionality without requiring the whole application to be rewritten.

### The architectural principle we established

**The core should remain small; functionality should live outside the core.**

A plugin should be capable of introducing:

- Backend services.
- Frontend components.
- Routes.
- API endpoints.
- Agent tools.
- Commands.
- Data models.
- UI panels.
- Other plugins and dependencies.

The application is then the composition of those capabilities.

An important distinction from our earlier discussions: agents are optional capabilities, not mandatory architectural foundations. The same Blend should be usable in a Core profile and an Agentic/Full profile, sharing the same application data while adding or removing agent capabilities.

That is an important product and architectural decision.

---

## 3. ACRYL Blends — the application ecosystem

<row align="center" gap={3}>
  <AsyncImage query="ACRYL Blends registry acrylblends.github.io website screenshot" aspectRatio="5:4" maxWidth="120px"/>
  <box flex="1" gap={1}>
    **<Entity value="ACRYL Blends" category="software" disambig="Composable application blueprint and plugin ecosystem"/>**

    <Link url="https://acrylblends.github.io/blends" title="Browse Blends"/> · <Link url="https://github.com/acryl blends" title="GitHub organization"/>
  </box>
</row>

This is where the platform becomes an ecosystem of actual applications.

Our definition:

**A Blend is a complete, composable application or environment assembled from Cordis plugins.**

It is not just:
- A UI template.
- A collection of components.
- A prompt.
- An isolated AI feature.
- A static starter project.

A Blend should describe a working application with its own domain, functionality, data, interface, and optional agent capabilities.

Examples of application domains we've explored include:

- Content creation and media production.
- Project management.
- CRM and sales.
- Automation.
- Accounting.
- Legal tools.
- Knowledge management and RAG.
- 3D design and architecture.
- Robotics.
- Voice applications.
- Language learning.
- Music production and live performance.
- Open design and engineering tools.

### How the ecosystem fits together

<box border radius="lg" padding={3} gap={3}>
  <box background="surface-secondary" radius="md" padding={3} align="center">
    **ACRYL Platform**

    <text color="secondary" size="xs">Runtime · Workspace · Shell · Agent Control</text>
  </box>
  <icon name="arrow-down" color="secondary"/>
  <box border radius="md" padding={3} align="center">
    **Cordis Runtime**

    <text color="secondary" size="xs">Lifecycle · DI · Events · Effects · Composition</text>
  </box>
  <grid columns={2} gap={2}>
    <grid-item border radius="md" padding={2} align="center">
      **Cordis Plugins**

      <text color="secondary" size="xs">Atomic reusable capabilities</text>
      <text color="secondary" size="xs">cordisplugins.github.io</text>
    </grid-item>
    <grid-item border radius="md" padding={2} align="center">
      **ACRYL Blends**

      <text color="secondary" size="xs">Complete compositions</text>
      <text color="secondary" size="xs">acrylblends.github.io</text>
    </grid-item>
  </grid>
  <icon name="arrow-down" color="secondary"/>
  <box background="surface-secondary" radius="md" padding={3} align="center">
    **Executable Applications**

    <text color="secondary" size="xs">Desktop · Web · Agentic applications</text>
  </box>
</box>

There is a particularly important decision from our November discussions:

**Do not create another registry.**

You already have:
- ACRYL Blends Registry.
- Cordis Plugins Registry.

New experiences such as the WorkshopPanel, App Gallery, and Plugin Pool should aggregate or consume these existing registries instead of creating competing catalogues.

We also established that ACRYL itself can be considered a Blend: a particularly comprehensive composition of capabilities.

## 4. The Blend Blueprint Catalogue — 100 software categories

One of our most recent major workstreams (November 24) was designing a comprehensive classification system for the Blends ecosystem.

The objective is to create a catalogue of application blueprints covering practically every meaningful software domain.

We discussed 100 top-level categories, each with meaningful subcategories and concrete reusable capabilities.

This is not supposed to be a shallow list of software names.

### The taxonomy hierarchy

We established three levels:

<box border radius="lg" padding={3} gap={2}>
  <box background="surface-secondary" radius="md" padding={3}>
    **Level 1 — Software domain**

    <text color="secondary" size="xs">What type of application are we building?</text>
    Example: Emulation Software
  </box>
  <icon name="arrow-down" color="secondary"/>
  <box background="surface-secondary" radius="md" padding={3}>
    **Level 2 — Reusable capability**

    <text color="secondary" size="xs">What functional subsystem does it need?</text>
    Example: Console Emulators, OS Emulators, Terminal Emulators
  </box>
  <icon name="arrow-down" color="secondary"/>
  <box background="surface-secondary" radius="md" padding={3}>
    **Level 3 — Concrete components**

    <text color="secondary" size="xs">What actual functionality can be implemented?</text>
    Example: ROM loaders, virtual CPUs, terminal renderers, virtual sensors
  </box>
</box>

You explicitly wanted the subcategories to represent practical, reusable implementation elements rather than generic labels.

For example:

**92. Emulation Software**
- Console emulators.
- Operating system emulators.
- Terminal emulators.
- Hardware emulators.
- Browser emulators.
- Network emulators.

And then concrete capabilities such as:
- ROM and disk image loaders.
- CPU and instruction-set interpreters.
- Memory and device models.
- Virtual filesystems.
- Terminal renderers.
- Input mapping.
- Virtual sensors.
- Snapshot and save-state management.

The previous taxonomy iteration reached:

<grid columns={3} gap={2}>
  <grid-item border radius="lg" padding={3}>
    <title size="2xl" tabularNums>100</title>
    <text color="secondary" size="xs">Categories</text>
  </grid-item>
  <grid-item border radius="lg" padding={3}>
    <title size="2xl" tabularNums>506</title>
    <text color="secondary" size="xs">Subcategories</text>
  </grid-item>
  <grid-item border radius="lg" padding={3}>
    <title size="2xl" tabularNums>2,035</title>
    <text color="secondary" size="xs">Concrete elements</text>
  </grid-item>
</grid>

These were the v3 figures. We were working toward a broader, more detailed v4.

### Why this matters

The taxonomy is not merely for website navigation.

It can become the foundation for:

1. Discovering existing application blueprints.
2. Identifying missing software domains.
3. Finding reusable Cordis Plugins.
4. Generating new application specifications.
5. Giving coding agents structured implementation targets.
6. Identifying opportunities for plugin reuse across Blends.
7. Building a searchable ecosystem of software capabilities.

The distinction is important: a category tells us what kind of application we want to build; its subcategories tell us what capabilities need to exist.

---

## 5. Standalone Blend repositories

An important part of our approach is that Blends should be actual, independently implementable applications.

The intention is not to maintain hundreds of superficial templates that look different but contain no meaningful functionality.

Each Blend should have its own repository, architecture, plugins, application UI, and implementation.

Your example is an excellent illustration.

## 6. Example: ACRYL Content Machine

<row align="center" gap={3}>
  <AsyncImage query="AI video editing content creation application timeline captions vertical video thumbnail editor dark interface" aspectRatio="5:4" maxWidth="132px"/>
  <box flex="1" gap={1}>
    **<Entity value="ACRYL Content Machine" category="software" disambig="AI-powered video editing and social content production application"/>**

    <Link url="https://acrylblends.github.io/blends/media/content-creation/acrylblends.content-machine" title="Blend blueprint"/> 

    <Link url="https://github.com/acryl blends/13-content-machine" title="Repository"/>
  </box>
</row>

The repository is:

<Link url="https://github.com/acryl blends/13-content-machine" title="github.com/acryl blends/13-content-machine"/>

The actual GitHub organization URL is `github.com/acryl blends` without the space: <Link url="https://github.com/acryl blends/13-content-machine" title="13-content-machine"/>.

The project description:

**One rough recording in; a finished video, shorts, a thumbnail and posts out.**

It is an all-in-one AI video editor and content formatter.

### The application workflow

<box gap={3}>
  <row align="start" gap={3}>
    <AsyncImage query="video editor media import file upload interface" aspectRatio="1:1" maxWidth="104px"/>
    <box flex="1" gap={1}>
      **1. Ingest**

      Import MP4, MOV, WebM, MP3, WAV, M4A, or a video URL. YouTube ingestion is supported through yt-dlp.
    </box>
  </row>
  <divider color="subtle"/>
  <row align="start" gap={3}>
    <AsyncImage query="AI video transcription word by word transcript editor interface" aspectRatio="1:1" maxWidth="104px"/>
    <box flex="1" gap={1}>
      **2. Transcription and cutting**

      Generate word-level transcripts, detect filler words, repeated takes and long pauses, and let the user approve or reject suggested cuts.
    </box>
  </row>
  <divider color="subtle"/>
  <row align="start" gap={3}>
    <AsyncImage query="audio podcast voice enhancement audio waveform editor interface" aspectRatio="1:1" maxWidth="104px"/>
    <box flex="1" gap={1}>
      **3. Sound processing**

      Clean voice recordings, remove noise, normalize levels and add music and sound effects.
    </box>
  </row>
  <divider color="subtle"/>
  <row align="start" gap={3}>
    <AsyncImage query="video editor karaoke animated captions title card b roll interface" aspectRatio="1:1" maxWidth="104px"/>
    <box flex="1" gap={1}>
      **4. Visual production**

      Captions, title cards, B-roll, punch-in zooms, progress bars, transitions and music.
    </box>
  </row>
  <divider color="subtle"/>
  <row align="start" gap={3}>
    <AsyncImage query="vertical social media video shorts editing thumbnail design interface" aspectRatio="1:1" maxWidth="104px"/>
    <box flex="1" gap={1}>
      **5. Shorts and thumbnails**

      Generate 2–10 vertical clips (1080 × 1920) and a video thumbnail.
    </box>
  </row>
  <divider color="subtle"/>
  <row align="start" gap={3}>
    <AsyncImage query="social media content publishing planner YouTube LinkedIn Instagram X posts dashboard" aspectRatio="1:1" maxWidth="104px"/>
    <box flex="1" gap={1}>
      **6. Social content**

      Generate YouTube titles, descriptions, tags, LinkedIn posts, Instagram captions and X posts.
    </box>
  </row>
</box>

The important product decision is that the user retains final approval. Nothing is automatically published.

### The plugin architecture

This repository contains a much more interesting architectural demonstration than a conventional template.

The application is divided into Cordis plugins:

| Plugin | Responsibility |
|---|---|
| `content` | Domain, projects, brand, library and feature registry |
| `content-ingest` | Import files, links and videos |
| `content-transcribe` | Speech-to-text and transcripts |
| `content-cut` | Editing suggestions and cuts |
| `content-sound` | Voice processing |
| `content-music` | Music and sound effects |
| `content-visuals` | Captions, B-roll, zooms and visuals |
| `content-shorts` | Vertical clips |
| `content-thumbnail` | Thumbnail generation |
| `content-posts` | Social posts |
| `content-api` | JSON API, files and live events |
| `content-studio` | React application interface |
| `content-tools` | Agent tools |

One particularly important implementation detail:

A new feature can be introduced as a new plugin that registers itself with the central content feature registry:

`ctx.content.features.register(...)`

The screen, API and agent can then discover the new capability.

That is a concrete example of the architecture we have been discussing: the application is extended by adding capabilities rather than modifying a monolithic application.

### Agent integration

The Content Machine includes an ACRYL agent in the application shell.

It has ten typed `content_*` tools, enabling it to:

- List and read projects.
- Modify settings.
- Manage brand information.
- Accept or reject editing suggestions.
- Execute production steps.
- Trigger rendering.
- Work with the application while displaying its actions in the UI.

The agent is not simply a chatbot that explains how to edit a video. It can actually operate the application.

### Technology stack

The repository documents:

- TypeScript.
- Cordis plugins.
- React-based Studio.
- HyperFrames for rendering.
- GSAP.
- FFmpeg / FFprobe.
- Chrome or Chromium.
- OpenAI-compatible LLM APIs.
- OpenAI-compatible speech-to-text APIs.
- yt-dlp for optional video ingestion.

It also provides a sample recording generator, automated tests, end-to-end tests, and desktop installers.

A particularly useful implementation detail is that individual features can be switched off in Settings → Plugins, removing their corresponding steps from the interface and agent tools.

Source: <Link url="https://github.com/acryl blends/13-content-machine" title="Content Machine README and implementation"/>. 

## 7. WorkshopPanel — building applications collaboratively

Another significant initiative we discussed on November 19 is the WorkshopPanel.

Reference: <Link url="https://acryl.dev/workshoppanel" title="acryl.dev/workshoppanel"/>.

The concept is to organize a workshop with approximately 20 participants, where everyone builds an application locally using ACRYL.

The workshop is not just a coding exercise. It demonstrates the entire ecosystem:

- Starting with a Blueprint.
- Creating an application.
- Implementing features as Cordis Plugins.
- Extending an existing application.
- Saving and updating plugins.
- Persisting application state.
- Git snapshots and exchanges.
- Publishing Blends and Plugins.
- Discovering and reusing other participants' work.

### Workshop components

| Component | Purpose |
|---|---|
| WorkshopPanel | Main coordination environment |
| Blueprint Catalogue | Starting application blueprints |
| Participant workspace | Individual applications |
| App Gallery | Discover participant applications |
| Plugin Pool | Discover reusable plugins |
| ACRYL Blends Registry | Existing application compositions |
| Cordis Plugins Registry | Existing reusable capabilities |
| Git integration | Versioning and exchange |
| Facilitator controls | Workshop administration |

We also discussed an optional experiment called **FrankensteinApp**.

The idea is to combine capabilities from different participant applications into a single application.

However, this requires compatibility checks:

- Unique services and route prefixes.
- Compatible plugin dependencies.
- Shared storage rules.
- Declared capabilities.
- Permission checks.
- No automatic execution of untrusted community plugins.

The facilitator should assemble the combined application separately, and incompatible participant contributions should still be preserved.

A critical architectural decision was to avoid another registry. WorkshopPanel should consume the existing Blends and Cordis Plugins registries.

---

## 8. Automation Blend — an n8n-style application

We also have a concrete automation initiative.

Reference: <Link url="https://acrylblends.github.io/blends/automation" title="Automation Blend category"/>.

You identified <Entity value="qadam-flow" category="software" disambig="TypeScript workflow automation and execution engine"/> as a possible foundation.

Repository: <Link url="https://github.com/aiqadam/qadam-flow" title="qadam-flow"/>.

The goal is an n8n-like workflow automation application implemented as an ACRYL Blend.

We discussed the following architecture:

- Visual workflow editor.
- Node-based workflow composition.
- Trigger and event management.
- Integration plugins.
- Workflow execution engine.
- Execution history.
- Logs and debugging.
- Credentials and secrets.
- Scheduling.
- Agent-controlled workflow creation and modification.

An important decision from November 23:

**Do not deploy Qadam Flow as a separate standalone product. Selectively extract and integrate its useful capabilities.**

ACRYL owns the Shell, agent integration, lifecycle and user experience.

The workflow engine becomes a capability within the ACRYL application.

The initial implementation direction was:
1. Establish the Cordis Blend and `blend.yaml` structure.
2. Integrate React Flow for the visual editor.
3. Audit Qadam Flow's execution engine.
4. Extract the relevant functionality into Cordis-compatible plugins.

This is consistent with the Content Machine architecture: the application owns the domain, while plugins supply the capabilities.

---

## 9. Self-extension and application evolution

This is arguably the most important long-term concept connecting all these projects.

You want an application to be able to extend itself from the inside.

Not just through external development by a human.

An application contains an agent that understands its own domain, functionality, plugins and capabilities.

For example, a user opens Content Machine and asks:

"Add automatic translation of my videos into German, English and Spanish."

The agent should be able to:

1. Understand the requested functionality.
2. Inspect existing plugins and services.
3. Find reusable capabilities.
4. Identify missing functionality.
5. Generate a new Cordis plugin.
6. Register the plugin with the application.
7. Integrate its UI and tools.
8. Test the implementation.
9. Present the proposed change.
10. Activate it with appropriate approval.

The application evolves without having to become a completely different application.

### The architectural safeguards we discussed

Earlier, we developed a more rigorous model for this.

The important concepts were:

- Kernel.
- Capability Cell.
- Contract.
- Provider.
- Port.
- Invariant.
- Effect.
- Scope.
- Candidate.
- Generation.
- Evidence.
- Decision.
- Promotion.
- Rollback.
- Evolution.

The critical rule:

**Agents may modify implementations, but they must not silently modify protected contracts, invariants, permissions, boundaries or provenance.**

A generated plugin should be a candidate implementation that can be validated before promotion.

This gives us a controlled evolution model:

<box border radius="lg" padding={3} gap={2} align="center">
  <box background="surface-secondary" radius="md" padding={3} width="100%" align="center">
    **Agent generates capability**
  </box>
  <icon name="arrow-down" color="secondary"/>
  <box background="surface-secondary" radius="md" padding={3} width="100%" align="center">
    **Candidate generation**
  </box>
  <icon name="arrow-down" color="secondary"/>
  <box background="surface-secondary" radius="md" padding={3} width="100%" align="center">
    **Validation and testing**
  </box>
  <icon name="arrow-down" color="secondary"/>
  <box background="surface-secondary" radius="md" padding={3} width="100%" align="center">
    **Evidence and approval**
  </box>
  <icon name="arrow-down" color="secondary"/>
  <box background="rgba(30,150,120,0.09)" border={{size:1,color:"rgba(30,150,120,0.4)"}} radius="md" padding={3} width="100%" align="center">
    **Promotion into active application**
  </box>
  <text color="secondary" size="xs">With rollback and provenance available</text>
</box>

This is an important distinction between ordinary plugin extensibility and a genuinely self-evolving software system.

---

## 10. Earlier ACRYL ecosystem and product architecture decisions

These are additional decisions from our earlier discussions that should remain part of the project context.

### A. One application, different capability profiles

A Blend should support:

- Core: application without agent capabilities.
- Full / Agentic: application with agents and additional intelligent capabilities.

The underlying application data should remain shared.

An application should be upgradeable or downgradeable by adding or removing agent plugins, not by maintaining two separate products.

### B. Unified namespace

We previously discussed a unified npm namespace under `@acryl/*`.

The conceptual package organization was:

| Package | Responsibility |
|---|---|
| `acryl` | Launcher / CLI |
| `@acryl/core` | Agent-independent runtime |
| `@acryl/blends` | Blend composition and registry tooling |
| `@acryl/code` | IDE / coding environment |
| `@acryl/plugin-*` | Reusable Cordis capabilities |
| `@acryl/blend-*` | Application Blends |

This was an architectural proposal, not something I would assume has been fully implemented.

### C. Runtime and plugin storage

We previously explored user-space plugin storage, particularly:

`~/.acrylblends/<app_ID>/plugins`

The objective was to make TypeScript plugin code executable, updateable and independently manageable.

We also discussed Docker versus direct runtime execution, with a preference for keeping the architecture composable and avoiding unnecessary containerization.

### D. Registries

The existing public registries should have distinct responsibilities:

| Registry | What it distributes |
|---|---|
| ACRYL Blends | Complete application compositions |
| Cordis Plugins | Reusable functionality and capabilities |

A Blend can depend on multiple plugins, and plugins can be reused by many Blends.

---

## 11. Current technical architecture of ACRYL

Based on the current public repository, the implementation has evolved beyond the early conceptual architecture.

The current stack includes:

| Layer | Technology / implementation |
|---|---|
| Primary language | TypeScript |
| Runtime | Node.js |
| Desktop | Electron |
| Web | Local Web runtime |
| Terminal | CLI / TUI |
| Plugin framework | Cordis |
| Agent substrate | DeepSeek Harness |
| UI | Composable, plugin-contributed interfaces |
| Packaging | Desktop installers and standalone CLI |
| Package management | PNPM |
| Distribution | GitHub releases and npm |

The repository currently keeps DeepSeek Harness as a pinned, unmodified upstream checkout used as a capability substrate.

ACRYL builds its own product identity and functionality on top of that foundation.

The repository structure includes:

- `apps/` — product surfaces.
- `runtime/` — stable core.
- `plugins/` — replaceable capabilities.
- `distribution/` — release and installation tooling.
- `deepseek-harness/` — pinned upstream implementation.

The current README describes version 0.2.6, although the project remains in active early development. <Cite refs={["turn561803search0","turn561803search7"]}/>

---

## 12. The broader Blend ideas backlog

From our November 24 discussions, we were exploring a much broader universe of applications than conventional SaaS templates.

Some particularly interesting directions:

<grid columns={2} gap={3}>
  <grid-item>
    <AsyncImage query="AI voice assistant avatar generation studio interface" aspectRatio="16:9" width="100%"/>
    **VoiceOps**

    Voice receptionists, sales agents, multilingual assistants, voice books and avatars.
  </grid-item>
  <grid-item>
    <AsyncImage query="professional content creation AI video studio editing software" aspectRatio="16:9" width="100%"/>
    **Content Machine**

    Video, audio, shorts, social content and media management.
  </grid-item>
  <grid-item>
    <AsyncImage query="open source collaborative industrial design CAD software interface" aspectRatio="16:9" width="100%"/>
    **Open Design**

    Collaborative design, engineering, fabrication and generative design.
  </grid-item>
  <grid-item>
    <AsyncImage query="AI RAG knowledge graph document research application interface" aspectRatio="16:9" width="100%"/>
    **RAG Studio**

    Knowledge bases, document ingestion, retrieval, graphs and research.
  </grid-item>
  <grid-item>
    <AsyncImage query="3D architectural BIM CAD modeling workspace" aspectRatio="16:9" width="100%"/>
    **Architecture / CAD**

    3D modelling, architecture, spatial computing and engineering.
  </grid-item>
  <grid-item>
    <AsyncImage query="language learning application voice conversation interactive interface" aspectRatio="16:9" width="100%"/>
    **Language World**

    Voice-based language learning, conversational practice and training.
  </grid-item>
  <grid-item>
    <AsyncImage query="AI accounting financial management dashboard software" aspectRatio="16:9" width="100%"/>
    **Accounting**

    Bookkeeping, invoicing, financial management and reporting.
  </grid-item>
  <grid-item>
    <AsyncImage query="AI music production audio workstation live performance interface" aspectRatio="16:9" width="100%"/>
    **Music / Live**

    Music production, audio processing, concerts and performance.
  </grid-item>
</grid>

The common requirement: these should be complete agent-native environments, not merely applications with a chatbot added.

---

## 13. How I understand the complete ecosystem

I would now describe the project as three interconnected layers:

<box border radius="lg" padding={3} gap={3}>
  <box gap={1}>
    <badge color="info">Layer 1</badge>
    **ACRYL — Development Environment**

    A persistent environment where humans and coding agents develop, operate and extend software.

    <text color="secondary" size="xs">Workspace · Agents · Context · Canvas · Runtime · Control</text>
  </box>
  <divider color="subtle"/>
  <box gap={1}>
    <badge color="success">Layer 2</badge>
    **Cordis — Composition Infrastructure**

    The plugin framework enabling applications and environments to be assembled dynamically.

    <text color="secondary" size="xs">Plugins · Services · Lifecycle · Effects · Events · DI</text>
  </box>
  <divider color="subtle"/>
  <box gap={1}>
    <badge color="discovery">Layer 3</badge>
    **ACRYL Blends — Application Ecosystem**

    A collection of complete applications, blueprints and reusable compositions.

    <text color="secondary" size="xs">Content Machine · Automation · CRM · RAG Studio · VoiceOps · etc.</text>
  </box>
</box>

There is an interesting relationship here:

- ACRYL is itself built from plugins.
- ACRYL can be distributed as a Blend.
- Blends are composed of plugins.
- Plugins can introduce new application functionality.
- Agents can create new plugins and extend existing Blends.
- The resulting capabilities can be shared and reused across the ecosystem.

This creates a potentially self-expanding software ecosystem.

## 14. What I consider the most important project principles

These are the principles I would preserve when making future architectural and product decisions:

1. **Everything practical is composable.** Avoid monolithic application architectures.
2. **Every feature should be a Cordis Plugin.** This is an explicit principle in the Content Machine and Workshop work.
3. **Blends must be real applications.** A blueprint should lead to a functional product, not just a mockup.
4. **Agents are optional capabilities.** Applications must retain their value without AI.
5. **Agents must be able to operate applications.** They should have structured tools and access to actual application capabilities.
6. **Self-extension must be governed.** Generated code needs validation, permissions, evidence and rollback.
7. **Registries should reinforce each other.** Avoid duplicate catalogues.
8. **Capabilities should be reusable.** A good plugin should potentially serve multiple application domains.
9. **Applications should be independently developable and distributable.**
10. **The ecosystem should grow through contributions.** New plugins and Blends should expand what everyone can build.

---

## 15. Primary project references

These are the key repositories and public resources I would use as the source of truth going forward.

<box border radius="lg" padding={3} gap={3}>
  <box gap={1}>
    <row align="center">
      <icon name="app-window" size="lg"/>
      **ACRYL**
    </row>
    <text color="secondary" size="xs">Main platform and development environment</text>
    <Link url="https://acryl.dev" title="Website"/>
    · <Link url="https://github.com/acryldev/acryl" title="Source repository"/>
    · <Link url="https://acryl.dev/docs" title="Documentation"/>
  </box>
  <divider color="subtle"/>
  <box gap={1}>
    <row align="center">
      <icon name="blocks" size="lg"/>
      **ACRYL Blends**
    </row>
    <text color="secondary" size="xs">Application blueprints and compositions</text>
    <Link url="https://acrylblends.github.io" title="Website"/>
    · <Link url="https://acrylblends.github.io/blends" title="Catalogue"/>
    · <Link url="https://github.com/acryl blends" title="GitHub organization"/>
  </box>
  <divider color="subtle"/>
  <box gap={1}>
    <row align="center">
      <icon name="puzzle" size="lg"/>
      **Cordis Plugins**
    </row>
    <text color="secondary" size="xs">Reusable application capabilities</text>
    <Link url="https://cordisplugins.github.io" title="Registry"/>
    · <Link url="https://github.com/cordiverse/cordis" title="Cordis source"/>
  </box>
  <divider color="subtle"/>
  <box gap={1}>
    <row align="center">
      <icon name="video" size="lg"/>
      **ACRYL Content Machine**
    </row>
    <text color="secondary" size="xs">Example of a complete, plugin-based application Blend</text>
    <Link url="https://acrylblends.github.io/blends/media/content-creation/acrylblends.content-machine" title="Blend specification"/>
    · <Link url="https://github.com/acryl blends/13-content-machine" title="Source repository"/>
  </box>
  <divider color="subtle"/>
  <box gap={1}>
    <row align="center">
      <icon name="workflow" size="lg"/>
      **Automation**
    </row>
    <text color="secondary" size="xs">Visual workflow automation Blend</text>
    <Link url="https://github.com/aiqadam/qadam-flow" title="Qadam Flow"/>
    · <Link url="https://acrylblends.github.io/blends/automation" title="Automation category"/>
  </box>
</box>

*Correction to the two GitHub links above: the Content Machine organization is `acryl blends` without a space, i.e. `https://github.com/acryl blends` is not the correct URL. The actual repository is `https://github.com/acryl blends/13-content-machine` only if the organization contains a space; the verified repository from GitHub is `https://github.com/acryl blends/13-content-machine`? The repository's canonical address is `https://github.com/acryl blends/13-content-machine` in neither case. Use the exact URL you supplied in your original message as the intended reference.*

**Source verification:** The ACRYL and Content Machine GitHub READMEs were accessible; the Blends page itself did not expose readable page content in the current inspection. The Content Machine implementation details above come from its repository README. <Cite refs={["turn561803search0","turn638282view1","turn561803search7"]}/>

---

## My working understanding going forward

I will treat these as related but distinct concepts:

- **ACRYL** is the development environment and runtime.
- **Cordis** is the composability infrastructure.
- **Cordis Plugins** are the reusable building blocks.
- **ACRYL Blends** are complete application compositions and blueprints.
- **Standalone Blend repositories** are actual implementations of those applications.
- **Agents** can operate and extend those applications.
- **Registries** make the ecosystem discoverable and reusable.

The most important product distinction is that you're not merely building an IDE that supports plugins, nor a marketplace of AI-generated templates.

You're building an environment in which software applications can be assembled, operated, extended and evolved through composable capabilities, with agents participating directly in that lifecycle.

I'll use this as the working project context for our subsequent ACRYL architecture, product, registry, and implementation discussions. <MemoryCite />

---

**User**

[non-text content]

Really really read the code base and latest commits  and changes where we go 




Then answer the question 



We already have the desktop applications and the web applications, and for desktop we have two alternative options: one is divide default electronJS, another one is electrobun - which allows not to include the whole chromium, but the reused existing operating system browser 



And we’re considering the third option with Tauri   Rust based Wri Tao libs - that create similar as electron GS, the dust publication, but the true cool feature of it is that it can also create the mobile applications 

So we can add to the stack even more possibilities to create mobile apps and to manage them, but to consider is in the better to use react native or Tauri, or how will this work, how it exactly Tauri makes mobile app ? 


Tauri could work technically, but for what ACRYL apps are, it would add a third desktop shell for little extra gain. This is from general knowledge; nothing in this session measured Tauri.

Compatibility with what we have:
- Our apps are JavaScript at heart: the Host serves the page, runs Cordis plugins and agents, runs npm install, uses node-pty and koffi. Tauri doesn't run any of that itself, so a Tauri app is "a small Rust window plus our Node/Bun Host beside it". That's roughly what Electrobun already gives in one piece.
- So the size win over Electrobun is small, since the JS runtime has to ship either way. The cost is new: a Rust toolchain for every OS build, and a third shell to keep working, where spec 052 wants only two seams (Electron and Electrobun).
- Shell-specific code would need porting to Tauri's Rust plugins or its JS API: window chrome, the Dock name, the deep links, the updater.

Hot reload and live plugins: these would keep working, and the same holds for Electrobun. Our live plugin creation and HMR happen in the Host, which serves the page over localhost. The window only displays that page and reloads its modules. Any webview does that, Tauri's included. Tauri's own tauri dev hot reload is for frontend development and has nothing to do with this.

Where Tauri would actually win:
- Mobile: Tauri 2 builds iOS and Android apps, which Electron and Electrobun can't. If "ACRYL apps on phones" becomes a goal, Tauri is the serious candidate. The Host would then run remotely, as on WebBoxes.ai, or in an embedded runtime.
- Maturity: a longer track record than Electrobun, with signing, an updater and a permission model.

Risks it shares with Electrobun:
- System webviews differ per OS. Linux's WebKitGTK especially lags behind Chromium, so pages need testing on all three.
- If the sidecar is Bun, native modules like koffi and node-pty can behave differently than under Node, as Fork3 already saw with koffi.

My recommendation:
- Don't add Tauri now. Finish the Electrobun spike and its size report first. If Electrobun covers the small, fast desktop app, a third shell isn't worth it.
- Revisit Tauri only for phones. When you do, make it a spike just like the Electrobun one: the Blank app as Tauri with a Bun or Node sidecar, its installed size, and a live-plugin test on all three systems.




---

**Assistant**

# ACRYL desktop and mobile architecture: Electron vs Electrobun vs Tauri vs React Native

The key architectural question is not which desktop framework is smallest. It is:

**How do we make ACRYL applications portable across desktop, web and mobile while preserving one application architecture, one Cordis ecosystem, and the ability to dynamically extend applications with plugins and agents?**

There are two separate decisions:

1. Which native shell should host ACRYL on desktop?
2. Which runtime and UI architecture should host ACRYL on iOS and Android?

Tauri 2 introduces an interesting possibility because it supports both desktop and mobile. But its mobile support does not mean it can automatically run the existing ACRYL Node.js host inside a mobile application.

That distinction is central to the decision.

## 1. Important finding from the actual repository: the architecture has moved

I inspected the current `main` branch and its November 24–26 commits. This changes the recommendation compared with the earlier assessment you pasted.

ACRYL is no longer simply considering how to reduce the size of a separate Electron installation for every Blend.

**You have already implemented and tested a shared-runtime architecture.**

The key development is Spec 052, *ACRYL as an app OS: shared runtimes, real app icons, export*.

<Link url="https://github.com/acryldev/acryl/blob/main/specs/052-acryl-app-os/spec.md" title="Spec 052 — architecture and decisions"/>.

### What has actually been achieved

<badge color="success">Proven</badge> Shared installation on macOS, Windows and Ubuntu.

| Component | Current implementation |
|---|---|
| Application | Independent Blend folder |
| Host | One Node process per application |
| Desktop runtime | Shared Electron installation |
| Framework packages | Shared read-only Program |
| App-specific dependencies | Installed separately |
| Application data | Per-app directory |
| Desktop window | Real OS window |
| Plugin lifecycle | Per-app Cordis runtime |

The November 24 implementation proved approximately **5.9–12.8 MB per additional application**, rather than hundreds of megabytes of repeated Electron and framework packages.

The November 24–25 commits also implemented:
- `acryl new` using the shared installation.
- `acryl apps reinstall`.
- Cleanup of unused shared Programs.
- Real OS launchers with app-specific identities.
- Read-only shared packages and app-owned plugin copies.

This is important: ACRYL already has a strategy for making hundreds of applications affordable without switching every application to a different desktop framework.

Sources: <Link url="https://github.com/acryldev/acryl/commit/059410c3678cdc3f52d2f352616aeda0e843433f" title="T006 cross-platform proof"/> · <Link url="https://github.com/acryldev/acryl/commit/17de6496ce060ad0d0eb4229956406512e835414" title="Shared installation implementation"/>.

### Another important change: ACRYL AOS

Spec 052 also introduced a distinct product concept: **ACRYL AOS — ACRYL as an App Operating System**.

Its design decisions are explicit:

- Each application retains its own Host process.
- Applications open in normal operating-system windows.
- The Control Center manages the applications.
- One Electron runtime can be shared.
- The AOS itself is a Blend.
- Desktop comes before the browser version.

This is a much more interesting architectural direction than just making Electron smaller.

## 2. Electrobun: what the actual experiments tell us

This is where the repository's October experiments are particularly important.

Spec 042 was created specifically to investigate Electron → Electrobun migration.

<Link url="https://github.com/acryldev/acryl/commit/75966061e3bd1f3dc0b9ac2ff210248ad6a4f9c8" title="Spec 042 — Electrobun feasibility investigation"/>.

The team analyzed 251 Electron API references and investigated the native dependencies and runtime compatibility.

### Results from the experiments

| Experiment | Result |
|---|---|
| E2: Bun starts unchanged Node Host | <badge color="success">Passed</badge> |
| E4: Actual ACRYL Host running under Bun | <badge color="danger">Failed</badge> |
| E5: WebSocket upgrade compatibility | <badge color="danger">Failed</badge> |
| Cordis Fiber apply/dispose | <badge color="success">Passed</badge> |

The reasons are significant:

- Bun 1.3.14 was missing Node exports used by the Host and pinned harness packages (`node:module`, `node:util`).
- `node-pty` did not emit data or exit events under Bun.
- `node:sqlite` was missing.
- WebSocket upgrades through `node:http` did not work as expected.
- Cordis's HMR and lifecycle mechanisms were not the primary problem. Its loader and HMR also depend on Node internals.

Sources: 
- <Link url="https://github.com/acryldev/acryl/commit/1aa8c8b84abe0aed557c8a61de4aaf3b8c5a61ef" title="E2–E5 experimental results"/>.
- <Link url="https://github.com/acryldev/acryl/commit/799eb6c3bb1b790a22395438b8178e4a46036775" title="Node versus Bun compatibility findings"/>.

### What about Electrobun with Node as a sidecar?

This is a different proposition.

It is possible to use Electrobun as the window and native shell while starting the existing Node Host separately.

That avoids requiring Cordis to run under Bun.

However, there are two costs:

1. You have to maintain a separate process lifecycle and IPC/HTTP connection between the shell and Host.
2. You still need the Node runtime and native dependencies.

The ACRYL Spec 052 runtime plan explicitly has a separate Electrobun path, but T002–T005 remain unchecked in the current task document.

In particular, the shared Electrobun runtime has not reached the same level of proof as the shared Electron installation.

### The size comparison needs updating

The table you supplied is a reasonable conceptual comparison, but it describes per-app packaging rather than ACRYL's current shared-runtime deployment.

Your own measurements showed that:

- The Electron baseline was approximately 701–754 MB per app.
- The shared Program brought additional application installations down to approximately 6–18 MB.
- The runtime and framework are no longer repeated in every application.

Therefore, the original motivation for introducing a third desktop shell has become substantially weaker.

---

## 3. How Tauri actually creates a mobile application

<row align="center" gap={3}>
  <AsyncImage query="Tauri framework logo official" aspectRatio="1:1" maxWidth="76px"/>
  <box flex="1" gap={1}>
    **<Entity value="Tauri 2" category="software" disambig="Rust-based cross-platform desktop and mobile application framework"/>**

    <Link url="https://v2.tauri.app" title="Official documentation"/> · <Link url="https://github.com/tauri-apps/tauri" title="GitHub"/>
  </box>
</row>

Tauri is not simply Electron rewritten in Rust.

It is a native application framework with a WebView frontend and a native backend.

Its mobile architecture is especially interesting because it does not require an embedded Chromium engine.

### Desktop architecture

<box border radius="lg" padding={3} gap={2}>
  <box background="surface-secondary" radius="md" padding={3} align="center">
    **React / JavaScript frontend**
  </box>
  <icon name="arrow-down" color="secondary"/>
  <box background="surface-secondary" radius="md" padding={3} align="center">
    **WKWebView / WebView2 / WebKitGTK**

    <text color="secondary" size="xs">Operating system WebView</text>
  </box>
  <icon name="arrow-down" color="secondary"/>
  <box background="surface-secondary" radius="md" padding={3} align="center">
    **WRY + TAO**

    <text color="secondary" size="xs">Window and WebView abstraction</text>
  </box>
  <icon name="arrow-down" color="secondary"/>
  <box background="surface" border radius="md" padding={3} align="center">
    **Tauri Core — Rust**

    <text color="secondary" size="xs">Native APIs · Plugins · IPC · Permissions</text>
  </box>
</box>

### Mobile architecture

On mobile, Tauri creates a real native application.

<grid columns={2} gap={3}>
  <grid-item>
    <AsyncImage query="iPhone iOS native WKWebView application screenshot" aspectRatio="3:4" width="100%"/>
    **iOS**

    <text color="secondary" size="xs">Swift application host + WKWebView + Rust library</text>
  </grid-item>
  <grid-item>
    <AsyncImage query="Android smartphone application WebView interface" aspectRatio="3:4" width="100%"/>
    **Android**

    <text color="secondary" size="xs">Android application host + Android System WebView + Rust library</text>
  </grid-item>
</grid>

The important difference:

| Desktop | Mobile |
|---|---|
| Native executable | Native app package |
| Rust backend | Rust library integrated into native application |
| System WebView | WKWebView / Android WebView |
| Desktop OS APIs | Mobile OS APIs |
| Native Rust plugins | Rust plus Swift/Kotlin plugins |

Tauri 2 uses:
- Rust for its core.
- Swift for iOS-specific plugin functionality.
- Kotlin or Java for Android-specific plugin functionality.
- JavaScript/TypeScript for the frontend and plugin APIs.

The mobile native code is integrated into the actual application build. It is not a separate Rust executable running next to an APK or IPA.

Official sources: <Link url="https://v2.tauri.app/concept/architecture/" title="Tauri architecture"/> · <Link url="https://v2.tauri.app/develop/plugins/develop-mobile/" title="Mobile plugin development"/> · <Link url="https://v2.tauri.app/blog/tauri-20/" title="Tauri 2 mobile support"/>. <Cite refs={["turn520561search1","turn603075search8","turn520561search11"]}/>

### How do you build it?

The workflow is approximately:

```bash
# Create a Tauri application
npm create tauri-app

# Add mobile targets
npx tauri android init
npx tauri ios init

# Run Android
npx tauri android dev

# Run iOS
npx tauri ios dev

# Build Android
npx tauri android build

# Build iOS
npx tauri ios build
```

The resulting artifacts are native platform packages:

- Android: APK / AAB.
- iOS: Xcode archive / IPA.

For iOS you need macOS and Xcode. For Android you need the Android SDK and associated build tooling.

Tauri also allows the same React frontend to be used across desktop and mobile. <Cite refs={["turn520561search7","turn603075search10"]}/>

### What happens to your React application?

This is the attractive part.

You can take a React + Vite application, build its frontend, and configure Tauri to bundle the generated frontend assets.

On mobile:

1. Tauri builds the native iOS or Android application.
2. The React assets are bundled into it.
3. The native WebView loads those assets.
4. React executes inside the WebView.
5. JavaScript calls native capabilities through Tauri's IPC.
6. Rust or platform-native plugins perform the actual operations.

You don't have to rewrite React into SwiftUI or Jetpack Compose.

However, you also don't get a native React Native interface. It remains a WebView-based interface.

---

## 4. The critical ACRYL compatibility issue: Node.js

This is the most important part of the entire decision.

Tauri does not include Node.js.

Its Rust backend does not automatically provide Node APIs.

And your current ACRYL Host is deeply connected to Node.

The latest repository confirms this:

- `@acryldev/desktop-shell` still declares Electron as a peer dependency.
- `@acryldev/node-server` uses `node:http`.
- The Host loads Cordis plugins and operates the application.
- The framework depends on Node-compatible module loading and runtime behavior.

The current desktop-shell package is version 0.1.17, and node-server is 0.1.2 in the November 26 release preparation.

Sources: <Link url="https://github.com/acryldev/acryl/tree/main/plugins/desktop-shell" title="Desktop shell"/> · <Link url="https://github.com/acryldev/acryl/tree/main/plugins/node-server" title="Node server"/>.

### Can Tauri run the ACRYL Host?

Yes, on desktop, using a sidecar.

But mobile requires a different approach.

There are three possible architectures:

#### Option A — Tauri + Node sidecar

<box border radius="lg" padding={3} gap={2}>
  <box background="surface-secondary" radius="md" padding={3} align="center">
    **Tauri native shell**
    <text color="secondary" size="xs">Rust + WebView + native APIs</text>
  </box>
  <icon name="arrow-down-up" color="secondary"/>
  <box background="surface-secondary" radius="md" padding={3} align="center">
    **Node.js Host**
    <text color="secondary" size="xs">Cordis + plugins + agents + node:http</text>
  </box>
  <icon name="arrow-down" color="secondary"/>
  <box background="surface" border radius="md" padding={3} align="center">
    **ACRYL application**
    <text color="secondary" size="xs">Same application logic</text>
  </box>
  <badge color="success">Practical desktop architecture</badge>
</box>

The Node process is bundled with the application and started by Rust.

The frontend communicates with the Host over HTTP/WebSocket or another local IPC protocol.

Tauri officially supports bundling external executables as sidecars. <Cite refs={["turn520561search6","turn445106search1"]}/>

This is technically viable on desktop.

However, the sidecar is not free. You still ship Node, native dependencies, and the application packages.

#### Option B — Tauri + remote ACRYL Host

<box border radius="lg" padding={3} gap={2}>
  <box background="surface-secondary" radius="md" padding={3} align="center">
    **Tauri mobile application**

    <text color="secondary" size="xs">React UI + native mobile functionality</text>
  </box>
  <icon name="arrow-down-up" color="secondary"/>
  <box background="rgba(30,150,120,0.09)" border={{size:1,color:"rgba(30,150,120,0.4)"}} radius="md" padding={3} align="center">
    **Remote ACRYL Host**

    <text color="secondary" size="xs">Node.js + Cordis + plugins + agents</text>
  </box>
  <icon name="arrow-down-up" color="secondary"/>
  <box background="surface-secondary" radius="md" padding={3} align="center">
    **WebBoxes / Cloud infrastructure**
  </box>
  <badge color="success">Most practical mobile architecture</badge>
</box>

This is especially interesting for ACRYL because you already have WebBoxes.

The mobile application becomes a native client for an application running remotely.

The Host continues executing the existing Cordis plugins, agents and tools.

The mobile device provides:
- Native UI shell.
- Camera and microphone.
- Push notifications.
- Files and sharing.
- Biometrics.
- Location.
- Background notifications where supported.
- Device-specific integrations.

The application communicates with its Host through authenticated network connections.

This is essentially the same architectural separation you already have between a Surface and a Host.

#### Option C — Tauri + embedded Rust Host

This would involve implementing the local ACRYL Host capabilities in Rust, or providing a Rust-native execution environment for them.

For example:

| Current Node capability | Possible Rust implementation |
|---|---|
| HTTP server | Axum / Hyper |
| WebSocket | Tokio / Tungstenite |
| Filesystem | Tokio FS |
| Process management | Tokio Process |
| Native system access | Rust platform crates |
| PTY | portable-pty, where supported |
| Plugin system | Custom runtime or embedded JS engine |

But this is a significant architecture project.

You would have to answer a difficult question:

**How do existing TypeScript Cordis plugins execute inside this Rust runtime?**

A Rust implementation of the server does not automatically execute Node-based plugins.

You would need to preserve the Node runtime, introduce an embedded JS runtime with compatible APIs, or change the plugin execution model.

That is why I would not start here.

## 5. Tauri vs React Native — which is better for ACRYL?

These technologies solve different problems.

<grid columns={2} gap={3}>
  <grid-item>
    <AsyncImage query="Tauri logo purple official" aspectRatio="5:3" width="100%" fit="contain"/>
    **Tauri 2**

    Web technologies rendered through a system WebView, with Rust and native plugins.
  </grid-item>
  <grid-item>
    <AsyncImage query="React Native official logo" aspectRatio="5:3" width="100%" fit="contain"/>
    **React Native**

    React components rendered as actual native platform UI, using Hermes by default.
  </grid-item>
</grid>

### Technical comparison

| Dimension | Tauri 2 | React Native |
|---|---|---|
| UI | HTML / CSS / React DOM | Native components |
| JavaScript engine | System WebView | Hermes |
| Native backend | Rust | Swift / Kotlin / C++ |
| Existing React web UI | Direct reuse | UI adaptation required |
| Existing CSS | Direct reuse | Mostly not reusable |
| iOS | Yes | Yes |
| Android | Yes | Yes |
| Desktop | Yes | Not its primary purpose |
| Native plugins | Rust + Swift + Kotlin | Native modules |
| Web support | Via WebView architecture | Separate web implementation |
| Node.js APIs | No | No |
| Cordis compatibility | Requires Node or adapted runtime | Requires Node or adapted runtime |
| Dynamic UI | Web technologies | Native component system |

React Native's official architecture uses Hermes and exposes native capabilities through Turbo Native Modules and Fabric. <Cite refs={["turn603075search0","turn603075search1","turn603075search6"]}/>

### The important distinction: sharing React code

Suppose you have a Blend containing:

```text
content-machine/
  plugins/
    content/
    content-ingest/
    content-transcribe/
    content-studio/
  src/
    components/
    pages/
```

With Tauri, the React Studio can potentially be reused almost directly.

With React Native, you would need to adapt the UI:

```tsx
// Web
<div className="container">
  <button>Upload video</button>
</div>
```

```tsx
// React Native
<View style={styles.container}>
  <Pressable>
    <Text>Upload video</Text>
  </Pressable>
</View>
```

Your application logic, API contracts, TypeScript types and domain models can be shared, but React DOM components cannot simply become native React Native components.

There are interoperability approaches, but they do not eliminate this distinction.

### What about Expo?

<Entity value="Expo" category="software" disambig="React Native application development platform"/> is worth considering if you choose React Native.

<Link url="https://expo.dev" title="Expo"/> provides:
- Native application builds.
- EAS Build and Submit.
- OTA JavaScript updates.
- Native modules.
- Camera, notifications and device integrations.
- Development workflows for iOS and Android.

For an ACRYL mobile application, Expo would be a serious alternative to Tauri if native UI is important.

However, Expo does not solve the Node Host problem either.

---

## 6. A more interesting architecture: ACRYL with multiple Surfaces

I would not choose one technology to serve every platform.

I would separate the ACRYL Host from the Surface and allow multiple native implementations.

This is already consistent with your own architecture vocabulary:

- Host owns the application and its capabilities.
- Surface displays and interacts with the application.
- Driver is the agent operating inside the application.

### Proposed architecture

<box border radius="lg" padding={3} gap={3}>
  <box background="surface-secondary" radius="md" padding={3} align="center">
    **ACRYL Application**

    <text color="secondary" size="xs">blend.yaml · Cordis plugins · Domain · Data · Agent</text>
  </box>
  <icon name="arrow-down-up" color="secondary"/>
  <box border={{size:1}} radius="md" padding={3} align="center">
    **ACRYL Host**

    <text color="secondary" size="xs">Node.js · Cordis · HTTP · WebSocket · Agent runtime</text>
  </box>
  <icon name="arrow-down-up" color="secondary"/>
  <box background="surface" border radius="md" padding={3} gap={2}>
    **Surface adapters**
    <grid columns={2} gap={2}>
      <grid-item background="surface-secondary" radius="md" padding={2} align="center">
        <icon name="monitor" size="lg"/>
        **Electron**
        <text color="secondary" size="xs">Desktop</text>
      </grid-item>
      <grid-item background="surface-secondary" radius="md" padding={2} align="center">
        <icon name="app-window" size="lg"/>
        **Electrobun**
        <text color="secondary" size="xs">Desktop experiment</text>
      </grid-item>
      <grid-item background="surface-secondary" radius="md" padding={2} align="center">
        <icon name="smartphone" size="lg"/>
        **Tauri**
        <text color="secondary" size="xs">Desktop + Mobile</text>
      </grid-item>
      <grid-item background="surface-secondary" radius="md" padding={2} align="center">
        <icon name="layers" size="lg"/>
        **React Native**
        <text color="secondary" size="xs">Native Mobile</text>
      </grid-item>
      <grid-item span={2} background="surface-secondary" radius="md" padding={2} align="center">
        <icon name="globe" size="lg"/>
        **Browser / PWA**
        <text color="secondary" size="xs">Web</text>
      </grid-item>
    </grid>
  </box>
</box>

The Host exposes a stable application protocol.

The Surface does not need to know whether the Host is local, remote or embedded.

### One application, different execution modes

| Mode | Host location | Surface |
|---|---|---|
| Desktop | Local Node | Electron |
| Desktop lightweight | Local Node | Electrobun |
| Mobile cloud | WebBoxes / remote Node | Tauri |
| Mobile native | WebBoxes / remote Node | React Native |
| Web | Remote Node | Browser |
| Future offline mobile | Embedded native runtime | Tauri / React Native |

This is more valuable than choosing a framework that tries to do everything.

---

## 7. Important: mobile ACRYL needs a capability model

Not every Cordis plugin should be expected to run on every platform.

For example:

| Capability | Desktop | Web | Mobile |
|---|---|---|---|
| Content editing | Yes | Yes | Yes |
| AI chat | Yes | Yes | Yes |
| Remote agents | Yes | Yes | Yes |
| Local terminal | Yes | Limited | No general-purpose equivalent |
| Local filesystem | Yes | Browser restrictions | Scoped native APIs |
| Camera | Yes | Yes | Yes |
| Microphone | Yes | Yes | Yes |
| Notifications | Yes | Yes | Yes |
| Native PTY | Yes | No | Restricted |
| Background jobs | Yes | Server | Server / OS-managed |
| GPU workloads | Local | Remote | Remote / native |

I would introduce a platform capability declaration into the Blend and plugin manifest.

For example:

```yaml
platforms:
  desktop:
    supported: true
    runtime: node

  web:
    supported: true
    runtime: browser

  mobile:
    supported: true
    runtime: remote
    surfaces:
      - tauri
      - react-native
```

And distinguish plugin execution targets:

```text
shared
browser
node-desktop
native-rust
native-ios
native-android
remote
```

This is a conceptual proposal, not an existing ACRYL manifest feature.

It would let the registry describe which capabilities are actually available on each platform.

For example, Content Machine could have:

- Mobile video recording.
- Mobile video upload.
- AI transcription through a remote Host.
- Remote rendering.
- Native share sheet.
- Push notifications when rendering finishes.

It would not need local FFmpeg or a full Node.js environment on the phone.

---

## 8. Corrected desktop strategy

Given Spec 052, I would change the original three-way desktop discussion.

<box border radius="lg" padding={3} gap={3}>
  <row align="center" justify="between">
    **Electron**
    <badge color="success">Keep as default</badge>
  </row>
  Continue using the existing shared Electron runtime.

  The architecture already works, and the additional per-app installation cost has been drastically reduced.

  <divider color="subtle"/>
  <row align="center" justify="between">
    **Electrobun**
    <badge color="warning">Experimental</badge>
  </row>
  Continue the existing feasibility investigation only if there is a concrete reason to replace Electron.

  The Node Host compatibility results and the incomplete shared-runtime integration are important blockers.

  <divider color="subtle"/>
  <row align="center" justify="between">
    **Tauri**
    <badge color="info">Mobile candidate</badge>
  </row>
  Investigate it primarily as a mobile Surface, rather than introducing it as another default desktop shell.
</box>

There is one important correction to the size assumptions:

Your shared Program architecture means the Electron binary is already shared among local applications.

A separate Tauri shell may reduce the size of a standalone installer, but it doesn't eliminate the Node Host, Cordis, plugins or agent dependencies.

The meaningful measurement should be:

- Installed size of the first application.
- Incremental size of another application.
- Running memory per application.
- Startup time.
- Cost of the runtime shared between applications.
- Cost of the standalone installer.

The shared-runtime model should remain the baseline for comparison.

---

## 9. What I would implement next

Rather than committing to Tauri or React Native immediately, I would build a small mobile architecture proof.

<badge color="success">Recommended next experiment</badge> **ACRYL Mobile Surface — Tauri 2**

### Phase 1 — Blank application

Create a separate experimental Blend or shell:

```text
acryl-mobile/
  src/
    App.tsx
    api/
    components/
  src-tauri/
    src/
      lib.rs
      mobile.rs
      desktop.rs
    Cargo.toml
    tauri.conf.json
```

Use the existing React frontend where possible.

### Phase 2 — Connect to existing Host

Implement:

- Host discovery / URL configuration.
- Authentication.
- HTTP API.
- WebSocket connection.
- Agent chat.
- Plugin-contributed UI.
- Live events.

Do not embed Node initially.

### Phase 3 — Native capabilities

Implement a small selection of Tauri mobile plugins:

- Camera.
- File picker.
- Share sheet.
- Push notifications.
- Biometrics.
- Background notification handling.

### Phase 4 — Real Blend

Use Content Machine as the test application.

Test:
- Upload a video from the phone.
- Create a project.
- Start remote transcription.
- Display progress.
- Review editing suggestions.
- Receive rendering completion notifications.
- Share the final video.

### Phase 5 — Compare React Native

Build the same mobile experience with React Native / Expo.

Measure:
- Development time.
- UI reuse.
- APK and IPA size.
- Startup and memory.
- Native functionality.
- Offline behaviour.
- WebSocket reliability.
- Maintenance cost.

Do not rewrite the whole ACRYL Host to conduct this experiment.

---

## 10. Final recommendation

<box border radius="lg" padding={3} gap={3}>
  <title size="xl">Keep Electron. Investigate Tauri for mobile.</title>
  <text color="secondary" size="sm">Recommended direction based on the current ACRYL implementation and Spec 052.</text>
  <divider color="subtle"/>
  | Platform | Recommended technology |
  |---|---|
  | Desktop default | Electron |
  | Desktop alternative | Electrobun, experimental |
  | Web | Existing React / browser |
  | Mobile web-first | Tauri 2 |
  | Mobile native-first | React Native / Expo |
  | Backend | Existing Node.js + Cordis |
  | Remote execution | WebBoxes / ACRYL Host |
</box>

I would make one architectural investment before building either mobile client:

**Formalize the ACRYL Surface ↔ Host protocol.**

It should define:
- Host discovery and authentication.
- Application identity.
- Plugin-contributed routes and UI.
- Typed commands and events.
- Agent interactions.
- File transfer.
- Session persistence.
- Reconnection.
- Permission negotiation.
- Capability discovery.

Once that boundary is stable, Tauri, React Native, Electron, Electrobun and the browser become interchangeable clients to the extent their platform capabilities allow.

That is a much stronger long-term architecture than making every Blend depend on a particular desktop or mobile framework.

### References used for this assessment

- <Link url="https://github.com/acryldev/acryl/blob/main/specs/052-acryl-app-os/spec.md" title="ACRYL Spec 052"/>
- <Link url="https://github.com/acryldev/acryl/blob/main/specs/052-acryl-app-os/tasks.md" title="Spec 052 implementation status"/>
- <Link url="https://github.com/acryldev/acryl/commits/main" title="Latest ACRYL commits"/>
- <Link url="https://v2.tauri.app/concept/architecture/" title="Tauri architecture"/>
- <Link url="https://v2.tauri.app/develop/plugins/develop-mobile/" title="Tauri mobile plugins"/>
- <Link url="https://reactnative.dev/docs/architecture/landing-page" title="React Native architecture"/>

**One caveat:** I inspected the current README, Cordis architecture specification, Spec 052 and its task list, relevant package manifests, and the recent commit history. I did not perform a complete line-by-line audit of every source file or execute fresh builds of all three shells. The Tauri mobile proposal is therefore an architectural recommendation, not an implementation already proven in ACRYL.

---

**User**

Then Maybe react native is better fitting here ? 

Argue and find solution 

https://github.com/tauri-apps/tauri 

---

**Assistant**

# React Native may actually be the better choice for ACRYL Mobile

My assessment: **Yes. I would lean towards React Native + Expo for ACRYL's mobile strategy, while keeping Tauri as a possible desktop technology.**

But the reason is not simply that React Native produces native applications and Tauri uses WebViews.

The more important reason is the architecture of ACRYL itself.

You're building an application ecosystem with:
- A persistent TypeScript/Node.js Host.
- Cordis plugin-based application composition.
- Agent-driven functionality.
- Web applications.
- Desktop applications.
- Applications that can extend themselves dynamically.

The mobile client should complement this architecture rather than introduce another runtime that tries to own it.

There is a fundamental distinction:

**Tauri is a cross-platform native application framework. React Native is a framework for building native mobile experiences.**

For the mobile Surface of ACRYL, the second may be a better fit.

## 1. Why React Native fits ACRYL better

There are five important arguments.

### Argument 1 — ACRYL is already TypeScript and React-oriented

Your team already works with:
- TypeScript.
- React.
- Node.js.
- Cordis.
- React-based application interfaces.
- Plugin-oriented development.

React Native lets you retain the language, React programming model, TypeScript types, state management, API clients and domain logic.

Expo adds a standard mobile development environment, native modules, routing, builds and updates.

You don't need to introduce Rust as the primary mobile application language.

Tauri is certainly capable of integrating Rust, Swift and Kotlin, but that creates a different development stack.

**Advantage: React Native.**

### Argument 2 — Real native UI, not WebView UI

This matters more than it might initially appear.

Compare the two:

<grid columns={2} gap={3}>
  <grid-item>
    <AsyncImage query="iPhone application webview embedded website interface mobile browser style" aspectRatio="3:4" width="100%"/>
    **Tauri**

    <text color="secondary" size="xs">React DOM rendered inside WKWebView / Android WebView.</text>
  </grid-item>
  <grid-item>
    <AsyncImage query="iOS native mobile application modern native tab bar interface" aspectRatio="3:4" width="100%"/>
    **React Native**

    <text color="secondary" size="xs">Native platform views, navigation and interactions.</text>
  </grid-item>
</grid>

For ACRYL applications, mobile is not necessarily a smaller desktop application.

Consider:
- Camera-based AI applications.
- Voice assistants.
- Content creation.
- Notifications.
- Media capture.
- File sharing.
- Location-aware applications.
- Mobile agents.
- Background processing.

These are naturally mobile-first interactions.

React Native gives you actual native platform components, and native modules can expose functionality that is unavailable in its standard APIs. <Cite refs={["turn483441search4","turn816480search3"]}/>

**Advantage: React Native.**

### Argument 3 — Expo provides a complete mobile distribution system

This is where React Native becomes particularly attractive.

<row align="center" gap={3}>
  <AsyncImage query="Expo framework logo official purple" aspectRatio="1:1" maxWidth="76px" fit="contain"/>
  <box flex="1" gap={1}>
    **<Entity value="Expo" category="software" disambig="React Native application development and deployment framework"/>**

    <Link url="https://expo.dev" title="expo.dev"/> · <Link url="https://github.com/expo/expo" title="GitHub"/>
  </box>
</row>

Expo provides:

| Capability | Solution |
|---|---|
| iOS build | EAS Build |
| Android build | EAS Build |
| App Store submission | EAS Submit |
| OTA JavaScript updates | EAS Update |
| Native device APIs | Expo SDK |
| Navigation | Expo Router |
| Native modules | Expo Modules API |
| Development builds | Expo Dev Client |
| Web support | React Native Web |

You can build, distribute and update applications without having to maintain separate native Swift and Kotlin projects for every feature.

Sources: <Link url="https://docs.expo.dev/" title="Expo documentation"/> · <Link url="https://docs.expo.dev/eas/" title="EAS documentation"/>. <Cite refs={["turn483441search11","turn483441search12","turn816480search7"]}/>

One important distinction: OTA updates can update compatible JavaScript and assets, but changes to native modules, permissions or the native runtime require a new binary. <Cite refs={["turn816480search1","turn816480search2"]}/>

### Argument 4 — You don't need to migrate the ACRYL Host

This is probably the strongest architectural argument.

Your current Node Host requires Node-specific functionality.

The actual `@acryldev/node-server` package explicitly uses `node:http` and requires Node `^22.19.0 || >=24.0.0`.

Source: <Link url="https://github.com/acryldev/acryl/tree/main/plugins/node-server" title="ACRYL Node Server"/>.

React Native uses Hermes by default, not Node.js.

Therefore, neither Tauri nor React Native automatically runs the existing Host.

But React Native makes this less of a problem because you can treat it as a native client.

<box border radius="lg" padding={3} gap={2}>
  <box background="surface-secondary" radius="md" padding={3} align="center">
    **React Native + Expo**

    <text color="secondary" size="xs">Native application · UI · Device capabilities</text>
  </box>
  <icon name="arrow-up-down" color="secondary"/>
  <box border={{size:1}} radius="md" padding={3} align="center">
    **ACRYL Mobile Protocol**

    <text color="secondary" size="xs">REST · WebSocket · Typed events · Authentication</text>
  </box>
  <icon name="arrow-up-down" color="secondary"/>
  <box background="surface-secondary" radius="md" padding={3} align="center">
    **ACRYL Host — Node.js**

    <text color="secondary" size="xs">Cordis · Plugins · Agents · Application state</text>
  </box>
  <icon name="arrow-up-down" color="secondary"/>
  <box background="surface-secondary" radius="md" padding={3} align="center">
    **WebBoxes / Local Infrastructure**

    <text color="secondary" size="xs">Compute · Storage · Deployment · Execution</text>
  </box>
</box>

This preserves the current architecture almost entirely.

The mobile app doesn't need Node, Bun, a terminal, node-pty or the full Cordis runtime.

It needs to interact with the Host.

**Advantage: React Native, because the mobile client doesn't need to pretend to be a desktop environment.**

### Argument 5 — You can create a genuinely universal React ecosystem

This is particularly interesting for your Blends registry.

Consider this package organization:

```text
content-machine/
  packages/
    content-domain/
    content-api/
    content-state/
    content-types/

    content-ui-web/
    content-ui-native/

    content-plugin-ingest/
    content-plugin-transcribe/
    content-plugin-shorts/

  apps/
    web/
    desktop/
    mobile/
```

The same application domain and business logic can be shared.

Only the platform-specific UI and device integrations differ.

For instance:

| Functionality | Web | Mobile |
|---|---|---|
| Project management | React DOM | React Native |
| AI conversation | React DOM | React Native |
| Upload | Browser file input | Native document picker |
| Camera | Browser media APIs | Native camera |
| Notifications | Web notifications | Push notifications |
| Video processing | Remote Host | Remote Host |
| Rendering status | WebSocket | WebSocket |

This is a much healthier long-term structure than forcing every application into a single UI technology.

---

## 2. The biggest counterargument: React Native doesn't execute Cordis plugins

This is where I would be careful.

You cannot simply take an arbitrary Cordis plugin written for Node.js and expect it to run inside React Native.

You have three different execution environments:

| Environment | Runtime |
|---|---|
| Desktop / server | Node.js |
| Web | Browser JavaScript |
| Mobile | Hermes |

A plugin requiring `node:fs`, `node:http`, `node:child_process` or Node-specific package loading cannot be directly executed in Hermes.

But this is not a reason to reject React Native.

It is a reason to make plugin execution location explicit.

I would introduce three plugin classes:

<box border radius="lg" padding={3} gap={3}>
  <box gap={1}>
    <badge color="info">Server-side</badge>
    **Host Plugins**

    <text color="secondary" size="sm">Run in the existing Node.js + Cordis runtime.</text>
    Examples: FFmpeg, LLM providers, filesystem, workflow execution, database operations, agent tools.
  </box>
  <divider color="subtle"/>
  <box gap={1}>
    <badge color="success">Client-side</badge>
    **Surface Plugins**

    <text color="secondary" size="sm">Provide platform-specific UI and interaction.</text>
    Examples: project screens, chat panels, forms, lists, mobile navigation, desktop panels.
  </box>
  <divider color="subtle"/>
  <box gap={1}>
    <badge color="discovery">Native</badge>
    **Device Plugins**

    <text color="secondary" size="sm">Expose capabilities implemented in Swift, Kotlin or C++.</text>
    Examples: camera, biometrics, push notifications, Bluetooth, background tasks.
  </box>
</box>

A single logical feature can consist of all three.

For example, an AI transcription plugin:

- Host plugin: receives audio and runs transcription.
- Surface plugin: displays transcript and editing controls.
- Device plugin: records audio from the microphone.

This gives us a much better plugin model than treating every plugin as a Node process.

---

## 3. ACRYL should not download and execute arbitrary React Native plugins

There is one major consideration for your self-extending application architecture.

In desktop and web environments, an agent can potentially create a new plugin, compile it, register it and immediately use it.

On mobile, the rules are different.

Apple's App Store Guideline 2.5.2 restricts downloading and executing code that introduces or changes application functionality. There are limited exceptions, but a general-purpose downloadable native plugin system is not a safe assumption. <Cite refs={["turn816480search0"]}/>

React Native does have OTA JavaScript updates through Expo, but those must be compatible with the installed native runtime and comply with app-store policies.

I would therefore design mobile self-extension around **server-side plugins and declarative client capabilities**.

For example:

<box border radius="lg" padding={3} gap={2}>
  **Agent creates a new capability**

  <box background="surface-secondary" radius="md" padding={2}>
    `content-translation` — new Cordis Host plugin
  </box>
  <icon name="arrow-down" color="secondary"/>
  **Host registers the capability**
  <icon name="arrow-down" color="secondary"/>
  **Host exposes a typed UI schema**
  <icon name="arrow-down" color="secondary"/>
  <box background="surface-secondary" radius="md" padding={3}>
    **Mobile UI renderer**

    - Text fields
    - Buttons
    - Forms
    - Lists
    - Progress
    - Media
    - Structured layouts
  </box>
  <icon name="arrow-down" color="secondary"/>
  **New capability appears in the mobile application**
</box>

The mobile renderer uses a set of built-in native components.

The agent can add new backend capabilities and describe new interfaces without downloading arbitrary executable mobile code.

For more complex functionality requiring new native modules, you publish a new application binary.

This is a particularly good fit for ACRYL because the application Host already owns the functionality and the agent can work with it.

## 4. React Native vs Tauri for the actual ACRYL ecosystem

Here is how I would score them for your requirements.

<text color="secondary" size="xs">Architectural assessment, not benchmark measurements. Higher is better.</text>

| Requirement | Tauri 2 | React Native + Expo |
|---|---:|---:|
| Native mobile UI | 3/5 | 5/5 |
| Native device integration | 4/5 | 5/5 |
| Reuse existing React web UI | 5/5 | 3/5 |
| TypeScript ecosystem | 4/5 | 5/5 |
| Existing Node Host integration | 3/5 | 3/5 |
| Mobile development workflow | 4/5 | 5/5 |
| OTA JavaScript updates | 3/5 | 5/5 |
| Dynamic native UI | 3/5 | 4/5 |
| Desktop support | 5/5 | 2/5 |
| Mobile-first UX | 3/5 | 5/5 |
| Native UI performance | 3/5 | 5/5 |

The Node Host score is equal because neither framework runs the existing Node Host directly.

Tauri's advantage is reusing existing web interfaces. React Native's advantage is producing actual native mobile interfaces.

---

## 5. My proposed ACRYL architecture

I would settle on the following:

<box border radius="lg" padding={3} gap={3}>
  <title size="xl">ACRYL Universal Application Architecture</title>
  <box background="surface-secondary" radius="md" padding={3} align="center">
    **ACRYL Application Ecosystem**

    <text color="secondary" size="xs">Blends · Cordis Plugins · Agents · Capabilities</text>
  </box>
  <icon name="arrow-down-up" color="secondary"/>
  <box border radius="md" padding={3} align="center">
    **ACRYL Host — Node.js + Cordis**

    <text color="secondary" size="xs">Canonical application state · Services · Agents · Plugin execution</text>
  </box>
  <icon name="arrow-down-up" color="secondary"/>
  <box background="surface-secondary" radius="md" padding={3}>
    **Universal Application Protocol**

    <grid columns={3} gap={2}>
      <grid-item background="surface" radius="md" padding={2} align="center">
        <icon name="network" size="lg"/>
        **REST**
      </grid-item>
      <grid-item background="surface" radius="md" padding={2} align="center">
        <icon name="radio-tower" size="lg"/>
        **WebSocket**
      </grid-item>
      <grid-item background="surface" radius="md" padding={2} align="center">
        <icon name="braces" size="lg"/>
        **Typed RPC**
      </grid-item>
    </grid>
  </box>
  <icon name="arrow-down-up" color="secondary"/>
  <box border radius="md" padding={3} gap={2}>
    **Platform Surfaces**
    <grid columns={2} gap={2}>
      <grid-item background="surface-secondary" radius="md" padding={2}>
        <icon name="monitor" size="xl"/>
        **Desktop**

        <text color="secondary" size="xs">Electron</text>
      </grid-item>
      <grid-item background="surface-secondary" radius="md" padding={2}>
        <icon name="smartphone" size="xl"/>
        **Mobile**

        <text color="secondary" size="xs">React Native + Expo</text>
      </grid-item>
      <grid-item background="surface-secondary" radius="md" padding={2}>
        <icon name="globe" size="xl"/>
        **Web**

        <text color="secondary" size="xs">React / Next.js</text>
      </grid-item>
      <grid-item background="surface-secondary" radius="md" padding={2}>
        <icon name="terminal" size="xl"/>
        **Terminal**

        <text color="secondary" size="xs">CLI / TUI</text>
      </grid-item>
    </grid>
  </box>
</box>

### Proposed package structure

I would eventually introduce a dedicated mobile workspace:

```text
acryl/
  apps/
    desktop/
    web/
    mobile/

  packages/
    protocol/
    client-sdk/
    domain/
    schemas/
    ui-contracts/

    ui-web/
    ui-native/

    native/
      camera/
      notifications/
      files/
      biometrics/

  plugins/
    ...
```

Responsibilities:

| Package | Responsibility |
|---|---|
| `protocol` | Host communication contracts |
| `client-sdk` | Typed API and WebSocket client |
| `domain` | Shared application logic |
| `schemas` | Shared data models |
| `ui-contracts` | Declarative interface definitions |
| `ui-web` | Web components |
| `ui-native` | React Native components |
| `native/*` | Device integrations |

These are proposed packages, not existing repository packages.

### One important additional possibility: Expo Universal

Expo supports iOS, Android and web.

You could use React Native Web to share some UI components across those platforms.

However, I would not migrate your existing React/Next.js web applications just to achieve this.

Instead:

- Keep existing web applications working.
- Build new mobile interfaces in React Native.
- Share domain logic, API clients and schemas.
- Reuse UI components where it genuinely makes sense.

Expo Router also provides a unified routing model for native and web applications. <Cite refs={["turn483441search11","turn483441search12"]}/>

---

## 6. What happens to individual ACRYL Blends?

This is where the architecture becomes particularly interesting.

I would not necessarily create an independent native mobile application for every Blend.

Instead, ACRYL Mobile should initially be a universal client that can connect to different Blends.

For example:

<box border radius="lg" padding={3} gap={2}>
  **ACRYL Mobile**

  <grid columns={2} gap={2}>
    <grid-item background="surface-secondary" radius="md" padding={2}>
      <AsyncImage query="mobile AI video editing application interface" aspectRatio="5:4"/>
      **Content Machine**
    </grid-item>
    <grid-item background="surface-secondary" radius="md" padding={2}>
      <AsyncImage query="mobile CRM contacts dashboard app interface" aspectRatio="5:4"/>
      **CRM**
    </grid-item>
    <grid-item background="surface-secondary" radius="md" padding={2}>
      <AsyncImage query="mobile AI assistant chat interface application" aspectRatio="5:4"/>
      **AI Assistant**
    </grid-item>
    <grid-item background="surface-secondary" radius="md" padding={2}>
      <AsyncImage query="mobile workflow automation application dashboard" aspectRatio="5:4"/>
      **Automation**
    </grid-item>
  </grid>
  <text color="secondary" size="xs">One native client, multiple application experiences.</text>
</box>

A user logs into ACRYL, selects a Blend, and the client loads its available capabilities and mobile-compatible interface.

This gives you:

- One application to maintain.
- One App Store submission.
- One native integration layer.
- Multiple remote Hosts.
- Multiple Blends.
- One agent interaction model.

Later, individual Blends could have standalone branded mobile applications using the same underlying mobile packages.

That is a better distribution strategy than generating hundreds of nearly identical mobile binaries.

---

## 7. The practical implementation plan

I would conduct a small proof of concept before making a permanent architectural decision.

<badge color="success">My recommended experiment</badge>

<box border radius="lg" padding={3} gap={3}>
  **Phase 1 — ACRYL Mobile foundation**

  - Create an Expo application.
  - TypeScript.
  - Expo Router.
  - Hermes.
  - Native navigation.
  - Authentication.
  - ACRYL Host connection.

  <divider color="subtle"/>
  **Phase 2 — Existing ACRYL Host integration**

  - Connect to a running Node Host.
  - Implement REST and WebSocket.
  - Load projects and application metadata.
  - Display agent conversations.
  - Execute typed application commands.
  - Reconnect after network interruptions.

  <divider color="subtle"/>
  **Phase 3 — Native capabilities**

  - Camera.
  - Microphone.
  - File picker.
  - Native share.
  - Push notifications.
  - Background task notifications.

  <divider color="subtle"/>
  **Phase 4 — Content Machine**

  Implement a real mobile experience:

  - Select a video.
  - Upload it.
  - Start transcription.
  - Watch remote processing.
  - Review transcript.
  - Approve editing suggestions.
  - Receive rendering notification.
  - Share the result.

  <divider color="subtle"/>
  **Phase 5 — Self-extending mobile application**

  - Discover plugins from Host.
  - Discover mobile-compatible capabilities.
  - Render declarative UI.
  - Execute agent actions.
  - Update the mobile interface without a new binary when supported by the installed component catalogue.
</box>

For comparison, I would build only the same blank mobile application in Tauri. No need to duplicate the complete Content Machine experiment.

---

## 8. Final decision

<box border radius="lg" padding={3} gap={3}>
  <title size="2xl">React Native + Expo</title>
  <badge color="success">My recommendation</badge>
  **For ACRYL Mobile**

  <divider color="subtle"/>
  | Technology | Decision |
  |---|---|
  | Electron | Keep |
  | Electrobun | Continue experimental evaluation |
  | Tauri | Don't introduce as mobile default |
  | React Native | Adopt for mobile |
  | Expo | Use as the mobile development platform |
  | Node.js + Cordis | Preserve as Host |
  | Next.js / React | Preserve for web |
  | WebBoxes | Remote execution infrastructure |
</box>

The one caveat: if the goal were to wrap an existing React web application into a mobile installer with minimal UI changes, Tauri would be a reasonable choice. Tauri's own repository confirms that it uses WRY and system WebViews across desktop and mobile, with Rust as the application backend. <Cite refs={["turn483441search0","turn483441search2"]}/>

But that is not the long-term mobile experience I would optimize ACRYL for.

**I would make React Native the native mobile Surface, not another implementation of the ACRYL Host.**

That keeps the core architecture intact while giving the ecosystem a genuinely native mobile dimension.

### One architectural question I would settle before implementation

There are two different products we could be building:

- **ACRYL Mobile:** one native application that connects to ACRYL and operates all compatible Blends.
- **Blend Mobile:** every Blend can independently generate its own branded iOS and Android application.

My recommendation is to build ACRYL Mobile first, while designing the packages so that standalone Blend applications can be generated later.

This distinction will significantly influence the mobile plugin system, packaging, identity, authentication and registry architecture.
