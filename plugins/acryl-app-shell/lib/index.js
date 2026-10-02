//#region src/index.ts
/**
* Host side of the app shell. There is nothing for the Host to own: the shell is pure client-side layout
* (a three-column frame, slot composition, theme presentation) - no PTY, no routes, no server state. This
* plugin exists only so the Loader row has a real Host module to activate/dispose, matching every other
* package's shape; the client-only work lives entirely in `./client`.
*/
/** Stable Cordis plugin name. */
const name = "acryl-app-shell";
/** No Host-side resources to acquire. */
function apply() {}
//#endregion
export { apply, name };

//# sourceMappingURL=index.js.map