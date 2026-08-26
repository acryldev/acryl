# DeepSeek Harness and Cordis Framework Analysis

## Rapid Popularity and Core Concept 🚀

DeepSeek's repository reached 137,000 stars in just 4 days.

It crossed 50,000 stars in about 12 hours, breaking previous records.

The entire pitch is summarized in four words displayed on the repo page.

Everything in the system is designed as a plugin.

## Plugin Architecture and Ecosystem 🔌

### Universal Plugin System

Model adapters, tools, skills, sessions, sandboxes, storage, scheduling, interface—all are plugins.

Plugins register services; registrations are fully reversible.

Extending the system means mounting new plugins beside existing ones without altering a privileged core.

### Cordis Framework Origin

Cordis, powering DeepSeek, is not owned by DeepSeek but maintained by a different organization.

Created in May 2022 but with roots tracing back 4+ years earlier to a chatbot framework called Koishi.

Koishi is a cross-platform chatbot framework with about 6,000 stars.

### Relationship Between Components

DeepSeek harness is built on Cordis, which is extracted from Koishi.

Koishi supports multiple platforms: Discord, Telegram, Matrix, Fishu, and focuses on group chats.

The coding agent and chatbot share architecture designs, solving similar problems around session lifespan, plugin lifecycle, and state management.

## Technical Foundations and Theory 📚

### Spatio-Temporal Composability

Defined in a research paper pushed 84 minutes before the harness launch.

Temporal composability: fully reverting side effects of a component when removed.

Spatial composability: declaring and reactively managing dependencies between components.

### Core Design Ideas

Plugins register capabilities and declare dependencies.

Services communicate through typed events.

Every registration is reversible, enabling clean unload of plugins.

### Key Challenges Addressed

Session outliving capabilities: long-running group chats or coding sessions require underlying components to change without interruption.

Dynamic arrival and removal of capabilities without crashing.

State persistence through swaps to avoid unstable behavior.

## DeepSeek Engineering and Contributions 🛠️

### Development Insights

Majority of Cordis code authored by one contributor.

DeepSeek forked Cordis, made changes, and kept a detailed changelog.

Improvements include fixing lifecycle bugs and integrating unmerged upstream patches.

### Engineering Trade-offs

DeepSeek chose not to rewrite the plugin kernel but focused engineering efforts on loop, tools, and context.

Plugin kernel viewed as plumbing, already mature from years of chatbot use.

Developer preview status with warnings about breaking changes implies ongoing rapid development.

## Ecosystem Impact and Competition 🌐

Over 5,800 repositories already tagged with the "plugin" topic.

Post-launch, Cordis issues and pull requests surged dramatically.

Cross-compatibility bridges to competitors like Claude and Codex shipped as plugins from day one.

Star counts reflect interest more than depth of underlying engineering.

## Strategic Questions and Reflections ❓

The plugin kernel, though essential, is not where the real product moat lies.

DeepSeek’s real product differentiators are in the loop, tools, and context work.

The ecosystem's longstanding experience with plugin-based architectures informed DeepSeek’s rapid success.

The question remains: what truly forms the competitive advantage if the kernel and plugin system are borrowed?

