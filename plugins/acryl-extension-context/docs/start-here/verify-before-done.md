# Verify before you say it works

Never claim a plugin works, or state a live fiber state or inject list, from memory
or from what you just wrote. State drifts: another mount, a dispose, an edit. The
files on disk and the live Context can disagree.

## The loop

1. Write the package.
2. Verify it with the `acryl_verify_plugin` tool (absolute package path): it lints the package and imports the
   entry to check its shape. A `dependency-not-installed-yet` warning means the shape could not be checked before
   install. Read every
   finding. Each finding names the manifest doc that explains the fix: read that doc.
3. Fix the real cause and verify again. Do not silence a finding by removing the
   thing it checks (an `inject`, an effect, a lint rule).
4. Only when verification is green, deliver it (local install, or prepare for the
   marketplace).
5. After a local install, confirm the live state (`livePluginActivation.statusOf`,
   or the plugin's row and its service) instead of assuming it went live.

## The full self-modification protocol (from pi.dev's mechanism)

After the package is written: (1) `acryl_verify_plugin`; (2) `acryl_install_plugin` and read its result; (3) confirm the capability was discovered: `status: active`
in the result, and the live `acryl:installed-extensions` note or `acryl_list_plugins` shows it; (4) for a tool, command or prompt hook, USE it in a real turn
instead of assuming (call the new tool once; ask the user to type the command); (5) if the extension changes prompt or context behavior, inspect the next turn's
result instead of assuming activation worked; (6) UI: ask the user to reload and look. Say plainly which of these you did and which you could not.

## What "done" means

| You intended | Proof |
| --- | --- |
| A working plugin | its row is `ACTIVE` |
| A plugin waiting on a dependency | `PENDING`, with the missing service named |
| A service others use | a consumer goes `PENDING` to `ACTIVE` when it mounts |
| A config schema | a bad config fails the mount with the real validation error, a good one is `ACTIVE` |
| A timer or listener | its disposer runs on dispose, and a re-mount does not duplicate it |

## Failure states you will meet

- `PENDING`: an `inject` names a service nothing provides. Provide it.
- `FAILED`: `apply()` threw. Read the real error text; do not retry the same code.
- Installs but never goes live: the package `exports` lacks `./package.json`.
- Mounts, but a declared dependency is ignored: a default export was mixed with
  named `inject`/`name`.
- Duplicated behaviour after a reload: something outlived `apply()` outside
  `ctx.effect()`.
