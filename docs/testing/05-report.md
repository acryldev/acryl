# 5. Report what you found

One report per test run is enough: the checklist from the [README](README.md) with your ticks, then one short entry per problem.

## For each problem

```
What I did:        the command or prompt, exactly
What I expected:   from the guide (step number)
What happened:     what you saw; the error text; a screenshot for anything visual
How often:         every time / once / sometimes (how many tries)
Where:             OS and version, CPU, Node version (node -v, node -p process.arch), the commit you built (git log -1 --format=%h)
Logs:              the last 30 lines of the terminal; the output of `acryl doctor`
```

## Where to send it

- **Bugs and failures:** a GitHub issue in [acryldev/acryl](https://github.com/acryldev/acryl/issues), one per problem, with the entry above.
- **Questions, ideas, "this felt slow or confusing":** the [Discord](https://discord.gg/cY9KXMex69).
- **A fix you made:** a pull request from your fork on a feature branch; see [CONTRIBUTING.md](../../CONTRIBUTING.md).

## Worth reporting even when it worked

- Times: setup, build, the first answer, the plugin builds, the live app build.
- Anything you had to ask the agent twice, or explain more than once.
- Anything that looked off in a window (spacing, cut-off text, a control that did nothing).
