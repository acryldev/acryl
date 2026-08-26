# MISSION: BOOTSTRAP ACR ON TOP OF DEEPSEEK HARNESS + CORDIS

You are running inside the DeepSeek Harness repository.

Your task is not to merely add a feature to DeepSeek Harness.

Your task is to begin designing and implementing a new project/concept:

    ACR — Agent Context Relay

ACR should be an Agentic Development Environment (ADE) and persistent
agent operating environment built ON TOP OF DeepSeek Harness and Cordis.

The long-term vision is:

    One persistent development environment.
    One persistent project context.
    Any coding agent.
    Agents may come and go.
    The work continues.

Examples of coding agents ACR should eventually be able to run or connect:

    DeepSeek Harness native agents
    OpenCode
    Claude Code
    Codex
    Pi
    Kimi CLI
    Gemini CLI
    Goose
    Crush
    Aider
    arbitrary future CLI / ACP / API agents

ACR MUST NOT become tightly coupled to any one coding agent.

DeepSeek Harness + Cordis should provide the stable runtime substrate.

ACR should provide:

    continuity
    relay
    orchestration
    external-agent execution
    context persistence
    handoff
    multi-agent rooms
    generated capabilities
    generated functional UI
    self-extension
    eventually evidence-driven self-evolution


============================================================
0. FIRST PRINCIPLE
============================================================

Do NOT start by rewriting DeepSeek Harness.

Do NOT start by creating a giant new application.

Do NOT fork or replace the existing DSH architecture unless absolutely
necessary.

First understand the architecture that already exists.

DeepSeek Harness already provides important primitives:

    Cordis plugin composition
    Context / Services
    Fibers
    Effects
    lifecycle/disposal
    events
    waterfall events
    configuration
    profiles
    bundles
    patches
    sessions
    agents
    agent loop
    tools
    LLM adapters
    filesystem
    shell
    subprocess
    PTY
    jobs
    sandbox
    permissions
    persistence
    skills
    subagents
    agent teams
    web UI
    telemetry
    credentials

Use these.

The architectural question is:

    "What is the smallest set of NEW ACR capabilities that turns
     DSH into the foundation of an agent-agnostic ADE?"

Prefer composition over modification.


============================================================
1. CORE ACR PHILOSOPHY
============================================================

The fundamental ACR principle is:

    AGENT SESSIONS ARE DISPOSABLE.
    PROJECT CONTEXT IS PERSISTENT.

The user should be able to work like this:

    Claude works on task
        ↓
    Claude stops / reaches limit / user changes preference
        ↓
    ACR preserves the scene
        ↓
    Codex continues
        ↓
    DeepSeek reviews
        ↓
    OpenCode implements another part
        ↓
    Pi builds a custom capability
        ↓
    work continues

The project does NOT belong to Claude, Codex, OpenCode, Pi or DeepSeek.

The project belongs to ACR.

Agents are actors entering and leaving a persistent scene.

Conceptually:

    SAME PLAY
    SAME SCENE
    DIFFERENT ACTORS


============================================================
2. DSH SHOULD REMAIN THE RUNTIME SUBSTRATE
============================================================

Do not duplicate capabilities already correctly implemented by DSH.

Think approximately:

                    ACR ADE
                       │
        ┌──────────────┴──────────────┐
        │                             │
   ACR Product Layer             ACR UI Layer
        │                             │
        └──────────────┬──────────────┘
                       │
                 ACR Plugins
                       │
              DeepSeek Harness
                       │
                    Cordis


Cordis should remain responsible for runtime composition/lifecycle.

DSH should remain responsible for generic agent-runtime capabilities.

ACR should initially be implemented as plugins/services/capabilities
using documented DSH/Cordis extension seams wherever possible.


============================================================
3. DEFINE ACR AS CORDIS CAPABILITIES
============================================================

Investigate how these should be expressed idiomatically as Cordis services.

Candidate capability seams:

    ctx.acr
    ctx.relay
    ctx.agentProviders
    ctx.context
    ctx.handoffs
    ctx.identity
    ctx.checkpoints
    ctx.artifacts
    ctx.capabilities
    ctx.ui
    ctx.workspace
    ctx.tasks

Do NOT blindly implement all of these.

First determine which existing DSH services already cover them.

For each proposed ACR capability classify it:

    EXISTING DSH CAPABILITY
    EXTEND EXISTING CAPABILITY
    NEW ACR CAPABILITY
    NOT NEEDED

Avoid duplicate abstractions.


============================================================
4. CANONICAL ACR EVENT MODEL
============================================================

DSH already uses durable session events.

Preserve that philosophy.

Adopt this law:

    MODEL-VISIBLE MEANS LOGGED.
    AGENT-VISIBLE MEANS RELAYABLE.

The canonical state of an ACR project should NOT be a model's chat history.

It should be reconstructable from durable events + artifacts.

Think:

    ACR Event Stream
          │
          ├── DSH agent projection
          ├── Claude projection
          ├── Codex projection
          ├── OpenCode projection
          ├── Pi projection
          ├── UI projection
          ├── memory projection
          └── analytics / trace projection

Different agents may require different context formats.

Therefore:

    canonical event representation
        !=
    model prompt representation

Do not create one mega-format for everything.

Use projections.


============================================================
5. AGENT PROVIDERS / ADAPTERS
============================================================

ACR must eventually support arbitrary coding agents.

Do not encode this as giant conditionals:

    if claude...
    if codex...
    if opencode...

Create a narrow provider/capability contract.

Investigate at least three execution classes:

    A. DSH-native agent
    B. ACP-connected agent
    C. PTY/CLI agent

Potential later classes:

    API agent
    MCP-connected agent
    remote agent
    container agent

A provider should expose capabilities, not pretend every agent is identical.

For example an adapter may declare:

    execution
    streaming
    resume
    session import/export
    structured tool events
    context injection
    ACP
    PTY
    permissions
    checkpoints
    model selection

Capability detection is preferable to agent-name branching.


============================================================
6. NATIVE PTY IS IMPORTANT
============================================================

ACR is an ADE.

A critical feature is the ability to run real coding agents exactly as
developers already use them.

Therefore inspect and reuse DSH:

    PTY
    subprocess
    shell
    job management
    filesystem
    sandbox

The goal should eventually allow:

    ACR
      ├── native DSH agent
      ├── opencode
      ├── claude
      ├── codex
      ├── pi
      └── arbitrary CLI

inside one persistent project environment.

Do not require every external agent to be rewritten as a DSH agent.


============================================================
7. RELAY / HANDOFF
============================================================

This is one of ACR's defining capabilities.

An agent should be able to leave the project and another should continue.

A handoff should NOT merely be:

    summarize conversation

It should eventually be a structured artifact containing useful state such as:

    objective
    current task
    decisions
    completed work
    unresolved problems
    changed files
    relevant artifacts
    important tool results
    constraints
    tests/status
    recommended next actions
    provenance

Design the architecture so handoff representations can evolve.

Do not over-specify the final schema in the first implementation.


============================================================
8. SESSION FORKING / BRANCHING
============================================================

Investigate DSH session fork semantics carefully.

ACR should eventually support:

                         scene
                           │
             ┌─────────────┼─────────────┐
             │             │             │
          Claude         Codex       DeepSeek
             │             │             │
             └────── compare / merge ────┘

This becomes the basis for:

    alternative implementations
    parallel research
    review
    debate
    Consilium
    multi-agent work

Reuse DSH lineage/fork primitives where possible.


============================================================
9. MULTI-AGENT ROOM
============================================================

Investigate DSH experimental Agent Teams before implementing a competing
orchestration system.

ACR eventually wants a persistent room where heterogeneous agents can be
participants.

Potential concepts:

    agent identity
    roster
    task board
    mailbox
    shared artifacts
    messages
    mentions
    assignments
    status
    handoffs

But first determine what DSH Agent Teams already provides.

Extend rather than duplicate.


============================================================
10. CONTINUOUS MODE
============================================================

Long term, ACR should allow work to continue even when one actor stops.

Example:

    task exists
       ↓
    Agent A works
       ↓
    Agent A finishes / fails / hits limit
       ↓
    ACR evaluates remaining task state
       ↓
    Agent B can continue
       ↓
    verifier/reviewer checks
       ↓
    task continues

Do NOT implement uncontrolled autonomous loops now.

Design the primitives required for this later:

    durable tasks
    agent lifecycle
    handoff
    checkpoints
    resumability
    permissions
    budgets
    failure state


============================================================
11. ACR MUST BE SELF-EXTENSIBLE
============================================================

This is a defining property.

The application should not require its developers to anticipate every
workflow.

A user should eventually be able to say:

    "Build me a Kanban board for these agents."

or:

    "Whenever a frontend task completes, launch the app, capture screenshots,
     compare them to the previous version and give me an approval panel."

or:

    "Create a dependency graph viewer for this project."

ACR should be capable of creating a NEW VERSIONED CAPABILITY PACKAGE.

Conceptually:

    user need
       ↓
    capability builder
       ↓
    generate extension
       ↓
    validate
       ↓
    test
       ↓
    sandbox
       ↓
    permission review
       ↓
    install
       ↓
    Cordis/DSH hot activation
       ↓
    capability appears

NO rebuild of the complete ADE should be required.

NO restart should be required where Cordis lifecycle/HMR allows safe reload.


============================================================
12. IMPORTANT: SELF-EXTENSION != CORE SELF-MODIFICATION
============================================================

Do NOT interpret "self-updating" as:

    agent edits random DSH source
        ↓
    rebuild
        ↓
    hope application still works

The stable kernel should be intentionally boring.

Generated functionality should normally live outside the kernel.

Prefer something like:

    acr/
      capabilities/
        kanban/
        visual-qa/
        graph-viewer/
        custom-workflow/

Each capability should eventually be versionable and reproducible.

If the current extension contract cannot express a requested capability,
the agent may create:

    CORE EXTENSION PROPOSAL

explaining:

    missing seam
    why it is needed
    smallest proposed API
    compatibility impact
    tests

But do NOT silently mutate fundamental DSH/Cordis semantics.


============================================================
13. SELF-SURGEON / CAPABILITY BUILDER
============================================================

Create the architectural concept of a built-in role:

    @self-surgeon

or internally:

    acr-capability-builder

Its job is to understand:

    Cordis plugin API
    DSH capability seams
    ACR capability API
    event model
    permission model
    UI schema
    package format
    test harness
    currently installed capabilities

It should be able to answer:

    "Can the current system already do this?"

If yes:
    compose existing capabilities.

If no:
    determine whether a new extension can implement it.

Only if impossible:
    propose a new kernel seam.

The Capability Builder itself should eventually be an evolvable capability,
not permanently hard-coded intelligence.


============================================================
14. FUNCTIONAL GENERATIVE UI
============================================================

"Generative UI" must NOT mean decorative AI-generated React.

The generated UI must be connected to real functionality.

A generated capability may contain:

    manifest
    logic
    commands/actions
    state schema
    event handlers
    UI description
    permissions
    tests

For example:

    kanban/
      manifest
      task state
      move-task action
      event subscriptions
      kanban UI
      permissions
      tests

The UI is simply a projection/control surface for a real capability.


============================================================
15. UI ARCHITECTURE
============================================================

Prefer two UI extension classes.

NORMAL / SAFE PATH:

    declarative UI schema
          ↓
    trusted ACR component registry
          ↓
    host renderer

Possible inspiration:

    A2UI
    OpenUI
    Flutter GenUI

Do not adopt any of these blindly.
First determine whether DSH's existing Web Client / conversation-node
architecture already provides an appropriate primitive.

ADVANCED / POWER PATH:

    sandboxed custom UI module
          ↓
    strict ACR bridge
          ↓
    explicit permissions

Do NOT allow generated code unrestricted access to the browser/Electron/Node
host.


============================================================
16. CAPABILITY SECURITY
============================================================

Generated executable functionality must not automatically receive full
machine authority.

Design toward capability-based permissions such as:

    project.read
    project.write(patterns)

    process.exec(commands)

    network.allow(hosts)

    git.read
    git.write
    git.commit

    agents.dispatch

    artifacts.read
    artifacts.write

    ui.register

    secrets.read(named-secret)

Reuse DSH permission/sandbox mechanisms whenever possible.

Avoid creating a second security model if DSH already provides the necessary
primitive.


============================================================
17. CONFIGURATION THROUGH DSH PROFILES / BUNDLES
============================================================

Explore using DSH composition for ACR distributions.

Possible future bundles:

    acr-base
    acr-ade
    acr-coding
    acr-multi-agent
    acr-relay
    acr-ui
    acr-memory
    acr-graph
    acr-evolution

A profile might compose:

    dsh-base
    + acr-base
    + acr-ade
    + selected agent providers
    + selected memory provider
    + selected graph provider

This is important:

ACR should offer tools at the user's disposal without forcing one provider.

Examples:

    memory:
        OpenViking
        Hindsight
        Mem0
        future systems

    code graph:
        OmniGraph
        lat.md
        Graphify
        future systems

    coding agent:
        DSH
        OpenCode
        Claude
        Codex
        Pi
        future agents

Composition is a product feature.


============================================================
18. CHECKPOINTS
============================================================

Eventually an ACR checkpoint should be richer than chat history.

Think:

    session event boundary
    +
    workspace state
    +
    active task state
    +
    artifacts
    +
    runtime capability composition
    +
    provider/session references

Possible actions:

    rewind
    branch
    compare
    resume
    relay

Do not build the entire checkpoint system immediately.

Determine which primitives DSH already exposes.


============================================================
19. CONTEXT ENGINE
============================================================

Never assume every agent should receive the complete canonical event log.

Architecture:

    canonical ACR events
          ↓
    context selector
          ↓
    compaction
          ↓
    provider-specific projection
          ↓
    target agent

This should eventually allow:

    stable-prefix optimization
    token budgeting
    context compaction
    memory retrieval
    code graph retrieval
    task-specific context
    agent-specific formatting

The context engine should be replaceable/composable.


============================================================
20. PREFIX CACHE STABILITY
============================================================

For providers supporting prompt/prefix caching, preserve stable prefixes
where practical.

Think:

    STABLE:
        core instructions
        project identity
        tool schemas
        durable project rules

    MUTABLE:
        latest task
        recent events
        retrieved context
        tool results

Do not optimize prematurely, but avoid architectural decisions that make
cache-stable projections impossible.


============================================================
21. SELF-EXTENSION AND SELF-EVOLUTION ARE DIFFERENT
============================================================

Keep these concepts separate.

A. GENERATIVE SELF-EXTENSION

Immediate:

    "I need capability X"
           ↓
    capability builder
           ↓
    create package
           ↓
    test
           ↓
    approve
           ↓
    hot install

B. SELF-EVOLUTION

Evidence-driven:

    existing capability
           ↓
    real usage traces
           ↓
    failures / feedback / outcomes
           ↓
    optimization
           ↓
    candidate vNext
           ↓
    regression gates
           ↓
    approval
           ↓
    upgrade

Do not require GEPA for ordinary capability creation.


============================================================
22. FUTURE EVOLUTION LAB — DSPy + GEPA
============================================================

Do NOT implement this deeply in the first bootstrap unless it falls out
naturally.

But design the event/trace system so we can later build:

    ACR Evolution Lab
        DSPy
        +
        GEPA

It could optimize:

    capability-builder instructions
    extension prompts
    tool descriptions
    context selection
    handoff instructions
    routing policies
    agent-role prompts
    UI-generation instructions
    workflows

Potentially code later, but code evolution requires much stronger gates.

Important architecture rule:

    evolution proposes candidates
    tests/evals determine viability
    humans/policy determine adoption

The optimizer must not be the authority that declares itself improved.


============================================================
23. TRACES ARE A PRODUCT ASSET
============================================================

Design observability carefully.

ACR should eventually be able to normalize:

    prompts
    messages
    agent transitions
    tool calls
    tool results
    files changed
    tests
    approvals
    failures
    handoffs
    outcomes
    extension usage

into useful traces.

These traces support:

    debugging
    replay
    context reconstruction
    evaluation
    GEPA/DSPy evolution
    benchmarking
    future training datasets

But preserve provenance and privacy boundaries.


============================================================
24. ARCHITECTURE AS CODE
============================================================

Follow DSH's own engineering philosophy.

Do not let architecture documentation become hand-maintained fiction.

Where practical, generate or verify catalogs such as:

    ACR_CAPABILITIES.md
    ACR_EVENTS.md
    ACR_AGENT_PROVIDERS.md
    ACR_EXTENSION_POINTS.md
    ACR_PERMISSION_CATALOG.md
    ACR_MODULE_GRAPH.md
    ACR_PLUGIN_CATALOG.md

Prefer source-derived architecture documentation and CI verification.


============================================================
25. PRODUCT EXPERIENCE
============================================================

ACR is an ADE, not merely a framework.

Eventually the user should experience:

    Projects
      ↓
    persistent workspace / room
      ↓
    agents
      ↓
    tasks
      ↓
    terminal / editor / diff / artifacts
      ↓
    generated tools/views as needed

The interface should stay calm and minimal.

Do not begin by building a giant IDE.

A minimal ADE surface is enough:

    project/workspace
    conversation
    agent selector
    PTY
    task state
    artifacts
    extension/capability surface

More UI should increasingly be supplied through capabilities.


============================================================
26. FIRST BOOTSTRAP EXPERIMENT
============================================================

We are not asking you to implement the final ACR.

We are asking you to prove that DSH + Cordis can become ACR.

The first milestone should demonstrate FOUR things:

1. ACR exists as a clean plugin/bundle/profile layer on DSH.

2. A persistent ACR project/room can launch at least:
       - one DSH-native agent
       - one external PTY or ACP coding agent

3. A minimal durable ACR event/handoff representation allows work/state
   to survive switching between those actors.

4. ACR can create/install/hot-activate ONE tiny generated capability
   without modifying/rebuilding the DSH core.

The fourth proof is crucial.

Choose something small.

For example:

    generated task board
    generated notes panel
    generated session inspector
    generated agent-status view

It must include some FUNCTIONAL behavior, not merely static UI.


============================================================
27. YOUR FIRST ACTION: STUDY BEFORE CODING
============================================================

Before modifying code:

Read carefully:

    docs/architecture.md
    docs/development.md
    Cordis primer
    Cordis tutorial
    DSH configuration docs

Then inspect source for:

    sessions
    session fork
    agent teams
    subagents
    PTY
    shell
    subprocess
    permissions
    sandbox
    persistence
    Web Client
    conversation nodes
    plugin loading
    HMR
    profiles
    bundles
    patches

Also inspect relevant:

    .agents/notes/implemented/architecture/
    .agents/notes/implemented/process/

These notes are especially important.

We want to understand WHY DSH architecture exists before adding ACR.


============================================================
28. PRODUCE AN ARCHITECTURAL GAP ANALYSIS
============================================================

Create:

    docs/acr/ACR_DSH_GAP_ANALYSIS.md

For every desired ACR primitive document:

    requirement
    existing DSH primitive
    relevant Cordis primitive
    reusable as-is?
    extension required?
    missing seam?
    proposed minimal implementation
    risk

Include at least:

    project/room
    canonical events
    agent provider
    PTY agent
    ACP agent
    handoff
    context projection
    checkpoint
    multi-agent team
    tasks
    artifacts
    extension package
    dynamic UI
    permissions
    hot activation


============================================================
29. CREATE THE CONCEPT SPEC
============================================================

Then create:

    docs/acr/ACR_CONCEPT.md

It should describe:

    vision
    non-goals
    architecture
    DSH/Cordis relationship
    event model
    provider model
    extension model
    UI model
    security
    project lifecycle
    relay/handoff
    multi-agent roadmap
    self-extension
    self-evolution
    open questions


============================================================
30. CREATE A CONCRETE ROADMAP
============================================================

Create:

    docs/acr/ACR_ROADMAP.md

Suggested progression:

    ACR-0
    Architecture/gap analysis

    ACR-1
    ACR Cordis plugin + project identity + durable state

    ACR-2
    external PTY agent provider

    ACR-3
    relay/handoff between DSH-native + external agent

    ACR-4
    capability package format + loader

    ACR-5
    first self-generated functional capability + hot activation

    ACR-6
    minimal ADE UI

    ACR-7
    ACP provider

    ACR-8
    multi-agent room / DSH Agent Teams integration

    ACR-9
    context engine / memory / graph seams

    ACR-10
    checkpoints / branch / compare / Consilium

    ACR-11
    Continuous Mode

    ACR-12
    trace/evaluation infrastructure

    ACR-13
    DSPy/GEPA Evolution Lab

You may revise this ordering if source analysis shows a better dependency
structure.

Explain every revision.


============================================================
31. THEN IMPLEMENT ONLY THE FIRST VERTICAL SLICE
============================================================

After the architecture documents exist, implement the smallest useful
vertical slice.

Do NOT disappear into months of framework design.

Prefer a walking skeleton.

Target:

    start DSH with ACR profile
         ↓
    create/open ACR project
         ↓
    durable ACR project identity exists
         ↓
    DSH native actor can participate
         ↓
    external PTY actor can be launched
         ↓
    events are captured
         ↓
    actor can be switched
         ↓
    minimal handoff is generated/read
         ↓
    project remains the same

If feasible within the same iteration, add the smallest dynamic capability
proof.

Otherwise document it as the immediate next milestone.


============================================================
32. TEST THE THESIS, NOT JUST THE CODE
============================================================

At the end, answer these questions explicitly:

    Q1.
    Can ACR live mostly OUTSIDE the DSH core?

    Q2.
    Are Cordis services/plugins powerful enough for the ACR capability model?

    Q3.
    Can external coding agents be represented cleanly without pretending
    they are DSH-native agents?

    Q4.
    Can DSH session/event primitives serve as the canonical foundation
    for cross-agent continuity?

    Q5.
    Can a capability be installed/activated dynamically without rebuilding
    the whole application?

    Q6.
    Can generated functional UI be added without injecting arbitrary code
    into the trusted host?

    Q7.
    What is genuinely missing from DSH/Cordis?

    Q8.
    What is the SMALLEST upstream/core seam we would need to add?

These answers matter more than feature count.


============================================================
33. ARCHITECTURAL LAWS
============================================================

Unless source evidence demonstrates they are wrong, preserve these laws:

LAW 1
    ACR owns continuity.
    Agents perform work.

LAW 2
    Canonical state is durable and agent-independent.

LAW 3
    Agent-specific context is a projection.

LAW 4
    Prefer Cordis composition over DSH core modification.

LAW 5
    Generated capabilities live outside the stable kernel.

LAW 6
    Generated executable code receives explicit capabilities/permissions.

LAW 7
    Generated UI normally uses trusted declarative components.

LAW 8
    Everything generated is versioned and reproducible.

LAW 9
    Self-extension and self-evolution are separate systems.

LAW 10
    Evolution proposes; evaluation gates; policy/human approves.

LAW 11
    Never create an agent-name switch statement where a capability seam
    would work.

LAW 12
    Do not rebuild functionality DSH already provides.

LAW 13
    If the extension contract is insufficient, propose the smallest new seam.

LAW 14
    Keep the kernel intentionally boring.

LAW 15
    ACR must remain capable of running coding agents that do not know ACR
    exists.


============================================================
34. WORK AUTONOMOUSLY, BUT LEAVE AN AUDIT TRAIL
============================================================

You are allowed to inspect, create files, implement plugins, run tests,
refactor experimental ACR code, and use DSH's own facilities.

Maintain:

    docs/acr/ACR_DECISIONS.md

Record important architectural decisions as:

    context
    alternatives
    decision
    evidence
    consequences

Do not silently make foundational decisions.


============================================================
35. BEGIN
============================================================

Start now.

Phase 1:
    understand DSH + Cordis architecture.

Phase 2:
    write the gap analysis.

Phase 3:
    define ACR concept and roadmap.

Phase 4:
    identify the smallest vertical slice.

Phase 5:
    implement it.

Phase 6:
    run tests and demonstrate it.

Do not optimize for the amount of code written.

Optimize for proving this thesis:

    DeepSeek Harness + Cordis can become the stable substrate for a
    self-extensible, agent-agnostic Agentic Development Environment
    where project context persists independently of whichever coding
    agent is currently doing the work.

And the eventual experience should feel almost paradoxical:

    ACR starts small.

    The user works.

    The system discovers missing capabilities.

    Coding agents build those capabilities as extensions.

    Cordis activates them.

    The ADE grows around the user's actual workflow.

    Yet the kernel remains small, understandable and stable.