# create-acrylblends

Create an Acryl app with one command.

```sh
npm create acrylblends@latest my-app
```

It asks which template you want, creates `my-app`, and prints what to run next. Other package managers work the same way: `pnpm create acrylblends@latest`, `yarn create acrylblends`, `bun create acrylblends@latest`.

## Templates

Every template is a Cordis app: `blend.yaml` lists the plugins that are mounted and every plugin is a folder in `plugins/`.

| Template | What you get |
| --- | --- |
| `blank` | the smallest app: the router, a server and one route, with a test |
| `nodejs` | a web app: routes, a server-rendered JSX page and a client component, with tests; run with Node.js 22.19 or newer |
| `notes` | a full-stack starter: accounts (scrypt, cookie session), notes in SQLite through the `db` port, validated forms, search, a JSON API with a typed test client, csrf on, a test for every route |
| `chat` | an AI chat starter: the answer streams token by token (Server-Sent Events) from an OpenAI-compatible API (DeepSeek by default, key only from `DEEPSEEK_API_KEY`), a client component with a Stop button that also stops the request to the model, history in SQLite, tests with a mock model |
| `todo` | a to-do list on the router and state: CRUD routes, a page, tests |
| `agent` | the blank app with an offline agent that builds plugins into the running app, through the door (`acryl-app` is the old name for it and still works) |

Every template includes `AGENTS.md`, `CLAUDE.md` and a copy of the framework documentation in `docs/framework/`, so a coding agent working in the folder reads the API from the folder.

## Non-interactive use

Arguments for the initializer go after `--` with `npm create`:

```sh
npm create acrylblends@latest my-app -- --template nodejs --install --pm npm
```

| Option | |
| --- | --- |
| `--template <name>` | `blank`, `nodejs`, `notes`, `chat`, `todo` or `agent` (the same list as `acrylblends init`; `acryl-app` still means `agent`; a bare name after the directory means the same: `npm create acrylblends@latest my-app notes`) |
| `--desktop` | put the app inside the ACRYL frame: `npm run dev` opens it with the chat, the panels and Settings. Not with a starter from a source |
| `--install` | install the dependencies after creating the app |
| `--pm <manager>` | `npm`, `pnpm`, `yarn` or `bun` (default: the one that ran the command) |
| `-y`, `--yes` | ask nothing: template `nodejs`, directory `acrylblends-app` unless given |

## Then

```sh
cd my-app
npm install     # unless you passed --install
npm run dev     # prints its URL; GET / answers "Acryl!"
npm test
```

```ts
import { Acryl } from 'acrylblends'

const app = new Acryl()
app.get('/', (c) => c.text('Acryl!'))

export default app
```

## Links

- Documentation: https://acrylblends.github.io/docs (mirrored at https://acryl.dev/docs)
- The framework package: https://www.npmjs.com/package/acrylblends
- Source and issues: https://github.com/acrylblends/acrylblends
- Blends registry: https://acrylblends.github.io/blends
- ACRYL: https://acryl.dev

MIT license.

## The `notes` template

`npm create acrylblends@latest my-notes -- --template notes` makes a small full-stack app, written to be read and copied:

- sign up and log in (scrypt password hashes from `node:crypto`, a random token in an `httpOnly` cookie, sessions in the database);
- notes in SQLite through the built-in `node:sqlite` (Node.js 22.19 or later, nothing native to install), with create, edit, delete and search forms, server-side validation with messages on the page, and a redirect (303) after each POST;
- a JSON API under `/api/notes` that shares the validation rules, with a test that uses the typed `testClient`;
- csrf protection on, a test for every route, and an `AGENTS.md` that describes the files so a coding agent can extend it;
- a live character counter and an instant filter written as a small script in the page. When the client components of `acrylblends/jsx/dom` can be served without a bundler (planned for 0.7.2), they will replace that script here.

`npx acrylblends add desktop` followed by `npm install` and `npm run desktop` runs it as a desktop window (see `docs/framework/getting-started/desktop.md`).

## Templates from a repository or a package

```sh
npm create acrylblends@latest my-app github:owner/repo[#ref]
npm create acrylblends@latest my-app @scope/name[@version]
npm create acrylblends@latest my-app ./template.tgz
```

The source is downloaded as a tarball (never cloned) or packed with `npm pack --ignore-scripts`, unpacked, and read: it must hold an `acryl.template.json` (`name`, `description`, optional `plugins`), it is checked for secrets, and only then is the folder created. Nothing of the template is installed or run; if its `package.json` defines install scripts they are listed, and `--install` prints what will run before it runs. See the create-acrylblends guide in `docs/framework/guides/`.
