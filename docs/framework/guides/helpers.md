# Helpers

From `acryl-router/helpers`: `readJson`, `readText`, `readBytes` (counted while streaming, 413 past the limit, 400 on bad JSON), `streamSSE`, `validate` and `valid`.
Prefer them to `c.req.json()` for untrusted bodies: they stop reading at the limit instead of buffering everything first.
