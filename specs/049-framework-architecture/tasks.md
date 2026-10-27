# Tasks: the framework's own architecture (spec 049)

**Feature**: `specs/049-framework-architecture/` | **Input**: [spec.md](./spec.md), [plan.md](./plan.md)

**Conventions**
- Tickets found while building a slice, recorded where the slice's decisions live. Each names who found it, when, and the owner's or
  the coordinator's decision on it.
- The acceptance criterion of a ticket is the test or check it names; it is done when that passes on `main`.

## Open

- [ ] T001 [found 2026-10-27, slice 17 commit A, AcrylImplementer; coordinator: yes, low priority, after M6] Live activation of an
  `acrylblends` module. An app plugin installed into a running app that declares an `acrylblends/cordis/...` module in
  `dsh.requiresAcrylPackages` gets it linked into the profile, and it is used when its row is already mounted. When it is not, the live
  install path of `acryl-plugin-context` (`materializeRequiredAcrylPackages` in `plugins/acryl-plugin-context/lib/install.js`) refuses
  with what to do, and the module mounts at the next start: an `acrylblends` module is not a DSH bundle, so `ensureProfileBundle` and
  `live.activate` do not apply to it. The refusal and the restart are fine until this ticket.
  Wanted: the running app inserts and activates the module's row (id and name the module, package `acrylblends`) through the Loader,
  with the same reload and rollback the bundle path has.
  Done when: a test installs, into a running app, a plugin that requires `acrylblends/cordis/state` while no row for it is mounted, and
  the plugin's `ctx.state` works without a restart; a second install of a plugin requiring it adds no second row; uninstalling both
  leaves the row as it was before.

- [ ] T002 [found 2026-10-27, slice 17 DSH door live check, AcrylImplementer; coordinator: yes] `acryl control list` does not see an
  app started with an explicit home. The running-app registry (`announce` in
  `runtime/acryl-harness-runtime/src/instance/registry.ts`, `~/.acryl-instances/.running`) is written only by the managed launcher
  (`scripts/lib/instances.mjs`). An app started as `node apps/acryl-web/lib/bin.js` or Desktop's `launch-dev.mjs` with `ACRYL_HOME` set,
  which is how `scripts/live-run.mjs` starts every isolated run, writes nothing, so `acryl control list|snapshot|click` answers "no ACRYL
  app is running". The door live check had to call `POST /api/acryl-agent-control/online/call` with the secret read from
  `<home>/agent-control-secret`.
  Wanted: every app instance announces itself when its Host starts and withdraws on disposal, whichever launcher started it, in the
  OS home the instance module resolves (the isolated HOME for a live run), so the door check runs through `acryl control` alone.
  Done when: a live run of Web and of Desktop, each through `scripts/live-run.mjs` with `acryl-agent-control`'s `online` on, answers
  `HOME=<run home> acryl control list` with its instance, and `acryl control snapshot` and `acryl control click --ref ...` reach the
  page; after the run stops the list is empty and the real `~/.acryl-instances` is unchanged.
