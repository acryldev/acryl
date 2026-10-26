# acryl-db-sqlite

The SQLite provider of the [`db` port](../acryl-db/README.md), one Cordis plugin. It opens one file with Node's built-in `node:sqlite`
(WAL journal, `synchronous = NORMAL`, a busy timeout), applies the app's numbered migrations, and provides `db`.

```yaml
- id: acryl-db-sqlite
  name: acryl-db-sqlite
  config:
    path: data/app.sqlite   # default: data.sqlite in the ACRYL app home; required outside an ACRYL app
    migrations: migrations  # a folder of 001-name.sql, 002-name.sql, ...
```

Relative paths resolve from the app (the Loader's base URL). `busyTimeoutMs` (default 5000) and `walAutoCheckpointPages` (default 1000,
0 disables it) tune the connection.

Unloading the row withdraws `db` first, so consumers stop calling, and then closes the file. The close waits for running operations and
transactions, checkpoints the WAL, and releases the file. A failed migration fails the row and leaves the file unchanged.

Node 22.19 or later. The driver under `src/facade` and its tests under `tests/facade` are ported from pi's chord package (MIT);
`provenance.json` records the source commit and every change.
