
## This app (notes): accounts, sessions, a database

A Cordis app: `blend.yaml` lists the plugins that are mounted (`acryl-router`, `acryl-db-sqlite`, `routes`, `acryl-node-server`), `src/app.ts` is the one file that names the SQLite provider, and `src/routes.ts` is the app's own plugin: it builds the app on the `db` port and mounts it.

- **The dependency rule:** only `src/app.ts` (the `opener` in `package.json`) imports the provider. Every other file takes a `Db` (`import type { Db } from '../plugins/acryl-db/src/index.ts'`) as an argument and never imports `node:sqlite`, `pg`, another driver or `acryl-db-sqlite`. `npm test` and `npm run check` run `acrylblends check-deps`, which names the file and line of a violation; do not move the `opener` entry to silence it.
- `src/db.ts`: `notesStore(db)`, the queries for notes. Every `db` call returns a promise: `await` it. Use `?` bindings, never string-built SQL. The database is `data/notes.sqlite` (or the file `$NOTES_DB` names), opened by the `db` row with `migrations/` applied on start. See `docs/framework/guides/data.md`.
- `migrations/`: the shape of the database, one numbered file per change (`001-notes.sql`). A file that has run is never edited; a change is the next file (`002-name.sql`).
- `src/auth.ts`: scrypt password hashes (`node:crypto`) and the `sessions` table; the cookie `sid` holds a random token.
- `src/schema.ts`: the rules for a note and for credentials. The HTML forms and the JSON API both use `checkNote`.
- `src/views.tsx`: the pages, as JSX components rendered to strings, and the small script for the instant filter.
- `src/client/`: client components, with their own `tsconfig.json` (browser types). `counter.tsx` is the live character counter. `clientModules` in `notes-app.ts` compiles them when the browser asks; `npm run build` compiles them once into `dist/client` for production. See `docs/framework/guides/client-modules.md`.
- `src/notes-app.ts`: `createApp(db)` (pages and forms, csrf on) and `createApi(db)` (the JSON API under `/api/notes`, chained so `testClient` is typed).
- `test/notes.test.ts`: a test for every route. It boots the whole app on a database file in a throwaway home (`createApp` of `src/app.ts` with `database`) and takes `app.root.db`. A form POST in a test needs `origin: 'http://localhost'` (csrf) and the `sid` cookie from sign up.
- Forms answer an invalid input with status 400 and the same page with the messages; a successful POST redirects with 303.
- To add a column or a table: write the next migration (`migrations/002-name.sql`), then change `notesStore`, `checkNote`, the form and the list in `views.tsx`, and the tests. Do not edit `001-notes.sql`.

## Before you ship

Read `docs/framework/getting-started/deploy.md`. In short:

- Install with `npm ci --omit=dev`, run `npm run build` (it compiles `src/client` once; with `NODE_ENV=production` only `dist/client` is served), and start with `NODE_ENV=production npm start` (`typescript` stays a runtime dependency: it compiles the `.tsx` pages at start).
- The app listens on `127.0.0.1`; set `HOST=0.0.0.0` only in a container. `PORT` chooses the port.
- Put the SQLite file outside the code folder (`NOTES_DB=/var/lib/notes/notes.sqlite`) and back it up.
- Behind an HTTPS reverse proxy set `TRUST_PROXY=1` and `PUBLIC_ORIGIN=https://your.site`, or the cookie is not `Secure` and csrf refuses form posts.
- `npm test` includes a test that starts the server and stops it with SIGTERM; keep it passing if you change `src/main.ts`.
