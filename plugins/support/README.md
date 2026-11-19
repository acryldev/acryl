# acryl-support

Support tools as one Cordis plugin. Host: on the Web surface it attaches the shared file log sink (`acryl-diagnostics`)
to the Cordis logger, so Web finally keeps logs, and serves `GET /api/acryl-support/diagnostics`, a zip of system facts
and the recent masked logs. Client: Settings > Support with an "Export diagnostics" button.

Desktop keeps its richer export (crash dumps, lifecycle evidence) behind the tray; both use the same masking, sink and
archive builder.
