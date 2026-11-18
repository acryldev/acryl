# acryl-kv-db

The [`kv` port](../acryl-kv/README.md) over the [`db` port](../acryl-db/README.md), one Cordis plugin: the documents are rows of a `kv` table
(`key TEXT PRIMARY KEY, value TEXT NOT NULL`) in the app's own SQL database, so an app that grows from a JSON file into SQL keeps its data
(`copyKv` imports the file). The plugin injects `db`, stays PENDING until a `db` provider is active, and provides `kv`.

```yaml
- id: acryl-db-sqlite
  name: acryl-db-sqlite
  config: { path: data/app.sqlite }
- id: acryl-kv-db
  name: acryl-kv-db
  config: { table: kv }   # optional
```

Plain code uses `kvOnDb(db, { table? })` from `acryl-kv-db/open` on the `db` that `openDb` returned. It owns no connection.

- The table is created on first use (`CREATE TABLE IF NOT EXISTS`), so it needs no migration.
- `update` reads and writes in one `db.transaction`. On Postgres the same guarantee needs `SELECT ... FOR UPDATE`, which comes with that provider.
- `list` selects with `substr(key, 1, n) = ?`, not `LIKE`, so `%`, `_` and letter case need no escaping, and sorts by code point.
