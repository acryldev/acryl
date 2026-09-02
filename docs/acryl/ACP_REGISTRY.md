# ACP Registry: Running acryl inside Devin Desktop

acryl speaks the Agent Client Protocol (ACP) through DSH's `acp` profile
(`dsh-base` + `dsh-acp-app`), layered with acryl coding capabilities
(authorization, agent-presets, session-stats). The `acryl acp` subcommand
boots this profile and serves JSON-RPC over stdio — the transport ACP
clients like Devin Desktop launch as a subprocess.

## Prerequisites

- `acryl` CLI installed and on `PATH` (from `acryl-tui` or the `acryl` npm launcher)
- A configured DeepSeek API key (`DEEPSEEK_API_KEY`) or pi-ai OAuth login

## Local registry config

Add acryl to Devin Desktop's local ACP registry by editing
`~/.windsurf/acp/registry.json` (or `~/.windsurf-next/acp/registry.json`
for Devin Desktop Next). You can also open the file from the Command
Palette with `Open Local ACP Registry Config`.

If the file already has agents (e.g. Devin Local), merge the acryl entry
into the existing `agents` array.

```json
{
  "version": "1.0.0",
  "agents": [
    {
      "id": "acryl",
      "name": "acryl",
      "version": "0.1.26",
      "description": "ACRYL coding agent via DSH ACP profile",
      "authors": ["acryldev"],
      "license": "MIT",
      "distribution": {
        "binary": {
          "darwin-aarch64": { "archive": "", "cmd": "acryl", "args": ["acp"] },
          "darwin-x86_64": { "archive": "", "cmd": "acryl", "args": ["acp"] },
          "linux-aarch64": { "archive": "", "cmd": "acryl", "args": ["acp"] },
          "linux-x86_64": { "archive": "", "cmd": "acryl", "args": ["acp"] },
          "windows-aarch64": { "archive": "", "cmd": "acryl", "args": ["acp"] },
          "windows-x86_64": { "archive": "", "cmd": "acryl", "args": ["acp"] }
        }
      }
    }
  ],
  "extensions": []
}
```

## Enabling acryl in Devin Desktop

1. Open the Command Palette (`Cmd+Shift+P` on macOS, `Ctrl+Shift+P` on Windows/Linux)
2. Open `Devin User Settings`
3. Click the "Agents" tab
4. Toggle on the "acryl" agent
5. Restart Devin Desktop

acryl now appears in the agent selector (bottom right corner) when starting
new conversations, alongside built-in agents like Cascade and Devin Local.

## Authentication

Configure the `DEEPSEEK_API_KEY` environment variable in one of:

- The "..." button next to acryl in the Agents tab of Devin User Settings
- The `devin.acp.agentEnv.acryl` setting in your `settings.json`
- Your shell environment (`.zshrc`, `.bashrc`, etc.)

## Testing

After adding the registry entry, run `Reload ACP Connections` from the
Command Palette to pick up changes without restarting Devin Desktop.
