# @acryldev/blends 1.7.34

Released 2026-11-25.

- **A Blend's chat has the tools its plugins give** (`@acryldev/app-context` 0.2.2, carried in the frame). The frame now provides ACRYL's tools port
  (`acrylTools`) over the chat's tool registry, so a plugin that registers a tool through it (the launcher, plugin-admin, workspace) has it in the
  chat. Before, the frame provided no port and those tools were missing. A new app gets app-context 0.2.2; an app made before runs
  `npm install @acryldev/app-context@0.2.2`.
- **The `acryl-app` skill loads.** Its description is now a quoted YAML string; unquoted, the engine ignored the whole skill
  ("Nested mappings are not allowed").
