# Troubleshooting: PENDING, FAILED, nothing visible, stale code

Read this when a plugin you installed does not behave. Diagnose from evidence, never from memory: call
`acryl_list_plugins`, read the install result, and read the actual error.

| Symptom | Meaning | Fix |
| --- | --- | --- |
| Row `PENDING` | a hard `inject` service is missing (healthy, not an error) | provide that service, or make the dependency optional with `ctx.get('x')` at call time |
| Row `FAILED` | `apply` threw, or `Config` failed validation, or the module failed to import | read the error text in the install result; fix the real cause. Config errors name the field |
| Install refused: check stage | package lint failed (bundle patch, `exports` missing `./package.json`, missing client export) | the error names the fix; `docs/extending/packaging.md` |
| Install says installed but nothing happens | the plugin registers into a service the surface lacks (`tuiCommands` on Web), or its row is disabled | check the surface in `docs/start-here/this-runtime.md`; check the row exists |
| UI change not visible | the browser still has the old page | reload the page (Web) or window (Desktop); look in the browser console for `[your-plugin]` logs and errors |
| Host code change not applied on update | Node caches the imported module | use the hot shim (`examples/packages/lifecycle-function-hot-shim/`) or ask the user to restart |
| `ERR_PACKAGE_PATH_NOT_EXPORTED` | `exports` lacks `"./package.json"` | add it |
| Named exports (`name`, `inject`, `Config`) ignored | the entry also has a default export: the loader keeps only the default | export named only |
| Second provider rejected | one provider per service name | swap, do not stack (`docs/extending/three-role-capability.md`) |
| Behavior doubles after reload | a leaked effect: something acquired outside `ctx.effect` | move every listener, timer and registration into an effect with a disposer |
| Install fails with `ERR_PNPM_PUBLIC_HOIST_PATTERN_DIFF` (different public-hoist-pattern) | the profile's `node_modules` was made by an older pnpm than the one on PATH | the install tool now pins the recorded pattern in the profile's `pnpm-workspace.yaml` and retries once. If it still fails, report the exact error to the user; do NOT run `pnpm install` in the live profile (it re-resolves the running app's dependencies) and do not edit profile config by hand without telling them |
| Verify says `dependency-not-installed-yet` | a declared dependency resolves only after install | install, then read the status |

## Where to look

1. The tool results (install, list, verify): the real error is in them.
2. The browser console for client plugins (add your own `console.info('[name] ...')` at apply).
3. The host log: on Desktop, the app log files; on Web/CLI, the process output.
4. `reference/cordis-api/fiber.md` for the exact state machine.

Rules: never claim it works without the status from a tool result; change one thing at a time; after a fix
update (re-run the install tool), do not remove and re-add unless the update is refused.
