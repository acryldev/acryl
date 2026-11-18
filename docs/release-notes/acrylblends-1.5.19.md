# acrylblends 1.5.19

Every Blends app has Settings > Skills & MCP. The frame mounts [skill-mcp-manager](https://github.com/cordisplugins/skill-mcp-manager) (npm `skill-mcp-manager`, 1.3.1), so a new app has it, and `npx acrylblends upgrade` adds it to an older one. It lists the agent's skills and MCP servers, switches them on and off, and gives the agent `mcp_register`, `mcp_load` and `mcp_call`; a server that is not loaded costs no context.

`frame/packages.json` has a `plugins` section for plugins like this one, published from their own repositories under their own npm names.

If an app pulled skill-mcp-manager as a plugin earlier, the built-in one now runs, and the pulled copy is refused because its tools are already registered. Remove the pulled copy with `npm run acryl -- plugin remove skill-mcp-manager`.
