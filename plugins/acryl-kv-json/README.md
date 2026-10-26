# acryl-kv-json

The JSON-file provider of the [`kv` port](../acryl-kv/README.md), one Cordis plugin. The whole store is one file, read into memory when it
opens, and rewritten **atomically** on every write: the new content goes to a temporary file in the same folder, is flushed, and is renamed over the
file. A crash leaves the old file or the new one, never half of one.

```yaml
- id: acryl-kv-json
  name: acryl-kv-json
  config:
    path: data/kv.json   # default: kv.json in the ACRYL app home; required outside an ACRYL app
```

Plain code uses `openKv({ path })` from `acryl-kv-json/open`, which resolves `{ kv, close }`.

- One process owns the file. Two writers would overwrite each other; use `acryl-kv-db` for that.
- The whole file is rewritten on every write and kept in memory: it suits thousands of small values, not megabytes. Past a few MB, move to
  `acryl-kv-db` (`copyKv` imports the file).
- A file that exists and does not parse is an error naming the path; the provider never starts over an unreadable file. Temporary files left
  by a crash are removed at the next open.
- Unloading the row withdraws `kv` first, so consumers stop calling, and then closes: the close waits for the writes in flight.

The format is `{"version":1,"entries":{"key": value, ...}}`, keys in code point order.
