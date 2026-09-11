# ACRYL environment roots and clean-room isolation

How ACRYL decides which directories it reads and writes, and how to run it
against a throwaway root so a test or experiment cannot touch real user state.

## The two variables

| Variable | Owns | Default |
| --- | --- | --- |
| `ACRYL_HOME` | ACRYL's product root - everything not engine-specific | `~/.acryl` |
| `DSH_HOME` | The DSH engine's own home | `<ACRYL_HOME>/.dsh` |

Engines nest under ACRYL's root by name, so a future pi engine lives at
`<ACRYL_HOME>/.pi` and needs no new variable:

```txt
~/.acryl/            ACRYL's root
~/.acryl/.dsh/       the DSH engine home
~/.acryl/.pi/        reserved for a pi engine
```

## Precedence (highest first)

1. **`ACRYL_HOME` set** -> the DSH engine home is `<ACRYL_HOME>/.dsh`.
   `ACRYL_HOME` is the product-level root, so it **outranks `DSH_HOME`**.
2. `ACRYL_HOME` unset and `DSH_HOME` set -> that value is used directly, for
   pointing ACRYL at an existing harness home.
3. Neither -> `~/.acryl/.dsh`, never the harness's own bare `~/.dsh`.

Implementation: `acryl-harness-runtime/src/acryl-home.ts`
(`resolveAcrylHome`, `resolveAcrylDshHome`), covered by
`acryl-harness-runtime/tests/acryl-home.spec.ts`.

### Why `ACRYL_HOME` must win

`DSH_HOME` is commonly exported in a developer shell, and the DSH Desktop app
sets it too. When `DSH_HOME` outranked `ACRYL_HOME`, pinning ACRYL's root was
silently ineffective: the run read and wrote the operator's real `~/.dsh` -
credentials, sessions and all - while appearing to use the isolated path. A
cold-start or clean-room test written that way **passes without ever being
isolated**, which is worse than failing.

`ACRYL_HOME` therefore wins, and pinning it is a complete isolation switch on
its own. `DSH_HOME` still works whenever `ACRYL_HOME` is unset.

## Clean-room run

Create a throwaway root and point `ACRYL_HOME` at it. Nothing else is needed -
not even unsetting an exported `DSH_HOME`:

```sh
rm -rf .acryl-home-test && mkdir -p .acryl-home-test
ACRYL_HOME="$PWD/.acryl-home-test" corepack pnpm run acryl tui --json
```

`.acryl-home-test/` is gitignored. The `--json` probe is the cheap check: it
boots the real runtime, prints the resolved selection and exits.

## Always verify isolation, never assume it

A green exit code does not prove isolation. Confirm the two directories:

```sh
# 1. the isolated root actually got populated
ls .acryl-home-test/.dsh/profiles/

# 2. the real home was NOT touched (mtime should not move)
stat -f '%Sm %N' ~/.dsh/profiles        # macOS
stat -c '%y %n' ~/.dsh/profiles         # Linux
```

If step 1 is empty, the run used a different root - check that no other
variable won. If step 2's mtime moved, the run escaped the isolated root.

## Gotchas worth knowing

- **A change to `acryl-harness-runtime` needs a rebuild before `acryl-cli`
  sees it.** The CLI bundles the runtime's built `lib/`, and
  `acryl-cli/bin/dev-run.mjs` only rebuilds `acryl-cli` when *its* `src/`
  is stale. Run `corepack pnpm --filter acryl-harness-runtime run build`
  after editing the runtime, or the CLI keeps executing the previous build -
  which makes a correct source change look like a failure.
- **`node_modules/.pnpm` accumulates stale versions.** After a dependency
  bump, directories for the previous version remain reachable on disk (278
  `@deepseek-ai/dsh-*@0.1.1-rc.2` entries survived the `0.1.5-alpha.1`
  migration) even though `pnpm-lock.yaml` no longer references them. Confirm
  what actually resolves with the lockfile or a real import path, not with
  `ls node_modules/.pnpm`, which shows history as well as current state.
- **Two virtual-store entries for one version are normal.** They are peer
  variants (for example cordis `4.0.1` vs `4.0.2`), not a duplicate install.
