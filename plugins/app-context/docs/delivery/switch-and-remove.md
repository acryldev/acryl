# Switch a plugin off, change it, remove it

## Off and on

Settings > Plugins lists every plugin of the app: the app's own (made here, with who made it and when) and the library rows. Its switch writes
`disabled: true` into the plugin's row in `blend.yaml` (or takes it out), and the frame reloads the app: the plugin's routes and widget are gone
while it is off, and back when it is on. To do the same yourself, edit the row:

```yaml
    - id: notes
      disabled: true
      name: notes
```

A plugin's data stays in its file while it is off.

## Change

Read every file of the plugin first. Edit its folder (`plugins/<name>/`): the frame reloads it after the change. Then
[verify before done](../start-here/verify-before-done.md) again. Do not copy the plugin under a new name to change it; a new name is a new
plugin with a new row.

## Remove

Ask the person first unless they clearly asked for it. Remove the plugin's row from `blend.yaml` and its folder from `plugins/`, and its test
from `test/`. Its data file in `.acrylblends/` is left alone unless the person asks. Check with `npm test` and `look` that it is gone.

Only switch off or remove what the person named. If they want it hidden for now, switching it off keeps everything.
