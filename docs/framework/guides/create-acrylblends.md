# create-acrylblends

`create-acrylblends` is the project initializer that runs when you run `npm create acrylblends@latest`, `npx create-acrylblends@latest`, `pnpm create acrylblends@latest`,
`yarn create acrylblends` or `bun create acrylblends@latest`. It creates a folder with a working Acryl application for the runtime you choose.

## Templates

| Template | What you get |
| --- | --- |
| `nodejs` | an Acryl application served with `serve()` from `acrylblends/node-server`; run with Node.js 22.19 or newer |
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
| `--template <template>` | One of `nodejs`, `bun` (experimental), `acryl-app`. Skips the template question. | `--template bun` |
| `--install` | Install the dependencies with the package manager after creating the project. | `--install` |
| `--pm <packageManager>` | The package manager for `--install`: `npm`, `pnpm`, `yarn` or `bun`. Defaults to the one that started the initializer. | `--pm pnpm` |
| `--yes`, `-y` | Ask nothing: use `nodejs` unless `--template` is given, and the directory `acryl-app`. | `-y` |
| `--help` | Print the arguments. | `--help` |

The templates are inside the package, so creating a project needs no network except for `--install`.

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
