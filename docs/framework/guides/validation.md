# Validation

`validate(target, schema)` accepts any [Standard Schema](https://standardschema.dev) (Schemastery, Zod, Valibot, ArkType) for `'json'`, `'query'` or `'param'`.
On failure it answers 400 with the issues; on success the handler reads the typed value with `valid(c, target)`.

```ts
ctx.router.post('/api/notes', validate('json', NoteSchema), c => c.json(valid<Note>(c, 'json'), 201))
```
