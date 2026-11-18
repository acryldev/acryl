<p align="center">
  <img src="https://acrylblends.github.io/logo/mark.png" alt="ACRYLBLENDS" width="120">
</p>

<h1 align="center">ACRYLBLENDS</h1>

<p align="center"><strong>A framework for Cordis apps, built from ACRYL's best parts.</strong><br>
Cordis is the framework. ACRYLBLENDS gives you the plugins ACRYL proved, as code you own.</p>

<p align="center"><a href="docs/README.md">Documentation</a> · <a href="docs/getting-started.md">Getting started</a> · <a href="docs/plugins.md">Plugin library</a> · <a href="docs/agent/extending-apps.md">Extending a running app</a></p>

---

ACRYLBLENDS is a prototype of the ACRYL Blends framework: a fast experiment on which of ACRYL's features make a good base for
building agentic apps ([what it showed and what comes next](specs/013-acryl-extraction/handoff-to-blends.md)).

[Cordis](https://www.npmjs.com/package/@deepseek-ai/cordis) (the fork ACRYL runs on) already has what an app framework
needs: plugins, services, `inject`, lifecycle, effects that clean up after themselves, and events. ACRYLBLENDS adds no runtime
on top. It is a library of Cordis plugins extracted from ACRYL, and a command that copies them into your app:

- **instance**: one place decides where an app keeps its data and which port it uses
- **settings**: validated, layered, watched settings in one YAML file
- **extensions**: install, update and remove plugins while the app runs; a failed update keeps the previous version
- **builder** and **agent**: an agent that writes, installs and checks plugins in the app it runs in
- **tasks**: durable records of every run and tool call, readable after a restart
- **manifest**: the app as data (`blend.yaml`), with parameters, diagnostics and a lock
- **save**: commit the app, refusing secrets and public remotes for private apps

```sh
npx acrylblends@latest init my-app -y
cd my-app && npm install && npm run dev      # the app in the ACRYL frame: chat, agents, branches, versions, Settings
npm run desktop                               # the same in its own window
```

`--bare` makes the plain app without the frame.

Generated apps are TypeScript, run by Node 22.19 or newer with no build step, tested with `node:test`, and depend at run
time on `@deepseek-ai/cordis` and `yaml`.

## Repository

| Path | What |
|---|---|
| `plugins/` | the plugin library: each plugin's source, `plugin.json` and tests |
| `packages/cli` | the `acrylblends` command (`init`, `add`, `plugins`) and the `blank` and `agent` templates |
| `scripts/verify-scaffolder.mjs` | scaffolds both templates, installs, type-checks, tests, boots them, drives the agent, saves |
| `docs/` | the documentation; its examples are executed by the tests |
| `specs/` | specs and ledgers ([roadmap](specs/000-roadmap/spec.md), [013](specs/013-acryl-extraction/spec.md)) |

`pnpm run verify:model` (opt-in, needs `ACRYLBLENDS_MODEL_URL`, `ACRYLBLENDS_MODEL` and a key) proves the agent builds a plugin with a real model.
`pnpm run check` runs lint, build, both type checks, the tests and the scaffolder verification. A Deno version of the
runtime lives on the branch `012-deno-runtime-experiment`.

## License

MIT
