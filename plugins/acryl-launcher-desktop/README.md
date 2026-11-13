# acryl-launcher-desktop

The **ACRYL screen**: the first screen of the desktop app (and of the Web app), the Control Center design of spec 050
(`specs/050-acryl-launcher/design/control-center.html`). Every app made with ACRYL on this machine in one list, with its surface
(Web, Desktop, CLI (TUI), the last greyed out as "coming"), and New app, Add a folder, Start, Stop and Remove from list.

- **Host** (`src/index.ts`, `src/service.ts`, `src/route.ts`, `src/runner.ts`): the list is `<appInstance.home>/apps.json`
  (`acryl-launcher`, the file `acryl apps` and the terminal read). Starting an app runs `npm run dev` in its folder, making one runs
  `npx -y acryl new <name> <starter>`, both with the machine's Node and npm and the saved model key (`acryl model`). Every process it
  started stops when the plugin unloads. Routes: `/api/acryl-launcher/{state,health,add,remove,new,start,stop}`.
- **Client** (`src/client/`): one entry in the frame's `shell.overlay` seat, a full-window layer over the workspace. "ACRYL ADE" in
  its list closes it; the small ACRYL button reopens it.

Not built yet (shown disabled with "coming", or as a sentence): updates waiting, Deploy to WebBoxes.ai, Share, Open folder,
Keep and Discard for agent apps. The design, the boundaries and the reasons: spec 050, "Desktop face".
