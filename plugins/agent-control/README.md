# acryl-agent-control

Agent Control (spec 041): a governed, snapshot-and-act interface to ACRYL's own window for the agent, one Cordis plugin for Web and Desktop. Host tools reach the page over acryl-door's channel (an event stream down, POST up, same origin); the in-page driver builds accessibility snapshots with short-lived refs, redacts sensitive fields, refuses protected controls, and shows an "agent is driving" indicator with a kill switch

Part of [ACRYL](https://github.com/acryldev/acryl) (`plugins/acryl-agent-control`). `pnpm test` in this folder runs its suite.
