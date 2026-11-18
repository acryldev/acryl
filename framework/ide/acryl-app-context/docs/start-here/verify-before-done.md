# Verify before done

Do not tell the person a feature works until these three agree. Each one catches what the others cannot.

1. **`npm test`** composes the app from `blend.yaml` the way the frame does and runs every test in `test/`, yours included
   (`test/<name>.test.ts`, see [the feature plugin](../extending/feature-plugin.md)). A plugin that does not load, a row that names a missing
   folder, a route that answers wrong: it fails here with the file and the line.
2. **`npm run check`** type-checks `src/`, `test/` and `plugins/`. A wrong import path or a value of the wrong type fails here.
3. **`.acryl/bin/acryl look`** reads the page in the canvas as the person sees it. Your widget's heading and content must be in it. If the page
   still shows the old content, the frame did not take the change: read the error from step 1 or 2, fix it, and look again. To try the
   feature, act on it (`.acryl/bin/acryl act click --ref <ref>`, `act type --ref <ref> --text "..." --submit`) and look again.

Then tell the person what you built, where it is on the page, and that it is the plugin `<name>`, which Settings > Plugins can switch off.

## When a check fails

Read the first error completely; it names the file and the line. Change one thing, run the check again. Do not edit the test to make it pass,
and do not move the feature into `src/` to get around an error: the cause is in the plugin. [Troubleshooting](troubleshooting.md) lists the
errors this app gives and their causes. If the same cause survives two fixes, stop and tell the person what you observed.
