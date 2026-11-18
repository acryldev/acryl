# 56 — Pulsebus (Messaging infrastructure)

**Tagline:** Inspect event streams and consumer health.

## Product brief
A message infrastructure control surface for browsing topics, consumer groups, message payloads, delivery states and publishing synthetic test events.

**Primary audience:** Backend engineers, integration teams, platform operators and event-driven architects.

**UX direction:** Three-column event bus explorer: topic navigation, live-style message stream and JSON payload inspector/publisher.

## Workspace / screen map
1. Topic and consumer-group explorer
2. Message stream with delivery / retry state
3. Payload and schema inspector
4. Synthetic publish and replay controls

## Primary workflows
1. Select a topic and inspect its message stream.
2. Select a message to inspect headers, schema version and JSON payload.
3. Validate and publish a synthetic JSON event to the local stream.
4. Replay a selected sample or inspect the dead-letter queue.

## Core data model
Topic, ConsumerGroup, Message, MessageHeader, SchemaVersion, DeliveryAttempt, DeadLetterEntry.

## Prototype boundaries
All events and acknowledgments are local seed data. Publish and replay actions do not connect to Kafka, RabbitMQ, NATS, Pulsar or any live broker.

## Acceptance criteria
- A user can complete each primary workflow using seeded data without credentials or external API keys.
- The application has responsive behavior and meaningful empty, selected, success and error states.
- Data transformations and state transitions are separated from presentation and covered by domain tests.
- The UI uses semantic controls, visible focus states and keyboard-accessible primary actions.
- README documents purpose, target users, local run steps, prototype boundaries and the three agent prompts.

## Suggested implementation sequence
1. Define typed domain entities, seed fixtures and pure domain operations.
2. Implement the primary workspace and main state transitions.
3. Add detail / create / inspect flows, responsive layout and accessibility.
4. Add domain and route tests, then capture a screenshot for the registry entry.

## Coding-agent prompts
1. Implement message/topic domain types and an in-memory event repository with publish and replay methods.
2. Add schema validation, payload inspection and consumer-lag calculations with unit tests.
3. Create topic filtering, consumer group detail and dead-letter queue review flows.

## Blueprint delivery notes
- Standalone UX prototype only; it is not a production application.
- Use local seed data and do not require paid services or third-party API keys.
- Implement in its own repository when promoted from mockup to Blueprint.
- Publish a registry entry only after domain tests, route tests, README and screenshot are complete.
