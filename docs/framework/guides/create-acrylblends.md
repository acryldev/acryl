# create-acrylblends

`create-acrylblends` is the project initializer that runs when you run `npm create acrylblends@latest`, `npx create-acrylblends@latest`, `pnpm create acrylblends@latest`,
`yarn create acrylblends` or `bun create acrylblends@latest`. It creates a folder with a working Acryl application for the runtime you choose.

## Templates

| Template | What you get |
| --- | --- |
| `nodejs` | an Acryl application served with `serve()` from `acrylblends/node-server`; run with Node.js 22.19 or newer |
| `notes` | a full-stack starter: accounts (scrypt, cookie session), notes in SQLite through the [`db` port](data.md) with numbered migrations, validated forms, search, a JSON API with a typed test client, csrf, a test for every route, a client-component counter |
| `chat` | an AI chat starter: the answer streams token by token from an OpenAI-compatible API (DeepSeek by default, key only from `DEEPSEEK_API_KEY`), a client component with a Stop button that also stops the request to the model, history in SQLite through the [`db` port](data.md), tests with a mock model |
| `bun` (experimental) | an Acryl application with `export default app`, run with `bun` |
| `acryl-app` | a Cordis app built from plugins, with an agent that can extend it while it runs (the same app `npx acrylblends init --template agent` creates) |

Every template includes `AGENTS.md` and `CLAUDE.md` (which imports `AGENTS.md`) and a copy of these docs in `docs/framework/`, so a coding agent working in the folder reads the
API from the folder.

## Passing arguments

When you use `npm create` (or `npx`), arguments meant for the initializer must be placed **after** `--`. Anything after `--` is forwarded to the initializer.

**npm**

```sh
npm create acrylblends@latest my-app -- --template nodejs
```

**yarn**

```sh
yarn create acrylblends my-app --template nodejs
```

**pnpm**

```sh
pnpm create acrylblends@latest my-app --template nodejs
```

**bun**

```sh
bun create acrylblends@latest my-app --template nodejs
```

## Arguments

| Argument | Description | Example |
| :-- | :-- | :-- |
| `[directory]` | The folder to create. It must not exist or must be empty. Asked for when it is missing. | `my-app` |
| `[source]` | A template from outside the package: `github:owner/repo[#ref]`, `@scope/name[@version]` or a packed `.tgz` file. See [Templates from a repository or a package](#templates-from-a-repository-or-a-package). | `github:acme/starter` |
| `--template <template>` | One of `nodejs`, `notes`, `chat`, `bun` (experimental), `acryl-app`. Skips the template question. | `--template bun` |
| `--install` | Install the dependencies with the package manager after creating the project. For a template from a source, the install scripts it will run are listed first. | `--install` |
| `--pm <packageManager>` | The package manager for `--install`: `npm`, `pnpm`, `yarn` or `bun`. Defaults to the one that started the initializer. | `--pm pnpm` |
| `--yes`, `-y` | Ask nothing: use `nodejs` unless `--template` is given, and the directory `acryl-app`. | `-y` |
| `--help` | Print the arguments. | `--help` |

The templates are inside the package, so creating a project needs no network except for `--install`.

## Templates from a repository or a package

A second argument after the directory makes the app from someone else's template:

```sh
npm create acrylblends@latest my-app github:acme/starter          # a GitHub repository (the default branch)
npm create acrylblends@latest my-app github:acme/starter#v1.2      # a tag, branch or commit
npm create acrylblends@latest my-app @acme/starter                 # an npm package
npm create acrylblends@latest my-app ./acme-starter-1.0.0.tgz      # a packed template on disk
```

A template is a folder (a repository, or an npm package) with an `acryl.template.json` at its top:

```json
{
  "name": "starter",
  "description": "What the app is",
  "plugins": ["desktop"]
}
```

`name` and `description` are required and shown when the app is created. `plugins` is optional: library plugins the template needs, which the command lists with the `acrylblends add` line that adds them. A source without the file is refused with a message.

What the command does, in order:

1. **Fetches without running anything.** A GitHub source is downloaded as a tarball (never cloned, so no git hook can run). An npm source is fetched with `npm pack --ignore-scripts`. The archive is unpacked into a scratch folder; one with a path that leaves its folder, a symbolic link, more than 5,000 files or more than 50 MB is refused.
2. **Reads `acryl.template.json`** and refuses the source if it is missing or malformed.
3. **Fills the template in.** `__APP_NAME__`, `__PACKAGE__`, `__CLASS__` and `__RANGE__` in text files are replaced as in the built-in templates, `package.json` gets the app's name, a dependency on `acrylblends` is set to the release this command carries, a `gitignore` file becomes `.gitignore` (npm does not publish a `.gitignore`), `docs/framework/` is added, and so are `AGENTS.md` and `CLAUDE.md` when the template has none of its own.
4. **Looks for secrets.** The result is checked with the secret scan the save step of Blend apps uses; a template that holds a key or a password is refused, and the file and line are named (never the value).
5. **Creates the folder** only if all of that passed.

Nothing of the template is installed or run. If its `package.json` defines `preinstall`, `install`, `postinstall` or `prepare`, the command says so and prints them: `npm install` would run them. Read them first. With `--install` the command prints the list of what will be installed and which scripts will run, then runs the install.

To publish your own: put `acryl.template.json` in the repository or package, name the files with the placeholders above, keep a file named `gitignore` instead of `.gitignore`, and keep secrets out.

## Example flows

### Interactive

```sh
npm create acrylblends@latest my-app
```

This asks which template you want.

### Non-interactive

```sh
npm create acrylblends@latest my-app -- --template nodejs --pm npm --install
```

This creates `my-app` from the `nodejs` template and installs its dependencies with npm.

## Troubleshooting

- If an argument is not recognized, make sure you forward it with `--` when you use `npm create` or `npx`.
- Run `npm create acrylblends@latest -- --help` to see the arguments of the version you have.
