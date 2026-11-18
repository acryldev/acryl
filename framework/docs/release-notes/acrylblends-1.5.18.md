# acrylblends 1.5.18

A plugin pulled into a running app shows its Settings page at once. The frame now mounts DSH's live module channel (`client-hmr`, `/plugins/events`), so an open page takes a changed module list without a reload: pull `cordisplugins/skill-mcp-manager` and Settings > Skills & MCP is there. Before, the page's EventSource got 404 and the new page needed a reload.
