import { createRequire } from "node:module";
import { PluginLifecycleError } from "acryl-harness-runtime";
import { readFileSync } from "node:fs";
//#region src/architecture/inspector.ts
const MAX_FIBERS = 2048;
const MAX_SERVICES = 4096;
const MAX_EFFECTS_PER_FIBER = 512;
const MAX_EFFECT_DEPTH = 12;
const MAX_LABEL_LENGTH = 512;
const FIBER_PHASE = {
	0: "pending",
	1: "loading",
	2: "active",
	3: "failed",
	4: null,
	5: "unloading"
};
function phaseOf(fiber) {
	return FIBER_PHASE[fiber.state] ?? "pending";
}
function effectView(meta, depth, budget) {
	if (depth > MAX_EFFECT_DEPTH) throw new Error("Cordis effect tree exceeds the inspection depth limit");
	if (--budget.remaining < 0) throw new Error("Cordis Fiber exceeds the inspection effect limit");
	if (typeof meta.label !== "string" || meta.label.length > MAX_LABEL_LENGTH) throw new Error("Cordis effect label exceeds the inspection limit");
	return Object.freeze({
		label: meta.label,
		children: Object.freeze(meta.children.map((child) => effectView(child, depth + 1, budget)))
	});
}
function liveServices(ctx) {
	const store = ctx.root.reflect.store;
	return Object.getOwnPropertySymbols(store).map((key) => store[key]).filter((impl) => impl !== void 0 && impl.fiber.uid !== null);
}
function fibers(ctx) {
	const found = /* @__PURE__ */ new Set([ctx.root.fiber]);
	for (const runtime of ctx.root.registry.values()) for (const fiber of runtime.fibers) if (fiber.uid !== null) found.add(fiber);
	const result = [...found].sort((left, right) => (left.uid ?? 0) - (right.uid ?? 0));
	if (result.length > MAX_FIBERS) throw new Error("Cordis context exceeds the inspection Fiber limit");
	return result;
}
function dependencyView(fiber, name) {
	const resolved = fiber.store?.[name];
	if (resolved !== void 0 && resolved.fiber.uid !== null) return Object.freeze({
		name,
		status: "resolved",
		providerFiberUid: resolved.fiber.uid
	});
	return Object.freeze({
		name,
		status: fiber.ctx.get(name) === void 0 ? "missing" : "available",
		providerFiberUid: null
	});
}
function moduleName(fiber) {
	return fiber.entry?.options.name ?? null;
}
/** Inspect one Cordis context without caching or inventing cross-plane identity. */
function inspectCordisContext(ctx, plane) {
	const allFibers = fibers(ctx);
	const services = liveServices(ctx);
	if (services.length > MAX_SERVICES) throw new Error("Cordis context exceeds the inspection service limit");
	const servicesByFiber = /* @__PURE__ */ new Map();
	for (const impl of services) {
		const names = servicesByFiber.get(impl.fiber) ?? [];
		names.push(impl.name);
		servicesByFiber.set(impl.fiber, names);
	}
	const loader = ctx.get("loader");
	const fiberViews = allFibers.map((fiber) => {
		const parent = fiber.parent.fiber;
		const budget = { remaining: MAX_EFFECTS_PER_FIBER };
		return Object.freeze({
			uid: fiber.uid ?? 0,
			name: fiber.name,
			phase: phaseOf(fiber),
			parentUid: parent === fiber ? null : parent.uid,
			loaderEntryId: loader?.locate(fiber) ?? null,
			moduleName: moduleName(fiber),
			dependencies: Object.freeze(Object.keys(fiber.inject).sort().map((name) => dependencyView(fiber, name))),
			providedServices: Object.freeze([...servicesByFiber.get(fiber) ?? []].sort()),
			effects: Object.freeze(fiber.getEffects().map((meta) => effectView(meta, 0, budget)))
		});
	});
	const serviceViews = services.map((impl) => Object.freeze({
		name: impl.name,
		providerFiberUid: impl.fiber.uid ?? 0,
		providerName: impl.fiber.name,
		providerPhase: phaseOf(impl.fiber)
	})).sort((left, right) => left.name.localeCompare(right.name) || left.providerFiberUid - right.providerFiberUid);
	return Object.freeze({
		plane,
		fibers: Object.freeze(fiberViews),
		services: Object.freeze(serviceViews)
	});
}
//#endregion
//#region src/architecture/contract.ts
const PLUGIN_ARCHITECTURE_PATH = "/api/acryl-plugin-admin/architecture";
//#endregion
//#region src/http.ts
const MAX_BODY_BYTES = 16 * 1024;
var BodyTooLargeError = class extends Error {};
function finishJson(res, statusCode, value, allow) {
	res.statusCode = statusCode;
	res.setHeader("cache-control", "no-store");
	res.setHeader("content-type", "application/json; charset=utf-8");
	res.setHeader("x-content-type-options", "nosniff");
	if (allow !== void 0) res.setHeader("allow", allow);
	res.end(JSON.stringify(value));
}
function error(message) {
	return { error: message };
}
function isLoopbackHostname(hostname) {
	return hostname === "127.0.0.1" || hostname === "[::1]";
}
function isLoopbackAddress(address) {
	if (address === void 0) return false;
	if (address === "::1" || address === "127.0.0.1") return true;
	if (address.startsWith("::ffff:")) return address.slice(7).startsWith("127.");
	return address.startsWith("127.");
}
function expectedLoopbackOrigin(expectedOrigin) {
	try {
		const url = new URL(expectedOrigin);
		if (url.origin !== expectedOrigin || url.protocol !== "http:" || url.username !== "" || url.password !== "" || !isLoopbackHostname(url.hostname)) return void 0;
		return url;
	} catch {
		return;
	}
}
function exactHeaderOrigin(value) {
	if (value === void 0) return void 0;
	try {
		return new URL(value).origin === value ? value : void 0;
	} catch {
		return;
	}
}
function referrerOrigin(value) {
	if (value === void 0) return void 0;
	try {
		return new URL(value).origin;
	} catch {
		return;
	}
}
/**
* Require the actual socket and Host to stay on the configured loopback origin.
* A mutating request must carry the exact Origin. A read-only browser GET may
* use the standard same-origin fetch metadata plus its same-origin referrer,
* because browsers commonly omit Origin on same-origin GET requests.
*/
function isSameOriginLoopbackRequest(req, expectedOrigin, mutating) {
	const expected = expectedLoopbackOrigin(expectedOrigin);
	if (expected === void 0 || !isLoopbackAddress(req.socket.remoteAddress)) return false;
	if (req.headers.host?.toLowerCase() !== expected.host.toLowerCase()) return false;
	if (exactHeaderOrigin(req.headers.origin) === expected.origin) return req.headers["sec-fetch-site"] === void 0 || req.headers["sec-fetch-site"] === "same-origin";
	if (mutating) return false;
	return req.headers["sec-fetch-site"] === "same-origin" && referrerOrigin(req.headers.referer) === expected.origin;
}
function isJsonRequest(req) {
	return req.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase() === "application/json";
}
async function readJson(req) {
	const declaredLength = req.headers["content-length"];
	if (declaredLength !== void 0) {
		if (!/^\d+$/.test(declaredLength)) throw new SyntaxError("invalid content length");
		if (Number(declaredLength) > MAX_BODY_BYTES) throw new BodyTooLargeError();
	}
	let size = 0;
	const chunks = [];
	for await (const chunk of req) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		size += buffer.byteLength;
		if (size > MAX_BODY_BYTES) throw new BodyTooLargeError();
		chunks.push(buffer);
	}
	return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
async function parsePostBody(req, res) {
	if (!isJsonRequest(req)) {
		finishJson(res, 415, error("content type must be application/json"));
		return INVALID_BODY;
	}
	try {
		return await readJson(req);
	} catch (cause) {
		const tooLarge = cause instanceof BodyTooLargeError;
		finishJson(res, tooLarge ? 413 : 400, error(tooLarge ? "request body is too large" : "invalid JSON request"));
		return INVALID_BODY;
	}
}
const INVALID_BODY = Symbol("invalid body");
//#endregion
//#region src/architecture/route.ts
async function handlePluginArchitectureSnapshotRequest(req, res, expectedOrigin, controller, reportError = () => {}) {
	if (req.method !== "GET") return finishJson(res, 405, error("method not allowed"), "GET");
	if (!isSameOriginLoopbackRequest(req, expectedOrigin, false)) return finishJson(res, 403, error("forbidden"));
	try {
		finishJson(res, 200, controller.snapshot());
	} catch (cause) {
		reportError("read Cordis architecture", cause);
		finishJson(res, 500, error("Cordis architecture unavailable"));
	}
}
//#endregion
//#region src/lifecycle/contract.ts
/** Renderer-safe contract for plugin lifecycle inspection and control. */
const PLUGIN_LIFECYCLE_PATH = "/api/acryl-plugin-admin/lifecycle";
const PLUGIN_LIFECYCLE_ENABLE_PATH = "/api/acryl-plugin-admin/lifecycle/enable";
const PLUGIN_LIFECYCLE_DISABLE_PATH = "/api/acryl-plugin-admin/lifecycle/disable";
const PLUGIN_LIFECYCLE_RELOAD_PATH = "/api/acryl-plugin-admin/lifecycle/reload";
//#endregion
//#region src/lifecycle/route.ts
const MAX_ENTRY_ID_LENGTH = 512;
function publicLifecycleError(cause) {
	if (!(cause instanceof PluginLifecycleError)) return "Plugin lifecycle operation failed.";
	switch (cause.code) {
		case "unknown-entry": return "The selected plugin no longer exists.";
		case "protected-entry": return "The selected plugin is a core capability and cannot be toggled.";
		case "already-enabled": return "The selected plugin is already enabled.";
		case "already-disabled": return "The selected plugin is already disabled.";
		case "not-mounted": return "The selected plugin is not mounted.";
		case "persistence-failed": return "The plugin change could not be saved.";
		case "lifecycle-failed": return "The plugin lifecycle transition failed.";
	}
}
function parseEntryRequest(value) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return void 0;
	const record = value;
	if (Object.keys(record).length !== 1 || typeof record.entryId !== "string" || record.entryId.length === 0 || record.entryId.length > MAX_ENTRY_ID_LENGTH) return void 0;
	return { entryId: record.entryId };
}
function parseReloadRequest(value) {
	if (value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) return null;
	return parseEntryRequest(value);
}
/** Serve a current Host and Client-graph lifecycle snapshot. */
async function handlePluginLifecycleSnapshotRequest(req, res, expectedOrigin, controller, reportError = () => {}) {
	if (req.method !== "GET") return finishJson(res, 405, error("method not allowed"), "GET");
	if (!isSameOriginLoopbackRequest(req, expectedOrigin, false)) return finishJson(res, 403, error("forbidden"));
	try {
		finishJson(res, 200, controller.snapshot());
	} catch (cause) {
		reportError("read plugin lifecycle", cause);
		finishJson(res, 500, error("plugin lifecycle unavailable"));
	}
}
async function entryAction(req, res, expectedOrigin, controller, action, reportError) {
	if (req.method !== "POST") return finishJson(res, 405, error("method not allowed"), "POST");
	if (!isSameOriginLoopbackRequest(req, expectedOrigin, true)) return finishJson(res, 403, error("forbidden"));
	const value = await parsePostBody(req, res);
	if (value === INVALID_BODY) return;
	const request = parseEntryRequest(value);
	if (request === void 0) return finishJson(res, 400, error(`invalid plugin ${action} request`));
	let receipt;
	try {
		receipt = await controller.setEnabled(request.entryId, action === "enable");
	} catch (cause) {
		reportError(`${action} plugin`, cause);
		finishJson(res, 409, error(publicLifecycleError(cause)));
		return;
	}
	finishJson(res, 200, receipt);
}
function handlePluginLifecycleEnableRequest(req, res, expectedOrigin, controller, reportError = () => {}) {
	return entryAction(req, res, expectedOrigin, controller, "enable", reportError);
}
function handlePluginLifecycleDisableRequest(req, res, expectedOrigin, controller, reportError = () => {}) {
	return entryAction(req, res, expectedOrigin, controller, "disable", reportError);
}
/** Reload one managed entry or every mounted managed entry. */
async function handlePluginLifecycleReloadRequest(req, res, expectedOrigin, controller, reportError = () => {}) {
	if (req.method !== "POST") return finishJson(res, 405, error("method not allowed"), "POST");
	if (!isSameOriginLoopbackRequest(req, expectedOrigin, true)) return finishJson(res, 403, error("forbidden"));
	const value = await parsePostBody(req, res);
	if (value === INVALID_BODY) return;
	const request = parseReloadRequest(value);
	if (request === void 0) return finishJson(res, 400, error("invalid plugin reload request"));
	let receipt;
	try {
		receipt = await controller.reload(request?.entryId);
	} catch (cause) {
		reportError("reload plugin", cause);
		finishJson(res, 409, error(publicLifecycleError(cause)));
		return;
	}
	finishJson(res, 200, receipt);
}
//#endregion
//#region src/lifecycle/view.ts
/**
* The renderer-facing view of the shared plugin lifecycle.
*
* The lifecycle itself (resolution, dependent cascade, transactions, rollback, Fiber restart, persistence)
* is the one controller behind `ctx.acrPluginLifecycle` that every surface publishes. This adds only what
* the Settings tab needs on top: whether each entry also has a browser face and whether that face is in the
* page's boot graph, the Blend identity of the running composition when the surface has one, and the fact
* that a mutation needs the page to reload to re-compose its client graph.
*/
function isRecord(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
function declaresClientFace(manifest, moduleName) {
	if (manifest.name !== moduleName || !isRecord(manifest.dsh)) return false;
	const client = manifest.dsh.client;
	if (!isRecord(client) || client.platform !== "web") return false;
	if (!isRecord(manifest.exports)) return false;
	return Object.prototype.hasOwnProperty.call(manifest.exports, "./client");
}
var PluginLifecycleView = class {
	ctx;
	lifecycle;
	blend;
	clientFaces = /* @__PURE__ */ new Map();
	resolvePackageJson;
	/**
	* @param ctx - the Host context, read for the client module graph and the base URL packages resolve from.
	* @param lifecycle - the surface's `ctx.acrPluginLifecycle` authority.
	* @param blend - reads the composed Blend, or `undefined` on a surface without one.
	*/
	constructor(ctx, lifecycle, blend = () => void 0) {
		this.ctx = ctx;
		this.lifecycle = lifecycle;
		this.blend = blend;
		const require = ctx.baseUrl === void 0 ? void 0 : createRequire(ctx.baseUrl);
		this.resolvePackageJson = require === void 0 ? void 0 : (specifier) => require.resolve(`${specifier}/package.json`);
	}
	/** Every non-group Host entry with its current client-graph membership. */
	snapshot() {
		const graph = this.ctx.get("clientModules")?.graph();
		const clientGraph = new Set(graph?.entries.map((entry) => entry.id) ?? []);
		const entries = this.lifecycle.snapshot().entries.map((entry) => {
			const clientPackage = this.clientPackage(entry.moduleName, clientGraph);
			return Object.freeze({
				...entry,
				clientPackage,
				clientInBootGraph: clientPackage !== null && clientGraph.has(clientPackage)
			});
		});
		return Object.freeze({
			entries: Object.freeze(entries),
			blend: this.blendView()
		});
	}
	/** Persist and apply one managed entry's enablement, dependents included. */
	async setEnabled(entryId, enabled) {
		return this.receipt(await this.lifecycle.setEnabled(entryId, enabled));
	}
	/** Restart one entry, or every enabled entry the surface's lifecycle sweeps. */
	async reload(entryId) {
		return this.receipt(await this.lifecycle.reload(entryId));
	}
	blendView() {
		const blend = this.blend();
		if (blend === void 0) return null;
		return Object.freeze({
			id: blend.origin.id,
			kind: blend.origin.kind,
			version: blend.origin.version,
			digest: blend.origin.digest,
			lockPath: blend.lockPath,
			rows: blend.rows.length
		});
	}
	clientPackage(moduleName, graph) {
		if (graph.has(moduleName)) return moduleName;
		const cached = this.clientFaces.get(moduleName);
		if (cached !== void 0) return cached ? moduleName : null;
		let declared = false;
		if (!moduleName.startsWith("cordis:") && this.resolvePackageJson !== void 0) try {
			declared = declaresClientFace(JSON.parse(readFileSync(this.resolvePackageJson(moduleName), "utf8")), moduleName);
		} catch {
			declared = false;
		}
		this.clientFaces.set(moduleName, declared);
		return declared ? moduleName : null;
	}
	/** The Host fiber already restarted; the page must reload to re-compose its client graph. */
	receipt(receipt) {
		return Object.freeze({
			...receipt,
			rendererReloadRequired: true,
			snapshot: this.snapshot()
		});
	}
};
//#endregion
//#region src/index.ts
const name = "acryl-plugin-admin";
const inject = ["webServer"];
/** The origin the routes accept requests from: the page is served by this same web server. */
function rendererOrigin(ctx) {
	return `http://127.0.0.1:${String(ctx.webServer.port)}`;
}
function reporter(ctx) {
	return (operation, cause) => {
		ctx.logger.error(`acryl-plugin-admin: failed to ${operation}: ${cause instanceof Error ? cause.message : String(cause)}`);
	};
}
function apply(ctx) {
	const origin = rendererOrigin(ctx);
	const reportHostError = reporter(ctx);
	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: PLUGIN_ARCHITECTURE_PATH,
		handler: (req, res) => handlePluginArchitectureSnapshotRequest(req, res, origin, { snapshot: () => inspectCordisContext(ctx, "host") }, reportHostError)
	}), "acryl-plugin-admin: Cordis architecture route");
	ctx.plugin({
		name: "acryl-plugin-admin-lifecycle",
		inject: ["webServer", "acrPluginLifecycle"],
		apply(child) {
			const view = new PluginLifecycleView(child, child.acrPluginLifecycle, () => child.get("desktopPluginLifecycleBootstrap")?.blend);
			const routes = [
				[PLUGIN_LIFECYCLE_PATH, handlePluginLifecycleSnapshotRequest],
				[PLUGIN_LIFECYCLE_ENABLE_PATH, handlePluginLifecycleEnableRequest],
				[PLUGIN_LIFECYCLE_DISABLE_PATH, handlePluginLifecycleDisableRequest],
				[PLUGIN_LIFECYCLE_RELOAD_PATH, handlePluginLifecycleReloadRequest]
			];
			for (const [path, handler] of routes) child.effect(() => child.webServer.register({
				kind: "exact",
				path,
				handler: (req, res) => handler(req, res, origin, view, reportHostError)
			}), `acryl-plugin-admin: plugin lifecycle route ${path}`);
		}
	});
}
//#endregion
export { PluginLifecycleView, apply, inject, name };

//# sourceMappingURL=index.js.map