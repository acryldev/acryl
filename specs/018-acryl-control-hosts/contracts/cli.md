# Contract: `acryl` command surface

## General rules

- `acryl` is the canonical executable.
- No subcommand opens the interactive TUI.
- `--profile <name>` defaults to the current active profile.
- Human-readable output is the default for non-interactive commands.
- `--json` makes stdout contain exactly one canonical JSON result or a documented JSONL stream.
- Diagnostics and progress not contained in the canonical result use stderr.
- Exit `0` means the requested operation reached its required durability and lifecycle settlement.
- Invalid input, denial, cancellation, failed settlement, and incompatible attach targets use nonzero documented exit codes.
- Commands must not prompt when stdin is not interactive unless the caller explicitly selects an interactive approval mode.

## Global grammar

```text
acryl [--profile <name>] [--json]
acryl tui [--profile <name>]
acryl gui [--profile <name>]
acryl web [--profile <name>]

acryl host status [--profile <name>] [--json]
acryl host doctor [--profile <name>] [--json]

acryl profile list [--json]
acryl profile show [<name>] [--json]
acryl profile select <name> [--json]

acryl architecture [--plane host|client|tui|all] [--json]
acryl fiber list [--state <phase>] [--json]
acryl fiber show <fiber-uid> [--json]

acryl plugin list [--json]
acryl plugin show <entry-id> [--json]
acryl plugin enable <entry-id> [--json]
acryl plugin disable <entry-id> [--json]
acryl plugin reload [<entry-id>] [--json]
acryl plugin install <source> --preview [--json]
acryl plugin install <source> --approve [--json]
acryl plugin update [<package>] --preview [--json]
acryl plugin update [<package>] --approve [--json]
acryl plugin remove <package> --preview [--json]
acryl plugin remove <package> --approve [--json]

acryl agent list [--json]
acryl agent new [--cwd <path>] [--provider <id>] [--model <id>]
acryl agent resume <session-id>
acryl agent stop <worker-id> [--json]
```

The first release may stage command families, but accepted grammar must not acquire competing aliases or ambiguous positional meanings.

## Interactive default

`acryl` and `acryl tui` are equivalent. Startup chooses one mode:

- `direct`: acquire the profile and boot its ACRYL composition locally;
- `attached`: authenticate to the compatible live owner and project its capabilities;
- `recovery`: offer narrow diagnostic and repair commands after safe ownership or composition failure.

The current mode, owner kind, profile, generation, and protocol compatibility must remain visible in the TUI.

## GUI and Web launchers

`acryl gui` and `acryl web` are canonical launch commands. Distribution-specific `acryl-gui` and `acryl-web` executables delegate to those exact command paths without independent parsing or behavior.

## Mutation flow

A mutation command follows:

```text
parse
-> resolve profile and owner
-> authenticate/direct-bind
-> validate capability and target
-> preview policy/restart/permission impact
-> obtain required approval
-> execute
-> await durability and lifecycle settlement
-> verify health
-> return receipt
```

`--preview` cannot mutate. `--approve` confirms the exact candidate digest returned by preview; if the candidate changes between preview and execution, execution fails and requires a new preview.

## Output envelope

Machine-readable one-result commands use:

```json
{
  "schemaVersion": 1,
  "ok": true,
  "operation": "plugin.reload",
  "host": {
    "mode": "direct",
    "kind": "tui",
    "profile": "desktop",
    "generationId": "opaque"
  },
  "result": {}
}
```

Failures use:

```json
{
  "schemaVersion": 1,
  "ok": false,
  "operation": "plugin.reload",
  "error": {
    "code": "ACRYL_STABLE_CODE",
    "message": "actionable human-safe message",
    "retryable": false,
    "details": {}
  }
}
```

Secret values, service instances, callbacks, raw configuration, and unrestricted filesystem paths are excluded.

## Exit classes

| Class | Meaning |
| --- | --- |
| `0` | Settled success |
| usage | Invalid command or arguments |
| unavailable | Required capability, runtime, provider, or profile unavailable |
| denied | Protection or approval policy denied operation |
| conflict | Profile ownership or candidate generation conflict |
| failed | Execution, settlement, health, or rollback failure |
| interrupted | Explicit user or signal cancellation |

Concrete numeric assignments must be centralized in the CLI contract implementation and covered by parser/acceptance tests.
