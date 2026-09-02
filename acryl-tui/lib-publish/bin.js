#!/usr/bin/env node
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { existsSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { BlockAssembler, createUserMessage } from "@deepseek-ai/dsh-llm";
import { SessionId } from "@deepseek-ai/dsh-session";
import { DEFAULT_PROFILE_BUNDLES, boot, composeEntries, healProfilesModuleFallback, initProfile, loadProfile, resolveProfileDir } from "@deepseek-ai/dsh-app-boot";
import { diffLines } from "diff";
import { Container, Editor, HStack, Key, KeybindingsManager, ProcessTerminal, ScrollView, TUI_KEYBINDINGS, Text, TuiAltScreen, VStack, matchesKey, setKeybindings, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { readdir } from "node:fs/promises";
import { ManualCompactionError } from "@deepseek-ai/dsh-compaction";
import { GoalError } from "@deepseek-ai/dsh-goal";
//#region src/cli/node-launcher.ts
/** Return the child Node invocation required to expose Cordis HMR internals. */
function exposedInternalsInvocation(input) {
	if (input.execArgv.includes("--expose-internals")) return void 0;
	return [
		"--expose-internals",
		...input.execArgv,
		input.script,
		...input.args
	];
}
/** Re-execute this CLI under Node with the Cordis HMR prerequisite enabled. */
async function relaunchWithExposedInternals(input) {
	const invocation = exposedInternalsInvocation(input);
	if (invocation === void 0) return false;
	const exitCode = await new Promise((resolve, reject) => {
		const child = spawn(process.execPath, invocation, { stdio: "inherit" });
		child.once("error", reject);
		child.once("exit", (code) => resolve(code ?? 1));
	});
	process.exitCode = exitCode;
	return true;
}
//#endregion
//#region ../node_modules/.pnpm/@deepseek-ai+dsh-cmdline@0.1.1-rc.2_@deepseek-ai+cordis-plugin-loader@1.0.2_@deepseek-a_1bc57e8c58566d7b9c3fbf261d0f481e/node_modules/@deepseek-ai/dsh-cmdline/lib/index.js
/**
* @deepseek-ai/dsh-cmdline — the command line a dsh launcher hands to the app
* it boots.
*
* The launcher parses only its own flags (`--profile`, `--patch`, the config
* dumps) and hands everything after them to the tree verbatim through the
* {@link CmdlineArgs} service, so an app owns its flag family, its `--help`
* text, and its parse errors instead of the launcher knowing them.
*
* Any app plugin can inject `cmdlineArgs` and call {@link parseCmdline}. A
* provider may publish the parsed values as its own service from its program's
* commander action, and ordinary rows
* can inject that service and read it from lazily resolved config —
* `port: !!js ctx.webStartup.port ?? 3080` — so a flag beats the value written
* beside it. No row has launcher-level command-line status.
* @module @deepseek-ai/dsh-cmdline
*/
/**
* Provide the command line and the exit request on a host context before any
* tree entry mounts. Both are launcher facts, not config: an embedding host
* with no command line provides an empty argument list.
* @param ctx - the host context the tree will mount under.
* @param host - the invocation's arguments and its exit request.
*/
function provideCmdline(ctx, host) {
	const snapshot = Object.freeze([...host.args]);
	ctx.provide("cmdlineArgs", { get: () => snapshot });
	ctx.provide("appExit", host.exit);
}
process.stdout, process.stderr;
//#endregion
//#region ../acryl-harness-runtime/lib/index.mjs
function contentText(content) {
	return content.filter((block) => {
		return block.type === "text" && typeof block.text === "string";
	}).map((block) => block.text).join("");
}
function transcript(events) {
	const items = [];
	for (const event of events) {
		if (event.type === "user/message" && event.data.source.kind === "user") {
			const text = contentText(event.data.content);
			if (text !== "") items.push(Object.freeze({
				id: `event-${event.seq}`,
				author: "user",
				text
			}));
		}
		if (event.type === "assistant/message") {
			const text = contentText(event.data.message.content);
			if (text !== "") items.push(Object.freeze({
				id: `event-${event.seq}`,
				author: "assistant",
				text
			}));
		}
	}
	return Object.freeze(items);
}
function tools(events) {
	const current = /* @__PURE__ */ new Map();
	for (const event of events) {
		if (event.type === "tool/call") current.set(event.data.callId, Object.freeze({
			callId: event.data.callId,
			name: event.data.name,
			status: "running"
		}));
		if (event.type === "tool/result") {
			const callId = event.data.message.source.callId;
			const existing = current.get(callId);
			if (existing !== void 0) current.set(callId, Object.freeze({
				...existing,
				status: "succeeded"
			}));
		}
	}
	return Object.freeze([...current.values()]);
}
function status(agent) {
	return agent.status === "running" ? "running" : "idle";
}
/**
* Runtime-owned adapter over one native DSH agent/session. It creates or resumes
* the native agent and derives every presentation value from its durable log.
*/
function createAcrylSessionBridge(ctx, options) {
	const handles = /* @__PURE__ */ new Map();
	const subscribers = /* @__PURE__ */ new Map();
	const eventListeners = /* @__PURE__ */ new Map();
	let disposed = false;
	const notify = (sessionId) => {
		const listeners = subscribers.get(sessionId);
		if (listeners === void 0) return;
		snapshot(sessionId).then((next) => {
			for (const listener of listeners) try {
				listener(next);
			} catch {}
		});
	};
	const offSessionEvent = ctx.on("session/event", (session, event) => {
		if (!handles.has(session.id)) return;
		notify(session.id);
		const listeners = eventListeners.get(session.id);
		if (listeners === void 0) return;
		for (const listener of listeners) try {
			listener(event);
		} catch {}
	});
	const snapshot = async (sessionId) => {
		const agent = agentFor(sessionId);
		return Object.freeze({
			profile: options.profile,
			generationId: options.generationId,
			attachment: options.attachment,
			sessionId: agent.id,
			agentStatus: status(agent),
			transcript: transcript(agent.session.events),
			tools: tools(agent.session.events)
		});
	};
	const agentFor = (sessionId) => {
		if (disposed) throw new Error("ACRYL session bridge is disposed");
		const handle = handles.get(sessionId);
		if (handle === void 0) throw new Error(`ACRYL session ${sessionId} is not active`);
		return handle.agent;
	};
	return Object.freeze({
		async open(resumeSessionId) {
			if (disposed) throw new Error("ACRYL session bridge is disposed");
			if (handles.size !== 0) throw new Error("ACRYL session bridge already has an active session");
			const defaultModel = ctx.get("agentDefaultModel");
			if (defaultModel === void 0) throw new Error("ACRYL profile has no default agent model");
			const selection = defaultModel.currentSelection();
			const handle = resumeSessionId === void 0 ? await ctx.agents.create({
				sessionId: SessionId(`acryl-session-${crypto.randomUUID()}`),
				meta: { cwd: options.cwd },
				agentOptions: {
					provider: selection.provider,
					model: selection.model
				}
			}) : await ctx.agents.resume({
				resumeSessionId: SessionId(resumeSessionId),
				agentOptions: {
					provider: selection.provider,
					model: selection.model
				}
			});
			handles.set(handle.agent.id, handle);
			return handle.agent.id;
		},
		snapshot,
		events(sessionId) {
			return agentFor(sessionId).session.events;
		},
		async subscribe(sessionId, listener, _onError) {
			agentFor(sessionId);
			const listeners = subscribers.get(sessionId) ?? /* @__PURE__ */ new Set();
			subscribers.set(sessionId, listeners);
			listeners.add(listener);
			try {
				listener(await snapshot(sessionId));
			} catch {}
			let active = true;
			return Object.freeze({
				whenError() {
					return new Promise(() => {});
				},
				async dispose() {
					if (!active) return;
					active = false;
					listeners.delete(listener);
					if (listeners.size === 0) subscribers.delete(sessionId);
				}
			});
		},
		async subscribeEvents(sessionId, listener) {
			agentFor(sessionId);
			const listeners = eventListeners.get(sessionId) ?? /* @__PURE__ */ new Set();
			eventListeners.set(sessionId, listeners);
			listeners.add(listener);
			let active = true;
			return Object.freeze({ async dispose() {
				if (!active) return;
				active = false;
				listeners.delete(listener);
				if (listeners.size === 0) eventListeners.delete(sessionId);
			} });
		},
		async submitPrompt(input) {
			const agent = agentFor(input.sessionId);
			if (input.text.trim() === "") throw new Error("ACRYL prompt must not be empty");
			const accepted = new Promise((resolve) => {
				const off = ctx.on("session/event", (session, event) => {
					if (session !== agent.session || event.type !== "user/message") return;
					off();
					resolve();
				});
			});
			agent.followup(createUserMessage({
				content: [{
					type: "text",
					text: input.text
				}],
				source: { kind: "user" }
			}));
			await accepted;
		},
		async cancel(sessionId) {
			agentFor(sessionId).cancel({ kind: "user" });
		},
		async dispose() {
			if (disposed) return;
			disposed = true;
			offSessionEvent();
			subscribers.clear();
			eventListeners.clear();
			const activeHandles = [...handles.values()];
			handles.clear();
			const sessions = ctx.get("sessions");
			for (const handle of activeHandles) {
				try {
					await handle.agent.whenIdle();
				} catch {}
				try {
					await sessions?.flush(handle.agent.session);
				} catch {}
			}
			await Promise.all(activeHandles.map((handle) => handle.dispose()));
		}
	});
}
const dshInstallAnchor = createRequire(import.meta.url).resolve("@deepseek-ai/dsh/package.json");
const profileRoot = "[]\n";
const shippedPresetsDir = join(resolve(dirname(fileURLToPath(import.meta.url)), "../.."), "deepseek-harness", "packages", "preset", "agent-presets", "presets");
const ACRYL_RUNTIME_ROWS = [{
	id: "system-prompt",
	name: "@deepseek-ai/dsh-system-prompt",
	config: { persona: "You are a coding agent powered by the {{model}} model. Your working directory is {{cwd}}." }
}, { insert: [
	{
		id: "agent-presets",
		name: "@deepseek-ai/dsh-agent-presets",
		config: {
			default: "standard",
			roots: existsSync(shippedPresetsDir) ? [{
				path: shippedPresetsDir,
				trust: "system"
			}] : [],
			includeShippedRoot: false,
			includeUserRoot: true
		}
	},
	{
		id: "session-stats",
		name: "@deepseek-ai/dsh-session-stats"
	},
	{
		id: "authorization",
		name: "@deepseek-ai/dsh-authorization"
	}
] }];
/** Boot one normal pinned-Harness ACRYL profile in a single Cordis root. */
async function bootAcrylHarnessProfile(options) {
	if (options.profile.trim() === "") throw new Error("ACRYL Harness profile must not be empty");
	initProfile(resolveProfileDir(options.profile), DEFAULT_PROFILE_BUNDLES);
	healProfilesModuleFallback(dshInstallAnchor);
	const profile = loadProfile("acryl", options.profile, dshInstallAnchor);
	const rootConfig = join(profile.dir, "cordis.yml");
	writeFileSync(rootConfig, profileRoot);
	const patches = structuredClone([
		...profile.layers.flatMap((layer) => layer.patches),
		...ACRYL_RUNTIME_ROWS,
		...profile.patches
	]);
	if (composeEntries([patches]).find((entry) => entry.id === "hmr")?.disabled !== true && !process.execArgv.includes("--expose-internals")) throw new Error("ACRYL profile enables Cordis HMR and must be launched with Node --expose-internals");
	const ctx = await boot("acryl", rootConfig, patches, options.prepare);
	let disposed = false;
	return Object.freeze({
		ctx,
		profileDirectory: profile.dir,
		async dispose() {
			if (disposed) return;
			disposed = true;
			await ctx.fiber.dispose();
		}
	});
}
/**
* Boot the DSH browser surface (the `web` profile: `dsh-base` + `dsh-web-app`)
* as one normal ACRYL runtime, so `pnpm acryl-web` serves the same DSH
* HTTP/WebSocket seam the web surface always uses. The web profile already
* composes the persona/agent rows ACRYL's terminal surface adds, so no
* ACRYL_RUNTIME_ROWS are re-inserted (that would duplicate `system-prompt`).
*/
async function bootAcrylWebProfile(options = {}) {
	const profileName = "web";
	initProfile(resolveProfileDir(profileName), DEFAULT_PROFILE_BUNDLES);
	healProfilesModuleFallback(dshInstallAnchor);
	const profile = loadProfile("web", profileName, dshInstallAnchor);
	const rootConfig = join(profile.dir, "cordis.yml");
	writeFileSync(rootConfig, profileRoot);
	const patches = structuredClone([...profile.layers.flatMap((layer) => layer.patches), ...profile.patches]);
	const cmdlineArgs = options.cmdlineArgs ?? [];
	const ctx = await boot("web", rootConfig, patches, (hostCtx) => {
		provideCmdline(hostCtx, {
			args: [...cmdlineArgs],
			exit: (code) => {
				process.exitCode = code;
			}
		});
		return options.prepare?.(hostCtx);
	});
	const startup = ctx.get("webStartup");
	const url = `http://${startup?.host ?? "127.0.0.1"}:${startup?.port ?? 3080}`;
	let disposed = false;
	return Object.freeze({
		ctx,
		url,
		profileDirectory: profile.dir,
		async dispose() {
			if (disposed) return;
			disposed = true;
			await ctx.fiber.dispose();
		}
	});
}
//#endregion
//#region src/host/direct.ts
/** Start one normal local Harness runtime for this terminal surface. */
/**
* A local surface owns its normal DSH/Cordis root. Durable DSH sessions, not
* `.acryl/control` experiments, provide continuity across later launches.
*/
async function startDirectHost(options) {
	if (options.profile.trim() === "") throw new Error("ACRYL direct host profile must not be empty");
	const runtime = await bootAcrylHarnessProfile({ profile: options.profile });
	const ctx = runtime.ctx;
	let disposed = false;
	return Object.freeze({
		ctx,
		profile: options.profile,
		generationId: options.generationId ?? randomUUID(),
		runtimeState: ctx.get("sessions") !== void 0 && ctx.get("agents") !== void 0 ? "ready" : "unavailable",
		async dispose() {
			if (disposed) return;
			disposed = true;
			await runtime.dispose();
		}
	});
}
//#endregion
//#region src/tui/theme.ts
/**
* DeepSeek brand palette for the TUI. Keep color decisions semantic so every
* Ink surface and the raw-ANSI `render.ts`/`bannerText.ts` helpers share the
* same visual language — see `DESIGN.md` for the full rationale and the
* component-mapping guide this table is drawn from.
*
* The terminal still owns its background and default foreground; these are
* foreground tokens for interactive, stateful, and brand elements only —
* this TUI renders to native scrollback (no painted panel backgrounds), so
* DeepSeek's `surface`/`bg-dark`/`border-dim` tokens are deliberately not
* represented here.
* @module @tomowang/dsh-tui/tui/theme
*/
const theme = {
	/** DeepSeek Blue — brand banner/ASCII, active input border. */
	primary: "#4F6BFE",
	/** Electric Cyan — section headers, streaming/progress indicators. */
	secondary: "#38BDF8",
	/** Slate Indigo — badges (active provider/model). */
	accent: "#818CF8",
	/** Thought Violet — reasoning/thinking content, set apart from assistant text; see `formatReasoningSummary`/`formatStreamingText` in `src/render.ts`. */
	reasoning: "#A855F7",
	/** Mint Emerald. */
	success: "#34D399",
	/** Amber Sun. */
	warning: "#FBBF24",
	/** Coral Red. */
	error: "#F87171",
	/** DeepSeek uses its primary blue for informational UI. */
	info: "#4F6BFE",
	/** Slate Gray — dim/secondary text (labels, hints, timestamps). */
	muted: "#94A3B8"
};
/** 24-bit-color ANSI wrapper, shared by every raw-ANSI formatter (`render.ts`, `markdown.ts`, `bannerText.ts`) and every pi-tui component theme adapter. */
function fg(hex) {
	const n = Number.parseInt(hex.slice(1), 16);
	const r = n >> 16 & 255;
	const g = n >> 8 & 255;
	const b = n & 255;
	return (s) => `\x1b[38;2;${r};${g};${b}m${s}\x1b[0m`;
}
//#endregion
//#region src/markdown.ts
/**
* Terminal Markdown rendering for assistant text. `render.ts` prints
* assistant/tool output straight to native scrollback via raw ANSI, so this
* module detects whether a text blob is (at least partly) Markdown before
* paying the cost of styling it — plain prose keeps rendering exactly as it
* always has, only text carrying real Markdown syntax gets headers, bold,
* lists, code spans, tables, etc. converted to ANSI.
* @module @tomowang/dsh-tui/markdown
*/
const ESC = "\x1B[";
const dim$2 = fg(theme.muted);
const cyan$1 = fg(theme.secondary);
const primary = fg(theme.primary);
const bold$11 = (s) => `${ESC}1m${s}${ESC}0m`;
const italic = (s) => `${ESC}3m${s}${ESC}0m`;
const strike = (s) => `${ESC}9m${s}${ESC}0m`;
const underline = (s) => `${ESC}4m${s}${ESC}0m`;
/** Wrap `label` as an OSC 8 terminal hyperlink to `url`; terminals without OSC 8 support just print `label` and ignore the surrounding escapes. */
function hyperlink(url, label) {
	return `\x1b]8;;${url}\x1b\\${label}\x1b]8;;\x1b\\`;
}
const FENCE_RE = /^(\s*)(`{3,}|~{3,})\s*(\S*)\s*$/;
const ATX_HEADER_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const HR_RE = /^ {0,3}(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const BLOCKQUOTE_RE = /^(\s*)((?:>\s?)+)(.*)$/;
const UNORDERED_RE = /^(\s*)([-*+])\s+(.*)$/;
const ORDERED_RE = /^(\s*)(\d+)([.)])\s+(.*)$/;
const TABLE_ROW_RE = /^\s*\|.*\|\s*$/;
const TABLE_SEPARATOR_CELL_RE = /^:?-+:?$/;
const LINK_RE = /\[([^\]\n]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/;
const BOLD_RE = /\*\*([^*\n]+)\*\*|__([^_\n]+)__/;
const INLINE_CODE_RE = /`([^`\n]+)`/;
const ITALIC_RE = /(?<!\*)\*(?!\*)([^*\n]+)\*(?!\*)|(?<!_)_(?!_)([^_\n]+)_(?!_)/;
const STRIKE_RE = /~~([^~\n]+)~~/;
const LINK_RE_G = new RegExp(LINK_RE.source, "g");
const BOLD_RE_G = new RegExp(BOLD_RE.source, "g");
const ITALIC_RE_G = new RegExp(ITALIC_RE.source, "g");
const STRIKE_RE_G = new RegExp(STRIKE_RE.source, "g");
const INLINE_CODE_RE_G = new RegExp(INLINE_CODE_RE.source, "g");
/**
* Heuristically decides whether `text` carries Markdown markup worth
* rendering, as opposed to plain prose that happens to contain a stray `*`
* or `_`. Block-level syntax (fenced code, headers, rules, quotes, lists,
* table rows) and unambiguous inline syntax (links, bold, strikethrough,
* inline code) each single-handedly qualify. Lone single-`*`/`_` emphasis is
* deliberately excluded: it is the highest false-positive-risk cue (globs,
* multiplication, snake_case, `*args`) and easy to get wrong on its own, so
* it only ever renders as emphasis when some other signal already confirmed
* the text is Markdown.
*/
function looksLikeMarkdown(text) {
	for (const line of text.split("\n")) if (FENCE_RE.test(line) || ATX_HEADER_RE.test(line) || HR_RE.test(line) || BLOCKQUOTE_RE.test(line) || UNORDERED_RE.test(line) || ORDERED_RE.test(line) || TABLE_ROW_RE.test(line)) return true;
	return LINK_RE.test(text) || BOLD_RE.test(text) || STRIKE_RE.test(text) || INLINE_CODE_RE.test(text);
}
/** Style links, bold, strikethrough, and emphasis in a span already known to contain no inline code. */
function applyNonCodeInline(text) {
	let working = text.replaceAll(LINK_RE_G, (_match, label, url) => hyperlink(url, underline(primary(label))));
	working = working.replaceAll(BOLD_RE_G, (_match, a, b) => bold$11(a ?? b ?? ""));
	working = working.replaceAll(STRIKE_RE_G, (_match, t) => strike(t));
	return working.replaceAll(ITALIC_RE_G, (_match, a, b) => italic(a ?? b ?? ""));
}
/**
* Style one line's inline Markdown (links, bold, strikethrough, inline
* code, emphasis). Splits on inline code spans first — `String.split` with
* a single-capture-group regex interleaves the code contents (odd indices)
* between the surrounding plain-text spans (even indices) — so a code
* span's contents can never be mistaken for bold/italic/link syntax.
*/
function applyInline(text) {
	return text.split(INLINE_CODE_RE_G).map((part, i) => i % 2 === 1 ? cyan$1(part) : applyNonCodeInline(part)).join("");
}
/** Split a line already confirmed by `TABLE_ROW_RE` into trimmed cells, dropping the framing `|`. */
function splitTableRow(line) {
	return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}
/**
* A GFM delimiter row: every cell is dashes with optional leading/trailing
* colons for alignment. Returns each column's alignment, or `null` when
* `line` isn't a valid delimiter row — the caller then treats the preceding
* line as ordinary text rather than a table header.
*/
function parseTableSeparator(line) {
	const cells = splitTableRow(line);
	const aligns = [];
	for (const cell of cells) {
		if (!TABLE_SEPARATOR_CELL_RE.test(cell)) return null;
		const left = cell.startsWith(":");
		const right = cell.endsWith(":");
		aligns.push(left && right ? "center" : right ? "right" : "left");
	}
	return aligns;
}
/** Every escape this module's own `fg`/`bold`/`italic`/`strike`/`underline`/`hyperlink` helpers emit: SGR sequences and OSC 8 hyperlinks (BEL- or ST-terminated). */
const ANSI_RE = /\x1b\][^\x07]*\x07|\x1b\][^\x1b]*\x1b\\|\x1b\[[0-9;]*m/g;
/**
* Visible length of an already-styled cell: ANSI escapes have string length
* but no on-screen width, so measuring `styled.length` directly would
* overcount by however many escape bytes the cell's markup produced.
* Stripping them first — rather than measuring the pre-styling raw source
* — also fixes the companion bug that source length would otherwise cause:
* `**bold**`'s raw text is 4 characters longer than what it renders as, so
* a column sized from raw source overcounts a bold cell's true width, and
* that same bold cell then looks "wide enough" and gets under-padded
* relative to its plain siblings. Like the rest of this module, "visible"
* means UTF-16 code units after stripping escapes, not a true display-width
* count, so a wide/astral cell (CJK, emoji) can still under-pad — a known
* limitation shared with the fixed-width horizontal rule below.
*/
function visibleLength(styled) {
	return styled.replace(ANSI_RE, "").length;
}
/** Pad an already-styled cell out to `width`, measuring by `visibleLength` rather than `styled.length`. */
function padCell(styled, width, align) {
	const gap = Math.max(0, width - visibleLength(styled));
	if (align === "right") return " ".repeat(gap) + styled;
	if (align === "center") {
		const left = Math.floor(gap / 2);
		return " ".repeat(left) + styled + " ".repeat(gap - left);
	}
	return styled + " ".repeat(gap);
}
/** Pad one row of already-styled cells (header or body) to a single column-aligned line. */
function formatTableRow(styledCells, widths, aligns, isHeader) {
	return widths.map((width, i) => padCell(isHeader ? bold$11(styledCells[i] ?? "") : styledCells[i] ?? "", width, aligns[i] ?? "left")).join(dim$2(" │ "));
}
/** A dim horizontal rule under the header row, with a cross at each column boundary. */
function formatTableRule(widths) {
	return dim$2(widths.map((width) => "─".repeat(width)).join("─┼─"));
}
/**
* Render Markdown source to ANSI-styled terminal text: headers, fenced/
* inline code, block quotes, ordered/unordered lists, rules, tables, links,
* bold, strikethrough, and emphasis. Text that `looksLikeMarkdown` rejects
* passes through byte-for-byte unchanged.
*/
function renderMarkdown(text) {
	if (!looksLikeMarkdown(text)) return text;
	const out = [];
	let inCode = false;
	let fenceChar = "";
	let fenceLen = 0;
	const lines = text.split("\n");
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (!inCode && TABLE_ROW_RE.test(line) && i + 1 < lines.length) {
			const aligns = TABLE_ROW_RE.test(lines[i + 1]) ? parseTableSeparator(lines[i + 1]) : null;
			if (aligns !== null) {
				const styledHeader = splitTableRow(line).map((cell) => applyInline(cell));
				const styledRows = [];
				let j = i + 2;
				for (; j < lines.length && TABLE_ROW_RE.test(lines[j]); j++) styledRows.push(splitTableRow(lines[j]).map((cell) => applyInline(cell)));
				const columns = Math.max(styledHeader.length, ...styledRows.map((row) => row.length), aligns.length);
				const widths = Array.from({ length: columns }, (_, col) => Math.max(visibleLength(styledHeader[col] ?? ""), ...styledRows.map((row) => visibleLength(row[col] ?? ""))));
				const columnAligns = Array.from({ length: columns }, (_, col) => aligns[col] ?? "left");
				out.push(formatTableRow(styledHeader, widths, columnAligns, true));
				out.push(formatTableRule(widths));
				for (const styledRow of styledRows) out.push(formatTableRow(styledRow, widths, columnAligns, false));
				i = j - 1;
				continue;
			}
		}
		const fence = FENCE_RE.exec(line);
		if (fence !== null && (!inCode || fence[2][0] === fenceChar && fence[2].length >= fenceLen)) {
			if (inCode) inCode = false;
			else {
				inCode = true;
				fenceChar = fence[2][0];
				fenceLen = fence[2].length;
				if (fence[3] !== "") out.push(dim$2(fence[3]));
			}
			continue;
		}
		if (inCode) {
			out.push(dim$2(line));
			continue;
		}
		const header = ATX_HEADER_RE.exec(line);
		if (header !== null) {
			const level = header[1].length;
			const content = applyInline(header[2]);
			out.push(level === 1 ? bold$11(primary(content)) : level === 2 ? bold$11(cyan$1(content)) : bold$11(content));
			continue;
		}
		if (HR_RE.test(line)) {
			out.push(dim$2("─".repeat(40)));
			continue;
		}
		const quote = BLOCKQUOTE_RE.exec(line);
		if (quote !== null) {
			const depth = (quote[2].match(/>/g) ?? []).length;
			out.push(`${dim$2("▏".repeat(depth))} ${applyInline(quote[3])}`);
			continue;
		}
		const unordered = UNORDERED_RE.exec(line);
		if (unordered !== null) {
			out.push(`${unordered[1]}${cyan$1("•")} ${applyInline(unordered[3])}`);
			continue;
		}
		const ordered = ORDERED_RE.exec(line);
		if (ordered !== null) {
			out.push(`${ordered[1]}${cyan$1(`${ordered[2]}${ordered[3]}`)} ${applyInline(ordered[4])}`);
			continue;
		}
		out.push(applyInline(line));
	}
	return out.join("\n");
}
//#endregion
//#region src/render.ts
/**
* Terminal projection of durable session events. The TUI renders only from the
* append-only session log, so a resumed session replays through the exact same
* code path as live events.
* @module @tomowang/dsh-tui/render
*/
const dim$1 = fg(theme.muted);
const cyan = fg(theme.secondary);
const red = fg(theme.error);
const green = fg(theme.success);
const yellow = fg(theme.warning);
const violet$1 = fg(theme.reasoning);
/** Line cap for a settled shell-escape (`!`) run's body in the permanent transcript; `<Static>` prints can't be redrawn, so a long run is summarized there — tool calls/results don't use this cap, since the transcript only ever shows their one-line collapsed summary (see `formatToolCardSummary`), with full detail available via `formatToolCardDetail` in the Tool Cards overlay. */
const MAX_CARD_LINES = 20;
/** `diff` package's `maxEditLength`: bounds worst-case diff cost on a huge file, mirroring the removed first-party TUI's default. */
const MAX_DIFF_EDIT_LENGTH = 1e3;
/** Clamp one-line summaries so tool arguments cannot flood the transcript. */
function truncate(text, max) {
	const oneLine = text.replaceAll("\n", " ");
	return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max - 1)}…`;
}
/** Join the text blocks of a message content array. */
function textOf(content) {
	return content.filter((block) => block.type === "text").map((block) => block.text).join("");
}
/** Join the reasoning/thinking blocks of a message content array, distinct from its visible `textOf`. */
function reasoningOf(content) {
	return content.filter((block) => block.type === "reasoning").map((block) => block.text).join("");
}
/** Preview length for a settled step's reasoning summary line — long enough to be useful, short enough that a long thinking block never floods the transcript; the full text is always in `/trajectory`. */
const REASONING_SUMMARY_LENGTH = 80;
/** Format one settled message's reasoning/thinking content as a single collapsed line — the label plus a short preview — never the full body, which stays available via `/trajectory`. */
function formatReasoningSummary(text) {
	return violet$1(`✦ think · ${truncate(text, REASONING_SUMMARY_LENGTH)}`);
}
/**
* Format one settled step's text (and, ahead of it, a one-line reasoning
* summary when the step had any), for the permanent transcript.
*/
function formatSettledMessage(text, reasoningText) {
	const parts = [];
	if (reasoningText !== "") parts.push(formatReasoningSummary(reasoningText));
	if (text !== "") parts.push(renderMarkdown(text));
	return parts.length === 0 ? void 0 : `\n${parts.join("\n")}\n`;
}
/**
* Format the in-progress step's live region: while reasoning has started but
* no visible text has arrived yet, an animated `spinnerChar thinking` line
* stands in for the raw, fast-scrolling reasoning body (its settled one-line
* `✦ think · …` summary appears in the transcript once the step lands —
* see `formatSettledMessage`); once text starts streaming, that text is
* shown directly.
*/
function formatStreamingText(text, reasoningText = "", spinnerChar = "✦") {
	if (text === "" && reasoningText === "") return void 0;
	if (text === "") return `\n${violet$1(`${spinnerChar} thinking`)}\n`;
	return `\n${renderMarkdown(text)}\n`;
}
/** One local shell-escape run's header + output lines, shared by the settled and in-flight renderers below. `exitCode` is `null` while still running. */
function formatShellLines(command, output, exitCode) {
	const lines = [`${yellow("!")} ${command}`];
	if (output !== "") lines.push(...splitLines(output).map(dim$1));
	if (exitCode !== null) lines.push(exitCode === 0 ? dim$1(`[exit ${exitCode}]`) : red(`[exit ${exitCode}]`));
	return lines;
}
/** Format one settled local shell-escape run (`!` prompt-mode) for the permanent transcript, mirroring a `terminal` tool card. */
function formatShellRun(command, output, exitCode) {
	return `\n${capLines(formatShellLines(command, output, exitCode), MAX_CARD_LINES).join("\n")}\n`;
}
/** Format the in-progress shell-escape run's accumulated output for the live region, mirroring `formatStreamingText`'s settle-without-jump framing. */
function formatShellRunLive(command, output) {
	return `\n${capLines(formatShellLines(command, output, null), MAX_CARD_LINES).join("\n")}\n`;
}
/** Parse a tool call's JSON-encoded arguments; malformed JSON can't be handed to a presenter. */
function parseJson(text) {
	try {
		return {
			valid: true,
			value: JSON.parse(text)
		};
	} catch {
		return { valid: false };
	}
}
/** Render a value for display: a string as-is, anything else as pretty JSON. */
function pretty(value) {
	if (typeof value === "string") return value;
	return JSON.stringify(value, null, 2) ?? String(value);
}
/** A string's content lines: empty text is zero lines, a trailing newline terminates the last line. */
function splitLines(text) {
	if (text === "") return [];
	return (text.endsWith("\n") ? text.slice(0, -1) : text).split("\n");
}
/** Cap a card body to `max` lines, appending a dim summary of what was omitted. */
function capLines(lines, max) {
	if (lines.length <= max) return [...lines];
	const omitted = lines.length - max;
	return [...lines.slice(0, max), dim$1(`… +${omitted} line${omitted === 1 ? "" : "s"} omitted`)];
}
/**
* One file's change as +/- diff lines under a dim path header. A `null` prior
* text (new file, or a call-time overwrite with no before-image) renders the
* whole new text as additions; a comparison beyond `MAX_DIFF_EDIT_LENGTH` falls
* back to whole-side add/remove so a huge file can't stall formatting.
*/
function renderFileDiff(diff) {
	const lines = [dim$1(diff.path)];
	if (diff.oldText === null) {
		for (const line of splitLines(diff.newText)) lines.push(green(`+ ${line}`));
		return lines;
	}
	const changes = diffLines(diff.oldText, diff.newText, { maxEditLength: MAX_DIFF_EDIT_LENGTH });
	if (changes === void 0) {
		lines.push(dim$1(`[diff omitted: over ${MAX_DIFF_EDIT_LENGTH} changed lines]`));
		for (const line of splitLines(diff.oldText)) lines.push(red(`- ${line}`));
		for (const line of splitLines(diff.newText)) lines.push(green(`+ ${line}`));
		return lines;
	}
	for (const change of changes) {
		const prefix = change.added ? "+" : change.removed ? "-" : " ";
		const color = change.added ? green : change.removed ? red : dim$1;
		for (const line of splitLines(change.value)) lines.push(color(`${prefix} ${line}`));
	}
	return lines;
}
/** One or more `FileDiff`s, blank-line separated when there's more than one. */
function renderFileDiffs(diffs) {
	return diffs.flatMap((fileDiff, index) => (index > 0 ? [""] : []).concat(renderFileDiff(fileDiff)));
}
/** Today's flat one-line fallback for a pending call, unchanged: no tool, no presenter, bad JSON, or a throwing/`undefined` presenter. */
function fallbackCallLine(name, rawArgs) {
	return `${cyan("⚙")} ${name} ${dim$1(truncate(rawArgs, 100))}`;
}
/** Resolve a `tool/call`'s presented view, or `undefined` for any condition that keeps the flat fallback. */
function presentCallSafely(name, rawArgs, getTool) {
	const tool = getTool?.(name);
	if (tool?.presentCall === void 0) return void 0;
	const parsed = parseJson(rawArgs);
	if (!parsed.valid) return void 0;
	try {
		return tool.presentCall(parsed.value);
	} catch {
		return;
	}
}
/** A presented pending call's lines: a cyan header (the presenter's title) plus card-specific body. */
function formatCallLines(view) {
	const header = `${cyan("⚙")} ${view.title}`;
	if (view.card === "terminal") {
		const lines = [];
		if (view.description !== void 0 && view.description !== "") lines.push(dim$1(view.description));
		lines.push(header);
		if (view.cwd !== void 0) lines.push(dim$1(view.cwd));
		return lines;
	}
	if (view.card === "diff") return [header, ...renderFileDiffs(view.diffs)];
	return [header, ...view.rawInput === void 0 ? [] : splitLines(pretty(view.rawInput)).map(dim$1)];
}
/**
* A presented call's one-line identity. A `TerminalCallView`'s `title` is
* deliberately just the bare command with no verb (unlike a `generic`/`diff`
* title, which a presenter writes to already read as one, e.g. "Read foo.ts")
* — so on its own it reads as arbitrary text with no hint it was a shell
* call. Label it with the tool's own name so the one-line summary still
* names both what ran and how — the command itself is the detail a reader
* wants here; its optional `description` stays a detail-view-only addition
* (`formatCallLines` already shows it above the command there).
*/
function callSummaryTitle(name, view) {
	if (view.card !== "terminal") return view.title;
	return `${name.length === 0 ? name : name.charAt(0).toUpperCase() + name.slice(1)}: ${view.title}`;
}
/** A pending call's one-line title, presenting through the tool's `presentCall` when available — shared by the live region's spinner row. */
function pendingCallTitle(name, rawArgs, getTool) {
	const view = presentCallSafely(name, rawArgs, getTool);
	return view === void 0 ? `${name} ${truncate(rawArgs, 100)}` : callSummaryTitle(name, view);
}
/**
* Format every tool call that's been sent but has no `tool/result` yet, for
* the live region: one line per call, the shared spinner frame standing in
* for the settled ✓/✖ icon it'll collapse to once its result lands and it
* becomes a single transcript line (see `formatToolCardSummary`).
*/
function formatPendingToolCalls(calls, spinnerChar, getTool) {
	if (calls.length === 0) return "";
	return `\n${calls.map((call) => `${cyan(spinnerChar)} ${pendingCallTitle(call.name, call.arguments, getTool)}`).join("\n")}\n`;
}
/** Resolve a `tool/result`'s presented view, or `undefined` for any condition that keeps the flat fallback. */
function presentResultSafely(callId, result, options) {
	const call = options.getToolCall?.(callId);
	if (call === void 0) return void 0;
	const tool = options.getTool?.(call.name);
	if (tool?.presentResult === void 0) return void 0;
	const parsed = parseJson(call.arguments);
	if (!parsed.valid) return void 0;
	try {
		const view = tool.presentResult(parsed.value, result);
		return view === void 0 ? void 0 : {
			name: call.name,
			view
		};
	} catch {
		return;
	}
}
/** A `tool/result`'s paired `tool/call`'s presented one-line identity, when both the call and a presenter for it resolve — the "pending-state title" a result view's own optional `title` defers to when omitted (see `ToolResultView` docs in `@deepseek-ai/dsh-tools`). */
function resolveCallTitle(callId, options) {
	const call = options.getToolCall?.(callId);
	if (call === void 0) return void 0;
	const view = presentCallSafely(call.name, call.arguments, options.getTool);
	return view === void 0 ? void 0 : callSummaryTitle(call.name, view);
}
/** Shared by the transcript's compact line and the Tool Cards overlay's summary/detail, so all three read the same icon and presented view instead of re-deriving it. */
function resolveToolResult(event, options) {
	if (event.data.error !== void 0) return {
		kind: "error",
		line: `${red("✖")} ${event.data.error.code}: ${event.data.error.name}`
	};
	const [block] = event.data.message.content;
	const failed = block.isError === true;
	const icon = failed ? red("✖") : cyan("✓");
	const callId = event.data.message.source.callId;
	const presented = presentResultSafely(callId, {
		content: block.content,
		isError: failed,
		...event.data.meta !== void 0 ? { meta: event.data.meta } : {}
	}, options);
	return {
		kind: "ok",
		icon,
		content: block.content,
		presented,
		callTitle: resolveCallTitle(callId, options)
	};
}
/** A presented completed call's lines: an outcome-colored header plus card-specific body. `callTitle` is the paired call's presented title — a result view's own `title` field defers to it (the "pending-state title") when omitted, so it comes before the flat fallback name. */
function formatResultLines(fallbackName, callTitle, icon, rawContent, view) {
	const header = `${icon} ${view.title ?? callTitle ?? fallbackName}`;
	switch (view.card) {
		case "generic": return [header, ...splitLines(textOf(view.content ?? rawContent)).map(dim$1)];
		case "terminal": {
			const lines = [header];
			if (view.output !== void 0 && view.output !== "") lines.push(...splitLines(view.output).map(dim$1));
			if (view.exitCode !== void 0) lines.push(dim$1(`[exit ${view.exitCode}]`));
			if (view.signal !== void 0) lines.push(red(`[signal ${view.signal}]`));
			return lines;
		}
		case "diff": return [header, ...renderFileDiffs(view.diffs)];
		case "search": {
			const lines = [header];
			let shown = 0;
			if (view.shape === "matches") for (const file of view.files) {
				lines.push(dim$1(file.path));
				for (const match of file.matches) lines.push(dim$1(`  ${match.lineNumber}: ${match.line}`));
				shown += file.matches.length;
			}
			else {
				for (const path of view.paths) lines.push(dim$1(path));
				shown = view.paths.length;
			}
			if (view.truncated) lines.push(dim$1(`… showing ${shown} of ${view.total}`));
			return lines;
		}
		case "read": {
			const lines = [`${icon} ${view.title ?? callTitle ?? view.path}`];
			for (const line of view.lines) lines.push(dim$1(`${line.number}: ${line.text}`));
			if (view.totalLines > 0) {
				const last = view.offset + view.lines.length - 1;
				lines.push(dim$1(`[${view.offset}-${last} of ${view.totalLines}]`));
			}
			return lines;
		}
		case "web": {
			const lines = [header];
			if (view.kind === "search") {
				for (const source of view.sources) lines.push(dim$1(`${source.title ?? source.url} — ${source.url}`));
				if (view.answer !== void 0 && view.answer !== "") lines.push(...splitLines(view.answer).map(dim$1));
			} else lines.push(dim$1(`${view.url} [${view.statusCode}]`));
			if (view.truncated) lines.push(dim$1("… truncated"));
			return lines;
		}
	}
}
/**
* One `goal/change` mutation's transcript line, mirroring the durable
* ledger's `operation`. An explicit `switch` with no `default` over the
* post-`clear` operation union (rather than a sequential `if` chain ending
* in an implicit "must be block") so a future `dsh-goal` operation the TUI
* doesn't know about fails to compile here instead of silently rendering
* the wrong line.
*/
function goalChangeLine(change) {
	if (change.operation === "clear") return `${dim$1("🗑")} goal cleared`;
	const goal = change.goal;
	switch (change.operation) {
		case "create": return `${cyan("🎯")} goal set: ${goal.objective}`;
		case "edit": return `${cyan("🎯")} goal updated: ${goal.objective}`;
		case "pause": return `${yellow("⏸")} goal paused: ${goal.objective}`;
		case "resume": return `${green("▶")} goal resumed: ${goal.objective}`;
		case "complete": return `${green("✓")} goal complete: ${goal.objective}`;
		case "block": return `${red("⛔")} goal blocked${goal.blockedReason === void 0 ? "" : `: ${goal.blockedReason.code}: ${goal.blockedReason.message}`}`;
	}
}
/**
* Format one durable session event as a terminal line, or `undefined` for
* events this viewer does not present. Unknown event types are silently
* skipped: the log's vocabulary is merge-extensible and a transcript viewer
* must tolerate events from plugins it does not know.
* @param event - the durable session event to project.
* @param options - replay/live rendering context, plus optional tool-presentation resolvers.
*/
function formatEvent(event, options) {
	switch (event.type) {
		case "user/message": {
			const source = event.data.source;
			if (source.kind === "user") {
				const text = textOf(event.data.content);
				return text === "" ? void 0 : `${dim$1("you ›")} ${text}`;
			}
			if (source.kind === "plugin") {
				const summary = source.form === "notice" ? source.summary : void 0;
				return `${dim$1("⊕ context ›")} ${source.plugin}${summary === void 0 ? "" : ` · ${summary}`}`;
			}
			if (source.kind === "goal") return `${dim$1("⊕ goal ›")} round ${source.round}`;
			return `${dim$1("⊕ context ›")} ${source.kind}`;
		}
		case "assistant/message": {
			const content = event.data.message.content;
			return formatSettledMessage(textOf(content), reasoningOf(content));
		}
		case "tool/call": return;
		case "tool/result": return formatToolCardSummary(event, options);
		case "turn/end": {
			const reason = event.data.reason;
			if (reason.kind === "error") return `${red("✖")} ${reason.error.code}: ${reason.error.message}`;
			else if (reason.kind === "aborted") return `${yellow("⏹")} ${dim$1("turn canceled")}`;
			return;
		}
		case "compaction/summary": return `${cyan("⊙")} compacted ${event.data.shadowedSeqs.length} items (~${event.data.shadowedTokenCount} tokens)`;
		case "compaction/end": return event.data.error === void 0 ? void 0 : `${red("✖")} compaction: ${event.data.error}`;
		case "goal/change": return goalChangeLine(event.data);
		default: return;
	}
}
/**
* A `tool/call`/`tool/result` event's one-line summary — the Tool Cards
* overlay's collapsed row. Distinct from `formatEvent`'s own card rendering
* (which can be multi-line even at its most compact), because the overlay
* needs a genuine single line to toggle open from.
*/
function formatToolCardSummary(event, options) {
	if (event.type === "tool/call") {
		const view = presentCallSafely(event.data.name, event.data.arguments, options.getTool);
		return view === void 0 ? fallbackCallLine(event.data.name, event.data.arguments) : `${cyan("⚙")} ${callSummaryTitle(event.data.name, view)}`;
	}
	if (event.type === "tool/result") {
		const resolved = resolveToolResult(event, options);
		if (resolved.kind === "error") return resolved.line;
		const { icon, content, presented, callTitle } = resolved;
		if (presented === void 0) {
			const text = truncate(textOf(content), 100);
			return text === "" ? icon : `${icon} ${dim$1(text)}`;
		}
		return `${icon} ${presented.view.title ?? callTitle ?? presented.name}`;
	}
	return "";
}
/**
* Full, uncapped presentation lines for a `tool/call`/`tool/result` event.
* Unlike `formatEvent`, this never truncates or omits — the Tool Cards
* overlay scrolls its own window over the result instead of relying on a
* fixed line cap, so it needs the complete card body to scroll through.
*/
function formatToolCardDetail(event, options) {
	if (event.type === "tool/call") {
		const view = presentCallSafely(event.data.name, event.data.arguments, options.getTool);
		return view === void 0 ? [fallbackCallLine(event.data.name, event.data.arguments)] : formatCallLines(view);
	}
	if (event.type === "tool/result") {
		const resolved = resolveToolResult(event, options);
		if (resolved.kind === "error") return [resolved.line];
		const { icon, content, presented, callTitle } = resolved;
		if (presented === void 0) {
			const text = textOf(content);
			return text === "" ? [icon] : [icon, ...splitLines(text)];
		}
		return formatResultLines(presented.name, callTitle, icon, content, presented.view);
	}
	return [];
}
//#endregion
//#region src/tui/store.ts
const EMPTY_STATS = {
	sessionStats: void 0,
	tokenUsage: void 0,
	contextPressure: void 0,
	contextBreakdown: void 0
};
const EMPTY_FILE_INDEX = {
	candidates: void 0,
	loading: false
};
const CLOSED_OVERLAY = { kind: "none" };
/** Mutable projection; `getSnapshot`/`subscribe` satisfy `useSyncExternalStore`. */
var TuiStore = class {
	state;
	listeners = /* @__PURE__ */ new Set();
	lastSeq;
	streamingAssembler;
	streamingKey;
	toolCalls = /* @__PURE__ */ new Map();
	pendingToolCallsMap = /* @__PURE__ */ new Map();
	constructor(initial) {
		const lastSeq = initial.events.at(-1)?.seq ?? 0;
		this.lastSeq = lastSeq;
		for (const event of initial.events) if (event.type === "tool/call") {
			const call = {
				name: event.data.name,
				arguments: event.data.arguments
			};
			this.toolCalls.set(event.data.callId, call);
			this.pendingToolCallsMap.set(event.data.callId, call);
		} else if (event.type === "tool/result") this.pendingToolCallsMap.delete(event.data.message.source.callId);
		this.state = {
			events: initial.events.filter((event) => event.type !== "assistant/chunk"),
			replayThrough: lastSeq,
			status: "idle",
			queued: [],
			notice: void 0,
			overlay: CLOSED_OVERLAY,
			permission: void 0,
			goal: void 0,
			title: void 0,
			stats: EMPTY_STATS,
			preset: void 0,
			streaming: void 0,
			pendingToolCalls: this.pendingToolCallsSnapshot(),
			shellRun: void 0,
			shellHistory: [],
			fileIndex: EMPTY_FILE_INDEX,
			updateHint: void 0
		};
	}
	getSnapshot = () => this.state;
	/** The `tool/call` a later `tool/result` correlates with, by `callId`; `undefined` when its call was never seen (e.g. log truncation). */
	getToolCall = (callId) => this.toolCalls.get(callId);
	subscribe = (listener) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};
	/** Append one live session event, ignoring anything already seeded/seen. */
	appendEvent(event) {
		if (event.seq <= this.lastSeq) return;
		this.lastSeq = event.seq;
		if (event.type === "tool/call") {
			const call = {
				name: event.data.name,
				arguments: event.data.arguments
			};
			this.toolCalls.set(event.data.callId, call);
			this.pendingToolCallsMap.set(event.data.callId, call);
			this.set({
				events: [...this.state.events, event],
				pendingToolCalls: this.pendingToolCallsSnapshot()
			});
			return;
		}
		if (event.type === "tool/result") {
			this.pendingToolCallsMap.delete(event.data.message.source.callId);
			this.set({
				events: [...this.state.events, event],
				pendingToolCalls: this.pendingToolCallsSnapshot()
			});
			return;
		}
		if (event.type === "assistant/chunk") {
			this.foldChunk(event.data);
			return;
		}
		if (event.type === "assistant/message") {
			this.streamingAssembler = void 0;
			this.streamingKey = void 0;
			this.set({
				events: [...this.state.events, event],
				streaming: void 0
			});
			return;
		}
		this.set({ events: [...this.state.events, event] });
	}
	/** Snapshot `pendingToolCallsMap` into `TuiState`'s array shape, in call order. */
	pendingToolCallsSnapshot() {
		return [...this.pendingToolCallsMap.entries()].map(([callId, call]) => ({
			callId,
			...call
		}));
	}
	/** Fold one raw stream chunk into the in-flight step's live text, keyed by `{turn, step}`. */
	foldChunk(data) {
		const { turn, step, chunk } = data;
		if (this.streamingKey?.turn !== turn || this.streamingKey?.step !== step) {
			this.streamingAssembler = new BlockAssembler();
			this.streamingKey = {
				turn,
				step
			};
		}
		this.streamingAssembler.push(chunk);
		const blocks = this.streamingAssembler.blocks();
		const text = textOf(blocks);
		const reasoningText = reasoningOf(blocks);
		this.set({ streaming: text === "" && reasoningText === "" ? void 0 : {
			turn,
			step,
			text,
			reasoningText
		} });
	}
	setStatus(status) {
		if (status === this.state.status) return;
		this.set({ status });
	}
	setQueued(queued) {
		this.set({ queued });
	}
	setNotice(notice) {
		this.set({ notice });
	}
	setPermission(permission) {
		this.set({ permission });
	}
	/** Refresh the session's current goal from the 'goal' session projection; `undefined` when the projection unit isn't composed, `null` before the first create or after a clear. */
	setGoal(goal) {
		this.set({ goal });
	}
	/** Refresh the session's current title from the 'title' session projection; `undefined` when `dsh-session-title` isn't composed, `null` before the first accepted title. */
	setTitle(title) {
		this.set({ title });
	}
	setStats(stats) {
		this.set({ stats });
	}
	setPreset(preset) {
		this.set({ preset });
	}
	shellRunSeq = 0;
	/** Begin one local shell-escape run; its output accumulates via `appendShellOutput` until `finishShellRun` settles it into the transcript. */
	startShellRun(command) {
		const id = ++this.shellRunSeq;
		this.set({ shellRun: {
			id,
			command,
			output: ""
		} });
		return id;
	}
	/** Append one chunk of stdout/stderr to the in-flight run; a no-op once it's settled or superseded by a later run. */
	appendShellOutput(id, chunk) {
		if (this.state.shellRun?.id !== id) return;
		this.set({ shellRun: {
			...this.state.shellRun,
			output: this.state.shellRun.output + chunk
		} });
	}
	/** Settle the in-flight run into the permanent transcript; a no-op once it's already settled or superseded. */
	finishShellRun(id, exitCode) {
		if (this.state.shellRun?.id !== id) return;
		const { command, output } = this.state.shellRun;
		this.set({
			shellRun: void 0,
			shellHistory: [...this.state.shellHistory, {
				id,
				command,
				output,
				exitCode,
				afterSeq: this.lastSeq
			}]
		});
	}
	/** Open the `/model` overlay to a fresh, loading provider list. */
	openModelProfile() {
		this.set({ overlay: {
			kind: "modelProfile",
			modelProfile: {
				view: "list",
				providers: void 0,
				selected: 0,
				draft: void 0,
				formKey: 0,
				discovered: void 0,
				busy: true,
				error: void 0
			}
		} });
	}
	/** Open the `/login` sign-in overlay to a fresh, loading flow list. */
	openLogin() {
		this.set({ overlay: {
			kind: "login",
			login: {
				flows: void 0,
				selected: 0,
				signingIn: void 0,
				prompt: void 0,
				busy: true,
				error: void 0
			}
		} });
	}
	/** Patch the open `/login` overlay's sub-state; a no-op once it's closed. */
	updateLogin(patch) {
		if (this.state.overlay.kind !== "login") return;
		this.set({ overlay: {
			kind: "login",
			login: {
				...this.state.overlay.login,
				...patch
			}
		} });
	}
	/** Open the `/trajectory` ledger overlay. */
	openTrajectory() {
		this.set({ overlay: { kind: "trajectory" } });
	}
	/** Open the expandable Tool Cards inspector. */
	openToolCards() {
		this.set({ overlay: { kind: "toolCards" } });
	}
	/** Open the `/context` usage overlay. */
	openContext() {
		this.set({ overlay: { kind: "context" } });
	}
	/** Open the `/plugins` loaded-plugin-tree overlay with a snapshotted row list. */
	openPlugins(rows) {
		this.set({ overlay: {
			kind: "plugins",
			rows
		} });
	}
	/** Open the `/presets` overlay to a fresh, loading roster. */
	openAgentPresets(init) {
		this.set({ overlay: {
			kind: "agentPresets",
			agentPresets: {
				rows: [],
				selected: 0,
				current: init.current,
				blank: init.blank,
				busy: true,
				error: void 0
			}
		} });
	}
	/** Present one pending tool-approval decision, taking over the live region. */
	openApproval(approval) {
		this.set({ overlay: {
			kind: "approval",
			approval
		} });
	}
	/** Present one pending question, taking over the live region. */
	openUserQuestion(userQuestion) {
		this.set({ overlay: {
			kind: "userQuestion",
			userQuestion
		} });
	}
	/** Close whichever overlay is open, restoring the normal prompt/status controls. */
	closeOverlay() {
		this.set({ overlay: CLOSED_OVERLAY });
	}
	/** Patch the open `/model` overlay's sub-state; a no-op once it's closed. */
	updateModelProfile(patch) {
		if (this.state.overlay.kind !== "modelProfile") return;
		this.set({ overlay: {
			kind: "modelProfile",
			modelProfile: {
				...this.state.overlay.modelProfile,
				...patch
			}
		} });
	}
	/** Patch the open `/presets` overlay's sub-state; a no-op once it's closed. */
	updateAgentPresets(patch) {
		if (this.state.overlay.kind !== "agentPresets") return;
		this.set({ overlay: {
			kind: "agentPresets",
			agentPresets: {
				...this.state.overlay.agentPresets,
				...patch
			}
		} });
	}
	/** Move the `/presets` overlay's list cursor. */
	selectAgentPresetRow(index) {
		this.updateAgentPresets({ selected: index });
	}
	/** Mark the `@`-mention file index as loading; a no-op once candidates are already present. */
	setFileIndexLoading() {
		if (this.state.fileIndex.candidates !== void 0) return;
		this.set({ fileIndex: {
			candidates: void 0,
			loading: true
		} });
	}
	/** Settle the `@`-mention file index once `loadFileIndex` resolves. */
	setFileIndex(candidates) {
		this.set({ fileIndex: {
			candidates,
			loading: false
		} });
	}
	/** Record a newer npm-published version found by the startup update check; persists for the session (not cleared by `/clear`'s notice reset) until dismissed by a fresh check finding none. */
	setUpdateHint(version) {
		this.set({ updateHint: version });
	}
	set(partial) {
		this.state = {
			...this.state,
			...partial
		};
		for (const listener of this.listeners) listener();
	}
};
//#endregion
//#region src/tui/statsFormat.ts
/**
* Compact token count: 517 / 12.2K / 517K / 1.2M (one decimal under three digits).
* @param n - token count.
* @returns display string.
*/
function formatTokens(n) {
	const scaled = (v) => v >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10);
	if (n < 1e3) return String(n);
	if (n < 1e6) return `${scaled(n / 1e3)}K`;
	return `${scaled(n / 1e6)}M`;
}
/**
* Compact duration: 45.2s under a minute, 2m42s from there on.
* @param ms - duration in milliseconds.
* @returns display string.
*/
function formatDuration(ms) {
	const s = ms / 1e3;
	if (s < 60) return `${Math.round(s * 10) / 10}s`;
	const whole = Math.round(s);
	return `${Math.floor(whole / 60)}m${whole % 60}s`;
}
/**
* Compact throughput: one decimal under 10 tok/s, whole above.
* @param tps - tokens per second.
* @returns display string.
*/
function formatTokensPerSecond(tps) {
	const clamped = Math.max(0, tps);
	return clamped >= 10 ? String(Math.round(clamped)) : String(Math.round(clamped * 10) / 10);
}
/**
* Sum the three disjoint prompt-side billing buckets.
* @param usage - the session's token-usage projection value.
* @returns billed input tokens.
*/
function billedInputTokens(usage) {
	return usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
}
/**
* Cache-hit share of prompt-side input over the whole durable log.
* @param usage - the session's token-usage projection value.
* @returns rounded integer percent, or null when no input was billed.
*/
function cacheHitPercent(usage) {
	const denominator = billedInputTokens(usage);
	return denominator === 0 ? null : Math.round(usage.cacheReadTokens / denominator * 100);
}
/**
* Build the pipe-separated stats line for the status bar, e.g.
* `1 turns · 1 steps| LLM 4.3s| TTFT avg 1.1s · 131 tok/s| Cache hit 80%| Input 9.1K tok · Output 412 tok`.
* A group with no data drops out whole; an empty return means nothing to show yet.
* @param stats - whole-log turn/step counts and wall times, or `undefined` without the projection unit mounted.
* @param usage - whole-log provider token usage, or `undefined` without the projection unit mounted.
* @returns the joined line, or `''` when there is nothing to display.
*/
function buildStatsLine(stats, usage) {
	const groups = [];
	if (stats !== void 0 && stats.steps > 0) {
		groups.push(`${stats.turns} turns · ${stats.steps} steps`);
		const durations = [];
		if (stats.llmMs > 0) durations.push(`LLM ${formatDuration(stats.llmMs)}`);
		if (stats.toolMs > 0) durations.push(`Tool call ${formatDuration(stats.toolMs)}`);
		if (durations.length > 0) groups.push(durations.join(" · "));
		const speeds = [];
		if (stats.ttftSteps > 0) speeds.push(`TTFT avg ${formatDuration(stats.ttftMs / stats.ttftSteps)}`);
		if (stats.decodeMs > 0) speeds.push(`${formatTokensPerSecond(stats.decodeTokens / (stats.decodeMs / 1e3))} tok/s`);
		if (speeds.length > 0) groups.push(speeds.join(" · "));
	}
	if (usage !== void 0 && (billedInputTokens(usage) > 0 || usage.outputTokens > 0)) {
		const cacheHit = cacheHitPercent(usage);
		if (cacheHit !== null) groups.push(`Cache hit ${cacheHit}%`);
		groups.push(`Input ${formatTokens(billedInputTokens(usage))} tok · Output ${formatTokens(usage.outputTokens)} tok`);
	}
	return groups.join("| ");
}
/**
* Derive occupancy from the newest pressure sample, or `null` while either
* side (a usage sample, a known route capacity) hasn't arrived yet.
* @param pressure - the session's context-pressure projection value.
* @returns occupancy figures, or `null` when there is nothing to show yet.
*/
function contextOccupancy(pressure) {
	const usedTokens = pressure?.projectedTokens ?? pressure?.pressureTokens;
	if (usedTokens === void 0 || pressure?.contextWindow === void 0) return null;
	return {
		percent: Math.min(100, Math.round(usedTokens / pressure.contextWindow * 100)),
		usedTokens,
		contextWindow: pressure.contextWindow
	};
}
/**
* Build the always-on compact context-usage line, e.g. `Context 1% · ~8.1K / 1M tok`.
* @param pressure - the session's context-pressure projection value.
* @returns the display line, or `''` when there is nothing to show yet.
*/
function buildContextLine(pressure) {
	const occupancy = contextOccupancy(pressure);
	if (occupancy === null) return "";
	return `Context ${occupancy.percent}% · ~${formatTokens(occupancy.usedTokens)} / ${formatTokens(occupancy.contextWindow)} tok`;
}
/**
* Proportional breakdown rows for the `/context` overlay's bar. The three
* heuristic figures are composition only — they do not sum to
* `occupancy.usedTokens` — so segment widths are scaled to `occupancy.percent`
* rather than treated as an independent total; see `ContextBreakdownProjection`'s doc comment.
* @param occupancy - this session's occupancy figures, or `null` without a usage sample yet.
* @param breakdown - the session's context-breakdown projection value.
* @returns the three rows in System/Tools/Messages order, or `[]` when there is nothing to show yet.
*/
function contextBreakdownRows(occupancy, breakdown) {
	if (occupancy === null || breakdown === void 0) return [];
	const total = breakdown.systemTokens + breakdown.toolsTokens + breakdown.messageTokens;
	if (total === 0) return [];
	const scale = (tokens) => occupancy.percent * tokens / total;
	return [
		{
			label: "System prompt",
			tokens: breakdown.systemTokens,
			width: scale(breakdown.systemTokens)
		},
		{
			label: "Tools",
			tokens: breakdown.toolsTokens,
			width: scale(breakdown.toolsTokens)
		},
		{
			label: "Messages",
			tokens: breakdown.messageTokens,
			width: scale(breakdown.messageTokens)
		}
	];
}
//#endregion
//#region src/sessionId.ts
/**
* Session id prefix helpers shared between id generation/resolution
* (`src/index.ts`) and display (`src/tui/StatusBar.tsx`). `session-` is the
* de facto convention for top-level interactive sessions across the harness
* (web portal, headless bundle), so ids keep the prefix on disk; only
* user-facing text strips it.
* @module @tomowang/dsh-tui/sessionId
*/
const SESSION_ID_PREFIX = "session-";
/** Strip the `session-` prefix for display, if present. */
function stripSessionIdPrefix(id) {
	return id.startsWith(SESSION_ID_PREFIX) ? id.slice(8) : id;
}
//#endregion
//#region src/tui/liveText.ts
const dim = fg(theme.muted);
const accent = fg(theme.accent);
const warning$1 = fg(theme.warning);
function buildStatusBarText(params) {
	const { sessionId, provider, model, status, queuedCount, presetLabel, eventCount, spinnerChar } = params;
	const queuedSuffix = queuedCount > 0 ? ` · ${queuedCount} queued` : "";
	const presetSegment = presetLabel === void 0 ? "" : ` · ${presetLabel}`;
	const spinnerPart = status === "running" ? spinnerChar : "";
	return dim(`session ${stripSessionIdPrefix(sessionId)} · `) + accent(`${provider}/${model}`) + dim(`${presetSegment} · ${spinnerPart} ${status}${queuedSuffix} · ${eventCount} events`);
}
function previewOf(message) {
	return truncate(message.content.filter((block) => block.type === "text").map((block) => block.text).join(""), 80);
}
function buildQueuedText(queued) {
	if (queued.length === 0) return "";
	return queued.map((message) => dim(`↳ queued: ${previewOf(message)}`)).join("\n");
}
const PERMISSION_LABELS = {
	"read-only": "Read Only",
	"workspace-write": "Workspace Write",
	"danger-full-access": "Full Access",
	custom: "Custom"
};
const PERMISSION_ICONS = {
	"read-only": "⊘",
	"workspace-write": "✎",
	"danger-full-access": "‼",
	custom: "⊛"
};
const PERMISSION_COLORS = {
	"read-only": theme.info,
	"workspace-write": theme.success,
	"danger-full-access": theme.error,
	custom: theme.muted
};
/**
* Persistent low-key dock row nudging the reader to upgrade once the
* startup registry check (`src/updateCheck.ts`) finds a newer published
* version; renders nothing while unchecked or already current. Unlike
* `notice`, this isn't cleared on the next input — it's meant to stay
* visible for the rest of the session, mirroring how `gh`/`npm` surface an
* available-update line.
*/
function buildUpdateHintText(currentVersion, latestVersion) {
	if (latestVersion === void 0) return "";
	return warning$1(`⬆ ACRYL update available: v${currentVersion} → v${latestVersion}`) + dim(" (run `pnpm add -g @acryl/cli` to upgrade)");
}
function buildPermissionText(permission) {
	if (permission === void 0) return "";
	const icon = PERMISSION_ICONS[permission.current] ?? "•";
	const label = PERMISSION_LABELS[permission.current] ?? permission.current;
	return `${fg(PERMISSION_COLORS[permission.current] ?? theme.muted)(`${icon} ${label}`)}${dim(" (shift+tab to cycle)")}`;
}
/** Human label for one durable goal phase — the single source of truth shared by the `/goal` notice (`index.ts`) and this strip. */
function goalPhaseLabel(phase) {
	switch (phase) {
		case "active": return "active";
		case "paused": return "paused";
		case "blocked": return "blocked";
		case "complete": return "complete";
	}
}
/** Phase color for the goal glyph + label; active reads green, paused amber, blocked coral. */
const GOAL_PHASE_COLORS = {
	active: theme.success,
	paused: theme.warning,
	blocked: theme.error
};
/** Long-objective cap for the goal strip, matching the queued-preview cap. */
const GOAL_OBJECTIVE_LIMIT = 80;
/**
* The goal strip docked above the composer — the terminal GoalBar. Mirrors
* the web portal's rendering rule exactly: loading (`undefined` — projection
* unit not composed), absent/cleared (`null`), and complete goals render
* nothing; a present goal shows a goal glyph, its phase label, and the
* truncated objective, with the blocker explanation appended for a blocked
* goal (the portal shows it as a hover tooltip, which a terminal cannot).
* Mutations live on the `/goal` command, not on the strip.
*/
/**
* Terminal window/tab title: `<session title> — dsh-tui` once the optional
* `dsh-session-title` service has accepted one for this session, or just
* `dsh-tui` before that (loading) or without the service composed —
* mirroring the harness's own `<session title> — <configured title>` OSC 0
* convention. Plain text, never ANSI-colored: an OSC 0 title string is
* displayed verbatim by the terminal chrome, not interpreted as SGR.
*/
function buildTerminalTitle(title) {
	return title === null || title === void 0 ? "ACRYL" : `${title} — ACRYL`;
}
function buildGoalBarText(goal) {
	if (goal === void 0 || goal === null || goal.goal.phase === "complete") return "";
	const snapshot = goal.goal;
	const color = fg(GOAL_PHASE_COLORS[snapshot.phase] ?? theme.muted);
	const label = goalPhaseLabel(snapshot.phase);
	const objective = truncate(snapshot.objective, GOAL_OBJECTIVE_LIMIT);
	const blocker = snapshot.phase === "blocked" && snapshot.blockedReason !== void 0 ? dim(` · ${snapshot.blockedReason.code}: ${truncate(snapshot.blockedReason.message, GOAL_OBJECTIVE_LIMIT)}`) : "";
	return `${color(`🎯 ${label}`)} · ${objective}${blocker}`;
}
//#endregion
//#region src/tui/text.ts
/**
* Thin pi-tui `Component` wrappers around already-ANSI-styled strings.
* `render.ts`/`markdown.ts`/`bannerText.ts` produce terminal-ready text
* (colors, bold, links baked in via raw SGR/OSC sequences) — these wrappers
* exist only to satisfy pi-tui's `Component` interface (`render(width)`,
* `invalidate()`) without re-styling that text, mirroring how the old Ink
* `<Text>` usage printed these strings unmodified.
* @module @tomowang/dsh-tui/tui/text
*/
/** Left/right margin applied to main-panel message content, so it doesn't sit flush against either terminal edge. */
const TRANSCRIPT_MARGIN = 2;
const TRANSCRIPT_INDENT = " ".repeat(TRANSCRIPT_MARGIN);
/** Word-wraps already-ANSI-styled text to fit within `width` minus the transcript's left/right margin, then indents every resulting line. Used by the live-region rows (streaming text, pending tool calls, live shell output), which rebuild their string from the store on every render — see `createTranscriptLine` for the settled, append-only transcript rows, which get the same margin from pi-tui's own `Text` instead so repeated renders can be cached. */
function padTranscriptText(text, width) {
	if (text === "") return [];
	return wrapTextWithAnsi(text, Math.max(1, width - TRANSCRIPT_MARGIN * 2)).map((line) => `${TRANSCRIPT_INDENT}${line}`);
}
/** A settled transcript line: pi-tui's `Text` component wraps to width and applies the same left/right margin as `padTranscriptText`, but — unlike our own `Component`s here — caches its wrapped output keyed on `(text, width)`, so appended transcript history isn't re-wrapped on every unrelated store update (e.g. a streaming token delta) the way a hand-rolled render() would. Content is fixed at construction — transcript rows are append-only and never mutated after being added. */
function createTranscriptLine(text) {
	return new Text(text, TRANSCRIPT_MARGIN, 0);
}
/** A block of pre-styled text rebuilt from the current viewport width on every render — for content (the banner) whose own layout is width-responsive. */
var DynamicText = class {
	build;
	constructor(build) {
		this.build = build;
	}
	invalidate() {}
	render(width) {
		const text = this.build(width);
		return text === "" ? [] : text.split("\n");
	}
};
//#endregion
//#region src/tui/commands.ts
const SLASH_COMMANDS = [
	{
		command: "/help",
		description: "Show help and available commands"
	},
	{
		command: "/login",
		description: "Configure provider authentication (API key)"
	},
	{
		command: "/logout",
		description: "Remove provider authentication"
	},
	{
		command: "/model",
		description: "Manage LLM provider profiles"
	},
	{
		command: "/trajectory",
		description: "Browse the turn/step event ledger"
	},
	{
		command: "/tools",
		description: "Browse and expand tool cards"
	},
	{
		command: "/context",
		description: "Show context window usage"
	},
	{
		command: "/plugins",
		description: "Show the loaded plugin tree"
	},
	{
		command: "/presets",
		description: "Show and switch agent presets (only while the session is blank)"
	},
	{
		command: "/goal",
		description: "Set or view the long-running goal: /goal <objective> | clear | edit <objective> | pause | resume"
	},
	{
		command: "/plan",
		description: "Enter plan mode, optionally with a message; /plan off to leave"
	},
	{
		command: "/compact",
		description: "Summarize and compact session history"
	},
	{
		command: "/clear",
		description: "Clear the screen and start a new session"
	},
	{
		command: "/exit",
		description: "Exit ACRYL"
	},
	{
		command: "/quit",
		description: "Exit ACRYL"
	}
];
Math.max(...SLASH_COMMANDS.map((c) => c.command.length));
function matchSlashCommands(query) {
	return SLASH_COMMANDS.filter((c) => c.command.startsWith(query));
}
function commandQuery(value) {
	const query = value.trim();
	const isCommandMode = value.startsWith("/") && !/\s/.test(query);
	return {
		isCommandMode,
		matches: isCommandMode ? matchSlashCommands(query) : []
	};
}
/** `/plan` on its own, or followed by whitespace — matches the harness's own `/plan [message]`/`/plan off` syntax. */
const PLAN_COMMAND = /^\/plan(?:$|\s)/u;
/**
* `/plan`'s argument takes free text (a message, or the literal `off`), so unlike every other
* command it can't route through {@link matchSlashCommands}'s whitespace-free matching.
* @param text - Raw submitted line.
* @returns The trimmed argument text, or `undefined` when `text` isn't a `/plan` invocation.
*/
function parsePlanCommand(text) {
	const trimmed = text.trim();
	if (!PLAN_COMMAND.test(trimmed)) return void 0;
	return trimmed.slice(5).trim();
}
/** `/goal` on its own, or followed by whitespace — its objective is free text, so it shares `/plan`'s parse-ahead shape. */
const GOAL_COMMAND = /^\/goal(?:$|\s)/u;
/**
* Parse a `/goal` invocation exactly the way `@deepseek-ai/dsh-command-goal`'s own
* `parseGoalCommand` does — bare `/goal` shows the current goal, the control words
* `clear`/`pause`/`resume` (case-insensitive) mutate it, `edit <objective>` replaces
* the objective (bare `edit` is an error), and any other text is a create objective.
* @param text - Raw submitted line.
* @returns The parsed command, or `undefined` when `text` isn't a `/goal` invocation.
*/
function parseGoalCommand(text) {
	const trimmed = text.trim();
	if (!GOAL_COMMAND.test(trimmed)) return void 0;
	const input = trimmed.slice(5).trim();
	if (input.length === 0) return { kind: "show" };
	const control = input.toLowerCase();
	if (control === "clear") return { kind: "clear" };
	if (control === "pause") return { kind: "pause" };
	if (control === "resume") return { kind: "resume" };
	if (control === "edit") return { kind: "invalid-edit" };
	if (/^edit(?=\s)/iu.test(input)) return {
		kind: "edit",
		objective: input.slice(4).trim()
	};
	return {
		kind: "create",
		objective: input
	};
}
function runSlashCommand(command, actions) {
	switch (command) {
		case "/help":
			actions.help();
			return;
		case "/exit":
		case "/quit":
			actions.shutdown();
			return;
		case "/clear":
			actions.clear();
			return;
		case "/model":
			actions.openModelProfile();
			return;
		case "/login":
			actions.login();
			return;
		case "/logout":
			actions.logout();
			return;
		case "/trajectory":
			actions.openTrajectory();
			return;
		case "/tools":
			actions.openToolCards();
			return;
		case "/context":
			actions.openContext();
			return;
		case "/plugins":
			actions.openPlugins();
			return;
		case "/presets":
			actions.openAgentPresets();
			return;
		case "/compact":
			actions.compact();
			return;
	}
}
//#endregion
//#region src/tui/piTheme.ts
const bold$10 = (s) => `\x1b[1m${s}\x1b[0m`;
const selectListTheme = {
	selectedPrefix: fg(theme.primary),
	selectedText: (s) => bold$10(fg(theme.primary)(s)),
	description: fg(theme.muted),
	scrollInfo: fg(theme.muted),
	noMatch: fg(theme.muted)
};
const editorTheme = {
	borderColor: fg(theme.primary),
	selectList: selectListTheme
};
const shellModeEditorBorderColor = fg(theme.warning);
const NOT_MENTION = {
	isMentionMode: false,
	query: "",
	start: -1
};
/**
* Find the `@`-mention token, if any, ending at `cursor`.
* @param value - the full prompt buffer.
* @param cursor - the buffer offset the reader is currently editing at.
* @returns the open mention's query/span, or `isMentionMode: false` outside one.
*/
function mentionQuery(value, cursor) {
	let i = cursor;
	while (i > 0 && !/\s/.test(value[i - 1])) i--;
	if (i === cursor || value[i] !== "@") return NOT_MENTION;
	const before = value[i - 1];
	if (before !== void 0 && !/\s/.test(before)) return NOT_MENTION;
	return {
		isMentionMode: true,
		query: value.slice(i + 1, cursor),
		start: i
	};
}
/**
* Filter and rank file candidates for a `@`-mention query.
* @param candidates - the full file index, repo-relative paths.
* @param query - text typed after `@` (case-insensitive substring match).
* @param limit - max rows returned.
* @returns matches ranked by path-prefix, then basename-prefix, then path length.
*/
function matchFileCandidates(candidates, query, limit = 10) {
	const needle = query.toLowerCase();
	const matches = candidates.filter((path) => path.toLowerCase().includes(needle));
	matches.sort((a, b) => rank(a, needle) - rank(b, needle) || a.length - b.length);
	return matches.slice(0, limit);
}
function rank(path, needle) {
	const lower = path.toLowerCase();
	if (lower.startsWith(needle)) return 0;
	if (lower.slice(lower.lastIndexOf("/") + 1).startsWith(needle)) return 1;
	return 2;
}
//#endregion
//#region src/tui/promptAutocomplete.ts
function offsetToLineCol(lines, offset) {
	let remaining = offset;
	for (let line = 0; line < lines.length; line++) {
		const len = lines[line].length;
		if (remaining <= len) return {
			line,
			col: remaining
		};
		remaining -= len + 1;
	}
	const lastLine = Math.max(0, lines.length - 1);
	return {
		line: lastLine,
		col: lines[lastLine]?.length ?? 0
	};
}
function lineColToOffset(lines, line, col) {
	let offset = 0;
	for (let i = 0; i < line; i++) offset += lines[i].length + 1;
	return offset + col;
}
function splitWithCursor(text, offset) {
	const lines = text.split("\n");
	const { line, col } = offsetToLineCol(lines, offset);
	return {
		lines,
		cursorLine: line,
		cursorCol: col
	};
}
var PromptAutocompleteProvider = class {
	getFileCandidates;
	triggerCharacters = ["/", "@"];
	constructor(getFileCandidates) {
		this.getFileCandidates = getFileCandidates;
	}
	async getSuggestions(lines, cursorLine, cursorCol, { signal }) {
		const value = lines.join("\n");
		const offset = lineColToOffset(lines, cursorLine, cursorCol);
		const { isCommandMode, matches } = commandQuery(value);
		if (isCommandMode) {
			if (matches.length === 0) return null;
			return {
				items: matches.map((c) => ({
					value: c.command,
					label: c.command,
					description: c.description
				})),
				prefix: value.trim()
			};
		}
		const mention = mentionQuery(value, offset);
		if (!mention.isMentionMode) return null;
		const candidates = await this.getFileCandidates();
		if (signal.aborted) return null;
		const paths = matchFileCandidates(candidates, mention.query);
		if (paths.length === 0) return null;
		return {
			items: paths.map((path) => ({
				value: path,
				label: path
			})),
			prefix: mention.query
		};
	}
	applyCompletion(lines, cursorLine, cursorCol, item, _prefix) {
		const value = lines.join("\n");
		const offset = lineColToOffset(lines, cursorLine, cursorCol);
		const { isCommandMode } = commandQuery(value);
		if (isCommandMode) return splitWithCursor(item.value, item.value.length);
		const mention = mentionQuery(value, offset);
		if (mention.isMentionMode) {
			const start = mention.start + 1;
			const end = start + mention.query.length;
			const inserted = `${item.value} `;
			return splitWithCursor(value.slice(0, start) + inserted + value.slice(end), start + inserted.length);
		}
		return {
			lines,
			cursorLine,
			cursorCol
		};
	}
	shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
		return mentionQuery(lines.join("\n"), lineColToOffset(lines, cursorLine, cursorCol)).isMentionMode;
	}
};
//#endregion
//#region src/tui/CustomEditor.ts
const EXIT_ARM_TIMEOUT_MS = 2e3;
const armedHint = fg(theme.muted);
const shellModeHint = fg(theme.warning);
var CustomEditor = class extends Editor {
	actions;
	deps;
	shellMode = false;
	armedKey;
	armTimer;
	constructor(tui, actions, deps) {
		super(tui, editorTheme, {
			paddingX: 2,
			autocompleteMaxVisible: 20
		});
		this.actions = actions;
		this.deps = deps;
		this.setAutocompleteProvider(new PromptAutocompleteProvider(deps.getFileCandidates));
		this.onSubmit = (text) => this.handleSubmit(text);
		for (const line of deps.history.slice(-100)) this.addToHistory(line);
	}
	armOrConfirmExit(key) {
		if (this.armedKey === key) {
			if (this.armTimer !== void 0) clearTimeout(this.armTimer);
			this.armedKey = void 0;
			this.actions.shutdown();
			return;
		}
		if (this.armTimer !== void 0) clearTimeout(this.armTimer);
		this.armedKey = key;
		this.tui.requestRender();
		this.armTimer = setTimeout(() => {
			this.armTimer = void 0;
			this.armedKey = void 0;
			this.tui.requestRender();
		}, EXIT_ARM_TIMEOUT_MS);
	}
	clearArm() {
		if (this.armTimer !== void 0) clearTimeout(this.armTimer);
		this.armTimer = void 0;
		this.armedKey = void 0;
	}
	setShellMode(enabled) {
		this.shellMode = enabled;
		this.borderColor = enabled ? shellModeEditorBorderColor : editorTheme.borderColor;
	}
	handleSubmit(text) {
		const trimmed = text.trim();
		const shellMode = this.shellMode;
		this.setShellMode(false);
		if (trimmed === "") return;
		if (this.deps.history.at(-1) !== trimmed) {
			this.deps.history.push(trimmed);
			this.actions.recordHistory(trimmed);
		}
		this.addToHistory(trimmed);
		if (shellMode) {
			this.actions.runShell(trimmed);
			return;
		}
		const planArgs = parsePlanCommand(trimmed);
		if (planArgs !== void 0) {
			this.actions.plan(planArgs);
			return;
		}
		const goalCommand = parseGoalCommand(trimmed);
		if (goalCommand !== void 0) {
			this.actions.goal(goalCommand);
			return;
		}
		const matches = trimmed.startsWith("/") && !/\s/.test(trimmed) ? matchSlashCommands(trimmed) : [];
		if (matches.length > 0) {
			runSlashCommand(matches[0].command, this.actions);
			return;
		}
		this.actions.send(trimmed);
	}
	handleInput(data) {
		if (matchesKey(data, Key.ctrl("o"))) {
			this.actions.openToolCards();
			return;
		}
		if (!this.shellMode && data === "!" && this.getText() === "") {
			this.setShellMode(true);
			this.tui.requestRender();
			return;
		}
		if (this.shellMode && (matchesKey(data, Key.escape) || matchesKey(data, Key.backspace) && this.getText() === "")) {
			this.setShellMode(false);
			this.tui.requestRender();
			return;
		}
		if (matchesKey(data, "shift+tab")) {
			this.actions.cyclePermission();
			return;
		}
		if (matchesKey(data, Key.ctrl("c"))) {
			if (this.deps.getStatus() === "running") {
				this.actions.cancel();
				return;
			}
			if (this.getText() !== "") {
				this.setText("");
				this.setShellMode(false);
				this.clearArm();
				this.tui.requestRender();
				return;
			}
			this.armOrConfirmExit("c");
			return;
		}
		if (matchesKey(data, Key.ctrl("d"))) {
			if (this.deps.getStatus() === "running") return;
			if (this.getText() !== "") {
				super.handleInput(data);
				return;
			}
			this.armOrConfirmExit("d");
			return;
		}
		super.handleInput(data);
	}
	render(width) {
		const hints = [];
		if (this.armedKey !== void 0) hints.push(armedHint(`Press Ctrl+${this.armedKey.toUpperCase()} again to exit`));
		if (this.shellMode) hints.push(shellModeHint("! shell mode — Enter runs the command, Esc/Backspace exits"));
		return [...hints, ...this.withPromptPrefix(super.render(width), width)];
	}
	/**
	* Splices a `'› '`/`'! '` prompt marker into the editor box's first
	* content row (index 1 — index 0 is always the top border), replacing
	* that row's leading `paddingX` spaces. Skipped below `paddingX: 2`'s
	* width-clamped floor (mirrors `Editor.render`'s own `maxPadding` clamp)
	* rather than risk eating actual text in a pathologically narrow terminal.
	*/
	withPromptPrefix(lines, width) {
		if (lines.length < 2) return lines;
		if (Math.max(0, Math.floor((width - 1) / 2)) < 2) return lines;
		const prefix = this.borderColor(this.shellMode ? "! " : "› ");
		const next = [...lines];
		next[1] = prefix + next[1].slice(2);
		return next;
	}
};
//#endregion
//#region src/tui/Spinner.ts
const FRAMES = [
	"⠋",
	"⠙",
	"⠹",
	"⠸",
	"⠼",
	"⠴",
	"⠦",
	"⠧",
	"⠇",
	"⠏"
];
const INTERVAL_MS = 80;
var Spinner = class {
	tui;
	frame = 0;
	timer;
	constructor(tui) {
		this.tui = tui;
	}
	current() {
		return FRAMES[this.frame];
	}
	start() {
		if (this.timer !== void 0) return;
		this.timer = setInterval(() => {
			this.frame = (this.frame + 1) % FRAMES.length;
			this.tui.requestRender();
		}, INTERVAL_MS);
	}
	stop() {
		if (this.timer === void 0) return;
		clearInterval(this.timer);
		this.timer = void 0;
	}
};
//#endregion
//#region src/tui/clipboard.ts
/**
* System-clipboard read, used for right-click paste. Node has no built-in
* clipboard API, so this shells out to the platform's clipboard tool via
* `execFile` (the same `node:child_process` approach used elsewhere for
* platform launchers like `open`/`xdg-open`).
* @module @tomowang/dsh-tui/tui/clipboard
*/
function clipboardCommands() {
	switch (process.platform) {
		case "darwin": return [["pbpaste", []]];
		case "win32": return [["powershell.exe", [
			"-NoProfile",
			"-NonInteractive",
			"-Command",
			"Get-Clipboard"
		]]];
		default: return [
			["xclip", [
				"-selection",
				"clipboard",
				"-o"
			]],
			["xsel", ["--clipboard", "--output"]],
			["wl-paste", ["--no-newline"]]
		];
	}
}
/**
* Read the system clipboard. Resolves with the clipboard text (possibly empty).
* Rejects when no supported clipboard tool is available on this host.
*
* A single trailing newline is stripped: `pbpaste` prints the clipboard verbatim,
* while `xclip`/`xsel`/`Get-Clipboard` append one, so this keeps the result
* consistent with a native terminal paste (which inserts exactly what was copied).
*/
function readClipboard() {
	return new Promise((resolve, reject) => {
		const commands = clipboardCommands();
		let index = 0;
		const attempt = () => {
			if (index >= commands.length) {
				reject(/* @__PURE__ */ new Error("no clipboard tool available"));
				return;
			}
			const [command, args] = commands[index];
			index += 1;
			execFile(command, args, {
				encoding: "utf8",
				maxBuffer: 10 * 1024 * 1024
			}, (error, stdout) => {
				if (error) {
					attempt();
					return;
				}
				resolve(stdout.replace(/\r?\n$/, ""));
			});
		};
		attempt();
	});
}
//#endregion
//#region src/yly/yly-frames.generated.ts
const YLY_FRAMES = {
	"small": [
		[
			"                ",
			"     \x1B[38;2;131;131;131m▄\x1B[0m\x1B[38;2;196;196;196m\x1B[48;2;188;194;203m▀\x1B[0m\x1B[38;2;198;201;209m\x1B[48;2;104;120;148m▀\x1B[0m\x1B[38;2;175;179;188m\x1B[48;2;108;118;138m▀\x1B[0m\x1B[38;2;152;160;177m\x1B[48;2;99;109;129m▀\x1B[0m\x1B[38;2;45;68;110m\x1B[48;2;83;90;106m▀\x1B[0m     ",
			"\x1B[38;2;115;109;115m▄\x1B[0m\x1B[38;2;209;209;204m\x1B[48;2;215;220;227m▀\x1B[0m\x1B[38;2;149;155;162m\x1B[48;2;232;240;253m▀\x1B[0m\x1B[38;2;147;154;169m▄\x1B[0m\x1B[38;2;219;219;216m▄\x1B[0m\x1B[38;2;206;207;212m\x1B[48;2;184;189;204m▀\x1B[0m\x1B[38;2;184;196;216m▀\x1B[0m \x1B[38;2;180;185;195m▀\x1B[0m\x1B[38;2;204;210;217m▀\x1B[0m\x1B[38;2;210;214;220m\x1B[48;2;180;185;201m▀\x1B[0m\x1B[38;2;170;177;187m\x1B[48;2;224;227;234m▀\x1B[0m\x1B[38;2;103;117;149m▄\x1B[0m   ",
			"\x1B[38;2;209;214;222m\x1B[48;2;123;140;170m▀\x1B[0m\x1B[38;2;143;153;180m▀\x1B[0m\x1B[38;2;103;117;144m▀\x1B[0m\x1B[38;2;226;229;230m\x1B[48;2;164;176;194m▀\x1B[0m\x1B[38;2;222;222;225m\x1B[48;2;227;229;234m▀\x1B[0m\x1B[38;2;92;119;156m\x1B[48;2;33;87;180m▀\x1B[0m\x1B[38;2;92;139;214m\x1B[48;2;46;104;223m▀\x1B[0m\x1B[38;2;68;151;227m▄\x1B[0m\x1B[38;2;76;129;210m\x1B[48;2;40;107;231m▀\x1B[0m\x1B[38;2;182;202;242m\x1B[48;2;105;146;243m▀\x1B[0m\x1B[38;2;234;234;234m\x1B[48;2;221;225;227m▀\x1B[0m\x1B[38;2;137;148;172m\x1B[48;2;98;111;133m▀\x1B[0m\x1B[38;2;51;71;112m▀\x1B[0m   ",
			"    \x1B[38;2;185;192;204m\x1B[48;2;103;110;133m▀\x1B[0m\x1B[38;2;180;189;213m\x1B[48;2;190;195;202m▀\x1B[0m\x1B[38;2;161;161;161m▄\x1B[0m\x1B[38;2;190;187;182m▀\x1B[0m\x1B[38;2;93;117;206m▀\x1B[0m\x1B[38;2;190;190;185m▄\x1B[0m\x1B[38;2;203;209;220m\x1B[48;2;136;143;157m▀\x1B[0m\x1B[38;2;169;182;205m\x1B[48;2;33;54;94m▀\x1B[0m \x1B[38;2;144;147;150m▄\x1B[0m\x1B[38;2;123;126;136m\x1B[48;2;196;202;216m▀\x1B[0m\x1B[38;2;95;104;127m\x1B[48;2;71;81;119m▀\x1B[0m",
			"     \x1B[38;2;127;138;159m▀\x1B[0m\x1B[38;2;199;204;214m\x1B[48;2;145;150;175m▀\x1B[0m\x1B[38;2;177;182;191m\x1B[48;2;218;221;228m▀\x1B[0m\x1B[38;2;168;168;168m\x1B[48;2;222;227;235m▀\x1B[0m\x1B[38;2;218;222;227m\x1B[48;2;122;139;170m▀\x1B[0m\x1B[38;2;200;206;217m\x1B[48;2;100;113;136m▀\x1B[0m\x1B[38;2;199;204;214m\x1B[48;2;196;204;217m▀\x1B[0m\x1B[38;2;138;131;116m\x1B[48;2;209;213;220m▀\x1B[0m\x1B[38;2;207;211;216m\x1B[48;2;214;219;228m▀\x1B[0m\x1B[38;2;138;150;170m\x1B[48;2;201;204;209m▀\x1B[0m\x1B[38;2;153;161;180m▄\x1B[0m",
			"      \x1B[38;2;191;198;203m▄\x1B[0m\x1B[38;2;140;151;176m\x1B[48;2;175;179;189m▀\x1B[0m\x1B[38;2;110;126;157m\x1B[48;2;214;215;217m▀\x1B[0m\x1B[38;2;61;85;136m\x1B[48;2;183;192;206m▀\x1B[0m \x1B[38;2;75;97;130m▀\x1B[0m\x1B[38;2;78;102;148m▀\x1B[0m\x1B[38;2;74;97;139m▀\x1B[0m\x1B[38;2;98;117;156m▀\x1B[0m\x1B[38;2;63;83;123m▀\x1B[0m",
			"     \x1B[38;2;202;202;202m\x1B[48;2;129;138;155m▀\x1B[0m\x1B[38;2;254;255;255m\x1B[48;2;147;159;183m▀\x1B[0m\x1B[38;2;132;143;170m\x1B[48;2;52;69;105m▀\x1B[0m\x1B[38;2;187;195;209m\x1B[48;2;99;116;145m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;156;165;184m▀\x1B[0m\x1B[38;2;192;196;204m\x1B[48;2;114;129;158m▀\x1B[0m\x1B[38;2;10;28;68m▄\x1B[0m    ",
			"                "
		],
		[
			"                ",
			"       \x1B[38;2;195;195;196m▄\x1B[0m\x1B[38;2;184;189;201m▄\x1B[0m\x1B[38;2;169;175;189m▄\x1B[0m\x1B[38;2;125;138;162m▄\x1B[0m     ",
			"\x1B[38;2;137;143;157m\x1B[48;2;183;188;199m▀\x1B[0m\x1B[38;2;195;200;209m▄\x1B[0m\x1B[38;2;93;93;99m▄\x1B[0m\x1B[38;2;206;210;215m▄\x1B[0m\x1B[38;2;190;196;206m▄\x1B[0m \x1B[38;2;207;207;203m\x1B[48;2;215;217;221m▀\x1B[0m\x1B[38;2;193;200;215m\x1B[48;2;149;157;175m▀\x1B[0m\x1B[38;2;80;100;137m▀\x1B[0m\x1B[38;2;159;168;182m\x1B[48;2;174;176;180m▀\x1B[0m\x1B[38;2;160;166;175m\x1B[48;2;170;179;198m▀\x1B[0m\x1B[38;2;154;158;165m\x1B[48;2;221;224;228m▀\x1B[0m\x1B[38;2;194;200;211m▄\x1B[0m   ",
			" \x1B[38;2;181;189;204m▀\x1B[0m\x1B[38;2;214;220;229m\x1B[48;2;92;105;136m▀\x1B[0m\x1B[38;2;147;160;182m▀\x1B[0m\x1B[38;2;188;196;213m\x1B[48;2;88;104;130m▀\x1B[0m\x1B[38;2;229;230;231m\x1B[48;2;220;223;228m▀\x1B[0m\x1B[38;2;155;168;193m\x1B[48;2;119;152;197m▀\x1B[0m\x1B[38;2;33;108;222m\x1B[48;2;37;111;234m▀\x1B[0m\x1B[38;2;47;118;219m▄\x1B[0m\x1B[38;2;19;95;251m\x1B[48;2;27;92;218m▀\x1B[0m\x1B[38;2;228;226;228m\x1B[48;2;217;222;233m▀\x1B[0m\x1B[38;2;208;213;219m\x1B[48;2;184;192;207m▀\x1B[0m\x1B[38;2;161;174;192m▀\x1B[0m   ",
			"     \x1B[38;2;176;182;198m▀\x1B[0m\x1B[38;2;179;186;202m\x1B[48;2;195;199;207m▀\x1B[0m\x1B[38;2;0;0;11m\x1B[48;2;194;197;199m▀\x1B[0m\x1B[38;2;195;195;195m\x1B[48;2;104;121;133m▀\x1B[0m\x1B[38;2;22;33;116m▀\x1B[0m\x1B[38;2;203;203;201m▄\x1B[0m\x1B[38;2;168;176;188m\x1B[48;2;100;111;131m▀\x1B[0m\x1B[38;2;80;93;123m▀\x1B[0m\x1B[38;2;154;154;154m▄\x1B[0m\x1B[38;2;141;144;153m\x1B[48;2;170;178;192m▀\x1B[0m\x1B[38;2;97;109;129m\x1B[48;2;54;72;100m▀\x1B[0m",
			"      \x1B[38;2;73;73;100m▀\x1B[0m\x1B[38;2;182;188;200m▀\x1B[0m\x1B[38;2;212;214;223m\x1B[48;2;201;207;218m▀\x1B[0m\x1B[38;2;217;219;219m\x1B[48;2;168;179;200m▀\x1B[0m\x1B[38;2;187;195;208m▀\x1B[0m\x1B[38;2;197;204;215m\x1B[48;2;150;165;184m▀\x1B[0m\x1B[38;2;188;185;185m\x1B[48;2;177;187;203m▀\x1B[0m\x1B[38;2;241;242;244m\x1B[48;2;177;186;201m▀\x1B[0m\x1B[38;2;169;174;187m\x1B[48;2;184;191;206m▀\x1B[0m\x1B[38;2;179;179;185m\x1B[48;2;145;155;173m▀\x1B[0m",
			"      \x1B[38;2;248;241;235m▄\x1B[0m\x1B[38;2;171;171;166m\x1B[48;2;235;237;239m▀\x1B[0m\x1B[38;2;134;141;156m\x1B[48;2;146;155;176m▀\x1B[0m\x1B[38;2;153;162;183m\x1B[48;2;232;234;237m▀\x1B[0m\x1B[38;2;225;230;238m▄\x1B[0m\x1B[38;2;165;172;192m▄\x1B[0m    ",
			"      \x1B[38;2;151;158;172m▀\x1B[0m\x1B[38;2;190;200;219m▀\x1B[0m\x1B[38;2;48;68;105m▀\x1B[0m\x1B[38;2;157;165;182m▀\x1B[0m\x1B[38;2;200;209;227m▀\x1B[0m\x1B[38;2;101;119;155m▀\x1B[0m    ",
			"                "
		],
		[
			"                ",
			"     \x1B[38;2;162;162;164m▄\x1B[0m\x1B[38;2;188;190;194m\x1B[48;2;196;206;220m▀\x1B[0m\x1B[38;2;197;202;212m\x1B[48;2;77;96;135m▀\x1B[0m\x1B[38;2;179;183;193m\x1B[48;2;153;157;171m▀\x1B[0m\x1B[38;2;128;139;163m\x1B[48;2;163;170;185m▀\x1B[0m\x1B[38;2;159;159;163m▄\x1B[0m     ",
			"\x1B[38;2;142;137;137m▄\x1B[0m\x1B[38;2;153;159;164m\x1B[48;2;197;204;214m▀\x1B[0m\x1B[38;2;172;177;188m\x1B[48;2;209;218;230m▀\x1B[0m\x1B[38;2;177;184;194m▄\x1B[0m\x1B[38;2;205;206;208m▄\x1B[0m\x1B[38;2;208;212;219m\x1B[48;2;177;189;210m▀\x1B[0m\x1B[38;2;150;167;195m▀\x1B[0m \x1B[38;2;163;166;178m▀\x1B[0m\x1B[38;2;178;185;200m\x1B[48;2;65;71;83m▀\x1B[0m\x1B[38;2;202;205;215m\x1B[48;2;205;205;205m▀\x1B[0m\x1B[38;2;164;172;187m\x1B[48;2;198;205;217m▀\x1B[0m\x1B[38;2;0;0;37m▄\x1B[0m   ",
			"\x1B[38;2;179;185;198m\x1B[48;2;127;140;165m▀\x1B[0m\x1B[38;2;160;173;195m▀\x1B[0m\x1B[38;2;38;63;102m▀\x1B[0m\x1B[38;2;226;230;236m\x1B[48;2;132;141;162m▀\x1B[0m\x1B[38;2;225;227;231m\x1B[48;2;206;209;215m▀\x1B[0m\x1B[38;2;30;83;172m\x1B[48;2;53;87;165m▀\x1B[0m\x1B[38;2;60;116;227m\x1B[48;2;30;78;196m▀\x1B[0m\x1B[38;2;32;137;255m\x1B[48;2;134;167;211m▀\x1B[0m\x1B[38;2;48;123;239m\x1B[48;2;17;88;220m▀\x1B[0m\x1B[38;2;234;238;247m\x1B[48;2;165;174;194m▀\x1B[0m\x1B[38;2;198;205;216m\x1B[48;2;201;208;217m▀\x1B[0m\x1B[38;2;103;122;151m▀\x1B[0m \x1B[38;2;170;170;173m▄\x1B[0m\x1B[38;2;217;217;217m\x1B[48;2;195;202;215m▀\x1B[0m\x1B[38;2;126;138;158m\x1B[48;2;94;114;147m▀\x1B[0m",
			"    \x1B[38;2;178;184;195m▀\x1B[0m\x1B[38;2;208;215;226m\x1B[48;2;182;190;204m▀\x1B[0m\x1B[38;2;227;230;236m▄\x1B[0m\x1B[38;2;139;149;158m▄\x1B[0m \x1B[38;2;0;0;0m\x1B[48;2;201;203;210m▀\x1B[0m\x1B[38;2;137;143;158m\x1B[48;2;160;165;176m▀\x1B[0m\x1B[38;2;106;116;141m\x1B[48;2;166;170;180m▀\x1B[0m\x1B[38;2;178;171;156m\x1B[48;2;199;203;210m▀\x1B[0m\x1B[38;2;205;209;217m\x1B[48;2;197;204;214m▀\x1B[0m\x1B[38;2;102;114;137m\x1B[48;2;156;161;174m▀\x1B[0m\x1B[38;2;82;95;118m▄\x1B[0m",
			"      \x1B[38;2;197;205;217m\x1B[48;2;218;224;236m▀\x1B[0m\x1B[38;2;229;229;230m\x1B[48;2;181;191;208m▀\x1B[0m\x1B[38;2;222;223;227m\x1B[48;2;135;150;178m▀\x1B[0m\x1B[38;2;131;140;161m▀\x1B[0m \x1B[38;2;143;167;207m▀\x1B[0m  \x1B[38;2;110;130;172m▀\x1B[0m ",
			"     \x1B[38;2;221;215;213m▄\x1B[0m\x1B[38;2;241;241;239m\x1B[48;2;249;251;252m▀\x1B[0m\x1B[38;2;179;186;197m\x1B[48;2;134;145;173m▀\x1B[0m\x1B[38;2;167;173;183m\x1B[48;2;203;203;207m▀\x1B[0m\x1B[38;2;168;179;193m\x1B[48;2;222;227;233m▀\x1B[0m\x1B[38;2;154;160;176m▄\x1B[0m     ",
			"    \x1B[38;2;74;87;111m▀\x1B[0m\x1B[38;2;182;188;201m▀\x1B[0m\x1B[38;2;174;185;207m▀\x1B[0m\x1B[38;2;38;60;105m▀\x1B[0m\x1B[38;2;157;164;182m▀\x1B[0m\x1B[38;2;219;226;238m▀\x1B[0m\x1B[38;2;129;146;176m▀\x1B[0m     ",
			"                "
		],
		[
			"                ",
			"       \x1B[38;2;198;199;205m▄\x1B[0m\x1B[38;2;198;202;212m▄\x1B[0m\x1B[38;2;192;195;206m▄\x1B[0m\x1B[38;2;124;138;164m▄\x1B[0m     ",
			"   \x1B[38;2;201;205;213m▄\x1B[0m\x1B[38;2;177;188;207m▄\x1B[0m \x1B[38;2;180;180;180m\x1B[48;2;203;207;214m▀\x1B[0m\x1B[38;2;191;199;212m\x1B[48;2;131;146;176m▀\x1B[0m\x1B[38;2;4;21;57m▀\x1B[0m\x1B[38;2;176;180;186m\x1B[48;2;142;147;157m▀\x1B[0m\x1B[38;2;173;175;178m\x1B[48;2;129;137;155m▀\x1B[0m\x1B[38;2;157;159;166m\x1B[48;2;206;209;215m▀\x1B[0m\x1B[38;2;179;185;199m▄\x1B[0m   ",
			"\x1B[38;2;145;153;169m\x1B[48;2;175;185;204m▀\x1B[0m\x1B[38;2;208;213;216m▄\x1B[0m\x1B[38;2;217;220;224m\x1B[48;2;201;207;216m▀\x1B[0m\x1B[38;2;164;174;193m\x1B[48;2;31;39;79m▀\x1B[0m\x1B[38;2;186;193;206m\x1B[48;2;141;153;173m▀\x1B[0m\x1B[38;2;211;212;216m\x1B[48;2;223;226;232m▀\x1B[0m\x1B[38;2;152;162;188m\x1B[48;2;62;88;142m▀\x1B[0m\x1B[38;2;32;78;180m\x1B[48;2;53;108;215m▀\x1B[0m\x1B[38;2;51;118;218m▄\x1B[0m\x1B[38;2;40;120;255m\x1B[48;2;48;124;248m▀\x1B[0m\x1B[38;2;252;252;252m\x1B[48;2;206;216;235m▀\x1B[0m\x1B[38;2;205;210;219m\x1B[48;2;173;182;201m▀\x1B[0m\x1B[38;2;147;157;177m▀\x1B[0m \x1B[38;2;200;204;209m▄\x1B[0m\x1B[38;2;132;142;160m\x1B[48;2;139;151;174m▀\x1B[0m",
			"\x1B[38;2;115;133;151m▀\x1B[0m\x1B[38;2;205;212;223m\x1B[48;2;57;72;101m▀\x1B[0m\x1B[38;2;146;158;176m\x1B[48;2;35;49;77m▀\x1B[0m  \x1B[38;2;184;192;204m▀\x1B[0m\x1B[38;2;180;190;211m\x1B[48;2;196;205;217m▀\x1B[0m\x1B[38;2;0;0;138m\x1B[48;2;182;185;188m▀\x1B[0m\x1B[38;2;162;164;170m▀\x1B[0m\x1B[38;2;26;93;228m▀\x1B[0m\x1B[38;2;205;205;205m▄\x1B[0m\x1B[38;2;176;184;197m\x1B[48;2;153;161;176m▀\x1B[0m\x1B[38;2;45;58;91m\x1B[48;2;168;173;182m▀\x1B[0m\x1B[38;2;187;189;192m\x1B[48;2;239;242;246m▀\x1B[0m\x1B[38;2;168;177;192m\x1B[48;2;172;179;193m▀\x1B[0m\x1B[38;2;105;113;129m▄\x1B[0m",
			"      \x1B[38;2;66;81;111m▀\x1B[0m\x1B[38;2;187;193;206m\x1B[48;2;99;111;130m▀\x1B[0m\x1B[38;2;200;204;211m\x1B[48;2;205;211;221m▀\x1B[0m\x1B[38;2;216;216;218m\x1B[48;2;170;182;204m▀\x1B[0m\x1B[38;2;166;174;189m\x1B[48;2;15;30;69m▀\x1B[0m\x1B[38;2;138;150;168m▀\x1B[0m\x1B[38;2;174;185;202m▀\x1B[0m\x1B[38;2;154;166;188m▀\x1B[0m\x1B[38;2;150;162;185m▀\x1B[0m\x1B[38;2;83;100;133m▀\x1B[0m",
			"       \x1B[38;2;230;224;230m\x1B[48;2;224;230;235m▀\x1B[0m\x1B[38;2;174;182;195m\x1B[48;2;168;177;192m▀\x1B[0m\x1B[38;2;155;168;189m\x1B[48;2;238;241;245m▀\x1B[0m\x1B[38;2;111;127;151m\x1B[48;2;185;194;206m▀\x1B[0m     ",
			"      \x1B[38;2;178;182;192m▀\x1B[0m\x1B[38;2;224;231;246m▀\x1B[0m\x1B[38;2;72;91;132m▀\x1B[0m\x1B[38;2;163;171;188m▀\x1B[0m\x1B[38;2;227;233;246m▀\x1B[0m\x1B[38;2;106;122;150m▀\x1B[0m    ",
			"                "
		],
		[
			"                ",
			"      \x1B[38;2;199;199;196m\x1B[48;2;207;210;219m▀\x1B[0m\x1B[38;2;210;213;220m\x1B[48;2;138;152;174m▀\x1B[0m\x1B[38;2;187;191;199m\x1B[48;2;200;209;221m▀\x1B[0m\x1B[38;2;185;191;204m\x1B[48;2;139;147;163m▀\x1B[0m\x1B[38;2;91;109;144m\x1B[48;2;103;108;127m▀\x1B[0m     ",
			" \x1B[38;2;168;168;173m\x1B[48;2;204;207;212m▀\x1B[0m\x1B[38;2;163;168;175m\x1B[48;2;242;250;255m▀\x1B[0m\x1B[38;2;153;160;175m▄\x1B[0m\x1B[38;2;175;175;175m▄\x1B[0m\x1B[38;2;216;217;220m\x1B[48;2;205;211;224m▀\x1B[0m\x1B[38;2;198;210;226m\x1B[48;2;6;25;82m▀\x1B[0m \x1B[38;2;195;200;207m▀\x1B[0m\x1B[38;2;217;221;226m▀\x1B[0m\x1B[38;2;222;224;227m▀\x1B[0m\x1B[38;2;199;203;211m\x1B[48;2;246;249;250m▀\x1B[0m\x1B[38;2;26;45;78m\x1B[48;2;157;165;187m▀\x1B[0m   ",
			"\x1B[38;2;210;212;215m\x1B[48;2;126;139;161m▀\x1B[0m\x1B[38;2;178;188;204m\x1B[48;2;83;104;140m▀\x1B[0m\x1B[38;2;83;101;133m▀\x1B[0m\x1B[38;2;220;223;225m\x1B[48;2;165;177;195m▀\x1B[0m\x1B[38;2;224;225;228m\x1B[48;2;227;229;236m▀\x1B[0m\x1B[38;2;104;121;153m\x1B[48;2;38;60;108m▀\x1B[0m\x1B[38;2;88;139;208m\x1B[48;2;52;109;227m▀\x1B[0m \x1B[38;2;89;142;211m\x1B[48;2;60;129;243m▀\x1B[0m\x1B[38;2;96;140;219m\x1B[48;2;33;93;223m▀\x1B[0m\x1B[38;2;245;242;237m\x1B[48;2;222;223;221m▀\x1B[0m\x1B[38;2;182;190;205m\x1B[48;2;150;162;184m▀\x1B[0m\x1B[38;2;121;137;165m▀\x1B[0m \x1B[38;2;170;170;172m▄\x1B[0m\x1B[38;2;114;123;141m▄\x1B[0m",
			"    \x1B[38;2;182;192;203m\x1B[48;2;112;123;142m▀\x1B[0m\x1B[38;2;184;190;206m\x1B[48;2;193;199;210m▀\x1B[0m\x1B[38;2;160;160;162m▄\x1B[0m\x1B[38;2;204;204;190m\x1B[48;2;63;70;85m▀\x1B[0m\x1B[38;2;82;93;172m▀\x1B[0m\x1B[38;2;199;199;199m▄\x1B[0m\x1B[38;2;177;185;192m\x1B[48;2;173;178;189m▀\x1B[0m\x1B[38;2;187;196;213m\x1B[48;2;89;105;131m▀\x1B[0m\x1B[38;2;89;95;108m▄\x1B[0m\x1B[38;2;177;177;170m\x1B[48;2;213;218;225m▀\x1B[0m\x1B[38;2;207;214;224m\x1B[48;2;121;138;166m▀\x1B[0m\x1B[38;2;109;128;159m▀\x1B[0m",
			"     \x1B[38;2;146;158;178m▀\x1B[0m\x1B[38;2;209;216;230m\x1B[48;2;87;119;167m▀\x1B[0m\x1B[38;2;199;204;210m\x1B[48;2;223;228;236m▀\x1B[0m\x1B[38;2;137;146;154m\x1B[48;2;241;244;249m▀\x1B[0m\x1B[38;2;226;228;232m\x1B[48;2;156;172;199m▀\x1B[0m\x1B[38;2;168;180;197m▀\x1B[0m\x1B[38;2;210;215;221m\x1B[48;2;171;185;208m▀\x1B[0m\x1B[38;2;236;238;239m\x1B[48;2;174;187;212m▀\x1B[0m\x1B[38;2;222;227;235m\x1B[48;2;175;190;210m▀\x1B[0m\x1B[38;2;227;232;237m\x1B[48;2;189;204;224m▀\x1B[0m\x1B[38;2;146;157;172m\x1B[48;2;98;115;143m▀\x1B[0m",
			"      \x1B[38;2;239;236;236m▄\x1B[0m\x1B[38;2;172;183;206m\x1B[48;2;198;201;207m▀\x1B[0m\x1B[38;2;146;157;181m\x1B[48;2;216;218;222m▀\x1B[0m\x1B[38;2;79;96;133m\x1B[48;2;197;205;215m▀\x1B[0m      ",
			"     \x1B[38;2;222;222;222m\x1B[48;2;161;170;186m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;170;180;199m▀\x1B[0m\x1B[38;2;168;179;200m\x1B[48;2;75;92;128m▀\x1B[0m\x1B[38;2;188;197;214m\x1B[48;2;83;101;143m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;163;171;189m▀\x1B[0m\x1B[38;2;210;214;220m\x1B[48;2;164;177;202m▀\x1B[0m\x1B[38;2;56;73;102m\x1B[48;2;54;77;117m▀\x1B[0m    ",
			"                "
		],
		[
			"                ",
			"     \x1B[38;2;156;152;152m▄\x1B[0m\x1B[38;2;201;201;201m\x1B[48;2;207;212;218m▀\x1B[0m\x1B[38;2;212;216;226m\x1B[48;2;106;120;148m▀\x1B[0m\x1B[38;2;175;182;197m\x1B[48;2;108;120;138m▀\x1B[0m\x1B[38;2;172;179;196m\x1B[48;2;128;136;154m▀\x1B[0m\x1B[38;2;102;121;157m\x1B[48;2;128;130;141m▀\x1B[0m\x1B[38;2;117;117;125m▄\x1B[0m    ",
			" \x1B[38;2;161;161;164m\x1B[48;2;209;210;217m▀\x1B[0m\x1B[38;2;175;181;190m\x1B[48;2;237;244;255m▀\x1B[0m\x1B[38;2;155;164;182m▄\x1B[0m\x1B[38;2;226;226;226m▄\x1B[0m\x1B[38;2;234;237;239m\x1B[48;2;197;205;218m▀\x1B[0m\x1B[38;2;151;161;178m\x1B[48;2;0;6;60m▀\x1B[0m \x1B[38;2;177;182;191m▀\x1B[0m\x1B[38;2;209;214;222m▀\x1B[0m\x1B[38;2;214;219;227m▀\x1B[0m\x1B[38;2;210;213;219m\x1B[48;2;231;233;234m▀\x1B[0m\x1B[38;2;101;113;133m\x1B[48;2;183;190;205m▀\x1B[0m   ",
			"\x1B[38;2;182;185;192m\x1B[48;2;86;99;123m▀\x1B[0m\x1B[38;2;177;188;207m\x1B[48;2;75;93;127m▀\x1B[0m\x1B[38;2;90;102;128m▀\x1B[0m\x1B[38;2;227;229;233m\x1B[48;2;172;181;189m▀\x1B[0m\x1B[38;2;224;227;230m\x1B[48;2;218;219;225m▀\x1B[0m\x1B[38;2;71;93;124m\x1B[48;2;43;76;134m▀\x1B[0m\x1B[38;2;85;125;185m\x1B[48;2;40;92;206m▀\x1B[0m\x1B[38;2;54;124;255m▄\x1B[0m\x1B[38;2;68;132;223m\x1B[48;2;34;107;234m▀\x1B[0m\x1B[38;2;84;136;227m\x1B[48;2;19;82;213m▀\x1B[0m\x1B[38;2;255;255;247m\x1B[48;2;226;224;213m▀\x1B[0m\x1B[38;2;174;180;195m\x1B[48;2;138;150;174m▀\x1B[0m\x1B[38;2;111;124;149m▀\x1B[0m  \x1B[38;2;18;24;42m▄\x1B[0m",
			"    \x1B[38;2;203;209;218m\x1B[48;2;103;107;118m▀\x1B[0m\x1B[38;2;179;188;202m\x1B[48;2;205;209;217m▀\x1B[0m\x1B[38;2;0;0;0m\x1B[48;2;175;175;171m▀\x1B[0m\x1B[38;2;176;176;170m▀\x1B[0m\x1B[38;2;81;100;160m▀\x1B[0m\x1B[38;2;211;211;211m▄\x1B[0m\x1B[38;2;201;210;214m\x1B[48;2;222;224;222m▀\x1B[0m\x1B[38;2;199;207;222m\x1B[48;2;83;99;129m▀\x1B[0m\x1B[38;2;78;93;137m\x1B[48;2;0;10;54m▀\x1B[0m\x1B[38;2;193;195;198m▄\x1B[0m\x1B[38;2;198;200;207m\x1B[48;2;161;174;194m▀\x1B[0m\x1B[38;2;124;135;159m\x1B[48;2;31;57;108m▀\x1B[0m",
			"     \x1B[38;2;146;159;181m▀\x1B[0m\x1B[38;2;217;224;238m\x1B[48;2;113;134;177m▀\x1B[0m\x1B[38;2;215;219;224m\x1B[48;2;214;218;228m▀\x1B[0m\x1B[38;2;245;245;246m▄\x1B[0m\x1B[38;2;225;229;234m\x1B[48;2;161;171;189m▀\x1B[0m\x1B[38;2;216;222;233m▀\x1B[0m\x1B[38;2;186;192;200m\x1B[48;2;208;216;227m▀\x1B[0m\x1B[38;2;202;204;204m\x1B[48;2;220;224;231m▀\x1B[0m\x1B[38;2;221;227;238m\x1B[48;2;216;220;228m▀\x1B[0m\x1B[38;2;126;135;154m\x1B[48;2;236;240;245m▀\x1B[0m\x1B[38;2;165;165;165m\x1B[48;2;126;137;160m▀\x1B[0m",
			"      \x1B[38;2;148;154;167m▄\x1B[0m\x1B[38;2;157;167;185m\x1B[48;2;198;203;210m▀\x1B[0m\x1B[38;2;160;172;193m\x1B[48;2;159;169;185m▀\x1B[0m\x1B[38;2;115;135;169m\x1B[48;2;180;186;194m▀\x1B[0m      ",
			"     \x1B[38;2;183;183;183m\x1B[48;2;167;173;185m▀\x1B[0m\x1B[38;2;251;251;250m\x1B[48;2;210;216;227m▀\x1B[0m\x1B[38;2;179;190;212m\x1B[48;2;92;110;144m▀\x1B[0m\x1B[38;2;135;145;165m\x1B[48;2;61;84;126m▀\x1B[0m\x1B[38;2;237;241;246m\x1B[48;2;188;195;208m▀\x1B[0m\x1B[38;2;194;199;209m\x1B[48;2;201;210;225m▀\x1B[0m\x1B[38;2;80;93;120m\x1B[48;2;77;97;134m▀\x1B[0m    ",
			"                "
		],
		[
			"                ",
			"      \x1B[38;2;186;184;188m\x1B[48;2;209;213;220m▀\x1B[0m\x1B[38;2;197;200;207m\x1B[48;2;177;189;211m▀\x1B[0m\x1B[38;2;184;186;193m\x1B[48;2;179;189;206m▀\x1B[0m\x1B[38;2;172;177;191m\x1B[48;2;150;158;179m▀\x1B[0m\x1B[38;2;93;110;144m\x1B[48;2;57;65;92m▀\x1B[0m     ",
			" \x1B[38;2;127;127;133m\x1B[48;2;199;201;206m▀\x1B[0m\x1B[38;2;167;172;181m\x1B[48;2;248;254;255m▀\x1B[0m\x1B[38;2;163;173;191m▄\x1B[0m\x1B[38;2;198;198;201m▄\x1B[0m\x1B[38;2;219;220;224m\x1B[48;2;211;216;226m▀\x1B[0m\x1B[38;2;169;179;201m\x1B[48;2;37;42;63m▀\x1B[0m \x1B[38;2;199;203;209m\x1B[48;2;120;120;134m▀\x1B[0m\x1B[38;2;211;213;218m\x1B[48;2;155;167;199m▀\x1B[0m\x1B[38;2;217;219;222m\x1B[48;2;161;170;192m▀\x1B[0m\x1B[38;2;160;165;176m\x1B[48;2;231;234;238m▀\x1B[0m\x1B[38;2;159;171;193m▄\x1B[0m   ",
			"\x1B[38;2;181;182;187m\x1B[48;2;122;133;151m▀\x1B[0m\x1B[38;2;169;178;195m\x1B[48;2;103;121;151m▀\x1B[0m\x1B[38;2;105;117;142m▀\x1B[0m\x1B[38;2;226;231;238m\x1B[48;2;166;177;195m▀\x1B[0m\x1B[38;2;217;217;222m\x1B[48;2;215;216;223m▀\x1B[0m\x1B[38;2;100;126;160m\x1B[48;2;25;87;170m▀\x1B[0m\x1B[38;2;72;125;204m\x1B[48;2;43;106;228m▀\x1B[0m\x1B[38;2;33;121;238m▄\x1B[0m\x1B[38;2;57;121;203m\x1B[48;2;36;102;219m▀\x1B[0m\x1B[38;2;141;165;214m\x1B[48;2;58;87;172m▀\x1B[0m\x1B[38;2;244;243;240m\x1B[48;2;229;231;232m▀\x1B[0m\x1B[38;2;170;179;198m\x1B[48;2;109;125;154m▀\x1B[0m\x1B[38;2;106;124;157m▀\x1B[0m   ",
			"    \x1B[38;2;200;206;214m\x1B[48;2;112;115;125m▀\x1B[0m\x1B[38;2;162;170;190m\x1B[48;2;217;220;225m▀\x1B[0m\x1B[38;2;0;0;47m\x1B[48;2;180;180;178m▀\x1B[0m\x1B[38;2;163;160;157m\x1B[48;2;31;39;55m▀\x1B[0m\x1B[38;2;62;82;172m▀\x1B[0m\x1B[38;2;255;255;255m▄\x1B[0m\x1B[38;2;204;209;218m\x1B[48;2;175;179;187m▀\x1B[0m\x1B[38;2;169;179;197m\x1B[48;2;59;78;111m▀\x1B[0m \x1B[38;2;200;200;204m▄\x1B[0m\x1B[38;2;124;130;144m\x1B[48;2;184;194;210m▀\x1B[0m ",
			"     \x1B[38;2;135;144;166m▀\x1B[0m\x1B[38;2;214;219;229m\x1B[48;2;90;102;123m▀\x1B[0m\x1B[38;2;181;189;198m\x1B[48;2;222;225;230m▀\x1B[0m\x1B[38;2;164;164;167m\x1B[48;2;237;241;249m▀\x1B[0m\x1B[38;2;226;230;238m\x1B[48;2;105;122;149m▀\x1B[0m\x1B[38;2;214;220;232m\x1B[48;2;78;92;115m▀\x1B[0m\x1B[38;2;175;183;193m\x1B[48;2;201;207;218m▀\x1B[0m\x1B[38;2;191;195;195m\x1B[48;2;230;232;233m▀\x1B[0m\x1B[38;2;207;213;222m\x1B[48;2;216;219;226m▀\x1B[0m\x1B[38;2;111;132;164m\x1B[48;2;222;222;224m▀\x1B[0m\x1B[38;2;152;164;180m▄\x1B[0m",
			"   \x1B[38;2;119;130;146m▄\x1B[0m\x1B[38;2;224;225;227m▄\x1B[0m\x1B[38;2;208;208;206m▄\x1B[0m\x1B[38;2;229;226;226m\x1B[48;2;217;221;227m▀\x1B[0m\x1B[38;2;160;169;186m\x1B[48;2;96;109;132m▀\x1B[0m\x1B[38;2;108;124;153m▀\x1B[0m\x1B[38;2;152;164;187m\x1B[48;2;190;198;207m▀\x1B[0m\x1B[38;2;176;186;199m▄\x1B[0m\x1B[38;2;97;113;135m▀\x1B[0m\x1B[38;2;90;104;136m▀\x1B[0m\x1B[38;2;82;92;119m▀\x1B[0m\x1B[38;2;97;108;132m▀\x1B[0m\x1B[38;2;73;88;118m▀\x1B[0m",
			"   \x1B[38;2;63;79;103m▀\x1B[0m\x1B[38;2;134;147;171m▀\x1B[0m\x1B[38;2;228;236;251m\x1B[48;2;43;65;105m▀\x1B[0m\x1B[38;2;136;150;180m\x1B[48;2;34;62;111m▀\x1B[0m  \x1B[38;2;213;215;218m\x1B[48;2;127;140;164m▀\x1B[0m\x1B[38;2;243;248;255m\x1B[48;2;105;120;145m▀\x1B[0m\x1B[38;2;74;93;132m▀\x1B[0m    ",
			"                "
		],
		[
			"                ",
			"     \x1B[38;2;154;159;170m▄\x1B[0m\x1B[38;2;193;197;203m\x1B[48;2;200;205;215m▀\x1B[0m\x1B[38;2;201;205;214m\x1B[48;2;167;178;196m▀\x1B[0m\x1B[38;2;195;198;205m\x1B[48;2;190;194;206m▀\x1B[0m\x1B[38;2;153;162;181m\x1B[48;2;123;137;164m▀\x1B[0m\x1B[38;2;16;27;54m▄\x1B[0m     ",
			" \x1B[38;2;182;182;182m\x1B[48;2;207;208;215m▀\x1B[0m\x1B[38;2;133;137;147m\x1B[48;2;236;243;255m▀\x1B[0m\x1B[38;2;137;156;188m▄\x1B[0m\x1B[38;2;228;226;228m▄\x1B[0m\x1B[38;2;224;227;230m\x1B[48;2;181;189;204m▀\x1B[0m\x1B[38;2;141;156;183m▀\x1B[0m \x1B[38;2;171;175;185m\x1B[48;2;87;91;102m▀\x1B[0m\x1B[38;2;178;181;190m\x1B[48;2;74;88;115m▀\x1B[0m\x1B[38;2;196;197;201m\x1B[48;2;163;169;181m▀\x1B[0m\x1B[38;2;158;165;181m\x1B[48;2;225;228;233m▀\x1B[0m\x1B[38;2;117;137;167m▄\x1B[0m   ",
			"\x1B[38;2;187;192;199m\x1B[48;2;129;139;158m▀\x1B[0m\x1B[38;2;171;182;203m\x1B[48;2;118;136;166m▀\x1B[0m\x1B[38;2;153;164;188m▀\x1B[0m\x1B[38;2;228;232;235m\x1B[48;2;193;199;207m▀\x1B[0m\x1B[38;2;207;211;218m\x1B[48;2;194;198;206m▀\x1B[0m\x1B[38;2;84;111;153m\x1B[48;2;22;92;207m▀\x1B[0m\x1B[38;2;117;156;213m\x1B[48;2;66;105;200m▀\x1B[0m\x1B[38;2;38;114;199m▄\x1B[0m\x1B[38;2;54;124;239m\x1B[48;2;36;112;247m▀\x1B[0m\x1B[38;2;252;255;255m\x1B[48;2;196;207;233m▀\x1B[0m\x1B[38;2;239;240;239m\x1B[48;2;202;207;215m▀\x1B[0m\x1B[38;2;156;166;185m\x1B[48;2;18;37;87m▀\x1B[0m\x1B[38;2;58;78;107m▀\x1B[0m   ",
			"   \x1B[38;2;108;114;121m▀\x1B[0m\x1B[38;2;216;220;226m\x1B[48;2;174;180;191m▀\x1B[0m\x1B[38;2;114;123;160m\x1B[48;2;209;213;220m▀\x1B[0m\x1B[38;2;44;38;110m\x1B[48;2;135;132;129m▀\x1B[0m\x1B[38;2;154;160;169m▀\x1B[0m\x1B[38;2;31;80;214m▀\x1B[0m\x1B[38;2;175;173;173m▄\x1B[0m\x1B[38;2;189;196;206m\x1B[48;2;127;139;157m▀\x1B[0m\x1B[38;2;151;163;184m\x1B[48;2;60;81;115m▀\x1B[0m \x1B[38;2;202;202;200m▄\x1B[0m\x1B[38;2;117;123;139m\x1B[48;2;181;188;204m▀\x1B[0m\x1B[38;2;0;12;60m▄\x1B[0m",
			"     \x1B[38;2;154;164;180m▀\x1B[0m\x1B[38;2;235;240;248m\x1B[48;2;137;149;170m▀\x1B[0m\x1B[38;2;166;174;191m\x1B[48;2;244;245;247m▀\x1B[0m\x1B[38;2;212;212;209m\x1B[48;2;210;215;226m▀\x1B[0m\x1B[38;2;217;223;232m\x1B[48;2;54;75;117m▀\x1B[0m\x1B[38;2;212;218;228m\x1B[48;2;171;182;202m▀\x1B[0m\x1B[38;2;124;130;139m\x1B[48;2;219;223;228m▀\x1B[0m\x1B[38;2;147;144;141m\x1B[48;2;229;231;233m▀\x1B[0m\x1B[38;2;197;203;213m\x1B[48;2;214;218;223m▀\x1B[0m\x1B[38;2;88;108;138m\x1B[48;2;236;237;238m▀\x1B[0m\x1B[38;2;153;164;183m▄\x1B[0m",
			"   \x1B[38;2;111;119;131m▄\x1B[0m\x1B[38;2;217;217;218m▄\x1B[0m\x1B[38;2;200;204;208m▄\x1B[0m\x1B[38;2;211;214;221m\x1B[48;2;206;213;222m▀\x1B[0m\x1B[38;2;142;151;170m▀\x1B[0m\x1B[38;2;110;124;154m\x1B[48;2;213;216;219m▀\x1B[0m\x1B[38;2;103;121;154m\x1B[48;2;168;177;191m▀\x1B[0m\x1B[38;2;49;63;92m▄\x1B[0m\x1B[38;2;136;155;192m▀\x1B[0m\x1B[38;2;133;155;194m▀\x1B[0m\x1B[38;2;139;157;194m▀\x1B[0m\x1B[38;2;148;166;199m▀\x1B[0m\x1B[38;2;88;105;138m▀\x1B[0m",
			"   \x1B[38;2;53;67;92m▀\x1B[0m\x1B[38;2;159;169;192m\x1B[48;2;23;35;77m▀\x1B[0m\x1B[38;2;235;242;255m\x1B[48;2;56;75;117m▀\x1B[0m\x1B[38;2;100;116;149m\x1B[48;2;7;22;67m▀\x1B[0m \x1B[38;2;210;212;212m\x1B[48;2;174;183;197m▀\x1B[0m\x1B[38;2;254;255;255m\x1B[48;2;145;159;186m▀\x1B[0m\x1B[38;2;111;130;169m\x1B[48;2;0;25;76m▀\x1B[0m     ",
			"                "
		],
		[
			"                ",
			"     \x1B[38;2;147;147;150m▄\x1B[0m\x1B[38;2;189;189;191m\x1B[48;2;197;202;213m▀\x1B[0m\x1B[38;2;207;210;218m\x1B[48;2;83;97;123m▀\x1B[0m\x1B[38;2;185;188;196m\x1B[48;2;107;111;126m▀\x1B[0m\x1B[38;2;164;171;186m\x1B[48;2;101;107;122m▀\x1B[0m\x1B[38;2;69;90;129m\x1B[48;2;114;117;126m▀\x1B[0m     ",
			"\x1B[38;2;123;131;131m▄\x1B[0m\x1B[38;2;181;181;181m\x1B[48;2;200;205;215m▀\x1B[0m\x1B[38;2;173;176;184m\x1B[48;2;220;227;240m▀\x1B[0m\x1B[38;2;175;180;192m▄\x1B[0m\x1B[38;2;203;203;205m▄\x1B[0m\x1B[38;2;214;216;218m\x1B[48;2;182;188;202m▀\x1B[0m\x1B[38;2;182;190;206m\x1B[48;2;0;0;15m▀\x1B[0m \x1B[38;2;141;146;158m▀\x1B[0m\x1B[38;2;153;158;168m▀\x1B[0m\x1B[38;2;174;178;185m\x1B[48;2;198;201;206m▀\x1B[0m\x1B[38;2;179;184;196m\x1B[48;2;222;225;232m▀\x1B[0m\x1B[38;2;100;118;151m▄\x1B[0m   ",
			"\x1B[38;2;194;198;205m\x1B[48;2;110;124;146m▀\x1B[0m\x1B[38;2;148;159;181m▀\x1B[0m\x1B[38;2;27;54;92m▀\x1B[0m\x1B[38;2;220;223;229m\x1B[48;2;138;149;170m▀\x1B[0m\x1B[38;2;234;235;240m\x1B[48;2;215;219;225m▀\x1B[0m\x1B[38;2;72;102;150m\x1B[48;2;47;83;145m▀\x1B[0m\x1B[38;2;58;105;207m\x1B[48;2;30;77;180m▀\x1B[0m \x1B[38;2;69;136;242m\x1B[48;2;35;96;204m▀\x1B[0m\x1B[38;2;177;198;245m\x1B[48;2;85;121;198m▀\x1B[0m\x1B[38;2;217;220;227m\x1B[48;2;205;209;214m▀\x1B[0m\x1B[38;2;129;142;168m\x1B[48;2;108;125;149m▀\x1B[0m    ",
			"    \x1B[38;2;161;166;180m▀\x1B[0m\x1B[38;2;184;189;202m\x1B[48;2;194;202;215m▀\x1B[0m\x1B[38;2;197;200;207m▄\x1B[0m\x1B[38;2;243;238;232m▀\x1B[0m\x1B[38;2;95;103;167m▀\x1B[0m\x1B[38;2;237;235;229m▄\x1B[0m\x1B[38;2;167;176;187m\x1B[48;2;170;176;188m▀\x1B[0m\x1B[38;2;139;151;174m\x1B[48;2;0;13;48m▀\x1B[0m \x1B[38;2;206;206;206m▄\x1B[0m\x1B[38;2;159;162;170m\x1B[48;2;165;176;193m▀\x1B[0m\x1B[38;2;90;97;127m▀\x1B[0m",
			"     \x1B[38;2;91;105;131m▀\x1B[0m\x1B[38;2;203;209;219m▀\x1B[0m\x1B[38;2;200;203;211m\x1B[48;2;226;230;238m▀\x1B[0m\x1B[38;2;237;237;233m\x1B[48;2;216;223;237m▀\x1B[0m\x1B[38;2;210;217;229m\x1B[48;2;64;86;122m▀\x1B[0m\x1B[38;2;203;208;218m\x1B[48;2;140;153;172m▀\x1B[0m\x1B[38;2;194;197;202m\x1B[48;2;204;209;218m▀\x1B[0m\x1B[38;2;194;191;189m\x1B[48;2;215;219;226m▀\x1B[0m\x1B[38;2;224;227;234m\x1B[48;2;214;219;228m▀\x1B[0m\x1B[38;2;147;155;176m\x1B[48;2;228;230;235m▀\x1B[0m\x1B[38;2;232;232;240m\x1B[48;2;148;163;183m▀\x1B[0m",
			"     \x1B[38;2;238;232;226m▄\x1B[0m\x1B[38;2;254;254;245m\x1B[48;2;213;216;220m▀\x1B[0m\x1B[38;2;156;166;183m\x1B[48;2;148;163;187m▀\x1B[0m\x1B[38;2;105;118;144m\x1B[48;2;122;129;147m▀\x1B[0m\x1B[38;2;148;157;171m\x1B[48;2;212;217;225m▀\x1B[0m\x1B[38;2;191;194;198m▄\x1B[0m     ",
			"     \x1B[38;2;180;188;201m\x1B[48;2;24;49;92m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;98;117;154m▀\x1B[0m\x1B[38;2;100;114;142m\x1B[48;2;70;89;128m▀\x1B[0m\x1B[38;2;178;178;186m\x1B[48;2;161;170;182m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;143;157;185m▀\x1B[0m\x1B[38;2;159;169;191m\x1B[48;2;30;54;94m▀\x1B[0m\x1B[38;2;0;0;18m▀\x1B[0m    ",
			"                "
		],
		[
			"       \x1B[38;2;190;190;190m▄\x1B[0m\x1B[38;2;133;145;170m▄\x1B[0m       ",
			"     \x1B[38;2;185;189;189m\x1B[48;2;216;221;229m▀\x1B[0m\x1B[38;2;198;203;211m\x1B[48;2;101;114;146m▀\x1B[0m\x1B[38;2;153;161;179m\x1B[48;2;70;77;90m▀\x1B[0m\x1B[38;2;70;87;116m\x1B[48;2;180;184;189m▀\x1B[0m\x1B[38;2;125;125;129m\x1B[48;2;179;185;196m▀\x1B[0m\x1B[38;2;114;118;125m\x1B[48;2;203;208;214m▀\x1B[0m\x1B[38;2;146;157;180m▄\x1B[0m    ",
			"    \x1B[38;2;231;227;223m\x1B[48;2;191;192;198m▀\x1B[0m\x1B[38;2;188;195;208m\x1B[48;2;175;184;199m▀\x1B[0m\x1B[38;2;0;0;21m▀\x1B[0m\x1B[38;2;153;162;179m▀\x1B[0m\x1B[38;2;125;136;155m▀\x1B[0m\x1B[38;2;38;60;95m\x1B[48;2;227;225;223m▀\x1B[0m\x1B[38;2;224;224;224m\x1B[48;2;206;213;225m▀\x1B[0m\x1B[38;2;211;219;232m\x1B[48;2;77;99;141m▀\x1B[0m    ",
			"\x1B[38;2;100;104;113m▄\x1B[0m\x1B[38;2;202;204;207m\x1B[48;2;198;202;212m▀\x1B[0m\x1B[38;2;164;172;188m\x1B[48;2;196;204;219m▀\x1B[0m\x1B[38;2;235;239;245m▄\x1B[0m\x1B[38;2;203;208;216m\x1B[48;2;201;205;213m▀\x1B[0m\x1B[38;2;105;120;155m\x1B[48;2;39;98;183m▀\x1B[0m\x1B[38;2;74;136;246m▄\x1B[0m\x1B[38;2;63;111;148m\x1B[48;2;23;88;213m▀\x1B[0m\x1B[38;2;64;120;219m\x1B[48;2;32;86;189m▀\x1B[0m\x1B[38;2;113;136;180m\x1B[48;2;0;0;139m▀\x1B[0m\x1B[38;2;207;213;218m\x1B[48;2;208;213;213m▀\x1B[0m\x1B[38;2;122;140;169m\x1B[48;2;160;174;196m▀\x1B[0m\x1B[38;2;0;0;7m▄\x1B[0m\x1B[38;2;187;182;173m▄\x1B[0m\x1B[38;2;172;178;190m▄\x1B[0m ",
			"\x1B[38;2;211;213;213m\x1B[48;2;173;180;195m▀\x1B[0m\x1B[38;2;155;164;185m\x1B[48;2;100;116;146m▀\x1B[0m\x1B[38;2;0;22;68m▀\x1B[0m\x1B[38;2;210;215;223m▀\x1B[0m\x1B[38;2;242;243;245m\x1B[48;2;165;176;194m▀\x1B[0m\x1B[38;2;102;120;169m\x1B[48;2;215;219;226m▀\x1B[0m\x1B[38;2;0;26;174m\x1B[48;2;172;167;154m▀\x1B[0m\x1B[38;2;160;166;183m\x1B[48;2;100;108;119m▀\x1B[0m\x1B[38;2;217;205;199m▀\x1B[0m\x1B[38;2;183;185;191m▄\x1B[0m\x1B[38;2;58;65;82m\x1B[48;2;229;231;237m▀\x1B[0m\x1B[38;2;18;32;61m\x1B[48;2;175;185;198m▀\x1B[0m\x1B[38;2;151;155;151m▄\x1B[0m\x1B[38;2;212;217;225m\x1B[48;2;189;196;206m▀\x1B[0m\x1B[38;2;144;158;178m\x1B[48;2;160;168;182m▀\x1B[0m\x1B[38;2;136;146;166m▄\x1B[0m",
			"\x1B[38;2;52;67;105m▀\x1B[0m    \x1B[38;2;146;158;175m▀\x1B[0m\x1B[38;2;224;231;244m\x1B[48;2;0;11;51m▀\x1B[0m\x1B[38;2;198;204;215m\x1B[48;2;196;202;216m▀\x1B[0m\x1B[38;2;119;123;127m\x1B[48;2;247;249;252m▀\x1B[0m\x1B[38;2;218;221;226m\x1B[48;2;140;154;178m▀\x1B[0m\x1B[38;2;101;118;147m▀\x1B[0m\x1B[38;2;188;196;210m\x1B[48;2;106;120;134m▀\x1B[0m\x1B[38;2;211;215;223m\x1B[48;2;83;93;120m▀\x1B[0m\x1B[38;2;181;188;200m▀\x1B[0m\x1B[38;2;156;167;185m▀\x1B[0m\x1B[38;2;108;124;149m▀\x1B[0m",
			"      \x1B[38;2;167;167;161m\x1B[48;2;207;210;213m▀\x1B[0m\x1B[38;2;148;158;178m\x1B[48;2;144;158;181m▀\x1B[0m\x1B[38;2;125;136;159m\x1B[48;2;240;240;235m▀\x1B[0m\x1B[38;2;95;104;132m\x1B[48;2;184;189;200m▀\x1B[0m      ",
			"    \x1B[38;2;197;197;197m\x1B[48;2;125;139;156m▀\x1B[0m\x1B[38;2;243;240;238m\x1B[48;2;157;170;195m▀\x1B[0m\x1B[38;2;216;224;239m\x1B[48;2;73;91;129m▀\x1B[0m\x1B[38;2;32;52;98m\x1B[48;2;0;0;35m▀\x1B[0m\x1B[38;2;226;222;221m\x1B[48;2;124;135;154m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;147;160;184m▀\x1B[0m\x1B[38;2;166;172;188m\x1B[48;2;94;112;147m▀\x1B[0m     ",
			"                "
		],
		[
			"      \x1B[38;2;65;78;104m\x1B[48;2;57;73;108m▀\x1B[0m\x1B[38;2;121;129;145m\x1B[48;2;199;208;225m▀\x1B[0m\x1B[38;2;69;69;75m\x1B[48;2;223;227;230m▀\x1B[0m\x1B[38;2;179;180;179m▄\x1B[0m\x1B[38;2;83;87;104m▄\x1B[0m     ",
			"  \x1B[38;2;0;18;42m▄\x1B[0m\x1B[38;2;52;67;82m\x1B[48;2;203;206;212m▀\x1B[0m\x1B[38;2;192;194;197m\x1B[48;2;184;192;205m▀\x1B[0m\x1B[38;2;210;209;210m\x1B[48;2;132;143;166m▀\x1B[0m\x1B[38;2;158;155;155m\x1B[48;2;200;206;219m▀\x1B[0m\x1B[38;2;7;15;41m\x1B[48;2;198;201;207m▀\x1B[0m\x1B[38;2;86;99;132m\x1B[48;2;83;83;77m▀\x1B[0m\x1B[38;2;204;212;227m\x1B[48;2;125;137;166m▀\x1B[0m\x1B[38;2;202;204;207m\x1B[48;2;188;192;199m▀\x1B[0m     ",
			"  \x1B[38;2;0;11;45m▀\x1B[0m\x1B[38;2;192;197;205m\x1B[48;2;45;67;105m▀\x1B[0m\x1B[38;2;188;191;195m\x1B[48;2;219;227;240m▀\x1B[0m\x1B[38;2;67;67;67m\x1B[48;2;190;190;194m▀\x1B[0m\x1B[38;2;11;22;55m▀\x1B[0m\x1B[38;2;89;102;127m▀\x1B[0m \x1B[38;2;99;119;155m\x1B[48;2;41;64;106m▀\x1B[0m\x1B[38;2;208;213;223m\x1B[48;2;193;201;214m▀\x1B[0m\x1B[38;2;62;62;62m\x1B[48;2;187;184;178m▀\x1B[0m    ",
			"  \x1B[38;2;86;100;125m▄\x1B[0m\x1B[38;2;185;198;212m\x1B[48;2;198;209;225m▀\x1B[0m\x1B[38;2;217;220;228m\x1B[48;2;129;140;152m▀\x1B[0m\x1B[38;2;53;99;163m\x1B[48;2;0;63;230m▀\x1B[0m\x1B[38;2;83;143;234m\x1B[48;2;23;77;210m▀\x1B[0m\x1B[38;2;52;121;214m▀\x1B[0m\x1B[38;2;78;135;227m▄\x1B[0m\x1B[38;2;0;0;45m\x1B[48;2;45;102;205m▀\x1B[0m\x1B[38;2;174;185;208m\x1B[48;2;158;168;184m▀\x1B[0m\x1B[38;2;193;193;190m\x1B[48;2;231;234;237m▀\x1B[0m\x1B[38;2;161;165;172m▄\x1B[0m\x1B[38;2;124;130;144m\x1B[48;2;248;254;255m▀\x1B[0m\x1B[38;2;146;152;160m\x1B[48;2;224;226;231m▀\x1B[0m ",
			" \x1B[38;2;146;156;171m\x1B[48;2;204;213;224m▀\x1B[0m\x1B[38;2;25;44;76m\x1B[48;2;162;166;173m▀\x1B[0m\x1B[38;2;58;75;100m▀\x1B[0m  \x1B[38;2;121;121;154m▀\x1B[0m\x1B[38;2;145;148;132m\x1B[48;2;141;141;137m▀\x1B[0m\x1B[38;2;22;81;202m\x1B[48;2;0;0;0m▀\x1B[0m\x1B[38;2;0;61;225m\x1B[48;2;132;137;163m▀\x1B[0m\x1B[38;2;177;187;195m\x1B[48;2;229;235;241m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;185;192;205m▀\x1B[0m\x1B[38;2;223;227;235m\x1B[48;2;63;78;106m▀\x1B[0m\x1B[38;2;123;138;172m▀\x1B[0m\x1B[38;2;193;200;214m\x1B[48;2;164;173;191m▀\x1B[0m\x1B[38;2;162;162;170m\x1B[48;2;186;188;190m▀\x1B[0m",
			"\x1B[38;2;124;135;158m▄\x1B[0m\x1B[38;2;109;126;153m\x1B[48;2;218;221;225m▀\x1B[0m\x1B[38;2;195;201;214m\x1B[48;2;223;225;232m▀\x1B[0m\x1B[38;2;125;136;153m\x1B[48;2;251;253;255m▀\x1B[0m\x1B[38;2;209;211;213m\x1B[48;2;174;184;200m▀\x1B[0m\x1B[38;2;175;178;185m\x1B[48;2;197;205;217m▀\x1B[0m\x1B[38;2;215;216;216m▄\x1B[0m\x1B[38;2;163;168;173m\x1B[48;2;232;233;233m▀\x1B[0m\x1B[38;2;213;214;213m\x1B[48;2;189;198;214m▀\x1B[0m\x1B[38;2;236;240;245m\x1B[48;2;91;105;128m▀\x1B[0m\x1B[38;2;141;153;171m▀\x1B[0m   \x1B[38;2;102;112;137m▀\x1B[0m\x1B[38;2;168;177;195m\x1B[48;2;38;54;87m▀\x1B[0m",
			"\x1B[38;2;119;135;166m▀\x1B[0m\x1B[38;2;184;194;214m▀\x1B[0m\x1B[38;2;178;188;206m▀\x1B[0m\x1B[38;2;167;178;201m▀\x1B[0m\x1B[38;2;52;70;101m▀\x1B[0m\x1B[38;2;90;104;130m\x1B[48;2;167;171;174m▀\x1B[0m\x1B[38;2;209;217;230m\x1B[48;2;129;140;164m▀\x1B[0m\x1B[38;2;208;217;236m\x1B[48;2;90;105;136m▀\x1B[0m\x1B[38;2;55;70;107m\x1B[48;2;173;181;195m▀\x1B[0m       ",
			"   \x1B[38;2;105;110;125m\x1B[48;2;80;93;116m▀\x1B[0m\x1B[38;2;209;209;207m\x1B[48;2;172;183;202m▀\x1B[0m\x1B[38;2;232;233;234m\x1B[48;2;194;204;227m▀\x1B[0m\x1B[38;2;206;213;224m\x1B[48;2;108;125;161m▀\x1B[0m\x1B[38;2;94;110;144m▀\x1B[0m\x1B[38;2;226;231;239m\x1B[48;2;190;198;211m▀\x1B[0m\x1B[38;2;150;162;180m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;176;179;189m▄\x1B[0m\x1B[38;2;25;45;85m▄\x1B[0m    ",
			"    \x1B[38;2;0;5;53m▀\x1B[0m\x1B[38;2;20;42;84m▀\x1B[0m\x1B[38;2;34;49;89m▀\x1B[0m \x1B[38;2;103;122;151m▀\x1B[0m\x1B[38;2;150;163;183m▀\x1B[0m\x1B[38;2;107;126;158m▀\x1B[0m\x1B[38;2;35;60;106m▀\x1B[0m    "
		],
		[
			"                ",
			"     \x1B[38;2;171;174;171m▄\x1B[0m\x1B[38;2;190;192;193m\x1B[48;2;208;214;224m▀\x1B[0m\x1B[38;2;196;199;208m\x1B[48;2;123;135;162m▀\x1B[0m\x1B[38;2;189;192;201m\x1B[48;2;144;149;167m▀\x1B[0m\x1B[38;2;151;160;177m\x1B[48;2;108;117;139m▀\x1B[0m      ",
			" \x1B[38;2;187;187;182m\x1B[48;2;194;196;203m▀\x1B[0m\x1B[38;2;201;208;214m\x1B[48;2;234;242;253m▀\x1B[0m\x1B[38;2;109;119;142m▄\x1B[0m\x1B[38;2;205;205;208m▄\x1B[0m\x1B[38;2;224;224;225m\x1B[48;2;192;200;214m▀\x1B[0m\x1B[38;2;127;137;159m▀\x1B[0m \x1B[38;2;176;181;190m\x1B[48;2;113;136;182m▀\x1B[0m\x1B[38;2;168;172;181m\x1B[48;2;102;123;165m▀\x1B[0m\x1B[38;2;193;195;201m\x1B[48;2;174;178;189m▀\x1B[0m\x1B[38;2;158;168;183m\x1B[48;2;220;224;231m▀\x1B[0m\x1B[38;2;120;141;177m▄\x1B[0m   ",
			"\x1B[38;2;196;197;200m\x1B[48;2;116;128;146m▀\x1B[0m\x1B[38;2;170;180;199m\x1B[48;2;83;94;121m▀\x1B[0m\x1B[38;2;159;175;201m▀\x1B[0m\x1B[38;2;222;223;224m\x1B[48;2;195;199;206m▀\x1B[0m\x1B[38;2;211;216;224m\x1B[48;2;198;206;222m▀\x1B[0m\x1B[38;2;102;117;147m\x1B[48;2;86;102;127m▀\x1B[0m\x1B[38;2;196;192;188m▄\x1B[0m \x1B[38;2;156;159;159m▄\x1B[0m\x1B[38;2;166;164;162m\x1B[48;2;186;194;201m▀\x1B[0m\x1B[38;2;224;225;226m\x1B[48;2;195;203;215m▀\x1B[0m\x1B[38;2;171;182;199m\x1B[48;2;7;21;63m▀\x1B[0m\x1B[38;2;53;83;118m▀\x1B[0m   ",
			"   \x1B[38;2;14;28;49m▀\x1B[0m\x1B[38;2;200;203;211m\x1B[48;2;166;171;180m▀\x1B[0m\x1B[38;2;133;143;163m\x1B[48;2;210;217;226m▀\x1B[0m\x1B[38;2;139;142;153m▄\x1B[0m\x1B[38;2;187;187;187m▀\x1B[0m \x1B[38;2;203;200;193m▄\x1B[0m\x1B[38;2;183;189;199m\x1B[48;2;107;116;134m▀\x1B[0m\x1B[38;2;155;167;184m\x1B[48;2;49;64;95m▀\x1B[0m \x1B[38;2;201;201;201m▄\x1B[0m\x1B[38;2;110;118;136m\x1B[48;2;196;206;221m▀\x1B[0m ",
			"     \x1B[38;2;170;179;196m▀\x1B[0m\x1B[38;2;221;224;231m\x1B[48;2;163;174;192m▀\x1B[0m\x1B[38;2;141;150;165m\x1B[48;2;233;236;240m▀\x1B[0m\x1B[38;2;196;196;196m\x1B[48;2;209;215;224m▀\x1B[0m\x1B[38;2;212;217;226m\x1B[48;2;97;121;157m▀\x1B[0m\x1B[38;2;209;215;223m\x1B[48;2;167;175;190m▀\x1B[0m\x1B[38;2;139;145;154m\x1B[48;2;206;212;221m▀\x1B[0m\x1B[38;2;178;178;174m\x1B[48;2;217;220;225m▀\x1B[0m\x1B[38;2;190;195;206m\x1B[48;2;211;218;227m▀\x1B[0m\x1B[38;2;72;86;112m\x1B[48;2;222;223;228m▀\x1B[0m\x1B[38;2;137;148;166m▄\x1B[0m",
			"      \x1B[38;2;219;228;241m\x1B[48;2;192;195;200m▀\x1B[0m\x1B[38;2;176;187;205m\x1B[48;2;180;187;202m▀\x1B[0m\x1B[38;2;138;153;182m\x1B[48;2;227;228;230m▀\x1B[0m\x1B[38;2;160;169;185m▄\x1B[0m \x1B[38;2;171;185;213m▀\x1B[0m\x1B[38;2;167;183;213m▀\x1B[0m\x1B[38;2;174;187;210m▀\x1B[0m\x1B[38;2;183;197;222m▀\x1B[0m\x1B[38;2;87;102;131m▀\x1B[0m",
			"    \x1B[38;2;96;111;132m▄\x1B[0m\x1B[38;2;238;236;232m\x1B[48;2;144;154;175m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;119;134;161m▀\x1B[0m\x1B[38;2;99;118;153m\x1B[48;2;28;53;96m▀\x1B[0m\x1B[38;2;229;233;240m\x1B[48;2;119;133;158m▀\x1B[0m\x1B[38;2;248;252;255m\x1B[48;2;153;161;183m▀\x1B[0m\x1B[38;2;180;185;201m\x1B[48;2;86;104;140m▀\x1B[0m\x1B[38;2;0;7;54m▄\x1B[0m    ",
			"                "
		],
		[
			"                ",
			"     \x1B[38;2;170;173;173m▄\x1B[0m\x1B[38;2;178;180;181m\x1B[48;2;212;216;223m▀\x1B[0m\x1B[38;2;197;200;209m\x1B[48;2;119;130;155m▀\x1B[0m\x1B[38;2;188;191;200m\x1B[48;2;137;144;162m▀\x1B[0m\x1B[38;2;154;163;179m\x1B[48;2;106;114;136m▀\x1B[0m\x1B[38;2;19;39;85m\x1B[48;2;28;35;56m▀\x1B[0m     ",
			" \x1B[38;2;255;255;248m\x1B[48;2;217;218;221m▀\x1B[0m\x1B[38;2;171;176;184m\x1B[48;2;235;241;252m▀\x1B[0m\x1B[38;2;105;121;143m▄\x1B[0m\x1B[38;2;193;193;195m▄\x1B[0m\x1B[38;2;221;223;225m\x1B[48;2;184;188;198m▀\x1B[0m\x1B[38;2;137;150;174m▀\x1B[0m\x1B[38;2;0;15;30m▀\x1B[0m\x1B[38;2;156;160;171m\x1B[48;2;124;130;140m▀\x1B[0m\x1B[38;2;174;179;189m\x1B[48;2;109;131;171m▀\x1B[0m\x1B[38;2;194;196;202m\x1B[48;2;162;169;182m▀\x1B[0m\x1B[38;2;141;148;161m\x1B[48;2;227;229;234m▀\x1B[0m\x1B[38;2;143;160;195m▄\x1B[0m   ",
			"\x1B[38;2;195;195;200m\x1B[48;2;118;130;150m▀\x1B[0m\x1B[38;2;182;191;206m\x1B[48;2;103;115;145m▀\x1B[0m\x1B[38;2;151;166;188m▀\x1B[0m\x1B[38;2;221;222;224m\x1B[48;2;189;198;211m▀\x1B[0m\x1B[38;2;223;223;224m\x1B[48;2;230;229;230m▀\x1B[0m\x1B[38;2;77;111;167m\x1B[48;2;21;115;226m▀\x1B[0m\x1B[38;2;48;111;229m\x1B[48;2;50;126;241m▀\x1B[0m\x1B[38;2;39;111;199m\x1B[48;2;17;96;224m▀\x1B[0m\x1B[38;2;32;98;222m\x1B[48;2;37;100;229m▀\x1B[0m\x1B[38;2;230;230;238m\x1B[48;2;161;181;215m▀\x1B[0m\x1B[38;2;226;226;224m\x1B[48;2;198;204;214m▀\x1B[0m\x1B[38;2;182;191;207m▀\x1B[0m\x1B[38;2;102;124;158m▀\x1B[0m   ",
			"    \x1B[38;2;220;224;228m\x1B[48;2;160;170;191m▀\x1B[0m\x1B[38;2;143;153;182m\x1B[48;2;201;206;214m▀\x1B[0m\x1B[38;2;147;141;135m▄\x1B[0m\x1B[38;2;230;230;240m▀\x1B[0m\x1B[38;2;52;82;232m▀\x1B[0m\x1B[38;2;210;207;204m▄\x1B[0m\x1B[38;2;201;207;217m\x1B[48;2;122;131;146m▀\x1B[0m\x1B[38;2;160;168;189m\x1B[48;2;50;64;94m▀\x1B[0m \x1B[38;2;191;193;195m▄\x1B[0m\x1B[38;2;108;120;137m\x1B[48;2;181;191;208m▀\x1B[0m\x1B[38;2;0;18;66m▄\x1B[0m",
			"     \x1B[38;2;158;168;186m▀\x1B[0m\x1B[38;2;231;235;242m\x1B[48;2;172;187;208m▀\x1B[0m\x1B[38;2;167;172;181m\x1B[48;2;224;228;232m▀\x1B[0m\x1B[38;2;189;189;189m\x1B[48;2;205;210;218m▀\x1B[0m\x1B[38;2;213;217;227m\x1B[48;2;93;108;143m▀\x1B[0m\x1B[38;2;214;218;226m\x1B[48;2;145;151;170m▀\x1B[0m\x1B[38;2;147;155;169m\x1B[48;2;216;220;227m▀\x1B[0m\x1B[38;2;185;180;170m\x1B[48;2;241;243;246m▀\x1B[0m\x1B[38;2;197;202;212m\x1B[48;2;211;217;227m▀\x1B[0m\x1B[38;2;81;98;126m\x1B[48;2;222;226;232m▀\x1B[0m\x1B[38;2;142;152;172m▄\x1B[0m",
			"      \x1B[38;2;197;206;224m\x1B[48;2;179;183;190m▀\x1B[0m\x1B[38;2;161;173;195m\x1B[48;2;140;145;160m▀\x1B[0m\x1B[38;2;136;152;180m\x1B[48;2;207;209;211m▀\x1B[0m\x1B[38;2;168;176;195m▄\x1B[0m \x1B[38;2;111;123;141m▀\x1B[0m\x1B[38;2;168;185;213m▀\x1B[0m\x1B[38;2;168;186;214m▀\x1B[0m\x1B[38;2;182;200;225m▀\x1B[0m\x1B[38;2;98;116;145m▀\x1B[0m",
			"    \x1B[38;2;89;100;129m▄\x1B[0m\x1B[38;2;239;236;233m\x1B[48;2;142;151;174m▀\x1B[0m\x1B[38;2;246;251;255m\x1B[48;2;122;134;164m▀\x1B[0m\x1B[38;2;76;92;130m\x1B[48;2;24;44;89m▀\x1B[0m\x1B[38;2;218;222;231m\x1B[48;2;122;137;163m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;152;161;184m▀\x1B[0m\x1B[38;2;167;174;184m\x1B[48;2;89;108;147m▀\x1B[0m\x1B[38;2;0;15;69m▄\x1B[0m    ",
			"                "
		]
	],
	"medium": [
		[
			"                      ",
			"        \x1B[38;2;107;114;114m\x1B[48;2;145;145;147m▀\x1B[0m\x1B[38;2;214;212;211m\x1B[48;2;226;233;244m▀\x1B[0m\x1B[38;2;196;196;202m\x1B[48;2;120;134;161m▀\x1B[0m\x1B[38;2;193;195;202m\x1B[48;2;147;163;193m▀\x1B[0m\x1B[38;2;203;203;207m\x1B[48;2;118;131;157m▀\x1B[0m\x1B[38;2;134;144;167m\x1B[48;2;86;106;148m▀\x1B[0m\x1B[38;2;19;44;95m▀\x1B[0m       ",
			"  \x1B[38;2;201;201;201m▄\x1B[0m\x1B[38;2;136;141;154m▄\x1B[0m\x1B[38;2;0;0;35m▄\x1B[0m \x1B[38;2;9;18;33m▄\x1B[0m\x1B[38;2;158;158;158m\x1B[48;2;204;204;206m▀\x1B[0m\x1B[38;2;230;234;241m\x1B[48;2;173;188;211m▀\x1B[0m\x1B[38;2;77;98;129m▀\x1B[0m \x1B[38;2;132;135;139m\x1B[48;2;163;171;186m▀\x1B[0m\x1B[38;2;132;133;135m\x1B[48;2;218;226;238m▀\x1B[0m\x1B[38;2;157;156;150m\x1B[48;2;200;209;222m▀\x1B[0m\x1B[38;2;161;161;165m\x1B[48;2;221;227;237m▀\x1B[0m\x1B[38;2;130;130;136m\x1B[48;2;226;229;235m▀\x1B[0m\x1B[38;2;51;65;94m▄\x1B[0m     ",
			"\x1B[38;2;150;153;157m▄\x1B[0m\x1B[38;2;186;186;188m\x1B[48;2;235;237;243m▀\x1B[0m\x1B[38;2;243;247;252m\x1B[48;2;116;135;170m▀\x1B[0m\x1B[38;2;239;244;254m\x1B[48;2;147;159;178m▀\x1B[0m\x1B[38;2;134;148;171m\x1B[48;2;241;241;241m▀\x1B[0m\x1B[38;2;137;139;141m▄\x1B[0m\x1B[38;2;206;207;209m\x1B[48;2;244;246;248m▀\x1B[0m\x1B[38;2;212;219;233m\x1B[48;2;107;122;147m▀\x1B[0m\x1B[38;2;30;55;107m\x1B[48;2;0;17;108m▀\x1B[0m  \x1B[38;2;19;67;145m▄\x1B[0m \x1B[38;2;255;255;255m▄\x1B[0m\x1B[38;2;255;255;250m▄\x1B[0m\x1B[38;2;234;235;234m\x1B[48;2;253;253;255m▀\x1B[0m\x1B[38;2;190;197;214m\x1B[48;2;138;152;181m▀\x1B[0m\x1B[38;2;0;0;23m\x1B[48;2;0;0;7m▀\x1B[0m    ",
			"\x1B[38;2;215;220;227m\x1B[48;2;103;123;158m▀\x1B[0m\x1B[38;2;135;150;179m\x1B[48;2;24;39;73m▀\x1B[0m\x1B[38;2;0;0;49m▀\x1B[0m \x1B[38;2;172;183;196m\x1B[48;2;22;40;78m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;223;230;240m▀\x1B[0m\x1B[38;2;181;187;201m\x1B[48;2;204;208;220m▀\x1B[0m \x1B[38;2;131;179;242m\x1B[48;2;25;90;220m▀\x1B[0m\x1B[38;2;85;134;238m\x1B[48;2;15;63;203m▀\x1B[0m \x1B[38;2;129;178;245m\x1B[48;2;25;98;227m▀\x1B[0m\x1B[38;2;31;102;232m\x1B[48;2;3;73;235m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;243;247;231m▀\x1B[0m\x1B[38;2;221;230;245m\x1B[48;2;230;235;243m▀\x1B[0m\x1B[38;2;83;99;129m\x1B[48;2;101;114;136m▀\x1B[0m\x1B[38;2;20;34;76m▀\x1B[0m     ",
			"     \x1B[38;2;103;115;141m▀\x1B[0m\x1B[38;2;235;240;251m\x1B[48;2;174;180;194m▀\x1B[0m\x1B[38;2;141;155;179m\x1B[48;2;207;214;226m▀\x1B[0m\x1B[38;2;0;0;237m\x1B[48;2;0;7;43m▀\x1B[0m\x1B[38;2;140;160;197m▀\x1B[0m\x1B[38;2;180;176;165m\x1B[48;2;205;205;199m▀\x1B[0m\x1B[38;2;70;118;214m▀\x1B[0m  \x1B[38;2;221;226;235m\x1B[48;2;99;114;140m▀\x1B[0m\x1B[38;2;210;219;233m\x1B[48;2;139;156;185m▀\x1B[0m\x1B[38;2;20;44;91m▄\x1B[0m  \x1B[38;2;153;155;155m▄\x1B[0m\x1B[38;2;24;31;55m\x1B[48;2;173;180;196m▀\x1B[0m\x1B[38;2;0;0;22m▄\x1B[0m",
			"      \x1B[38;2;9;19;48m▀\x1B[0m\x1B[38;2;199;203;211m\x1B[48;2;112;126;149m▀\x1B[0m\x1B[38;2;200;203;206m\x1B[48;2;160;169;185m▀\x1B[0m\x1B[38;2;143;146;157m\x1B[48;2;247;250;255m▀\x1B[0m\x1B[38;2;98;107;129m▄\x1B[0m \x1B[38;2;103;108;113m\x1B[48;2;229;229;229m▀\x1B[0m\x1B[38;2;211;210;208m\x1B[48;2;205;210;221m▀\x1B[0m\x1B[38;2;154;160;169m\x1B[48;2;230;234;243m▀\x1B[0m\x1B[38;2;0;0;24m\x1B[48;2;180;187;200m▀\x1B[0m \x1B[38;2;91;95;102m▄\x1B[0m\x1B[38;2;99;105;115m\x1B[48;2;212;215;220m▀\x1B[0m\x1B[38;2;252;253;255m\x1B[48;2;139;155;178m▀\x1B[0m\x1B[38;2;122;139;170m\x1B[48;2;0;0;0m▀\x1B[0m ",
			"         \x1B[38;2;215;221;229m\x1B[48;2;99;110;142m▀\x1B[0m\x1B[38;2;237;237;239m\x1B[48;2;196;204;222m▀\x1B[0m\x1B[38;2;240;235;229m\x1B[48;2;208;218;236m▀\x1B[0m\x1B[38;2;209;218;231m\x1B[48;2;86;107;143m▀\x1B[0m\x1B[38;2;29;49;85m▀\x1B[0m\x1B[38;2;126;138;162m▀\x1B[0m\x1B[38;2;242;247;254m\x1B[48;2;133;149;174m▀\x1B[0m\x1B[38;2;211;211;210m\x1B[48;2;165;176;196m▀\x1B[0m\x1B[38;2;242;241;239m\x1B[48;2;159;171;193m▀\x1B[0m\x1B[38;2;248;250;253m\x1B[48;2;160;171;192m▀\x1B[0m\x1B[38;2;201;201;205m\x1B[48;2;166;176;193m▀\x1B[0m\x1B[38;2;253;247;235m\x1B[48;2;167;176;195m▀\x1B[0m\x1B[38;2;157;166;187m\x1B[48;2;111;123;152m▀\x1B[0m",
			"         \x1B[38;2;232;235;238m\x1B[48;2;205;207;207m▀\x1B[0m\x1B[38;2;108;123;154m\x1B[48;2;156;162;178m▀\x1B[0m\x1B[38;2;88;106;138m\x1B[48;2;210;210;210m▀\x1B[0m\x1B[38;2;93;111;148m\x1B[48;2;215;218;223m▀\x1B[0m\x1B[38;2;63;83;117m▄\x1B[0m        ",
			"       \x1B[38;2;186;188;192m▄\x1B[0m\x1B[38;2;186;195;207m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;242;246;251m\x1B[48;2;241;246;254m▀\x1B[0m\x1B[38;2;112;122;146m\x1B[48;2;61;79;117m▀\x1B[0m\x1B[38;2;207;207;205m\x1B[48;2;138;150;179m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;251;253;255m▀\x1B[0m\x1B[38;2;174;188;213m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;183;190;203m▄\x1B[0m\x1B[38;2;3;21;55m▄\x1B[0m      ",
			"       \x1B[38;2;114;125;147m▀\x1B[0m\x1B[38;2;132;143;165m▀\x1B[0m\x1B[38;2;94;110;143m▀\x1B[0m\x1B[38;2;24;39;74m▀\x1B[0m\x1B[38;2;57;81;120m▀\x1B[0m\x1B[38;2;120;135;161m▀\x1B[0m\x1B[38;2;137;148;169m▀\x1B[0m\x1B[38;2;101;120;155m▀\x1B[0m\x1B[38;2;19;38;75m▀\x1B[0m      ",
			"                      "
		],
		[
			"                      ",
			"          \x1B[38;2;141;143;146m▄\x1B[0m\x1B[38;2;188;190;196m▄\x1B[0m\x1B[38;2;181;184;193m▄\x1B[0m\x1B[38;2;191;193;198m▄\x1B[0m\x1B[38;2;143;155;174m▄\x1B[0m       ",
			"\x1B[38;2;126;134;145m▄\x1B[0m\x1B[38;2;105;117;137m▄\x1B[0m   \x1B[38;2;58;58;73m▄\x1B[0m   \x1B[38;2;95;100;110m\x1B[48;2;237;237;236m▀\x1B[0m\x1B[38;2;231;233;236m\x1B[48;2;158;168;190m▀\x1B[0m\x1B[38;2;176;187;210m\x1B[48;2;0;0;0m▀\x1B[0m\x1B[38;2;150;165;196m\x1B[48;2;170;170;170m▀\x1B[0m\x1B[38;2;152;166;194m\x1B[48;2;168;171;175m▀\x1B[0m\x1B[38;2;87;107;143m\x1B[48;2;180;180;183m▀\x1B[0m\x1B[38;2;183;184;185m▄\x1B[0m\x1B[38;2;109;119;132m▄\x1B[0m     ",
			"\x1B[38;2;182;187;195m▀\x1B[0m\x1B[38;2;222;227;233m\x1B[48;2;185;195;210m▀\x1B[0m\x1B[38;2;109;118;136m\x1B[48;2;212;215;219m▀\x1B[0m\x1B[38;2;179;181;182m▄\x1B[0m\x1B[38;2;184;185;190m\x1B[48;2;221;227;236m▀\x1B[0m\x1B[38;2;236;239;244m\x1B[48;2;178;190;209m▀\x1B[0m\x1B[38;2;136;145;163m\x1B[48;2;211;216;224m▀\x1B[0m\x1B[38;2;113;124;141m▄\x1B[0m\x1B[38;2;184;184;184m\x1B[48;2;218;221;226m▀\x1B[0m\x1B[38;2;218;223;232m\x1B[48;2;140;154;178m▀\x1B[0m\x1B[38;2;63;85;127m▀\x1B[0m \x1B[38;2;143;151;167m▀\x1B[0m\x1B[38;2;184;193;209m▀\x1B[0m\x1B[38;2;165;176;197m\x1B[48;2;199;199;204m▀\x1B[0m\x1B[38;2;205;212;223m\x1B[48;2;240;240;237m▀\x1B[0m\x1B[38;2;206;211;216m\x1B[48;2;245;246;247m▀\x1B[0m\x1B[38;2;134;147;171m\x1B[48;2;171;187;210m▀\x1B[0m    ",
			"  \x1B[38;2;170;180;198m\x1B[48;2;27;38;60m▀\x1B[0m\x1B[38;2;226;234;248m\x1B[48;2;31;50;84m▀\x1B[0m\x1B[38;2;100;119;148m▀\x1B[0m \x1B[38;2;181;190;204m\x1B[48;2;61;81;108m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;218;224;231m▀\x1B[0m\x1B[38;2;175;180;190m\x1B[48;2;195;198;209m▀\x1B[0m\x1B[38;2;25;88;179m\x1B[48;2;0;92;230m▀\x1B[0m\x1B[38;2;81;150;252m\x1B[48;2;46;112;231m▀\x1B[0m \x1B[38;2;77;146;243m\x1B[48;2;42;105;218m▀\x1B[0m\x1B[38;2;47;111;233m\x1B[48;2;10;73;219m▀\x1B[0m\x1B[38;2;255;255;247m\x1B[48;2;236;232;221m▀\x1B[0m\x1B[38;2;210;217;231m\x1B[48;2;181;189;206m▀\x1B[0m\x1B[38;2;136;150;172m▀\x1B[0m\x1B[38;2;51;75;108m▀\x1B[0m    ",
			"       \x1B[38;2;155;167;186m▀\x1B[0m\x1B[38;2;221;227;236m\x1B[48;2;202;208;217m▀\x1B[0m\x1B[38;2;41;56;108m\x1B[48;2;180;185;199m▀\x1B[0m\x1B[38;2;9;30;139m▀\x1B[0m\x1B[38;2;231;231;208m▀\x1B[0m\x1B[38;2;59;70;136m▀\x1B[0m\x1B[38;2;0;10;127m▀\x1B[0m \x1B[38;2;215;219;227m\x1B[48;2;106;117;133m▀\x1B[0m\x1B[38;2;149;159;179m\x1B[48;2;87;103;130m▀\x1B[0m  \x1B[38;2;175;170;170m▄\x1B[0m\x1B[38;2;0;7;22m\x1B[48;2;173;182;197m▀\x1B[0m\x1B[38;2;17;35;67m▄\x1B[0m",
			"        \x1B[38;2;102;109;122m▀\x1B[0m\x1B[38;2;217;221;230m\x1B[48;2;63;73;94m▀\x1B[0m\x1B[38;2;215;218;224m\x1B[48;2;189;194;206m▀\x1B[0m\x1B[38;2;121;131;149m\x1B[48;2;207;213;223m▀\x1B[0m\x1B[38;2;102;106;119m▄\x1B[0m\x1B[38;2;127;127;131m\x1B[48;2;238;237;236m▀\x1B[0m\x1B[38;2;237;235;232m\x1B[48;2;163;174;195m▀\x1B[0m\x1B[38;2;158;165;177m\x1B[48;2;216;220;229m▀\x1B[0m\x1B[38;2;0;0;13m\x1B[48;2;168;172;180m▀\x1B[0m \x1B[38;2;97;100;109m\x1B[48;2;253;252;248m▀\x1B[0m\x1B[38;2;216;219;226m\x1B[48;2;149;158;176m▀\x1B[0m\x1B[38;2;108;124;152m\x1B[48;2;6;6;12m▀\x1B[0m ",
			"          \x1B[38;2;35;56;85m▀\x1B[0m\x1B[38;2;214;218;225m\x1B[48;2;149;160;179m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;115;130;158m▀\x1B[0m\x1B[38;2;157;168;186m\x1B[48;2;95;116;161m▀\x1B[0m \x1B[38;2;131;146;165m▀\x1B[0m\x1B[38;2;217;225;236m\x1B[48;2;88;109;155m▀\x1B[0m\x1B[38;2;223;227;233m\x1B[48;2;90;111;151m▀\x1B[0m\x1B[38;2;237;241;247m\x1B[48;2;77;100;140m▀\x1B[0m\x1B[38;2;211;216;224m\x1B[48;2;87;106;148m▀\x1B[0m\x1B[38;2;227;230;234m\x1B[48;2;96;117;156m▀\x1B[0m\x1B[38;2;156;169;187m\x1B[48;2;62;78;107m▀\x1B[0m",
			"         \x1B[38;2;170;170;176m▄\x1B[0m\x1B[38;2;163;163;163m\x1B[48;2;206;211;218m▀\x1B[0m\x1B[38;2;158;162;173m\x1B[48;2;172;179;194m▀\x1B[0m\x1B[38;2;128;138;159m\x1B[48;2;120;127;144m▀\x1B[0m\x1B[38;2;223;227;232m\x1B[48;2;242;244;244m▀\x1B[0m\x1B[38;2;162;176;200m▄\x1B[0m       ",
			"        \x1B[38;2;149;154;162m\x1B[48;2;75;85;108m▀\x1B[0m\x1B[38;2;241;241;241m\x1B[48;2;97;110;139m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;77;93;126m▀\x1B[0m\x1B[38;2;110;125;157m\x1B[48;2;29;49;85m▀\x1B[0m\x1B[38;2;69;85;118m▀\x1B[0m\x1B[38;2;250;252;252m\x1B[48;2;90;104;135m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;95;111;140m▀\x1B[0m\x1B[38;2;172;182;202m\x1B[48;2;62;83;121m▀\x1B[0m\x1B[38;2;0;31;87m▄\x1B[0m     ",
			"                      ",
			"                      "
		],
		[
			"                      ",
			"        \x1B[38;2;92;98;109m▄\x1B[0m\x1B[38;2;208;209;211m▄\x1B[0m\x1B[38;2;214;216;219m▄\x1B[0m\x1B[38;2;218;219;222m▄\x1B[0m\x1B[38;2;217;219;225m▄\x1B[0m\x1B[38;2;115;131;163m▄\x1B[0m        ",
			"       \x1B[38;2;0;0;0m\x1B[48;2;149;149;153m▀\x1B[0m\x1B[38;2;191;193;196m\x1B[48;2;229;234;243m▀\x1B[0m\x1B[38;2;205;215;230m\x1B[48;2;62;90;137m▀\x1B[0m\x1B[38;2;123;135;164m▀\x1B[0m\x1B[38;2;122;134;157m\x1B[48;2;240;232;229m▀\x1B[0m\x1B[38;2;106;119;147m\x1B[48;2;247;240;233m▀\x1B[0m\x1B[38;2;40;61;106m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;162;162;167m▄\x1B[0m       ",
			" \x1B[38;2;151;153;155m▄\x1B[0m\x1B[38;2;162;165;172m\x1B[48;2;224;230;239m▀\x1B[0m\x1B[38;2;163;169;182m\x1B[48;2;239;244;255m▀\x1B[0m\x1B[38;2;0;0;45m\x1B[48;2;172;183;203m▀\x1B[0m \x1B[38;2;154;161;172m\x1B[48;2;231;229;226m▀\x1B[0m\x1B[38;2;237;240;243m\x1B[48;2;195;205;220m▀\x1B[0m\x1B[38;2;149;166;196m\x1B[48;2;0;0;30m▀\x1B[0m \x1B[38;2;87;94;116m▀\x1B[0m\x1B[38;2;164;173;192m▀\x1B[0m\x1B[38;2;174;182;197m▀\x1B[0m\x1B[38;2;170;179;197m▀\x1B[0m\x1B[38;2;227;230;236m\x1B[48;2;147;150;153m▀\x1B[0m\x1B[38;2;173;185;199m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;0;7;46m\x1B[48;2;102;118;150m▀\x1B[0m     ",
			"\x1B[38;2;146;146;146m\x1B[48;2;173;179;189m▀\x1B[0m\x1B[38;2;234;235;238m\x1B[48;2;167;183;206m▀\x1B[0m\x1B[38;2;132;149;181m▀\x1B[0m\x1B[38;2;158;173;196m▀\x1B[0m\x1B[38;2;231;234;240m\x1B[48;2;172;183;200m▀\x1B[0m\x1B[38;2;193;193;196m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;221;226;236m\x1B[48;2;163;174;193m▀\x1B[0m\x1B[38;2;76;101;145m\x1B[48;2;0;43;143m▀\x1B[0m\x1B[38;2;16;93;230m\x1B[48;2;96;158;255m▀\x1B[0m\x1B[38;2;0;65;255m▄\x1B[0m\x1B[38;2;19;137;255m▄\x1B[0m\x1B[38;2;41;139;255m\x1B[48;2;94;168;255m▀\x1B[0m\x1B[38;2;32;114;245m▄\x1B[0m\x1B[38;2;201;197;193m\x1B[48;2;255;255;250m▀\x1B[0m\x1B[38;2;216;216;216m\x1B[48;2;154;170;195m▀\x1B[0m\x1B[38;2;207;215;225m\x1B[48;2;70;94;132m▀\x1B[0m\x1B[38;2;49;67;102m▀\x1B[0m  \x1B[38;2;87;100;114m▄\x1B[0m\x1B[38;2;102;109;129m\x1B[48;2;233;235;239m▀\x1B[0m\x1B[38;2;56;63;84m\x1B[48;2;117;133;161m▀\x1B[0m",
			"\x1B[38;2;65;87;123m▀\x1B[0m    \x1B[38;2;186;192;205m\x1B[48;2;61;77;109m▀\x1B[0m\x1B[38;2;208;212;218m\x1B[48;2;226;230;239m▀\x1B[0m\x1B[38;2;0;20;97m\x1B[48;2;159;171;194m▀\x1B[0m\x1B[38;2;9;64;196m▀\x1B[0m\x1B[38;2;75;110;210m\x1B[48;2;168;168;172m▀\x1B[0m\x1B[38;2;74;131;201m\x1B[48;2;221;218;208m▀\x1B[0m\x1B[38;2;13;81;216m▀\x1B[0m\x1B[38;2;0;12;191m▀\x1B[0m\x1B[38;2;189;187;183m\x1B[48;2;5;22;51m▀\x1B[0m\x1B[38;2;215;221;230m\x1B[48;2;214;220;229m▀\x1B[0m\x1B[38;2;36;54;91m\x1B[48;2;155;171;198m▀\x1B[0m  \x1B[38;2;45;56;66m\x1B[48;2;213;214;216m▀\x1B[0m\x1B[38;2;217;217;215m\x1B[48;2;175;186;206m▀\x1B[0m\x1B[38;2;176;188;211m\x1B[48;2;3;24;63m▀\x1B[0m\x1B[38;2;21;51;92m▀\x1B[0m",
			"      \x1B[38;2;173;179;191m\x1B[48;2;0;14;42m▀\x1B[0m\x1B[38;2;233;238;248m\x1B[48;2;162;170;186m▀\x1B[0m\x1B[38;2;149;162;178m\x1B[48;2;244;247;251m▀\x1B[0m\x1B[38;2;210;215;221m▄\x1B[0m  \x1B[38;2;246;246;246m▄\x1B[0m\x1B[38;2;71;73;79m\x1B[48;2;229;232;241m▀\x1B[0m\x1B[38;2;97;104;119m\x1B[48;2;196;200;209m▀\x1B[0m\x1B[38;2;96;105;124m\x1B[48;2;203;206;213m▀\x1B[0m\x1B[38;2;87;87;85m\x1B[48;2;212;217;226m▀\x1B[0m\x1B[38;2;202;200;198m\x1B[48;2;216;221;229m▀\x1B[0m\x1B[38;2;214;221;234m\x1B[48;2;200;206;216m▀\x1B[0m\x1B[38;2;77;87;105m\x1B[48;2;211;215;221m▀\x1B[0m\x1B[38;2;138;135;129m\x1B[48;2;156;167;187m▀\x1B[0m\x1B[38;2;8;21;48m▄\x1B[0m",
			"        \x1B[38;2;112;130;162m▀\x1B[0m\x1B[38;2;243;246;250m\x1B[48;2;184;191;206m▀\x1B[0m\x1B[38;2;184;187;192m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;241;240;235m\x1B[48;2;235;240;248m▀\x1B[0m\x1B[38;2;205;212;225m\x1B[48;2;73;88;125m▀\x1B[0m\x1B[38;2;47;65;96m▀\x1B[0m\x1B[38;2;85;120;170m▀\x1B[0m\x1B[38;2;75;105;150m▀\x1B[0m\x1B[38;2;68;96;147m▀\x1B[0m\x1B[38;2;54;81;130m▀\x1B[0m\x1B[38;2;72;98;145m▀\x1B[0m\x1B[38;2;72;98;150m▀\x1B[0m\x1B[38;2;36;60;109m▀\x1B[0m ",
			"         \x1B[38;2;220;227;240m\x1B[48;2;228;229;228m▀\x1B[0m\x1B[38;2;112;129;160m\x1B[48;2;143;156;180m▀\x1B[0m\x1B[38;2;90;108;141m\x1B[48;2;216;218;216m▀\x1B[0m\x1B[38;2;85;108;153m\x1B[48;2;174;184;196m▀\x1B[0m         ",
			"      \x1B[38;2;63;74;90m▄\x1B[0m\x1B[38;2;206;207;211m▄\x1B[0m\x1B[38;2;228;232;241m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;209;219;237m▀\x1B[0m\x1B[38;2;81;95;131m\x1B[48;2;16;41;99m▀\x1B[0m\x1B[38;2;200;197;194m\x1B[48;2;181;181;186m▀\x1B[0m\x1B[38;2;226;232;241m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;77;100;134m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;160;172;195m▄\x1B[0m       ",
			"      \x1B[38;2;93;105;129m▀\x1B[0m\x1B[38;2;162;172;193m▀\x1B[0m\x1B[38;2;145;157;176m▀\x1B[0m\x1B[38;2;82;102;139m▀\x1B[0m\x1B[38;2;0;20;56m▀\x1B[0m\x1B[38;2;117;134;167m▀\x1B[0m\x1B[38;2;161;173;195m▀\x1B[0m\x1B[38;2;160;171;188m▀\x1B[0m\x1B[38;2;89;110;147m▀\x1B[0m\x1B[38;2;0;0;47m▀\x1B[0m      ",
			"                      "
		],
		[
			"                      ",
			"          \x1B[38;2;192;194;199m▄\x1B[0m\x1B[38;2;216;219;226m▄\x1B[0m\x1B[38;2;202;207;216m▄\x1B[0m\x1B[38;2;216;218;223m▄\x1B[0m\x1B[38;2;142;155;181m▄\x1B[0m       ",
			"        \x1B[38;2;0;7;14m▄\x1B[0m\x1B[38;2;124;121;126m\x1B[48;2;222;222;222m▀\x1B[0m\x1B[38;2;219;223;232m\x1B[48;2;165;178;198m▀\x1B[0m\x1B[38;2;152;163;182m▀\x1B[0m\x1B[38;2;206;215;235m\x1B[48;2;187;184;179m▀\x1B[0m\x1B[38;2;146;154;175m\x1B[48;2;194;192;189m▀\x1B[0m\x1B[38;2;80;96;130m\x1B[48;2;208;205;198m▀\x1B[0m\x1B[38;2;180;182;183m▄\x1B[0m\x1B[38;2;106;110;127m▄\x1B[0m     ",
			"   \x1B[38;2;177;180;183m▄\x1B[0m\x1B[38;2;176;179;187m\x1B[48;2;206;212;223m▀\x1B[0m\x1B[38;2;193;198;209m\x1B[48;2;207;213;226m▀\x1B[0m\x1B[38;2;41;65;118m\x1B[48;2;195;204;215m▀\x1B[0m\x1B[38;2;90;93;96m▄\x1B[0m\x1B[38;2;191;193;193m\x1B[48;2;240;244;251m▀\x1B[0m\x1B[38;2;196;205;220m\x1B[48;2;97;112;142m▀\x1B[0m\x1B[38;2;30;57;101m▀\x1B[0m \x1B[38;2;120;131;150m▀\x1B[0m\x1B[38;2;148;156;174m▀\x1B[0m\x1B[38;2;129;137;157m▀\x1B[0m\x1B[38;2;182;188;198m\x1B[48;2;191;194;198m▀\x1B[0m\x1B[38;2;207;213;220m\x1B[48;2;235;238;240m▀\x1B[0m\x1B[38;2;96;112;146m\x1B[48;2;126;136;162m▀\x1B[0m    ",
			"\x1B[38;2;171;182;196m\x1B[48;2;168;183;206m▀\x1B[0m\x1B[38;2;133;136;150m\x1B[48;2;200;206;214m▀\x1B[0m\x1B[38;2;185;190;197m▄\x1B[0m\x1B[38;2;222;225;229m\x1B[48;2;206;212;223m▀\x1B[0m\x1B[38;2;138;152;178m\x1B[48;2;67;87;119m▀\x1B[0m\x1B[38;2;44;57;86m▀\x1B[0m\x1B[38;2;201;205;214m\x1B[48;2;122;140;159m▀\x1B[0m\x1B[38;2;237;237;238m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;150;160;180m\x1B[48;2;101;102;121m▀\x1B[0m\x1B[38;2;62;102;166m\x1B[48;2;34;88;182m▀\x1B[0m\x1B[38;2;95;146;235m\x1B[48;2;55;109;212m▀\x1B[0m \x1B[38;2;111;167;249m\x1B[48;2;67;138;246m▀\x1B[0m\x1B[38;2;55;130;252m\x1B[48;2;28;109;243m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;227;227;223m▀\x1B[0m\x1B[38;2;221;227;239m\x1B[48;2;176;188;209m▀\x1B[0m\x1B[38;2;136;149;176m\x1B[48;2;0;15;53m▀\x1B[0m\x1B[38;2;52;70;105m▀\x1B[0m \x1B[38;2;143;143;147m▄\x1B[0m\x1B[38;2;184;186;191m\x1B[48;2;225;231;241m▀\x1B[0m\x1B[38;2;137;149;170m\x1B[48;2;90;108;139m▀\x1B[0m",
			" \x1B[38;2;196;203;215m\x1B[48;2;90;102;133m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;128;138;162m▀\x1B[0m\x1B[38;2;147;159;183m\x1B[48;2;58;73;102m▀\x1B[0m   \x1B[38;2;181;191;210m\x1B[48;2;78;93;119m▀\x1B[0m\x1B[38;2;205;211;219m\x1B[48;2;212;218;228m▀\x1B[0m\x1B[38;2;17;51;150m\x1B[48;2;182;194;220m▀\x1B[0m\x1B[38;2;53;96;221m▀\x1B[0m\x1B[38;2;175;170;149m\x1B[48;2;188;183;173m▀\x1B[0m\x1B[38;2;68;113;205m▀\x1B[0m\x1B[38;2;0;66;255m▀\x1B[0m \x1B[38;2;216;221;229m\x1B[48;2;125;134;151m▀\x1B[0m\x1B[38;2;187;199;213m\x1B[48;2;93;106;136m▀\x1B[0m\x1B[38;2;66;75;85m▄\x1B[0m\x1B[38;2;127;130;135m\x1B[48;2;226;226;230m▀\x1B[0m\x1B[38;2;236;238;242m\x1B[48;2;140;152;175m▀\x1B[0m\x1B[38;2;144;160;188m\x1B[48;2;0;0;24m▀\x1B[0m ",
			"        \x1B[38;2;142;152;172m▀\x1B[0m\x1B[38;2;225;231;240m\x1B[48;2;87;102;130m▀\x1B[0m\x1B[38;2;165;170;179m\x1B[48;2;216;222;232m▀\x1B[0m\x1B[38;2;86;96;125m\x1B[48;2;193;196;205m▀\x1B[0m\x1B[38;2;62;68;87m▄\x1B[0m\x1B[38;2;132;143;159m\x1B[48;2;230;231;232m▀\x1B[0m\x1B[38;2;218;219;220m\x1B[48;2;160;171;191m▀\x1B[0m\x1B[38;2;191;194;200m\x1B[48;2;117;131;156m▀\x1B[0m\x1B[38;2;168;174;183m\x1B[48;2;153;166;188m▀\x1B[0m\x1B[38;2;207;208;211m\x1B[48;2;158;172;197m▀\x1B[0m\x1B[38;2;245;247;251m\x1B[48;2;129;143;172m▀\x1B[0m\x1B[38;2;216;220;226m\x1B[48;2;139;154;181m▀\x1B[0m\x1B[38;2;176;181;190m\x1B[48;2;107;124;160m▀\x1B[0m\x1B[38;2;37;53;86m\x1B[48;2;31;55;95m▀\x1B[0m",
			"          \x1B[38;2;107;118;138m▀\x1B[0m\x1B[38;2;228;230;233m\x1B[48;2;175;186;205m▀\x1B[0m\x1B[38;2;231;232;233m\x1B[48;2;141;155;180m▀\x1B[0m\x1B[38;2;179;188;203m\x1B[48;2;77;102;149m▀\x1B[0m\x1B[38;2;0;0;36m▀\x1B[0m       ",
			"          \x1B[38;2;211;211;211m\x1B[48;2;211;219;229m▀\x1B[0m\x1B[38;2;187;193;203m\x1B[48;2;176;180;191m▀\x1B[0m\x1B[38;2;203;207;216m\x1B[48;2;226;223;226m▀\x1B[0m\x1B[38;2;189;197;209m\x1B[48;2;244;247;252m▀\x1B[0m\x1B[38;2;113;130;160m▄\x1B[0m       ",
			"        \x1B[38;2;143;148;148m\x1B[48;2;110;119;138m▀\x1B[0m\x1B[38;2;238;237;236m\x1B[48;2;162;173;195m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;134;146;172m▀\x1B[0m\x1B[38;2;125;141;175m\x1B[48;2;60;80;120m▀\x1B[0m\x1B[38;2;126;139;171m\x1B[48;2;40;58;80m▀\x1B[0m\x1B[38;2;236;240;246m\x1B[48;2;132;144;169m▀\x1B[0m\x1B[38;2;242;243;245m\x1B[48;2;157;166;186m▀\x1B[0m\x1B[38;2;153;159;174m\x1B[48;2;99;119;155m▀\x1B[0m\x1B[38;2;17;43;86m▄\x1B[0m     ",
			"                      ",
			"                      "
		],
		[
			"                      ",
			"        \x1B[38;2;179;187;196m▄\x1B[0m\x1B[38;2;212;212;212m\x1B[48;2;233;237;244m▀\x1B[0m\x1B[38;2;230;232;236m\x1B[48;2;173;186;208m▀\x1B[0m\x1B[38;2;218;219;223m\x1B[48;2;185;200;224m▀\x1B[0m\x1B[38;2;230;231;233m\x1B[48;2;183;199;223m▀\x1B[0m\x1B[38;2;205;211;225m\x1B[48;2;137;159;194m▀\x1B[0m\x1B[38;2;72;90;131m\x1B[48;2;39;64;111m▀\x1B[0m       ",
			"  \x1B[38;2;168;170;173m▄\x1B[0m\x1B[38;2;166;171;179m▄\x1B[0m\x1B[38;2;0;5;37m▄\x1B[0m \x1B[38;2;6;18;37m▄\x1B[0m\x1B[38;2;121;127;133m\x1B[48;2;200;201;204m▀\x1B[0m\x1B[38;2;234;236;239m\x1B[48;2;207;217;232m▀\x1B[0m\x1B[38;2;133;147;173m\x1B[48;2;57;88;140m▀\x1B[0m\x1B[38;2;0;0;0m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;155;164;177m▀\x1B[0m\x1B[38;2;155;155;156m\x1B[48;2;240;245;255m▀\x1B[0m\x1B[38;2;151;150;151m\x1B[48;2;224;229;237m▀\x1B[0m\x1B[38;2;177;174;172m\x1B[48;2;221;225;233m▀\x1B[0m\x1B[38;2;149;150;157m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;135;147;171m▄\x1B[0m     ",
			"\x1B[38;2;0;0;0m▄\x1B[0m\x1B[38;2;114;114;118m\x1B[48;2;207;207;207m▀\x1B[0m\x1B[38;2;225;228;235m\x1B[48;2;168;180;199m▀\x1B[0m\x1B[38;2;254;255;255m\x1B[48;2;129;145;173m▀\x1B[0m\x1B[38;2;149;160;176m\x1B[48;2;250;252;255m▀\x1B[0m\x1B[38;2;111;119;132m▄\x1B[0m\x1B[38;2;171;174;177m\x1B[48;2;251;252;251m▀\x1B[0m\x1B[38;2;245;250;255m\x1B[48;2;145;159;182m▀\x1B[0m\x1B[38;2;73;96;137m\x1B[48;2;0;0;41m▀\x1B[0m  \x1B[38;2;5;44;116m▄\x1B[0m\x1B[38;2;0;0;86m▄\x1B[0m\x1B[38;2;255;255;239m▄\x1B[0m\x1B[38;2;248;248;243m▄\x1B[0m\x1B[38;2;210;220;226m\x1B[48;2;255;255;251m▀\x1B[0m\x1B[38;2;234;237;244m\x1B[48;2;239;244;251m▀\x1B[0m\x1B[38;2;77;90;124m\x1B[48;2;71;89;129m▀\x1B[0m    ",
			"\x1B[38;2;207;207;207m\x1B[48;2;105;117;140m▀\x1B[0m\x1B[38;2;217;227;243m\x1B[48;2;71;91;127m▀\x1B[0m\x1B[38;2;42;65;101m▀\x1B[0m \x1B[38;2;170;180;196m\x1B[48;2;11;38;81m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;215;223;234m▀\x1B[0m\x1B[38;2;194;201;215m\x1B[48;2;214;218;229m▀\x1B[0m\x1B[38;2;0;0;47m\x1B[48;2;0;0;0m▀\x1B[0m\x1B[38;2;118;165;218m\x1B[48;2;34;89;204m▀\x1B[0m\x1B[38;2;92;143;230m\x1B[48;2;27;86;227m▀\x1B[0m \x1B[38;2;124;183;240m\x1B[48;2;37;113;230m▀\x1B[0m\x1B[38;2;91;148;246m\x1B[48;2;29;94;235m▀\x1B[0m\x1B[38;2;190;210;242m\x1B[48;2;53;83;142m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;219;220;224m▀\x1B[0m\x1B[38;2;151;164;193m\x1B[48;2;148;159;177m▀\x1B[0m\x1B[38;2;92;114;152m▀\x1B[0m   \x1B[38;2;158;161;167m▄\x1B[0m\x1B[38;2;89;98;120m▄\x1B[0m",
			"     \x1B[38;2;121;135;156m▀\x1B[0m\x1B[38;2;218;225;237m\x1B[48;2;166;178;193m▀\x1B[0m\x1B[38;2;157;165;182m\x1B[48;2;226;231;241m▀\x1B[0m\x1B[38;2;0;0;181m\x1B[48;2;12;22;63m▀\x1B[0m\x1B[38;2;83;121;223m▀\x1B[0m\x1B[38;2;213;208;178m\x1B[48;2;129;133;133m▀\x1B[0m\x1B[38;2;81;110;194m▀\x1B[0m\x1B[38;2;0;49;218m▀\x1B[0m \x1B[38;2;193;201;212m\x1B[48;2;4;28;72m▀\x1B[0m\x1B[38;2;244;250;255m\x1B[48;2;157;171;195m▀\x1B[0m\x1B[38;2;96;115;143m\x1B[48;2;92;109;144m▀\x1B[0m \x1B[38;2;164;167;169m▄\x1B[0m\x1B[38;2;189;187;187m\x1B[48;2;241;247;255m▀\x1B[0m\x1B[38;2;245;252;255m\x1B[48;2;75;101;137m▀\x1B[0m\x1B[38;2;73;92;130m▀\x1B[0m",
			"      \x1B[38;2;31;49;77m▀\x1B[0m\x1B[38;2;186;192;203m\x1B[48;2;143;160;182m▀\x1B[0m\x1B[38;2;198;202;210m\x1B[48;2;183;193;212m▀\x1B[0m\x1B[38;2;126;128;136m\x1B[48;2;253;254;255m▀\x1B[0m\x1B[38;2;51;57;82m\x1B[48;2;155;163;178m▀\x1B[0m \x1B[38;2;235;235;233m▄\x1B[0m\x1B[38;2;196;199;203m\x1B[48;2;212;218;229m▀\x1B[0m\x1B[38;2;210;209;213m\x1B[48;2;159;175;201m▀\x1B[0m\x1B[38;2;99;111;133m\x1B[48;2;244;247;250m▀\x1B[0m\x1B[38;2;0;0;0m\x1B[48;2;246;246;243m▀\x1B[0m\x1B[38;2;229;229;222m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;232;237;247m\x1B[48;2;241;244;249m▀\x1B[0m\x1B[38;2;87;106;143m\x1B[48;2;238;239;238m▀\x1B[0m\x1B[38;2;255;255;255m▄\x1B[0m\x1B[38;2;113;127;148m▄\x1B[0m",
			"         \x1B[38;2;184;196;212m\x1B[48;2;81;103;151m▀\x1B[0m\x1B[38;2;247;248;250m\x1B[48;2;197;205;221m▀\x1B[0m\x1B[38;2;198;198;198m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;240;244;251m\x1B[48;2;107;124;159m▀\x1B[0m\x1B[38;2;125;144;171m▀\x1B[0m \x1B[38;2;143;162;192m▀\x1B[0m\x1B[38;2;182;192;213m▀\x1B[0m\x1B[38;2;172;184;208m▀\x1B[0m\x1B[38;2;178;189;210m▀\x1B[0m\x1B[38;2;183;194;213m▀\x1B[0m\x1B[38;2;179;192;217m▀\x1B[0m\x1B[38;2;75;93;120m▀\x1B[0m",
			"         \x1B[38;2;255;255;255m\x1B[48;2;245;244;241m▀\x1B[0m\x1B[38;2;157;170;195m\x1B[48;2;197;201;208m▀\x1B[0m\x1B[38;2;94;112;145m\x1B[48;2;151;155;175m▀\x1B[0m\x1B[38;2;123;136;165m\x1B[48;2;233;234;235m▀\x1B[0m\x1B[38;2;138;154;176m▄\x1B[0m        ",
			"       \x1B[38;2;210;213;215m▄\x1B[0m\x1B[38;2;226;226;232m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;252;253;253m▀\x1B[0m\x1B[38;2;159;168;185m\x1B[48;2;123;140;176m▀\x1B[0m\x1B[38;2;133;141;157m\x1B[48;2;78;98;149m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;228;231;239m▀\x1B[0m\x1B[38;2;185;197;220m\x1B[48;2;255;255;252m▀\x1B[0m\x1B[38;2;120;134;161m\x1B[48;2;235;238;242m▀\x1B[0m\x1B[38;2;79;92;120m▄\x1B[0m      ",
			"      \x1B[38;2;75;89;117m▀\x1B[0m\x1B[38;2;146;156;175m▀\x1B[0m\x1B[38;2;157;166;184m▀\x1B[0m\x1B[38;2;121;137;167m▀\x1B[0m\x1B[38;2;54;73;111m▀\x1B[0m \x1B[38;2;130;143;170m▀\x1B[0m\x1B[38;2;163;173;191m▀\x1B[0m\x1B[38;2;147;160;188m▀\x1B[0m\x1B[38;2;61;85;126m▀\x1B[0m      ",
			"                      "
		],
		[
			"                      ",
			"        \x1B[38;2;114;114;122m▄\x1B[0m\x1B[38;2;156;159;168m\x1B[48;2;244;246;248m▀\x1B[0m\x1B[38;2;171;171;182m\x1B[48;2;195;205;222m▀\x1B[0m\x1B[38;2;165;165;177m\x1B[48;2;183;196;218m▀\x1B[0m\x1B[38;2;168;167;174m\x1B[48;2;197;209;230m▀\x1B[0m\x1B[38;2;160;164;180m\x1B[48;2;174;188;215m▀\x1B[0m\x1B[38;2;83;101;143m\x1B[48;2;85;105;151m▀\x1B[0m       ",
			"  \x1B[38;2;159;162;166m▄\x1B[0m\x1B[38;2;129;138;156m▄\x1B[0m   \x1B[38;2;226;225;225m▄\x1B[0m\x1B[38;2;212;212;212m\x1B[48;2;238;244;252m▀\x1B[0m\x1B[38;2;167;179;201m\x1B[48;2;48;63;93m▀\x1B[0m\x1B[38;2;0;0;30m▀\x1B[0m\x1B[38;2;167;172;181m▄\x1B[0m\x1B[38;2;45;51;69m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;48;52;73m\x1B[48;2;240;243;249m▀\x1B[0m\x1B[38;2;80;76;83m\x1B[48;2;241;244;250m▀\x1B[0m\x1B[38;2;75;78;94m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;119;125;137m▄\x1B[0m     ",
			" \x1B[38;2;30;37;60m\x1B[48;2;187;189;191m▀\x1B[0m\x1B[38;2;207;208;212m\x1B[48;2;215;221;232m▀\x1B[0m\x1B[38;2;237;241;248m\x1B[48;2;185;195;211m▀\x1B[0m\x1B[38;2;84;103;131m\x1B[48;2;214;217;226m▀\x1B[0m\x1B[38;2;0;10;58m▄\x1B[0m\x1B[38;2;154;165;180m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;254;255;255m\x1B[48;2;184;197;219m▀\x1B[0m\x1B[38;2;121;141;170m\x1B[48;2;0;10;70m▀\x1B[0m  \x1B[38;2;97;112;138m▀\x1B[0m\x1B[38;2;155;174;210m▀\x1B[0m\x1B[38;2;143;164;196m▀\x1B[0m\x1B[38;2;102;125;175m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;196;205;217m\x1B[48;2;209;206;199m▀\x1B[0m\x1B[38;2;229;233;239m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;92;105;134m\x1B[48;2;122;136;169m▀\x1B[0m    ",
			"\x1B[38;2;165;163;163m\x1B[48;2;116;125;144m▀\x1B[0m\x1B[38;2;245;250;255m\x1B[48;2;116;133;166m▀\x1B[0m\x1B[38;2;82;103;141m▀\x1B[0m\x1B[38;2;86;98;120m▀\x1B[0m\x1B[38;2;216;220;227m\x1B[48;2;124;135;158m▀\x1B[0m\x1B[38;2;244;243;238m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;210;213;221m\x1B[48;2;169;176;193m▀\x1B[0m\x1B[38;2;44;59;89m\x1B[48;2;0;0;12m▀\x1B[0m\x1B[38;2;80;118;167m\x1B[48;2;85;130;205m▀\x1B[0m\x1B[38;2;75;121;193m\x1B[48;2;63;122;245m▀\x1B[0m \x1B[38;2;63;126;211m\x1B[48;2;51;132;240m▀\x1B[0m\x1B[38;2;59;118;214m\x1B[48;2;58;120;240m▀\x1B[0m\x1B[38;2;221;227;243m\x1B[48;2;85;134;196m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;247;247;245m▀\x1B[0m\x1B[38;2;211;216;224m\x1B[48;2;108;121;147m▀\x1B[0m\x1B[38;2;146;158;178m\x1B[48;2;0;0;0m▀\x1B[0m\x1B[38;2;55;74;108m▀\x1B[0m    ",
			"\x1B[38;2;0;5;40m▀\x1B[0m\x1B[38;2;0;5;35m▀\x1B[0m   \x1B[38;2;161;165;170m\x1B[48;2;0;0;31m▀\x1B[0m\x1B[38;2;242;244;250m\x1B[48;2;217;222;230m▀\x1B[0m\x1B[38;2;90;108;139m\x1B[48;2;184;192;205m▀\x1B[0m\x1B[38;2;0;26;153m\x1B[48;2;0;0;0m▀\x1B[0m\x1B[38;2;25;66;189m▀\x1B[0m\x1B[38;2;148;150;148m▄\x1B[0m\x1B[38;2;32;90;209m\x1B[48;2;142;137;121m▀\x1B[0m\x1B[38;2;5;61;206m▀\x1B[0m \x1B[38;2;192;198;204m\x1B[48;2;71;87;111m▀\x1B[0m\x1B[38;2;205;212;225m\x1B[48;2;241;245;249m▀\x1B[0m\x1B[38;2;60;90;150m\x1B[48;2;144;154;178m▀\x1B[0m  \x1B[38;2;149;149;153m▄\x1B[0m\x1B[38;2;61;69;85m\x1B[48;2;243;248;255m▀\x1B[0m\x1B[38;2;44;52;72m\x1B[48;2;83;100;134m▀\x1B[0m",
			"      \x1B[38;2;122;130;142m▀\x1B[0m\x1B[38;2;243;246;250m\x1B[48;2;161;167;183m▀\x1B[0m\x1B[38;2;121;135;153m\x1B[48;2;244;248;254m▀\x1B[0m\x1B[38;2;199;200;202m▄\x1B[0m\x1B[38;2;94;108;133m▄\x1B[0m \x1B[38;2;127;140;159m▄\x1B[0m\x1B[38;2;223;226;228m▄\x1B[0m\x1B[38;2;190;185;185m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;76;93;124m\x1B[48;2;153;163;176m▀\x1B[0m\x1B[38;2;72;89;127m\x1B[48;2;0;0;0m▀\x1B[0m\x1B[38;2;164;169;171m▄\x1B[0m\x1B[38;2;142;144;146m\x1B[48;2;238;241;248m▀\x1B[0m\x1B[38;2;247;251;255m\x1B[48;2;88;103;141m▀\x1B[0m\x1B[38;2;129;146;178m▀\x1B[0m ",
			"       \x1B[38;2;115;134;166m▀\x1B[0m\x1B[38;2;130;148;188m▀\x1B[0m\x1B[38;2;230;234;243m\x1B[48;2;121;136;171m▀\x1B[0m\x1B[38;2;226;228;230m\x1B[48;2;234;236;241m▀\x1B[0m\x1B[38;2;0;0;0m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;237;237;236m\x1B[48;2;226;230;237m▀\x1B[0m\x1B[38;2;203;210;222m\x1B[48;2;56;76;111m▀\x1B[0m\x1B[38;2;115;129;158m▀\x1B[0m\x1B[38;2;238;240;245m\x1B[48;2;157;173;195m▀\x1B[0m\x1B[38;2;190;194;199m\x1B[48;2;217;224;233m▀\x1B[0m\x1B[38;2;243;242;241m\x1B[48;2;210;215;227m▀\x1B[0m\x1B[38;2;213;219;231m\x1B[48;2;213;219;228m▀\x1B[0m\x1B[38;2;176;179;185m\x1B[48;2;218;224;232m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;215;222;233m▀\x1B[0m\x1B[38;2;99;110;134m\x1B[48;2;83;98;128m▀\x1B[0m",
			"         \x1B[38;2;43;49;68m\x1B[48;2;123;123;131m▀\x1B[0m\x1B[38;2;153;165;187m\x1B[48;2;180;187;202m▀\x1B[0m\x1B[38;2;186;195;210m\x1B[48;2;76;89;115m▀\x1B[0m\x1B[38;2;123;139;171m\x1B[48;2;169;179;196m▀\x1B[0m\x1B[38;2;63;82;114m▄\x1B[0m        ",
			"       \x1B[38;2;98;102;102m▄\x1B[0m\x1B[38;2;216;219;222m▄\x1B[0m\x1B[38;2;193;196;201m\x1B[48;2;239;240;241m▀\x1B[0m\x1B[38;2;209;213;221m\x1B[48;2;148;161;185m▀\x1B[0m\x1B[38;2;22;40;72m\x1B[48;2;21;43;82m▀\x1B[0m\x1B[38;2;239;239;237m\x1B[48;2;226;226;225m▀\x1B[0m\x1B[38;2;151;158;172m\x1B[48;2;176;187;205m▀\x1B[0m\x1B[38;2;159;167;180m▄\x1B[0m\x1B[38;2;63;69;86m▄\x1B[0m      ",
			"      \x1B[38;2;20;31;57m\x1B[48;2;42;54;72m▀\x1B[0m\x1B[38;2;206;208;213m\x1B[48;2;102;115;140m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;101;115;140m▀\x1B[0m\x1B[38;2;241;244;248m\x1B[48;2;79;98;132m▀\x1B[0m\x1B[38;2;96;115;156m\x1B[48;2;33;53;92m▀\x1B[0m\x1B[38;2;0;4;68m▀\x1B[0m\x1B[38;2;196;204;219m\x1B[48;2;93;113;144m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;102;118;149m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;91;109;143m▀\x1B[0m\x1B[38;2;115;130;162m\x1B[48;2;52;74;116m▀\x1B[0m      ",
			"                      "
		],
		[
			"                      ",
			"        \x1B[38;2;188;188;191m▄\x1B[0m\x1B[38;2;162;163;169m\x1B[48;2;245;247;251m▀\x1B[0m\x1B[38;2;176;177;183m\x1B[48;2;198;209;226m▀\x1B[0m\x1B[38;2;172;172;176m\x1B[48;2;210;221;241m▀\x1B[0m\x1B[38;2;181;181;185m\x1B[48;2;221;230;247m▀\x1B[0m\x1B[38;2;143;149;165m\x1B[48;2;161;178;209m▀\x1B[0m\x1B[38;2;22;52;97m▀\x1B[0m       ",
			"  \x1B[38;2;132;134;141m▄\x1B[0m\x1B[38;2;164;170;181m▄\x1B[0m   \x1B[38;2;93;98;114m\x1B[48;2;219;221;225m▀\x1B[0m\x1B[38;2;221;223;229m\x1B[48;2;191;200;218m▀\x1B[0m\x1B[38;2;129;143;170m\x1B[48;2;0;20;66m▀\x1B[0m \x1B[38;2;142;142;146m\x1B[48;2;192;197;208m▀\x1B[0m\x1B[38;2;117;117;124m\x1B[48;2;245;249;255m▀\x1B[0m\x1B[38;2;128;128;128m\x1B[48;2;228;233;242m▀\x1B[0m\x1B[38;2;145;143;149m\x1B[48;2;246;248;253m▀\x1B[0m\x1B[38;2;121;129;141m\x1B[48;2;205;208;213m▀\x1B[0m\x1B[38;2;31;45;66m▄\x1B[0m     ",
			"\x1B[38;2;10;15;25m▄\x1B[0m\x1B[38;2;102;102;106m\x1B[48;2;191;192;194m▀\x1B[0m\x1B[38;2;221;223;227m\x1B[48;2;186;196;216m▀\x1B[0m\x1B[38;2;247;253;255m\x1B[48;2;143;155;177m▀\x1B[0m\x1B[38;2;146;155;173m\x1B[48;2;249;251;255m▀\x1B[0m\x1B[38;2;128;141;167m▄\x1B[0m\x1B[38;2;161;165;174m\x1B[48;2;255;255;254m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;161;176;199m▀\x1B[0m\x1B[38;2;83;98;125m\x1B[48;2;0;0;79m▀\x1B[0m  \x1B[38;2;10;37;111m▄\x1B[0m\x1B[38;2;112;135;187m▀\x1B[0m\x1B[38;2;255;255;255m▄\x1B[0m\x1B[38;2;0;0;45m\x1B[48;2;255;255;252m▀\x1B[0m\x1B[38;2;226;230;234m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;203;209;218m\x1B[48;2;203;214;233m▀\x1B[0m\x1B[38;2;32;58;98m\x1B[48;2;40;69;127m▀\x1B[0m    ",
			"\x1B[38;2;180;180;185m\x1B[48;2;98;110;130m▀\x1B[0m\x1B[38;2;202;212;228m\x1B[48;2;89;112;144m▀\x1B[0m\x1B[38;2;22;37;70m▀\x1B[0m\x1B[38;2;9;14;39m▀\x1B[0m\x1B[38;2;164;174;192m\x1B[48;2;30;57;100m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;221;228;237m▀\x1B[0m\x1B[38;2;170;175;192m\x1B[48;2;187;192;207m▀\x1B[0m\x1B[38;2;0;13;57m\x1B[48;2;0;23;123m▀\x1B[0m\x1B[38;2;99;164;235m\x1B[48;2;31;103;227m▀\x1B[0m\x1B[38;2;74;116;211m\x1B[48;2;20;74;211m▀\x1B[0m \x1B[38;2;93;159;236m\x1B[48;2;31;106;225m▀\x1B[0m\x1B[38;2;33;88;194m\x1B[48;2;0;50;182m▀\x1B[0m\x1B[38;2;255;255;251m\x1B[48;2;167;157;139m▀\x1B[0m\x1B[38;2;247;251;255m\x1B[48;2;242;246;254m▀\x1B[0m\x1B[38;2;130;145;174m\x1B[48;2;102;123;158m▀\x1B[0m\x1B[38;2;68;89;126m▀\x1B[0m     ",
			"     \x1B[38;2;131;145;167m▀\x1B[0m\x1B[38;2;239;243;250m\x1B[48;2;172;179;188m▀\x1B[0m\x1B[38;2;119;131;153m\x1B[48;2;215;220;229m▀\x1B[0m\x1B[38;2;0;2;149m\x1B[48;2;33;58;91m▀\x1B[0m\x1B[38;2;73;100;176m▀\x1B[0m\x1B[38;2;185;177;157m\x1B[48;2;109;113;109m▀\x1B[0m\x1B[38;2;45;78;180m▀\x1B[0m\x1B[38;2;0;51;214m▀\x1B[0m \x1B[38;2;229;235;241m\x1B[48;2;118;126;139m▀\x1B[0m\x1B[38;2;205;213;225m\x1B[48;2;171;184;209m▀\x1B[0m\x1B[38;2;47;72;117m▄\x1B[0m  \x1B[38;2;170;175;180m▄\x1B[0m\x1B[38;2;153;164;189m▄\x1B[0m ",
			"      \x1B[38;2;51;54;66m▀\x1B[0m\x1B[38;2;213;218;225m\x1B[48;2;110;119;144m▀\x1B[0m\x1B[38;2;210;215;220m\x1B[48;2;179;185;201m▀\x1B[0m\x1B[38;2;117;120;132m\x1B[48;2;252;255;255m▀\x1B[0m\x1B[38;2;126;136;153m▄\x1B[0m \x1B[38;2;111;119;135m\x1B[48;2;237;237;234m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;211;220;234m▀\x1B[0m\x1B[38;2;208;209;214m\x1B[48;2;232;237;245m▀\x1B[0m\x1B[38;2;5;24;57m\x1B[48;2;183;191;201m▀\x1B[0m \x1B[38;2;181;190;196m▄\x1B[0m\x1B[38;2;179;182;186m\x1B[48;2;234;239;246m▀\x1B[0m\x1B[38;2;243;248;255m\x1B[48;2;99;125;159m▀\x1B[0m\x1B[38;2;106;130;166m▀\x1B[0m ",
			"         \x1B[38;2;199;206;215m\x1B[48;2;98;107;130m▀\x1B[0m\x1B[38;2;227;228;229m\x1B[48;2;228;234;246m▀\x1B[0m\x1B[38;2;224;222;219m\x1B[48;2;235;240;249m▀\x1B[0m\x1B[38;2;218;225;236m\x1B[48;2;89;109;149m▀\x1B[0m\x1B[38;2;49;73;107m▀\x1B[0m\x1B[38;2;115;122;147m▀\x1B[0m\x1B[38;2;241;246;254m\x1B[48;2;120;135;159m▀\x1B[0m\x1B[38;2;227;230;231m\x1B[48;2;187;193;204m▀\x1B[0m\x1B[38;2;255;255;252m\x1B[48;2;176;182;196m▀\x1B[0m\x1B[38;2;221;226;234m\x1B[48;2;172;178;189m▀\x1B[0m\x1B[38;2;249;249;245m\x1B[48;2;181;187;199m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;185;192;205m▀\x1B[0m\x1B[38;2;140;155;175m\x1B[48;2;106;122;146m▀\x1B[0m",
			"     \x1B[38;2;192;193;195m▄\x1B[0m\x1B[38;2;255;255;252m▄\x1B[0m\x1B[38;2;119;126;139m▄\x1B[0m\x1B[38;2;242;242;236m\x1B[48;2;250;250;249m▀\x1B[0m\x1B[38;2;243;242;243m\x1B[48;2;192;200;214m▀\x1B[0m\x1B[38;2;102;117;145m\x1B[48;2;0;4;40m▀\x1B[0m\x1B[38;2;0;0;37m▀\x1B[0m\x1B[38;2;170;182;202m\x1B[48;2;123;128;141m▀\x1B[0m\x1B[38;2;145;158;181m\x1B[48;2;220;225;235m▀\x1B[0m\x1B[38;2;129;144;165m▄\x1B[0m       ",
			"    \x1B[38;2;5;16;37m▀\x1B[0m\x1B[38;2;153;164;185m\x1B[48;2;0;0;22m▀\x1B[0m\x1B[38;2;247;251;255m\x1B[48;2;66;88;132m▀\x1B[0m\x1B[38;2;242;242;241m\x1B[48;2;175;189;215m▀\x1B[0m\x1B[38;2;235;237;243m\x1B[48;2;116;138;180m▀\x1B[0m\x1B[38;2;74;89;123m▀\x1B[0m  \x1B[38;2;140;151;166m▄\x1B[0m\x1B[38;2;195;199;206m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;252;253;255m\x1B[48;2;214;220;231m▀\x1B[0m\x1B[38;2;101;119;154m\x1B[48;2;61;81;123m▀\x1B[0m      ",
			"       \x1B[38;2;24;41;81m▀\x1B[0m\x1B[38;2;30;55;98m▀\x1B[0m   \x1B[38;2;85;100;131m▀\x1B[0m\x1B[38;2;121;135;163m▀\x1B[0m\x1B[38;2;77;95;124m▀\x1B[0m       ",
			"                      "
		],
		[
			"                      ",
			"        \x1B[38;2;151;155;168m\x1B[48;2;207;208;214m▀\x1B[0m\x1B[38;2;173;176;185m\x1B[48;2;231;236;244m▀\x1B[0m\x1B[38;2;177;179;187m\x1B[48;2;217;226;239m▀\x1B[0m\x1B[38;2;179;182;190m\x1B[48;2;230;237;248m▀\x1B[0m\x1B[38;2;188;191;198m\x1B[48;2;236;244;255m▀\x1B[0m\x1B[38;2;114;126;155m\x1B[48;2;108;130;170m▀\x1B[0m        ",
			"  \x1B[38;2;161;163;167m▄\x1B[0m\x1B[38;2;117;123;137m▄\x1B[0m  \x1B[38;2;105;110;115m▄\x1B[0m\x1B[38;2;165;170;178m\x1B[48;2;231;233;234m▀\x1B[0m\x1B[38;2;234;240;253m\x1B[48;2;157;171;194m▀\x1B[0m\x1B[38;2;58;74;107m▀\x1B[0m\x1B[38;2;130;130;143m▄\x1B[0m\x1B[38;2;81;89;102m\x1B[48;2;219;224;233m▀\x1B[0m\x1B[38;2;75;85;102m\x1B[48;2;234;239;247m▀\x1B[0m\x1B[38;2;110;112;122m\x1B[48;2;228;232;242m▀\x1B[0m\x1B[38;2;99;103;111m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;72;80;94m\x1B[48;2;192;198;208m▀\x1B[0m      ",
			"\x1B[38;2;41;54;79m▄\x1B[0m\x1B[38;2;125;125;129m\x1B[48;2;204;207;211m▀\x1B[0m\x1B[38;2;231;234;238m\x1B[48;2;163;177;205m▀\x1B[0m\x1B[38;2;237;243;254m\x1B[48;2;203;210;224m▀\x1B[0m\x1B[38;2;125;147;180m\x1B[48;2;211;217;228m▀\x1B[0m\x1B[38;2;159;167;180m▄\x1B[0m\x1B[38;2;217;218;222m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;192;201;218m\x1B[48;2;75;93;125m▀\x1B[0m\x1B[38;2;24;45;83m▀\x1B[0m  \x1B[38;2;50;61;89m▀\x1B[0m\x1B[38;2;48;63;94m▀\x1B[0m\x1B[38;2;0;0;36m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;78;91;117m\x1B[48;2;250;248;238m▀\x1B[0m\x1B[38;2;238;239;241m\x1B[48;2;242;243;242m▀\x1B[0m\x1B[38;2;174;183;198m\x1B[48;2;155;169;192m▀\x1B[0m     ",
			"\x1B[38;2;202;203;205m\x1B[48;2;103;112;134m▀\x1B[0m\x1B[38;2;206;217;228m\x1B[48;2;92;113;143m▀\x1B[0m\x1B[38;2;0;13;61m▀\x1B[0m\x1B[38;2;80;96;124m▀\x1B[0m\x1B[38;2;206;211;219m\x1B[48;2;104;117;139m▀\x1B[0m\x1B[38;2;255;255;255m▀\x1B[0m\x1B[38;2;135;146;169m\x1B[48;2;128;136;158m▀\x1B[0m\x1B[38;2;27;82;138m\x1B[48;2;0;74;233m▀\x1B[0m\x1B[38;2;141;183;237m\x1B[48;2;58;115;237m▀\x1B[0m\x1B[38;2;16;37;103m\x1B[48;2;3;15;87m▀\x1B[0m\x1B[38;2;34;147;238m\x1B[48;2;10;145;255m▀\x1B[0m\x1B[38;2;100;156;238m\x1B[48;2;50;126;255m▀\x1B[0m\x1B[38;2;3;69;220m\x1B[48;2;0;61;235m▀\x1B[0m\x1B[38;2;255;255;253m\x1B[48;2;231;228;220m▀\x1B[0m\x1B[38;2;215;222;235m\x1B[48;2;199;206;219m▀\x1B[0m\x1B[38;2;130;146;175m\x1B[48;2;0;8;53m▀\x1B[0m\x1B[38;2;40;58;85m▀\x1B[0m     ",
			"     \x1B[38;2;206;209;212m\x1B[48;2;66;88;114m▀\x1B[0m\x1B[38;2;228;232;242m\x1B[48;2;218;223;232m▀\x1B[0m\x1B[38;2;40;52;99m\x1B[48;2;150;159;178m▀\x1B[0m\x1B[38;2;0;38;197m▀\x1B[0m\x1B[38;2;139;139;148m\x1B[48;2;148;142;136m▀\x1B[0m\x1B[38;2;149;160;175m\x1B[48;2;172;172;168m▀\x1B[0m\x1B[38;2;17;75;217m▀\x1B[0m \x1B[38;2;149;149;149m▀\x1B[0m\x1B[38;2;235;240;248m\x1B[48;2;147;156;173m▀\x1B[0m\x1B[38;2;176;189;206m\x1B[48;2;150;165;191m▀\x1B[0m\x1B[38;2;0;0;14m▄\x1B[0m  \x1B[38;2;200;201;201m▄\x1B[0m\x1B[38;2;123;133;156m▄\x1B[0m ",
			"      \x1B[38;2;174;176;183m▀\x1B[0m\x1B[38;2;224;228;237m\x1B[48;2;151;163;181m▀\x1B[0m\x1B[38;2;159;162;173m\x1B[48;2;231;235;242m▀\x1B[0m\x1B[38;2;114;117;131m\x1B[48;2;217;222;230m▀\x1B[0m\x1B[38;2;34;56;85m▄\x1B[0m\x1B[38;2;135;135;127m▄\x1B[0m\x1B[38;2;109;112;117m\x1B[48;2;222;225;227m▀\x1B[0m\x1B[38;2;208;207;206m\x1B[48;2;225;231;242m▀\x1B[0m\x1B[38;2;118;131;149m\x1B[48;2;237;241;248m▀\x1B[0m\x1B[38;2;0;0;40m\x1B[48;2;118;127;143m▀\x1B[0m \x1B[38;2;122;123;127m▄\x1B[0m\x1B[38;2;187;186;186m\x1B[48;2;223;229;238m▀\x1B[0m\x1B[38;2;245;250;255m\x1B[48;2;81;97;129m▀\x1B[0m\x1B[38;2;82;100;133m▀\x1B[0m ",
			"        \x1B[38;2;71;86;114m▀\x1B[0m\x1B[38;2;218;223;229m\x1B[48;2;148;158;174m▀\x1B[0m\x1B[38;2;239;237;237m\x1B[48;2;242;246;251m▀\x1B[0m\x1B[38;2;250;249;245m\x1B[48;2;215;224;240m▀\x1B[0m\x1B[38;2;181;193;211m\x1B[48;2;46;63;105m▀\x1B[0m\x1B[38;2;0;3;54m▀\x1B[0m\x1B[38;2;188;196;212m▀\x1B[0m\x1B[38;2;246;247;249m\x1B[48;2;189;199;216m▀\x1B[0m\x1B[38;2;198;197;197m\x1B[48;2;215;221;232m▀\x1B[0m\x1B[38;2;246;246;245m\x1B[48;2;202;210;225m▀\x1B[0m\x1B[38;2;214;219;227m\x1B[48;2;207;213;224m▀\x1B[0m\x1B[38;2;202;203;205m\x1B[48;2;210;216;228m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;205;212;225m▀\x1B[0m\x1B[38;2;133;146;168m\x1B[48;2;100;116;146m▀\x1B[0m",
			"     \x1B[38;2;255;251;242m▄\x1B[0m\x1B[38;2;195;197;200m▄\x1B[0m\x1B[38;2;121;133;150m▄\x1B[0m\x1B[38;2;211;208;206m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;223;227;236m\x1B[48;2;140;155;180m▀\x1B[0m\x1B[38;2;8;28;65m▀\x1B[0m\x1B[38;2;74;91;129m\x1B[48;2;130;130;148m▀\x1B[0m\x1B[38;2;140;156;183m\x1B[48;2;205;211;220m▀\x1B[0m\x1B[38;2;65;82;111m▄\x1B[0m        ",
			"    \x1B[38;2;9;18;36m▀\x1B[0m\x1B[38;2;157;168;189m\x1B[48;2;10;30;75m▀\x1B[0m\x1B[38;2;251;253;255m\x1B[48;2;108;125;160m▀\x1B[0m\x1B[38;2;241;243;243m\x1B[48;2;211;219;237m▀\x1B[0m\x1B[38;2;199;206;220m\x1B[48;2;73;93;134m▀\x1B[0m\x1B[38;2;36;57;106m▀\x1B[0m\x1B[38;2;23;23;30m▄\x1B[0m\x1B[38;2;78;98;117m\x1B[48;2;189;192;195m▀\x1B[0m\x1B[38;2;230;233;234m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;220;225;233m\x1B[48;2;183;196;219m▀\x1B[0m\x1B[38;2;96;115;156m\x1B[48;2;56;79;124m▀\x1B[0m       ",
			"      \x1B[38;2;0;5;46m▀\x1B[0m\x1B[38;2;40;61;104m▀\x1B[0m\x1B[38;2;27;46;83m▀\x1B[0m \x1B[38;2;60;72;83m▀\x1B[0m\x1B[38;2;171;181;199m▀\x1B[0m\x1B[38;2;188;199;218m▀\x1B[0m\x1B[38;2;78;98;136m▀\x1B[0m        ",
			"                      "
		],
		[
			"                      ",
			"        \x1B[38;2;75;75;82m\x1B[48;2;170;172;179m▀\x1B[0m\x1B[38;2;226;225;222m\x1B[48;2;203;210;226m▀\x1B[0m\x1B[38;2;236;238;241m\x1B[48;2;88;100;125m▀\x1B[0m\x1B[38;2;228;229;232m\x1B[48;2;100;111;140m▀\x1B[0m\x1B[38;2;244;244;246m\x1B[48;2;79;90;119m▀\x1B[0m\x1B[38;2;176;186;204m\x1B[48;2;53;70;106m▀\x1B[0m\x1B[38;2;0;30;82m▀\x1B[0m       ",
			"  \x1B[38;2;189;192;193m▄\x1B[0m\x1B[38;2;178;182;189m▄\x1B[0m\x1B[38;2;49;69;115m▄\x1B[0m \x1B[38;2;60;70;85m▄\x1B[0m\x1B[38;2;114;116;119m\x1B[48;2;225;225;226m▀\x1B[0m\x1B[38;2;240;243;247m\x1B[48;2;179;191;212m▀\x1B[0m\x1B[38;2;88;104;137m▀\x1B[0m \x1B[38;2;156;156;156m\x1B[48;2;132;141;160m▀\x1B[0m\x1B[38;2;128;130;134m\x1B[48;2;172;178;195m▀\x1B[0m\x1B[38;2;158;157;152m\x1B[48;2;151;158;175m▀\x1B[0m\x1B[38;2;156;156;157m\x1B[48;2;188;193;203m▀\x1B[0m\x1B[38;2;105;109;122m\x1B[48;2;228;231;238m▀\x1B[0m\x1B[38;2;83;96;124m▄\x1B[0m     ",
			"\x1B[38;2;175;171;167m▄\x1B[0m\x1B[38;2;147;154;164m\x1B[48;2;243;247;250m▀\x1B[0m\x1B[38;2;227;231;238m\x1B[48;2;125;141;172m▀\x1B[0m\x1B[38;2;230;235;243m\x1B[48;2;102;122;159m▀\x1B[0m\x1B[38;2;187;193;204m\x1B[48;2;244;247;251m▀\x1B[0m\x1B[38;2;200;202;206m▄\x1B[0m\x1B[38;2;228;228;228m\x1B[48;2;238;240;243m▀\x1B[0m\x1B[38;2;222;229;242m\x1B[48;2;109;126;150m▀\x1B[0m\x1B[38;2;30;44;82m\x1B[48;2;0;53;174m▀\x1B[0m\x1B[38;2;37;97;255m▄\x1B[0m \x1B[38;2;44;126;255m▄\x1B[0m\x1B[38;2;0;39;247m▄\x1B[0m\x1B[38;2;253;247;240m▄\x1B[0m\x1B[38;2;0;0;17m\x1B[48;2;246;246;248m▀\x1B[0m\x1B[38;2;221;220;218m\x1B[48;2;226;230;237m▀\x1B[0m\x1B[38;2;177;186;207m\x1B[48;2;119;133;159m▀\x1B[0m     ",
			"\x1B[38;2;186;190;199m\x1B[48;2;59;78;108m▀\x1B[0m\x1B[38;2;158;172;196m\x1B[48;2;60;82;127m▀\x1B[0m\x1B[38;2;0;0;0m▀\x1B[0m \x1B[38;2;133;144;168m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;190;197;211m▀\x1B[0m\x1B[38;2;199;206;219m\x1B[48;2;222;226;232m▀\x1B[0m\x1B[38;2;0;0;23m\x1B[48;2;0;20;57m▀\x1B[0m\x1B[38;2;98;148;230m\x1B[48;2;8;58;167m▀\x1B[0m\x1B[38;2;52;104;240m\x1B[48;2;16;67;183m▀\x1B[0m \x1B[38;2;124;182;255m\x1B[48;2;18;85;200m▀\x1B[0m\x1B[38;2;24;93;243m\x1B[48;2;0;52;196m▀\x1B[0m\x1B[38;2;255;255;246m\x1B[48;2;205;197;190m▀\x1B[0m\x1B[38;2;198;209;230m\x1B[48;2;231;237;245m▀\x1B[0m\x1B[38;2;46;69;116m\x1B[48;2;109;123;147m▀\x1B[0m      ",
			"     \x1B[38;2;33;45;75m▀\x1B[0m\x1B[38;2;207;211;221m\x1B[48;2;151;160;181m▀\x1B[0m\x1B[38;2;171;177;191m\x1B[48;2;228;234;247m▀\x1B[0m\x1B[38;2;49;72;115m▄\x1B[0m\x1B[38;2;207;223;244m▀\x1B[0m\x1B[38;2;231;228;218m▀\x1B[0m\x1B[38;2;51;82;159m▀\x1B[0m  \x1B[38;2;198;201;207m\x1B[48;2;66;81;107m▀\x1B[0m\x1B[38;2;196;205;221m\x1B[48;2;100;119;150m▀\x1B[0m\x1B[38;2;0;0;18m\x1B[48;2;14;28;57m▀\x1B[0m  \x1B[38;2;207;208;209m▄\x1B[0m\x1B[38;2;75;79;96m\x1B[48;2;158;169;189m▀\x1B[0m ",
			"       \x1B[38;2;174;181;198m\x1B[48;2;86;100;129m▀\x1B[0m\x1B[38;2;235;236;237m\x1B[48;2;128;141;164m▀\x1B[0m\x1B[38;2;185;186;191m\x1B[48;2;241;245;250m▀\x1B[0m\x1B[38;2;133;142;159m▄\x1B[0m\x1B[38;2;167;167;180m▄\x1B[0m\x1B[38;2;153;155;155m\x1B[48;2;250;250;248m▀\x1B[0m\x1B[38;2;250;249;246m\x1B[48;2;173;187;206m▀\x1B[0m\x1B[38;2;195;199;206m\x1B[48;2;219;223;230m▀\x1B[0m\x1B[38;2;3;11;34m\x1B[48;2;185;190;200m▀\x1B[0m \x1B[38;2;172;172;172m▄\x1B[0m\x1B[38;2;200;198;195m\x1B[48;2;233;235;242m▀\x1B[0m\x1B[38;2;229;236;247m\x1B[48;2;77;94;127m▀\x1B[0m\x1B[38;2;32;60;102m▀\x1B[0m ",
			"         \x1B[38;2;201;208;220m\x1B[48;2;168;173;188m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;183;192;210m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;152;163;188m▀\x1B[0m\x1B[38;2;160;171;193m\x1B[48;2;95;113;146m▀\x1B[0m \x1B[38;2;112;125;147m▀\x1B[0m\x1B[38;2;237;240;245m\x1B[48;2;154;163;186m▀\x1B[0m\x1B[38;2;237;237;238m\x1B[48;2;185;196;218m▀\x1B[0m\x1B[38;2;246;246;247m\x1B[48;2;171;183;209m▀\x1B[0m\x1B[38;2;243;244;248m\x1B[48;2;175;187;208m▀\x1B[0m\x1B[38;2;235;235;236m\x1B[48;2;180;189;211m▀\x1B[0m\x1B[38;2;255;255;253m\x1B[48;2;176;187;208m▀\x1B[0m\x1B[38;2;134;148;171m\x1B[48;2;90;112;145m▀\x1B[0m",
			"        \x1B[38;2;164;172;183m▄\x1B[0m\x1B[38;2;236;237;237m\x1B[48;2;215;220;229m▀\x1B[0m\x1B[38;2;142;151;168m\x1B[48;2;121;142;181m▀\x1B[0m\x1B[38;2;82;85;93m▀\x1B[0m\x1B[38;2;179;185;198m\x1B[48;2;220;225;233m▀\x1B[0m\x1B[38;2;33;49;83m\x1B[48;2;195;206;219m▀\x1B[0m        ",
			"       \x1B[38;2;196;199;204m\x1B[48;2;120;136;161m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;213;218;229m▀\x1B[0m\x1B[38;2;207;213;224m\x1B[48;2;223;228;237m▀\x1B[0m\x1B[38;2;31;51;88m\x1B[48;2;42;63;105m▀\x1B[0m\x1B[38;2;206;200;188m▄\x1B[0m\x1B[38;2;168;175;191m\x1B[48;2;251;250;247m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;246;247;249m▀\x1B[0m\x1B[38;2;168;175;189m\x1B[48;2;98;116;152m▀\x1B[0m\x1B[38;2;2;17;46m\x1B[48;2;0;6;36m▀\x1B[0m      ",
			"       \x1B[38;2;0;0;14m▀\x1B[0m\x1B[38;2;49;70;116m▀\x1B[0m\x1B[38;2;107;129;172m▀\x1B[0m\x1B[38;2;34;53;95m▀\x1B[0m\x1B[38;2;121;129;144m▀\x1B[0m\x1B[38;2;159;173;199m▀\x1B[0m\x1B[38;2;79;98;135m▀\x1B[0m\x1B[38;2;0;20;58m▀\x1B[0m       ",
			"                      "
		],
		[
			"                      ",
			"       \x1B[38;2;131;134;137m▄\x1B[0m\x1B[38;2;197;197;197m▄\x1B[0m\x1B[38;2;101;104;107m\x1B[48;2;234;235;239m▀\x1B[0m\x1B[38;2;194;191;185m\x1B[48;2;213;221;236m▀\x1B[0m\x1B[38;2;163;173;191m\x1B[48;2;100;117;148m▀\x1B[0m\x1B[38;2;22;41;89m\x1B[48;2;0;6;51m▀\x1B[0m         ",
			"      \x1B[38;2;183;175;167m▄\x1B[0m\x1B[38;2;241;245;248m\x1B[48;2;237;239;242m▀\x1B[0m\x1B[38;2;201;210;227m\x1B[48;2;94;106;139m▀\x1B[0m\x1B[38;2;78;95;130m▀\x1B[0m\x1B[38;2;0;0;7m\x1B[48;2;181;184;185m▀\x1B[0m\x1B[38;2;53;49;45m\x1B[48;2;224;228;233m▀\x1B[0m\x1B[38;2;150;145;142m\x1B[48;2;218;226;238m▀\x1B[0m\x1B[38;2;194;194;193m\x1B[48;2;156;171;195m▀\x1B[0m\x1B[38;2;171;175;182m\x1B[48;2;249;251;252m▀\x1B[0m\x1B[38;2;60;78;116m\x1B[48;2;205;211;226m▀\x1B[0m\x1B[38;2;77;100;140m▄\x1B[0m     ",
			"      \x1B[38;2;224;221;221m\x1B[48;2;212;214;215m▀\x1B[0m\x1B[38;2;224;230;241m\x1B[48;2;190;198;212m▀\x1B[0m\x1B[38;2;51;71;114m\x1B[48;2;0;0;4m▀\x1B[0m \x1B[38;2;141;153;175m▀\x1B[0m\x1B[38;2;94;110;140m▀\x1B[0m\x1B[38;2;37;55;93m▀\x1B[0m\x1B[38;2;217;217;216m▄\x1B[0m\x1B[38;2;176;181;183m\x1B[48;2;216;219;227m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;151;165;191m▀\x1B[0m\x1B[38;2;130;154;190m\x1B[48;2;28;52;86m▀\x1B[0m     ",
			" \x1B[38;2;199;196;199m▄\x1B[0m\x1B[38;2;59;71;97m\x1B[48;2;244;245;247m▀\x1B[0m\x1B[38;2;15;30;54m\x1B[48;2;171;179;197m▀\x1B[0m\x1B[38;2;0;4;52m▄\x1B[0m\x1B[38;2;60;68;80m\x1B[48;2;236;229;214m▀\x1B[0m\x1B[38;2;227;230;234m\x1B[48;2;226;234;247m▀\x1B[0m\x1B[38;2;121;136;162m\x1B[48;2;46;62;97m▀\x1B[0m\x1B[38;2;21;81;203m▄\x1B[0m\x1B[38;2;27;75;192m▄\x1B[0m\x1B[38;2;0;67;114m▄\x1B[0m\x1B[38;2;45;102;205m\x1B[48;2;116;172;255m▀\x1B[0m\x1B[38;2;0;6;174m\x1B[48;2;23;78;206m▀\x1B[0m\x1B[38;2;255;251;243m\x1B[48;2;127;124;113m▀\x1B[0m\x1B[38;2;187;200;220m\x1B[48;2;244;249;255m▀\x1B[0m\x1B[38;2;0;8;57m\x1B[48;2;142;156;180m▀\x1B[0m    \x1B[38;2;20;27;48m▄\x1B[0m ",
			"\x1B[38;2;53;60;72m▄\x1B[0m\x1B[38;2;187;190;194m\x1B[48;2;213;217;224m▀\x1B[0m\x1B[38;2;210;217;228m\x1B[48;2;112;131;166m▀\x1B[0m\x1B[38;2;218;224;236m\x1B[48;2;71;92;124m▀\x1B[0m\x1B[38;2;207;214;225m\x1B[48;2;226;232;240m▀\x1B[0m\x1B[38;2;233;234;236m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;170;178;197m\x1B[48;2;178;186;205m▀\x1B[0m\x1B[38;2;0;0;111m\x1B[48;2;0;42;103m▀\x1B[0m\x1B[38;2;109;167;251m\x1B[48;2;11;74;197m▀\x1B[0m\x1B[38;2;56;113;225m\x1B[48;2;18;78;207m▀\x1B[0m\x1B[38;2;255;232;166m▄\x1B[0m\x1B[38;2;4;64;189m\x1B[48;2;132;151;186m▀\x1B[0m\x1B[38;2;13;68;185m▀\x1B[0m \x1B[38;2;146;159;177m▀\x1B[0m\x1B[38;2;241;248;255m\x1B[48;2;80;95;122m▀\x1B[0m\x1B[38;2;81;102;136m\x1B[48;2;52;72;105m▀\x1B[0m \x1B[38;2;160;164;172m▄\x1B[0m\x1B[38;2;170;174;180m\x1B[48;2;244;250;255m▀\x1B[0m\x1B[38;2;161;170;193m\x1B[48;2;93;112;144m▀\x1B[0m ",
			"\x1B[38;2;255;255;250m\x1B[48;2;180;186;196m▀\x1B[0m\x1B[38;2;221;229;243m\x1B[48;2;130;142;171m▀\x1B[0m\x1B[38;2;25;48;94m\x1B[48;2;0;0;0m▀\x1B[0m \x1B[38;2;72;86;118m▀\x1B[0m\x1B[38;2;178;185;197m\x1B[48;2;0;0;30m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;152;165;188m▀\x1B[0m\x1B[38;2;154;169;190m\x1B[48;2;249;251;255m▀\x1B[0m\x1B[38;2;149;153;159m▄\x1B[0m\x1B[38;2;90;82;127m\x1B[48;2;102;102;108m▀\x1B[0m\x1B[38;2;182;180;175m\x1B[48;2;75;75;103m▀\x1B[0m  \x1B[38;2;124;130;145m\x1B[48;2;197;200;202m▀\x1B[0m\x1B[38;2;114;118;126m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;36;43;60m\x1B[48;2;199;207;217m▀\x1B[0m\x1B[38;2;19;47;86m▄\x1B[0m\x1B[38;2;129;129;127m▄\x1B[0m\x1B[38;2;235;239;244m\x1B[48;2;214;219;228m▀\x1B[0m\x1B[38;2;125;139;163m\x1B[48;2;124;135;158m▀\x1B[0m\x1B[38;2;217;214;211m▄\x1B[0m\x1B[38;2;122;134;158m▄\x1B[0m",
			"\x1B[38;2;47;66;100m▀\x1B[0m\x1B[38;2;46;64;102m▀\x1B[0m    \x1B[38;2;0;0;0m▀\x1B[0m\x1B[38;2;140;153;173m▀\x1B[0m\x1B[38;2;243;248;253m\x1B[48;2;72;89;120m▀\x1B[0m\x1B[38;2;251;253;255m\x1B[48;2;129;139;158m▀\x1B[0m\x1B[38;2;160;171;189m\x1B[48;2;245;247;249m▀\x1B[0m\x1B[38;2;181;183;186m▄\x1B[0m\x1B[38;2;213;211;209m\x1B[48;2;241;243;244m▀\x1B[0m\x1B[38;2;225;232;244m\x1B[48;2;131;147;174m▀\x1B[0m\x1B[38;2;56;78;119m▀\x1B[0m\x1B[38;2;192;200;213m\x1B[48;2;75;93;125m▀\x1B[0m\x1B[38;2;241;242;243m\x1B[48;2;146;157;175m▀\x1B[0m\x1B[38;2;229;229;231m\x1B[48;2;122;132;157m▀\x1B[0m\x1B[38;2;238;242;248m\x1B[48;2;79;99;132m▀\x1B[0m\x1B[38;2;200;209;221m\x1B[48;2;36;55;94m▀\x1B[0m\x1B[38;2;175;187;207m\x1B[48;2;0;0;7m▀\x1B[0m\x1B[38;2;87;106;135m▀\x1B[0m",
			"         \x1B[38;2;60;80;120m\x1B[48;2;170;175;179m▀\x1B[0m\x1B[38;2;186;195;214m\x1B[48;2;144;157;182m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;64;78;108m▀\x1B[0m\x1B[38;2;160;174;197m\x1B[48;2;116;128;157m▀\x1B[0m\x1B[38;2;0;22;63m▀\x1B[0m        ",
			"       \x1B[38;2;120;125;136m▄\x1B[0m\x1B[38;2;103;107;114m\x1B[48;2;229;227;227m▀\x1B[0m\x1B[38;2;210;215;220m\x1B[48;2;222;230;244m▀\x1B[0m\x1B[38;2;123;138;165m\x1B[48;2;0;31;93m▀\x1B[0m\x1B[38;2;211;206;206m▀\x1B[0m\x1B[38;2;208;211;214m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;38;52;76m\x1B[48;2;151;167;193m▀\x1B[0m        ",
			"     \x1B[38;2;45;54;68m▄\x1B[0m\x1B[38;2;220;218;215m\x1B[48;2;153;166;186m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;158;169;191m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;125;142;175m▀\x1B[0m\x1B[38;2;114;132;166m\x1B[48;2;37;59;103m▀\x1B[0m \x1B[38;2;180;180;183m\x1B[48;2;128;140;159m▀\x1B[0m\x1B[38;2;255;255;253m\x1B[48;2;164;176;198m▀\x1B[0m\x1B[38;2;254;254;254m\x1B[48;2;152;164;186m▀\x1B[0m\x1B[38;2;159;166;183m\x1B[48;2;85;106;146m▀\x1B[0m\x1B[38;2;0;7;63m▄\x1B[0m      ",
			"                      "
		],
		[
			"        \x1B[38;2;0;3;39m▄\x1B[0m\x1B[38;2;73;86;110m\x1B[48;2;144;161;192m▀\x1B[0m\x1B[38;2;118;123;140m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;0;0;0m\x1B[48;2;203;203;202m▀\x1B[0m\x1B[38;2;155;155;156m▄\x1B[0m\x1B[38;2;39;43;51m▄\x1B[0m        ",
			"    \x1B[38;2;13;27;47m▄\x1B[0m\x1B[38;2;119;128;142m▄\x1B[0m\x1B[38;2;70;75;86m\x1B[48;2;247;246;243m▀\x1B[0m\x1B[38;2;224;223;221m▄\x1B[0m\x1B[38;2;186;185;183m▄\x1B[0m\x1B[38;2;25;43;78m\x1B[48;2;104;104;107m▀\x1B[0m\x1B[38;2;118;134;162m▀\x1B[0m\x1B[38;2;192;202;223m\x1B[48;2;12;25;56m▀\x1B[0m\x1B[38;2;248;249;253m\x1B[48;2;59;76;115m▀\x1B[0m\x1B[38;2;217;218;220m\x1B[48;2;227;234;246m▀\x1B[0m\x1B[38;2;121;125;135m\x1B[48;2;182;185;187m▀\x1B[0m       ",
			"   \x1B[38;2;0;0;9m▄\x1B[0m\x1B[38;2;166;170;180m\x1B[48;2;198;205;218m▀\x1B[0m\x1B[38;2;252;254;255m\x1B[48;2;218;219;218m▀\x1B[0m\x1B[38;2;159;172;192m\x1B[48;2;0;2;26m▀\x1B[0m\x1B[38;2;135;148;174m\x1B[48;2;0;0;0m▀\x1B[0m\x1B[38;2;222;229;243m\x1B[48;2;23;39;76m▀\x1B[0m\x1B[38;2;247;248;250m\x1B[48;2;85;98;128m▀\x1B[0m\x1B[38;2;203;203;205m\x1B[48;2;157;170;190m▀\x1B[0m\x1B[38;2;170;170;162m\x1B[48;2;103;112;123m▀\x1B[0m\x1B[38;2;0;0;0m▀\x1B[0m\x1B[38;2;165;175;198m\x1B[48;2;135;150;180m▀\x1B[0m\x1B[38;2;209;208;207m\x1B[48;2;221;223;229m▀\x1B[0m\x1B[38;2;0;0;0m\x1B[48;2;12;22;41m▀\x1B[0m      ",
			"    \x1B[38;2;102;115;132m▀\x1B[0m\x1B[38;2;212;218;229m\x1B[48;2;70;89;123m▀\x1B[0m\x1B[38;2;232;232;233m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;149;151;156m\x1B[48;2;167;170;177m▀\x1B[0m  \x1B[38;2;0;4;20m▀\x1B[0m  \x1B[38;2;102;120;154m\x1B[48;2;45;66;111m▀\x1B[0m\x1B[38;2;246;247;250m\x1B[48;2;235;240;253m▀\x1B[0m\x1B[38;2;118;120;123m\x1B[48;2;182;182;178m▀\x1B[0m      ",
			"   \x1B[38;2;45;60;89m▄\x1B[0m\x1B[38;2;47;78;117m\x1B[48;2;202;206;211m▀\x1B[0m\x1B[38;2;220;230;242m\x1B[48;2;230;237;247m▀\x1B[0m\x1B[38;2;219;224;233m\x1B[48;2;140;153;184m▀\x1B[0m\x1B[38;2;39;49;62m▀\x1B[0m\x1B[38;2;68;142;239m\x1B[48;2;63;123;239m▀\x1B[0m\x1B[38;2;85;147;228m\x1B[48;2;74;128;230m▀\x1B[0m \x1B[38;2;49;99;174m▄\x1B[0m\x1B[38;2;68;118;216m▄\x1B[0m\x1B[38;2;0;25;81m\x1B[48;2;0;14;81m▀\x1B[0m\x1B[38;2;188;201;224m\x1B[48;2;167;181;208m▀\x1B[0m\x1B[38;2;205;205;201m\x1B[48;2;236;236;233m▀\x1B[0m\x1B[38;2;0;0;0m▀\x1B[0m\x1B[38;2;51;68;94m▄\x1B[0m\x1B[38;2;5;5;30m\x1B[48;2;175;181;195m▀\x1B[0m\x1B[38;2;72;79;97m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;85;92;108m\x1B[48;2;170;173;175m▀\x1B[0m ",
			" \x1B[38;2;114;128;146m▄\x1B[0m\x1B[38;2;125;134;147m▄\x1B[0m\x1B[38;2;46;62;94m▀\x1B[0m\x1B[38;2;179;193;215m\x1B[48;2;6;22;49m▀\x1B[0m\x1B[38;2;105;127;158m▀\x1B[0m  \x1B[38;2;2;52;210m▀\x1B[0m\x1B[38;2;1;31;170m\x1B[48;2;169;162;153m▀\x1B[0m\x1B[38;2;161;174;149m▄\x1B[0m\x1B[38;2;50;128;240m\x1B[48;2;9;71;196m▀\x1B[0m\x1B[38;2;121;175;255m\x1B[48;2;5;65;209m▀\x1B[0m\x1B[38;2;0;36;218m▀\x1B[0m\x1B[38;2;134;145;168m\x1B[48;2;128;146;179m▀\x1B[0m\x1B[38;2;232;235;236m\x1B[48;2;248;250;251m▀\x1B[0m\x1B[38;2;190;194;196m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;226;228;230m\x1B[48;2;205;212;225m▀\x1B[0m\x1B[38;2;241;244;250m\x1B[48;2;75;97;144m▀\x1B[0m\x1B[38;2;230;237;247m\x1B[48;2;147;161;190m▀\x1B[0m\x1B[38;2;189;188;187m\x1B[48;2;220;219;222m▀\x1B[0m\x1B[38;2;13;20;48m▄\x1B[0m",
			" \x1B[38;2;206;215;233m\x1B[48;2;76;104;141m▀\x1B[0m\x1B[38;2;224;229;233m\x1B[48;2;235;242;250m▀\x1B[0m\x1B[38;2;50;61;77m\x1B[48;2;180;184;193m▀\x1B[0m\x1B[38;2;0;0;0m▄\x1B[0m\x1B[38;2;85;102;136m▄\x1B[0m\x1B[38;2;89;97;110m▄\x1B[0m\x1B[38;2;69;76;87m▄\x1B[0m \x1B[38;2;162;166;170m▀\x1B[0m\x1B[38;2;136;134;129m▀\x1B[0m\x1B[38;2;11;23;115m\x1B[48;2;98;104;104m▀\x1B[0m\x1B[38;2;111;118;122m▄\x1B[0m\x1B[38;2;80;102;132m\x1B[48;2;224;227;233m▀\x1B[0m\x1B[38;2;217;224;233m\x1B[48;2;218;221;228m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;105;121;149m▀\x1B[0m\x1B[38;2;139;152;174m▀\x1B[0m\x1B[38;2;44;63;95m▀\x1B[0m \x1B[38;2;94;109;144m\x1B[48;2;18;33;69m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;215;221;232m▀\x1B[0m\x1B[38;2;126;126;132m\x1B[48;2;169;169;173m▀\x1B[0m",
			"\x1B[38;2;6;12;25m\x1B[48;2;98;111;138m▀\x1B[0m\x1B[38;2;211;211;214m▄\x1B[0m\x1B[38;2;61;80;121m\x1B[48;2;241;238;236m▀\x1B[0m\x1B[38;2;233;238;247m\x1B[48;2;223;225;228m▀\x1B[0m\x1B[38;2;138;146;163m\x1B[48;2;243;244;245m▀\x1B[0m\x1B[38;2;153;161;175m\x1B[48;2;234;237;241m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;140;153;175m▀\x1B[0m\x1B[38;2;197;200;208m\x1B[48;2;213;221;232m▀\x1B[0m\x1B[38;2;16;29;51m\x1B[48;2;202;206;212m▀\x1B[0m\x1B[38;2;117;131;155m▄\x1B[0m\x1B[38;2;140;145;155m\x1B[48;2;225;226;227m▀\x1B[0m\x1B[38;2;252;253;255m\x1B[48;2;217;223;234m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;97;113;142m▀\x1B[0m\x1B[38;2;209;217;228m\x1B[48;2;70;82;106m▀\x1B[0m\x1B[38;2;46;63;98m▀\x1B[0m    \x1B[38;2;0;0;0m▀\x1B[0m\x1B[38;2;126;139;167m\x1B[48;2;34;53;87m▀\x1B[0m\x1B[38;2;149;158;178m\x1B[48;2;30;46;76m▀\x1B[0m",
			"\x1B[38;2;95;113;146m▀\x1B[0m\x1B[38;2;201;209;226m▀\x1B[0m\x1B[38;2;201;208;221m▀\x1B[0m\x1B[38;2;193;200;214m▀\x1B[0m\x1B[38;2;205;210;221m▀\x1B[0m\x1B[38;2;151;162;181m▀\x1B[0m\x1B[38;2;0;7;40m▀\x1B[0m\x1B[38;2;99;113;138m▀\x1B[0m\x1B[38;2;243;246;250m\x1B[48;2;123;142;172m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;139;155;181m▀\x1B[0m\x1B[38;2;243;246;250m\x1B[48;2;137;155;188m▀\x1B[0m\x1B[38;2;80;98;133m\x1B[48;2;66;81;119m▀\x1B[0m          ",
			"     \x1B[38;2;148;148;148m▄\x1B[0m\x1B[38;2;148;151;156m▄\x1B[0m\x1B[38;2;154;154;154m\x1B[48;2;197;202;211m▀\x1B[0m\x1B[38;2;196;202;211m\x1B[48;2;242;244;250m▀\x1B[0m\x1B[38;2;34;41;76m\x1B[48;2;87;103;143m▀\x1B[0m\x1B[38;2;102;106;127m\x1B[48;2;108;123;153m▀\x1B[0m\x1B[38;2;211;217;227m\x1B[48;2;254;255;255m▀\x1B[0m\x1B[38;2;17;28;52m\x1B[48;2;178;184;188m▀\x1B[0m\x1B[38;2;15;38;92m▄\x1B[0m        ",
			"    \x1B[38;2;0;15;43m\x1B[48;2;20;34;68m▀\x1B[0m\x1B[38;2;179;183;193m\x1B[48;2;80;100;134m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;88;109;150m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;138;155;190m▀\x1B[0m\x1B[38;2;173;182;199m\x1B[48;2;99;117;157m▀\x1B[0m  \x1B[38;2;205;209;217m\x1B[48;2;139;154;173m▀\x1B[0m\x1B[38;2;204;212;226m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;193;201;215m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;113;111;113m\x1B[48;2;209;215;230m▀\x1B[0m\x1B[38;2;52;71;114m▄\x1B[0m      ",
			"      \x1B[38;2;0;4;58m▀\x1B[0m\x1B[38;2;13;35;77m▀\x1B[0m\x1B[38;2;29;46;83m▀\x1B[0m  \x1B[38;2;85;108;141m▀\x1B[0m\x1B[38;2;137;153;183m▀\x1B[0m\x1B[38;2;137;150;173m▀\x1B[0m\x1B[38;2;98;119;156m▀\x1B[0m\x1B[38;2;35;58;103m▀\x1B[0m      "
		],
		[
			"                      ",
			"        \x1B[38;2;150;153;165m\x1B[48;2;230;231;230m▀\x1B[0m\x1B[38;2;189;190;194m\x1B[48;2;220;225;236m▀\x1B[0m\x1B[38;2;199;201;205m\x1B[48;2;143;153;177m▀\x1B[0m\x1B[38;2;198;200;204m\x1B[48;2;155;163;188m▀\x1B[0m\x1B[38;2;209;210;213m\x1B[48;2;159;169;193m▀\x1B[0m\x1B[38;2;129;142;166m\x1B[48;2;94;111;146m▀\x1B[0m        ",
			"  \x1B[38;2;198;198;198m▄\x1B[0m\x1B[38;2;179;189;204m▄\x1B[0m  \x1B[38;2;125;129;138m▄\x1B[0m\x1B[38;2;161;161;161m\x1B[48;2;248;248;248m▀\x1B[0m\x1B[38;2;240;244;251m\x1B[48;2;153;161;179m▀\x1B[0m\x1B[38;2;71;88;124m▀\x1B[0m \x1B[38;2;98;93;98m\x1B[48;2;203;209;222m▀\x1B[0m\x1B[38;2;58;58;61m\x1B[48;2;212;218;228m▀\x1B[0m\x1B[38;2;100;96;89m\x1B[48;2;206;213;226m▀\x1B[0m\x1B[38;2;105;105;108m\x1B[48;2;246;247;252m▀\x1B[0m\x1B[38;2;198;206;217m▄\x1B[0m\x1B[38;2;0;6;49m▄\x1B[0m     ",
			"\x1B[38;2;47;51;61m▄\x1B[0m\x1B[38;2;94;97;106m\x1B[48;2;219;219;220m▀\x1B[0m\x1B[38;2;223;226;230m\x1B[48;2;161;176;202m▀\x1B[0m\x1B[38;2;236;242;249m\x1B[48;2;192;203;219m▀\x1B[0m\x1B[38;2;107;120;149m\x1B[48;2;210;214;221m▀\x1B[0m\x1B[38;2;144;150;161m▄\x1B[0m\x1B[38;2;192;195;198m\x1B[48;2;252;255;255m▀\x1B[0m\x1B[38;2;216;222;235m\x1B[48;2;105;122;154m▀\x1B[0m\x1B[38;2;28;47;81m▀\x1B[0m  \x1B[38;2;82;107;154m▀\x1B[0m\x1B[38;2;92;114;162m▀\x1B[0m\x1B[38;2;40;81;156m\x1B[48;2;167;167;163m▀\x1B[0m\x1B[38;2;92;106;138m\x1B[48;2;221;220;212m▀\x1B[0m\x1B[38;2;223;224;226m\x1B[48;2;237;237;238m▀\x1B[0m\x1B[38;2;174;185;202m\x1B[48;2;154;171;196m▀\x1B[0m     ",
			"\x1B[38;2;217;216;217m\x1B[48;2;96;109;132m▀\x1B[0m\x1B[38;2;195;205;220m\x1B[48;2;70;87;120m▀\x1B[0m\x1B[38;2;0;10;66m▀\x1B[0m\x1B[38;2;113;132;168m▀\x1B[0m\x1B[38;2;216;220;227m\x1B[48;2;85;94;120m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;243;245;247m▀\x1B[0m\x1B[38;2;158;172;196m\x1B[48;2;154;168;196m▀\x1B[0m\x1B[38;2;0;5;38m▀\x1B[0m\x1B[38;2;184;181;178m\x1B[48;2;179;179;179m▀\x1B[0m  \x1B[38;2;149;151;151m\x1B[48;2;179;179;179m▀\x1B[0m \x1B[38;2;212;213;214m\x1B[48;2;202;208;219m▀\x1B[0m\x1B[38;2;228;234;246m\x1B[48;2;197;204;215m▀\x1B[0m\x1B[38;2;157;172;199m\x1B[48;2;0;0;42m▀\x1B[0m\x1B[38;2;23;44;81m▀\x1B[0m     ",
			"     \x1B[38;2;164;167;177m\x1B[48;2;21;31;56m▀\x1B[0m\x1B[38;2;229;234;242m\x1B[48;2;213;217;224m▀\x1B[0m\x1B[38;2;46;60;98m\x1B[48;2;150;161;181m▀\x1B[0m \x1B[38;2;150;150;154m\x1B[48;2;247;239;223m▀\x1B[0m\x1B[38;2;196;196;196m\x1B[48;2;170;170;170m▀\x1B[0m  \x1B[38;2;56;66;89m▀\x1B[0m\x1B[38;2;226;230;238m\x1B[48;2;150;155;171m▀\x1B[0m\x1B[38;2;166;179;195m\x1B[48;2;149;161;184m▀\x1B[0m\x1B[38;2;0;0;0m▄\x1B[0m  \x1B[38;2;195;198;204m▄\x1B[0m\x1B[38;2;0;0;15m\x1B[48;2;138;147;167m▀\x1B[0m ",
			"      \x1B[38;2;145;145;160m▀\x1B[0m\x1B[38;2;234;239;246m\x1B[48;2;157;167;185m▀\x1B[0m\x1B[38;2;184;190;195m\x1B[48;2;217;221;231m▀\x1B[0m\x1B[38;2;112;115;121m\x1B[48;2;209;213;219m▀\x1B[0m\x1B[38;2;53;63;90m▄\x1B[0m\x1B[38;2;91;91;102m▄\x1B[0m\x1B[38;2;139;143;147m\x1B[48;2;211;211;213m▀\x1B[0m\x1B[38;2;211;209;206m\x1B[48;2;218;224;234m▀\x1B[0m\x1B[38;2;89;97;117m\x1B[48;2;241;244;247m▀\x1B[0m\x1B[38;2;0;0;20m\x1B[48;2;156;162;172m▀\x1B[0m \x1B[38;2;146;148;155m▄\x1B[0m\x1B[38;2;176;176;178m\x1B[48;2;218;223;233m▀\x1B[0m\x1B[38;2;253;255;255m\x1B[48;2;73;89;115m▀\x1B[0m\x1B[38;2;127;151;192m▀\x1B[0m ",
			"        \x1B[38;2;63;76;104m▀\x1B[0m\x1B[38;2;234;237;244m\x1B[48;2;159;172;198m▀\x1B[0m\x1B[38;2;205;208;215m\x1B[48;2;248;250;254m▀\x1B[0m\x1B[38;2;230;229;227m\x1B[48;2;208;218;236m▀\x1B[0m\x1B[38;2;197;207;221m\x1B[48;2;65;91;133m▀\x1B[0m\x1B[38;2;0;29;79m▀\x1B[0m\x1B[38;2;182;188;200m\x1B[48;2;48;65;92m▀\x1B[0m\x1B[38;2;241;243;246m\x1B[48;2;188;198;213m▀\x1B[0m\x1B[38;2;145;147;151m\x1B[48;2;213;220;231m▀\x1B[0m\x1B[38;2;247;246;244m\x1B[48;2;202;211;224m▀\x1B[0m\x1B[38;2;196;204;219m\x1B[48;2;209;216;226m▀\x1B[0m\x1B[38;2;166;167;172m\x1B[48;2;213;219;230m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;207;215;229m▀\x1B[0m\x1B[38;2;129;142;162m\x1B[48;2;84;100;125m▀\x1B[0m",
			"        \x1B[38;2;102;106;123m▄\x1B[0m\x1B[38;2;220;226;236m\x1B[48;2;234;236;237m▀\x1B[0m\x1B[38;2;124;141;171m\x1B[48;2;120;137;169m▀\x1B[0m\x1B[38;2;141;154;180m\x1B[48;2;255;253;247m▀\x1B[0m\x1B[38;2;115;136;177m\x1B[48;2;199;205;213m▀\x1B[0m         ",
			"      \x1B[38;2;126;131;144m▄\x1B[0m\x1B[38;2;155;158;158m\x1B[48;2;247;247;247m▀\x1B[0m\x1B[38;2;181;190;199m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;227;233;243m\x1B[48;2;200;212;232m▀\x1B[0m\x1B[38;2;41;63;105m\x1B[48;2;19;43;93m▀\x1B[0m\x1B[38;2;255;255;250m\x1B[48;2;203;213;230m▀\x1B[0m\x1B[38;2;235;241;251m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;124;139;165m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;154;164;185m▄\x1B[0m\x1B[38;2;0;0;22m▄\x1B[0m      ",
			"      \x1B[38;2;94;110;135m▀\x1B[0m\x1B[38;2;131;143;172m▀\x1B[0m\x1B[38;2;113;125;153m▀\x1B[0m\x1B[38;2;65;86;124m▀\x1B[0m \x1B[38;2;98;114;145m▀\x1B[0m\x1B[38;2;123;135;163m▀\x1B[0m\x1B[38;2;119;129;157m▀\x1B[0m\x1B[38;2;62;86;130m▀\x1B[0m\x1B[38;2;15;42;81m▀\x1B[0m      ",
			"                      "
		],
		[
			"                      ",
			"       \x1B[38;2;0;0;0m▄\x1B[0m\x1B[38;2;127;131;136m\x1B[48;2;205;206;206m▀\x1B[0m\x1B[38;2;184;185;189m\x1B[48;2;216;222;232m▀\x1B[0m\x1B[38;2;199;201;204m\x1B[48;2;144;154;177m▀\x1B[0m\x1B[38;2;198;200;204m\x1B[48;2;153;162;186m▀\x1B[0m\x1B[38;2;210;212;214m\x1B[48;2;160;169;192m▀\x1B[0m\x1B[38;2;136;146;168m\x1B[48;2;88;103;134m▀\x1B[0m        ",
			"  \x1B[38;2;244;244;241m▄\x1B[0m\x1B[38;2;148;155;170m▄\x1B[0m  \x1B[38;2;90;94;102m▄\x1B[0m\x1B[38;2;200;200;200m\x1B[48;2;237;238;238m▀\x1B[0m\x1B[38;2;244;249;255m\x1B[48;2;141;152;177m▀\x1B[0m\x1B[38;2;88;105;129m▀\x1B[0m\x1B[38;2;95;99;107m▄\x1B[0m\x1B[38;2;71;68;75m\x1B[48;2;202;208;221m▀\x1B[0m\x1B[38;2;59;59;66m\x1B[48;2;215;220;230m▀\x1B[0m\x1B[38;2;104;96;88m\x1B[48;2;207;213;226m▀\x1B[0m\x1B[38;2;123;120;120m\x1B[48;2;240;242;247m▀\x1B[0m\x1B[38;2;58;65;72m\x1B[48;2;181;186;195m▀\x1B[0m\x1B[38;2;0;4;43m▄\x1B[0m     ",
			"\x1B[38;2;5;10;25m▄\x1B[0m\x1B[38;2;123;127;134m\x1B[48;2;245;245;242m▀\x1B[0m\x1B[38;2;225;228;232m\x1B[48;2;163;175;195m▀\x1B[0m\x1B[38;2;232;238;247m\x1B[48;2;190;199;213m▀\x1B[0m\x1B[38;2;105;122;151m\x1B[48;2;214;219;225m▀\x1B[0m\x1B[38;2;126;132;141m▄\x1B[0m\x1B[38;2;185;186;189m\x1B[48;2;245;248;252m▀\x1B[0m\x1B[38;2;218;224;235m\x1B[48;2;106;120;146m▀\x1B[0m\x1B[38;2;20;35;67m\x1B[48;2;0;0;68m▀\x1B[0m  \x1B[38;2;105;121;149m▀\x1B[0m\x1B[38;2;87;110;156m▀\x1B[0m\x1B[38;2;49;78;147m\x1B[48;2;214;208;202m▀\x1B[0m\x1B[38;2;64;79;119m\x1B[48;2;219;215;211m▀\x1B[0m\x1B[38;2;228;228;229m\x1B[48;2;239;240;240m▀\x1B[0m\x1B[38;2;180;188;205m\x1B[48;2;187;199;218m▀\x1B[0m     ",
			"\x1B[38;2;195;194;197m\x1B[48;2;97;111;135m▀\x1B[0m\x1B[38;2;205;212;225m\x1B[48;2;95;115;147m▀\x1B[0m\x1B[38;2;26;48;96m▀\x1B[0m\x1B[38;2;92;114;149m▀\x1B[0m\x1B[38;2;211;216;224m\x1B[48;2;88;107;142m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;241;245;251m▀\x1B[0m\x1B[38;2;195;198;208m\x1B[48;2;198;198;207m▀\x1B[0m\x1B[38;2;0;43;135m\x1B[48;2;0;90;249m▀\x1B[0m\x1B[38;2;89;150;252m\x1B[48;2;48;134;255m▀\x1B[0m\x1B[38;2;45;103;232m\x1B[48;2;15;101;251m▀\x1B[0m\x1B[38;2;0;85;187m\x1B[48;2;0;88;210m▀\x1B[0m\x1B[38;2;92;152;255m\x1B[48;2;47;114;253m▀\x1B[0m\x1B[38;2;0;28;205m\x1B[48;2;0;43;229m▀\x1B[0m\x1B[38;2;255;255;249m\x1B[48;2;207;207;199m▀\x1B[0m\x1B[38;2;231;236;250m\x1B[48;2;205;213;227m▀\x1B[0m\x1B[38;2;154;169;196m\x1B[48;2;0;0;52m▀\x1B[0m\x1B[38;2;63;89;121m▀\x1B[0m     ",
			"     \x1B[38;2;183;186;192m\x1B[48;2;105;112;127m▀\x1B[0m\x1B[38;2;230;236;244m\x1B[48;2;219;224;233m▀\x1B[0m\x1B[38;2;54;79;120m\x1B[48;2;176;185;201m▀\x1B[0m\x1B[38;2;0;56;255m▀\x1B[0m\x1B[38;2;171;200;234m▀\x1B[0m\x1B[38;2;221;225;232m▀\x1B[0m\x1B[38;2;13;58;222m▀\x1B[0m \x1B[38;2;62;73;90m▀\x1B[0m\x1B[38;2;223;227;234m\x1B[48;2;159;166;179m▀\x1B[0m\x1B[38;2;184;195;215m\x1B[48;2;150;162;186m▀\x1B[0m\x1B[38;2;0;0;28m▄\x1B[0m  \x1B[38;2;193;198;202m▄\x1B[0m\x1B[38;2;0;0;22m\x1B[48;2;121;134;159m▀\x1B[0m ",
			"      \x1B[38;2;102;119;150m▀\x1B[0m\x1B[38;2;227;231;239m\x1B[48;2;147;158;176m▀\x1B[0m\x1B[38;2;174;178;184m\x1B[48;2;227;231;240m▀\x1B[0m\x1B[38;2;131;134;141m\x1B[48;2;227;229;233m▀\x1B[0m\x1B[38;2;76;93;120m▄\x1B[0m\x1B[38;2;80;80;80m▄\x1B[0m\x1B[38;2;201;201;207m\x1B[48;2;232;232;232m▀\x1B[0m\x1B[38;2;197;195;194m\x1B[48;2;218;223;233m▀\x1B[0m\x1B[38;2;123;130;145m\x1B[48;2;247;248;251m▀\x1B[0m\x1B[38;2;0;0;25m\x1B[48;2;157;167;183m▀\x1B[0m \x1B[38;2;151;154;159m▄\x1B[0m\x1B[38;2;159;164;167m\x1B[48;2;222;227;236m▀\x1B[0m\x1B[38;2;254;255;255m\x1B[48;2;84;99;126m▀\x1B[0m\x1B[38;2;93;117;152m▀\x1B[0m ",
			"        \x1B[38;2;67;93;127m▀\x1B[0m\x1B[38;2;230;234;239m\x1B[48;2;138;157;186m▀\x1B[0m\x1B[38;2;197;200;205m\x1B[48;2;238;243;250m▀\x1B[0m\x1B[38;2;219;217;216m\x1B[48;2;213;221;236m▀\x1B[0m\x1B[38;2;197;203;219m\x1B[48;2;63;78;117m▀\x1B[0m\x1B[38;2;0;0;49m▀\x1B[0m\x1B[38;2;170;178;193m\x1B[48;2;18;31;68m▀\x1B[0m\x1B[38;2;242;243;246m\x1B[48;2;160;170;183m▀\x1B[0m\x1B[38;2;220;218;216m\x1B[48;2;210;216;227m▀\x1B[0m\x1B[38;2;255;255;253m\x1B[48;2;202;210;224m▀\x1B[0m\x1B[38;2;209;215;228m\x1B[48;2;206;213;225m▀\x1B[0m\x1B[38;2;169;174;182m\x1B[48;2;213;219;232m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;209;216;231m▀\x1B[0m\x1B[38;2;129;140;160m\x1B[48;2;93;109;135m▀\x1B[0m",
			"        \x1B[38;2;38;50;69m▄\x1B[0m\x1B[38;2;207;214;226m\x1B[48;2;224;225;227m▀\x1B[0m\x1B[38;2;111;126;157m\x1B[48;2;85;97;122m▀\x1B[0m\x1B[38;2;136;149;177m\x1B[48;2;219;217;213m▀\x1B[0m\x1B[38;2;106;126;164m\x1B[48;2;204;211;221m▀\x1B[0m  \x1B[38;2;0;0;14m▀\x1B[0m      ",
			"      \x1B[38;2;135;138;150m▄\x1B[0m\x1B[38;2;162;162;162m\x1B[48;2;252;252;252m▀\x1B[0m\x1B[38;2;165;173;187m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;218;225;236m\x1B[48;2;195;206;227m▀\x1B[0m\x1B[38;2;31;47;81m\x1B[48;2;13;35;83m▀\x1B[0m\x1B[38;2;237;231;225m\x1B[48;2;191;200;219m▀\x1B[0m\x1B[38;2;241;246;254m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;132;144;166m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;119;119;119m\x1B[48;2;152;163;186m▀\x1B[0m\x1B[38;2;0;0;43m▄\x1B[0m      ",
			"      \x1B[38;2;90;102;129m▀\x1B[0m\x1B[38;2;128;140;170m▀\x1B[0m\x1B[38;2;115;126;156m▀\x1B[0m\x1B[38;2;69;88;129m▀\x1B[0m\x1B[38;2;0;3;35m▀\x1B[0m\x1B[38;2;108;124;157m▀\x1B[0m\x1B[38;2;123;136;164m▀\x1B[0m\x1B[38;2;118;129;157m▀\x1B[0m\x1B[38;2;69;93;138m▀\x1B[0m\x1B[38;2;15;42;92m▀\x1B[0m      ",
			"                      "
		]
	],
	"large": [
		[
			"                              ",
			"            \x1B[38;2;195;197;201m▄\x1B[0m\x1B[38;2;171;171;172m▄\x1B[0m\x1B[38;2;163;162;165m▄\x1B[0m\x1B[38;2;167;168;172m▄\x1B[0m\x1B[38;2;162;161;164m▄\x1B[0m\x1B[38;2;167;166;167m▄\x1B[0m\x1B[38;2;108;117;136m▄\x1B[0m\x1B[38;2;19;45;98m▄\x1B[0m          ",
			"          \x1B[38;2;0;0;6m▄\x1B[0m\x1B[38;2;19;19;29m\x1B[48;2;151;153;156m▀\x1B[0m\x1B[38;2;228;228;229m\x1B[48;2;234;240;247m▀\x1B[0m\x1B[38;2;243;247;255m\x1B[48;2;80;99;132m▀\x1B[0m\x1B[38;2;204;214;232m\x1B[48;2;12;29;60m▀\x1B[0m\x1B[38;2;206;215;231m\x1B[48;2;37;55;124m▀\x1B[0m\x1B[38;2;212;220;236m\x1B[48;2;0;12;50m▀\x1B[0m\x1B[38;2;224;231;247m\x1B[48;2;0;16;51m▀\x1B[0m\x1B[38;2;133;154;192m\x1B[48;2;0;12;72m▀\x1B[0m\x1B[38;2;32;58;100m▀\x1B[0m          ",
			"   \x1B[38;2;144;147;151m▄\x1B[0m\x1B[38;2;112;115;128m▄\x1B[0m\x1B[38;2;22;33;44m▄\x1B[0m   \x1B[38;2;66;68;70m▄\x1B[0m\x1B[38;2;170;171;173m\x1B[48;2;223;223;223m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;212;221;232m▀\x1B[0m\x1B[38;2;115;134;163m\x1B[48;2;55;85;128m▀\x1B[0m\x1B[38;2;0;0;25m▀\x1B[0m \x1B[38;2;108;110;117m\x1B[48;2;174;177;182m▀\x1B[0m\x1B[38;2;130;133;138m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;130;130;128m\x1B[48;2;251;251;251m▀\x1B[0m\x1B[38;2;131;133;131m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;126;129;137m\x1B[48;2;252;252;253m▀\x1B[0m\x1B[38;2;130;132;139m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;76;76;81m\x1B[48;2;165;176;192m▀\x1B[0m\x1B[38;2;0;0;13m▄\x1B[0m       ",
			" \x1B[38;2;65;70;89m▄\x1B[0m\x1B[38;2;120;129;144m\x1B[48;2;241;241;241m▀\x1B[0m\x1B[38;2;246;249;251m\x1B[48;2;204;214;229m▀\x1B[0m\x1B[38;2;240;240;243m\x1B[48;2;212;221;233m▀\x1B[0m\x1B[38;2;90;108;138m\x1B[48;2;238;242;251m▀\x1B[0m\x1B[38;2;100;117;145m▄\x1B[0m \x1B[38;2;21;30;38m\x1B[48;2;177;187;198m▀\x1B[0m\x1B[38;2;183;184;186m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;249;250;252m\x1B[48;2;135;151;182m▀\x1B[0m\x1B[38;2;79;102;147m\x1B[48;2;0;5;54m▀\x1B[0m   \x1B[38;2;92;110;144m▀\x1B[0m\x1B[38;2;124;146;187m▀\x1B[0m\x1B[38;2;126;149;186m▀\x1B[0m\x1B[38;2;124;146;182m▀\x1B[0m\x1B[38;2;101;125;169m▀\x1B[0m\x1B[38;2;193;200;210m\x1B[48;2;63;78;98m▀\x1B[0m\x1B[38;2;246;248;252m\x1B[48;2;255;254;248m▀\x1B[0m\x1B[38;2;109;121;148m\x1B[48;2;212;221;238m▀\x1B[0m\x1B[38;2;0;0;24m\x1B[48;2;4;29;88m▀\x1B[0m      ",
			"\x1B[38;2;232;232;231m▄\x1B[0m\x1B[38;2;172;176;181m\x1B[48;2;252;255;255m▀\x1B[0m\x1B[38;2;244;247;255m\x1B[48;2;112;129;165m▀\x1B[0m\x1B[38;2;79;101;139m\x1B[48;2;5;26;88m▀\x1B[0m\x1B[38;2;102;120;149m▀\x1B[0m\x1B[38;2;250;251;255m\x1B[48;2;146;160;182m▀\x1B[0m\x1B[38;2;222;221;221m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;34;39;52m\x1B[48;2;241;239;235m▀\x1B[0m\x1B[38;2;247;244;237m\x1B[48;2;240;242;247m▀\x1B[0m\x1B[38;2;227;234;246m\x1B[48;2;114;129;160m▀\x1B[0m\x1B[38;2;48;67;98m\x1B[48;2;0;0;0m▀\x1B[0m\x1B[38;2;0;0;68m\x1B[48;2;129;176;241m▀\x1B[0m\x1B[38;2;6;13;107m\x1B[48;2;93;149;244m▀\x1B[0m  \x1B[38;2;0;4;78m\x1B[48;2;121;171;239m▀\x1B[0m\x1B[38;2;17;30;88m\x1B[48;2;96;153;241m▀\x1B[0m \x1B[38;2;234;234;238m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;247;245;243m\x1B[48;2;254;255;255m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;187;197;216m▀\x1B[0m\x1B[38;2;251;253;255m\x1B[48;2;111;124;151m▀\x1B[0m\x1B[38;2;132;149;181m\x1B[48;2;22;44;93m▀\x1B[0m\x1B[38;2;0;17;57m▀\x1B[0m      ",
			"\x1B[38;2;184;196;216m\x1B[48;2;49;79;137m▀\x1B[0m\x1B[38;2;112;128;164m\x1B[48;2;43;65;116m▀\x1B[0m\x1B[38;2;0;18;57m▀\x1B[0m  \x1B[38;2;14;28;53m▀\x1B[0m\x1B[38;2;145;160;181m\x1B[48;2;33;63;108m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;199;214;231m▀\x1B[0m\x1B[38;2;207;212;222m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;37;48;86m\x1B[48;2;102;116;158m▀\x1B[0m \x1B[38;2;123;170;224m\x1B[48;2;3;64;215m▀\x1B[0m\x1B[38;2;81;126;227m\x1B[48;2;3;58;214m▀\x1B[0m  \x1B[38;2;112;170;228m\x1B[48;2;0;75;218m▀\x1B[0m\x1B[38;2;94;137;234m\x1B[48;2;11;75;235m▀\x1B[0m\x1B[38;2;0;0;255m\x1B[48;2;6;95;255m▀\x1B[0m\x1B[38;2;255;255;248m\x1B[48;2;127;156;179m▀\x1B[0m\x1B[38;2;246;251;255m\x1B[48;2;241;244;247m▀\x1B[0m\x1B[38;2;66;87;122m\x1B[48;2;204;212;224m▀\x1B[0m\x1B[38;2;30;47;78m▄\x1B[0m        ",
			"       \x1B[38;2;90;103;131m\x1B[48;2;0;0;0m▀\x1B[0m\x1B[38;2;221;223;229m\x1B[48;2;130;140;158m▀\x1B[0m\x1B[38;2;193;202;219m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;42;49;81m\x1B[48;2;145;161;193m▀\x1B[0m\x1B[38;2;0;68;246m▀\x1B[0m\x1B[38;2;81;126;218m▀\x1B[0m\x1B[38;2;179;177;169m\x1B[48;2;187;190;190m▀\x1B[0m\x1B[38;2;168;166;159m\x1B[48;2;185;187;185m▀\x1B[0m\x1B[38;2;103;143;209m▀\x1B[0m\x1B[38;2;0;86;255m▀\x1B[0m  \x1B[38;2;205;211;221m\x1B[48;2;88;104;141m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;234;240;249m▀\x1B[0m\x1B[38;2;140;161;191m\x1B[48;2;166;181;208m▀\x1B[0m\x1B[38;2;0;3;61m▄\x1B[0m   \x1B[38;2;12;17;21m▄\x1B[0m\x1B[38;2;146;149;158m▄\x1B[0m\x1B[38;2;87;96;125m▄\x1B[0m ",
			"        \x1B[38;2;30;50;100m▀\x1B[0m\x1B[38;2;199;203;215m\x1B[48;2;61;70;89m▀\x1B[0m\x1B[38;2;214;221;233m\x1B[48;2;244;247;250m▀\x1B[0m\x1B[38;2;16;32;60m\x1B[48;2;222;220;216m▀\x1B[0m\x1B[38;2;176;177;180m▄\x1B[0m\x1B[38;2;107;117;139m▄\x1B[0m   \x1B[38;2;154;158;163m▄\x1B[0m\x1B[38;2;45;52;63m\x1B[48;2;248;247;244m▀\x1B[0m\x1B[38;2;39;48;59m\x1B[48;2;208;210;214m▀\x1B[0m\x1B[38;2;71;93;126m\x1B[48;2;51;68;93m▀\x1B[0m\x1B[38;2;43;64;100m▀\x1B[0m\x1B[38;2;0;20;61m▀\x1B[0m  \x1B[38;2;113;120;131m▄\x1B[0m\x1B[38;2;149;154;162m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;141;158;189m▀\x1B[0m\x1B[38;2;82;95;128m\x1B[48;2;0;10;57m▀\x1B[0m ",
			"          \x1B[38;2;135;147;169m▀\x1B[0m\x1B[38;2;153;164;184m\x1B[48;2;0;0;0m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;189;198;212m▀\x1B[0m\x1B[38;2;181;188;204m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;0;5;40m\x1B[48;2;144;153;169m▀\x1B[0m\x1B[38;2;94;99;107m▄\x1B[0m\x1B[38;2;144;147;153m\x1B[48;2;214;213;211m▀\x1B[0m\x1B[38;2;245;245;243m\x1B[48;2;233;240;253m▀\x1B[0m\x1B[38;2;222;227;235m\x1B[48;2;49;65;98m▀\x1B[0m\x1B[38;2;244;246;250m\x1B[48;2;95;111;143m▀\x1B[0m\x1B[38;2;206;213;226m\x1B[48;2;249;252;255m▀\x1B[0m\x1B[38;2;59;80;121m\x1B[48;2;185;195;208m▀\x1B[0m\x1B[38;2;52;60;78m▄\x1B[0m\x1B[38;2;111;116;126m▄\x1B[0m\x1B[38;2;113;120;129m\x1B[48;2;226;226;225m▀\x1B[0m\x1B[38;2;244;245;247m\x1B[48;2;215;220;229m▀\x1B[0m\x1B[38;2;176;190;211m\x1B[48;2;71;87;121m▀\x1B[0m\x1B[38;2;33;51;80m\x1B[48;2;108;95;82m▀\x1B[0m\x1B[38;2;160;160;154m▄\x1B[0m\x1B[38;2;86;98;127m▄\x1B[0m",
			"            \x1B[38;2;134;144;168m▀\x1B[0m\x1B[38;2;222;225;234m\x1B[48;2;119;130;159m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;200;208;224m▀\x1B[0m\x1B[38;2;250;248;244m\x1B[48;2;210;216;229m▀\x1B[0m\x1B[38;2;247;249;251m\x1B[48;2;127;147;181m▀\x1B[0m\x1B[38;2;100;122;158m\x1B[48;2;13;37;78m▀\x1B[0m  \x1B[38;2;145;161;184m\x1B[48;2;38;67;105m▀\x1B[0m\x1B[38;2;251;254;255m\x1B[48;2;130;146;173m▀\x1B[0m\x1B[38;2;249;247;241m\x1B[48;2;137;151;180m▀\x1B[0m\x1B[38;2;251;250;246m\x1B[48;2;133;148;176m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;135;150;177m▀\x1B[0m\x1B[38;2;248;247;245m\x1B[48;2;141;155;181m▀\x1B[0m\x1B[38;2;252;247;240m\x1B[48;2;141;154;180m▀\x1B[0m\x1B[38;2;247;244;238m\x1B[48;2;136;149;176m▀\x1B[0m\x1B[38;2;255;252;246m\x1B[48;2;144;156;182m▀\x1B[0m\x1B[38;2;142;155;186m\x1B[48;2;77;91;124m▀\x1B[0m",
			"            \x1B[38;2;7;7;14m▄\x1B[0m\x1B[38;2;182;189;205m\x1B[48;2;239;240;239m▀\x1B[0m\x1B[38;2;69;90;134m\x1B[48;2;97;110;135m▀\x1B[0m\x1B[38;2;64;83;119m\x1B[48;2;179;176;173m▀\x1B[0m\x1B[38;2;94;116;158m\x1B[48;2;213;218;230m▀\x1B[0m\x1B[38;2;0;14;62m\x1B[48;2;51;67;103m▀\x1B[0m            ",
			"           \x1B[38;2;206;213;222m▄\x1B[0m\x1B[38;2;155;161;170m\x1B[48;2;193;205;222m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;250;250;251m▀\x1B[0m\x1B[38;2;97;110;136m\x1B[48;2;61;76;109m▀\x1B[0m\x1B[38;2;193;197;197m\x1B[48;2;189;189;189m▀\x1B[0m\x1B[38;2;255;255;255m▀\x1B[0m\x1B[38;2;198;204;211m\x1B[48;2;206;214;230m▀\x1B[0m\x1B[38;2;39;70;114m\x1B[48;2;156;173;205m▀\x1B[0m           ",
			"         \x1B[38;2;80;86;96m▄\x1B[0m\x1B[38;2;174;177;184m\x1B[48;2;250;251;254m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;248;248;247m▀\x1B[0m\x1B[38;2;244;243;239m\x1B[48;2;240;242;245m▀\x1B[0m\x1B[38;2;215;223;237m\x1B[48;2;150;168;202m▀\x1B[0m\x1B[38;2;26;44;83m\x1B[48;2;23;39;73m▀\x1B[0m\x1B[38;2;144;147;160m\x1B[48;2;43;77;142m▀\x1B[0m\x1B[38;2;242;243;248m\x1B[48;2;175;188;215m▀\x1B[0m\x1B[38;2;228;228;227m\x1B[48;2;255;255;251m▀\x1B[0m\x1B[38;2;252;252;252m\x1B[48;2;246;246;244m▀\x1B[0m\x1B[38;2;204;207;210m\x1B[48;2;234;239;246m▀\x1B[0m\x1B[38;2;55;67;92m\x1B[48;2;75;95;136m▀\x1B[0m\x1B[38;2;0;0;8m▄\x1B[0m        ",
			"         \x1B[38;2;42;53;76m▀\x1B[0m\x1B[38;2;79;96;128m▀\x1B[0m\x1B[38;2;81;96;125m▀\x1B[0m\x1B[38;2;73;90;123m▀\x1B[0m\x1B[38;2;37;54;94m▀\x1B[0m\x1B[38;2;12;20;41m▀\x1B[0m \x1B[38;2;76;96;127m▀\x1B[0m\x1B[38;2;91;108;142m▀\x1B[0m\x1B[38;2;86;102;133m▀\x1B[0m\x1B[38;2;78;98;134m▀\x1B[0m\x1B[38;2;29;49;88m▀\x1B[0m\x1B[38;2;0;7;22m▀\x1B[0m        ",
			"                              "
		],
		[
			"                              ",
			"                              ",
			"             \x1B[38;2;96;102;115m▄\x1B[0m\x1B[38;2;106;108;117m\x1B[48;2;246;246;245m▀\x1B[0m\x1B[38;2;143;144;151m\x1B[48;2;224;230;241m▀\x1B[0m\x1B[38;2;144;144;150m\x1B[48;2;195;206;224m▀\x1B[0m\x1B[38;2;140;141;147m\x1B[48;2;201;211;227m▀\x1B[0m\x1B[38;2;139;139;143m\x1B[48;2;214;221;236m▀\x1B[0m\x1B[38;2;123;131;144m\x1B[48;2;181;196;224m▀\x1B[0m\x1B[38;2;46;65;104m\x1B[48;2;53;71;104m▀\x1B[0m         ",
			"\x1B[38;2;108;115;130m▄\x1B[0m\x1B[38;2;108;119;138m▄\x1B[0m    \x1B[38;2;39;39;55m▄\x1B[0m\x1B[38;2;45;51;71m▄\x1B[0m    \x1B[38;2;189;189;193m▄\x1B[0m\x1B[38;2;207;206;206m\x1B[48;2;251;254;255m▀\x1B[0m\x1B[38;2;240;245;253m\x1B[48;2;90;109;147m▀\x1B[0m\x1B[38;2;58;79;120m▀\x1B[0m\x1B[38;2;130;130;136m▄\x1B[0m\x1B[38;2;13;13;13m\x1B[48;2;187;188;189m▀\x1B[0m\x1B[38;2;0;0;0m\x1B[48;2;189;189;188m▀\x1B[0m\x1B[38;2;0;0;0m\x1B[48;2;189;190;190m▀\x1B[0m\x1B[38;2;188;188;189m▄\x1B[0m\x1B[38;2;180;180;181m▄\x1B[0m\x1B[38;2;78;86;107m▄\x1B[0m       ",
			"\x1B[38;2;170;172;180m\x1B[48;2;30;45;60m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;167;178;199m▀\x1B[0m\x1B[38;2;132;143;162m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;0;15;46m\x1B[48;2;167;170;181m▀\x1B[0m\x1B[38;2;0;0;0m▄\x1B[0m\x1B[38;2;186;191;195m▄\x1B[0m\x1B[38;2;164;167;173m\x1B[48;2;246;249;253m▀\x1B[0m\x1B[38;2;252;251;252m\x1B[48;2;201;210;222m▀\x1B[0m\x1B[38;2;114;126;148m\x1B[48;2;239;244;252m▀\x1B[0m\x1B[38;2;99;116;147m▄\x1B[0m \x1B[38;2;90;90;99m\x1B[48;2;190;195;203m▀\x1B[0m\x1B[38;2;240;240;240m\x1B[48;2;235;241;250m▀\x1B[0m\x1B[38;2;176;189;213m\x1B[48;2;55;76;116m▀\x1B[0m\x1B[38;2;0;27;79m▀\x1B[0m \x1B[38;2;66;73;93m▀\x1B[0m\x1B[38;2;173;183;202m▀\x1B[0m\x1B[38;2;177;186;205m▀\x1B[0m\x1B[38;2;175;186;204m▀\x1B[0m\x1B[38;2;173;183;203m▀\x1B[0m\x1B[38;2;252;254;254m\x1B[48;2;123;142;174m▀\x1B[0m\x1B[38;2;194;200;211m\x1B[48;2;255;255;253m▀\x1B[0m\x1B[38;2;101;114;140m\x1B[48;2;205;213;227m▀\x1B[0m      ",
			" \x1B[38;2;21;38;68m▀\x1B[0m\x1B[38;2;149;162;183m\x1B[48;2;0;0;39m▀\x1B[0m\x1B[38;2;252;253;255m\x1B[48;2;134;148;172m▀\x1B[0m\x1B[38;2;185;185;187m\x1B[48;2;250;254;255m▀\x1B[0m\x1B[38;2;246;248;251m\x1B[48;2;128;145;172m▀\x1B[0m\x1B[38;2;139;156;182m\x1B[48;2;0;0;34m▀\x1B[0m\x1B[38;2;49;68;108m▀\x1B[0m\x1B[38;2;227;232;244m\x1B[48;2;111;128;159m▀\x1B[0m\x1B[38;2;203;208;215m\x1B[48;2;248;251;254m▀\x1B[0m\x1B[38;2;152;159;171m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;171;180;196m▀\x1B[0m\x1B[38;2;124;142;172m\x1B[48;2;0;0;40m▀\x1B[0m\x1B[38;2;0;0;127m\x1B[48;2;73;150;255m▀\x1B[0m\x1B[38;2;70;138;237m▄\x1B[0m \x1B[38;2;15;118;233m▄\x1B[0m\x1B[38;2;26;58;228m\x1B[48;2;98;166;255m▀\x1B[0m\x1B[38;2;0;58;226m▄\x1B[0m\x1B[38;2;216;214;211m\x1B[48;2;255;252;233m▀\x1B[0m\x1B[38;2;255;252;247m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;255;253;245m\x1B[48;2;164;176;197m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;124;141;166m▀\x1B[0m\x1B[38;2;150;168;192m\x1B[48;2;22;45;79m▀\x1B[0m      ",
			"   \x1B[38;2;26;38;53m▀\x1B[0m\x1B[38;2;46;65;100m▀\x1B[0m\x1B[38;2;20;31;57m▀\x1B[0m  \x1B[38;2;0;15;45m▀\x1B[0m\x1B[38;2;147;159;178m\x1B[48;2;0;30;85m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;202;208;216m▀\x1B[0m\x1B[38;2;145;160;189m\x1B[48;2;216;221;228m▀\x1B[0m\x1B[38;2;12;34;56m▄\x1B[0m\x1B[38;2;64;137;232m\x1B[48;2;0;52;175m▀\x1B[0m\x1B[38;2;64;123;228m\x1B[48;2;8;53;172m▀\x1B[0m \x1B[38;2;2;104;236m\x1B[48;2;30;66;127m▀\x1B[0m\x1B[38;2;87;144;249m\x1B[48;2;6;50;177m▀\x1B[0m\x1B[38;2;0;64;245m\x1B[48;2;0;50;175m▀\x1B[0m\x1B[38;2;208;204;192m▀\x1B[0m\x1B[38;2;254;255;255m\x1B[48;2;196;201;213m▀\x1B[0m\x1B[38;2;101;117;150m\x1B[48;2;206;212;222m▀\x1B[0m\x1B[38;2;0;0;45m▄\x1B[0m       ",
			"          \x1B[38;2;120;138;162m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;201;208;216m▀\x1B[0m\x1B[38;2;122;134;163m\x1B[48;2;228;232;241m▀\x1B[0m\x1B[38;2;42;61;104m▄\x1B[0m \x1B[38;2;228;228;231m▀\x1B[0m\x1B[38;2;197;194;186m▀\x1B[0m   \x1B[38;2;147;153;170m\x1B[48;2;0;0;5m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;118;128;149m▀\x1B[0m\x1B[38;2;118;130;154m\x1B[48;2;79;100;137m▀\x1B[0m   \x1B[38;2;85;88;94m▄\x1B[0m\x1B[38;2;40;48;70m\x1B[48;2;224;225;228m▀\x1B[0m\x1B[38;2;39;48;70m\x1B[48;2;119;134;161m▀\x1B[0m ",
			"           \x1B[38;2;59;66;79m▀\x1B[0m\x1B[38;2;215;220;229m\x1B[48;2;147;155;172m▀\x1B[0m\x1B[38;2;212;215;220m\x1B[48;2;190;196;209m▀\x1B[0m\x1B[38;2;160;164;171m\x1B[48;2;241;243;247m▀\x1B[0m\x1B[38;2;71;85;109m\x1B[48;2;171;180;197m▀\x1B[0m  \x1B[38;2;168;168;171m▄\x1B[0m\x1B[38;2;178;180;182m\x1B[48;2;254;255;255m▀\x1B[0m\x1B[38;2;195;195;194m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;35;40;63m\x1B[48;2;182;192;207m▀\x1B[0m\x1B[38;2;0;0;4m\x1B[48;2;11;19;41m▀\x1B[0m  \x1B[38;2;23;29;42m\x1B[48;2;198;200;204m▀\x1B[0m\x1B[38;2;209;208;207m\x1B[48;2;236;241;250m▀\x1B[0m\x1B[38;2;201;212;230m\x1B[48;2;47;63;94m▀\x1B[0m\x1B[38;2;39;56;88m▀\x1B[0m ",
			"            \x1B[38;2;29;36;51m▀\x1B[0m\x1B[38;2;0;0;0m▀\x1B[0m\x1B[38;2;179;187;200m\x1B[48;2;15;26;58m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;202;205;212m▀\x1B[0m\x1B[38;2;122;130;153m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;185;185;183m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;136;149;170m▀\x1B[0m\x1B[38;2;119;135;165m\x1B[48;2;0;0;26m▀\x1B[0m\x1B[38;2;94;113;147m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;118;136;160m▀\x1B[0m\x1B[38;2;160;167;179m\x1B[48;2;251;254;255m▀\x1B[0m\x1B[38;2;43;54;65m\x1B[48;2;246;246;245m▀\x1B[0m\x1B[38;2;212;212;210m\x1B[48;2;254;254;254m▀\x1B[0m\x1B[38;2;254;254;252m\x1B[48;2;251;251;251m▀\x1B[0m\x1B[38;2;111;124;154m\x1B[48;2;243;243;243m▀\x1B[0m\x1B[38;2;67;67;74m\x1B[48;2;247;247;246m▀\x1B[0m\x1B[38;2;231;231;207m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;81;92;110m\x1B[48;2;155;170;194m▀\x1B[0m",
			"               \x1B[38;2;165;175;194m\x1B[48;2;173;178;187m▀\x1B[0m\x1B[38;2;171;182;205m\x1B[48;2;38;55;86m▀\x1B[0m\x1B[38;2;152;166;196m\x1B[48;2;139;147;168m▀\x1B[0m\x1B[38;2;57;80;127m\x1B[48;2;119;138;177m▀\x1B[0m   \x1B[38;2;112;132;167m▀\x1B[0m\x1B[38;2;118;136;169m▀\x1B[0m\x1B[38;2;116;132;165m▀\x1B[0m\x1B[38;2;112;128;163m▀\x1B[0m\x1B[38;2;111;128;162m▀\x1B[0m\x1B[38;2;120;138;170m▀\x1B[0m\x1B[38;2;119;136;167m▀\x1B[0m\x1B[38;2;67;83;107m▀\x1B[0m",
			"              \x1B[38;2;145;145;147m\x1B[48;2;186;194;204m▀\x1B[0m\x1B[38;2;226;229;236m\x1B[48;2;238;243;250m▀\x1B[0m\x1B[38;2;25;39;71m\x1B[48;2;0;2;49m▀\x1B[0m\x1B[38;2;255;255;255m▀\x1B[0m\x1B[38;2;211;215;221m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;118;138;178m▄\x1B[0m          ",
			"           \x1B[38;2;94;100;112m▄\x1B[0m\x1B[38;2;202;204;207m\x1B[48;2;249;252;255m▀\x1B[0m\x1B[38;2;242;242;241m\x1B[48;2;245;245;246m▀\x1B[0m\x1B[38;2;250;249;245m\x1B[48;2;232;236;242m▀\x1B[0m\x1B[38;2;182;194;215m\x1B[48;2;113;134;175m▀\x1B[0m\x1B[38;2;0;0;35m\x1B[48;2;0;0;29m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;179;192;214m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;244;248;254m▀\x1B[0m\x1B[38;2;220;225;231m\x1B[48;2;243;243;242m▀\x1B[0m\x1B[38;2;217;221;224m\x1B[48;2;235;238;245m▀\x1B[0m\x1B[38;2;94;103;127m\x1B[48;2;103;125;169m▀\x1B[0m        ",
			"           \x1B[38;2;39;50;67m▀\x1B[0m\x1B[38;2;64;80;114m▀\x1B[0m\x1B[38;2;62;78;111m▀\x1B[0m\x1B[38;2;47;67;106m▀\x1B[0m\x1B[38;2;15;34;75m▀\x1B[0m \x1B[38;2;49;66;94m▀\x1B[0m\x1B[38;2;65;82;118m▀\x1B[0m\x1B[38;2;63;80;114m▀\x1B[0m\x1B[38;2;62;81;120m▀\x1B[0m\x1B[38;2;27;50;90m▀\x1B[0m        ",
			"                              ",
			"                              "
		],
		[
			"                              ",
			"            \x1B[38;2;131;133;141m▄\x1B[0m\x1B[38;2;148;150;158m▄\x1B[0m\x1B[38;2;145;147;154m▄\x1B[0m\x1B[38;2;148;150;159m▄\x1B[0m\x1B[38;2;143;145;151m▄\x1B[0m\x1B[38;2;133;137;147m▄\x1B[0m\x1B[38;2;117;130;158m▄\x1B[0m           ",
			"          \x1B[38;2;19;32;51m▄\x1B[0m\x1B[38;2;74;82;93m\x1B[48;2;196;197;199m▀\x1B[0m\x1B[38;2;241;243;245m\x1B[48;2;223;231;244m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;78;98;140m▀\x1B[0m\x1B[38;2;246;248;254m\x1B[48;2;47;62;99m▀\x1B[0m\x1B[38;2;246;248;254m\x1B[48;2;51;68;107m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;41;54;86m▀\x1B[0m\x1B[38;2;226;233;248m\x1B[48;2;39;57;98m▀\x1B[0m\x1B[38;2;75;98;146m\x1B[48;2;19;35;67m▀\x1B[0m           ",
			"   \x1B[38;2;116;123;136m▄\x1B[0m\x1B[38;2;108;116;131m▄\x1B[0m    \x1B[38;2;0;0;0m\x1B[48;2;103;111;121m▀\x1B[0m\x1B[38;2;148;151;157m\x1B[48;2;248;246;242m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;187;198;215m▀\x1B[0m\x1B[38;2;110;129;167m\x1B[48;2;6;42;109m▀\x1B[0m\x1B[38;2;6;42;97m▀\x1B[0m\x1B[38;2;74;83;105m▄\x1B[0m\x1B[38;2;229;232;239m▄\x1B[0m\x1B[38;2;241;243;244m▄\x1B[0m\x1B[38;2;236;238;241m▄\x1B[0m\x1B[38;2;236;240;246m▄\x1B[0m\x1B[38;2;98;98;109m\x1B[48;2;250;249;249m▀\x1B[0m\x1B[38;2;27;33;44m\x1B[48;2;179;187;197m▀\x1B[0m\x1B[38;2;31;51;79m▄\x1B[0m        ",
			" \x1B[38;2;0;0;0m▄\x1B[0m\x1B[38;2;9;22;41m\x1B[48;2;203;205;206m▀\x1B[0m\x1B[38;2;182;187;195m\x1B[48;2;221;228;240m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;199;206;222m▀\x1B[0m\x1B[38;2;90;105;136m\x1B[48;2;247;251;255m▀\x1B[0m\x1B[38;2;88;107;147m▄\x1B[0m \x1B[38;2;166;164;166m▄\x1B[0m\x1B[38;2;247;249;250m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;226;234;247m\x1B[48;2;133;154;187m▀\x1B[0m\x1B[38;2;67;95;142m\x1B[48;2;0;0;30m▀\x1B[0m  \x1B[38;2;41;53;82m▀\x1B[0m\x1B[38;2;77;93;126m▀\x1B[0m\x1B[38;2;81;96;129m▀\x1B[0m\x1B[38;2;90;105;136m▀\x1B[0m\x1B[38;2;85;102;136m▀\x1B[0m\x1B[38;2;146;157;176m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;203;203;203m▀\x1B[0m\x1B[38;2;162;174;196m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;39;52;85m\x1B[48;2;70;90;133m▀\x1B[0m       ",
			"\x1B[38;2;150;153;161m▄\x1B[0m\x1B[38;2;149;153;161m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;149;164;187m▀\x1B[0m\x1B[38;2;121;141;178m\x1B[48;2;7;32;80m▀\x1B[0m\x1B[38;2;107;127;163m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;128;144;168m▀\x1B[0m\x1B[38;2;167;174;186m\x1B[48;2;250;252;255m▀\x1B[0m\x1B[38;2;126;129;142m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;242;241;236m\x1B[48;2;226;234;245m▀\x1B[0m\x1B[38;2;180;195;218m\x1B[48;2;74;98;142m▀\x1B[0m\x1B[38;2;41;59;97m\x1B[48;2;0;51;156m▀\x1B[0m\x1B[38;2;0;12;218m\x1B[48;2;104;171;255m▀\x1B[0m\x1B[38;2;19;93;239m▄\x1B[0m \x1B[38;2;0;99;238m▄\x1B[0m\x1B[38;2;12;90;238m\x1B[48;2;105;181;255m▀\x1B[0m\x1B[38;2;30;113;243m▄\x1B[0m\x1B[38;2;159;148;148m\x1B[48;2;255;255;242m▀\x1B[0m\x1B[38;2;162;162;163m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;182;180;178m\x1B[48;2;197;208;224m▀\x1B[0m\x1B[38;2;253;251;247m\x1B[48;2;186;197;217m▀\x1B[0m\x1B[38;2;200;211;227m\x1B[48;2;93;115;146m▀\x1B[0m\x1B[38;2;34;52;92m▀\x1B[0m    \x1B[38;2;125;129;138m▄\x1B[0m\x1B[38;2;21;25;34m\x1B[48;2;178;183;194m▀\x1B[0m\x1B[38;2;0;0;0m\x1B[48;2;73;85;110m▀\x1B[0m",
			"\x1B[38;2;143;151;166m▀\x1B[0m\x1B[38;2;163;180;209m▀\x1B[0m\x1B[38;2;0;15;66m▀\x1B[0m  \x1B[38;2;0;15;54m▀\x1B[0m\x1B[38;2;155;170;193m\x1B[48;2;0;0;7m▀\x1B[0m\x1B[38;2;255;254;249m\x1B[48;2;179;186;199m▀\x1B[0m\x1B[38;2;187;196;212m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;104;114;136m▄\x1B[0m\x1B[38;2;12;82;188m\x1B[48;2;0;31;124m▀\x1B[0m\x1B[38;2;104;150;237m\x1B[48;2;2;46;186m▀\x1B[0m\x1B[38;2;14;87;237m\x1B[48;2;30;89;233m▀\x1B[0m \x1B[38;2;0;113;255m\x1B[48;2;55;127;220m▀\x1B[0m\x1B[38;2;102;157;255m\x1B[48;2;4;62;207m▀\x1B[0m\x1B[38;2;29;106;247m\x1B[48;2;16;91;243m▀\x1B[0m\x1B[38;2;161;167;161m▀\x1B[0m\x1B[38;2;235;235;235m\x1B[48;2;156;164;175m▀\x1B[0m\x1B[38;2;165;177;197m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;0;14;57m\x1B[48;2;122;138;162m▀\x1B[0m    \x1B[38;2;47;53;66m▄\x1B[0m\x1B[38;2;89;97;113m\x1B[48;2;195;196;196m▀\x1B[0m\x1B[38;2;224;225;226m\x1B[48;2;240;245;255m▀\x1B[0m\x1B[38;2;232;241;252m\x1B[48;2;67;89;129m▀\x1B[0m\x1B[38;2;65;92;130m\x1B[48;2;0;21;48m▀\x1B[0m",
			"       \x1B[38;2;57;78;123m▀\x1B[0m\x1B[38;2;214;218;227m\x1B[48;2;132;138;153m▀\x1B[0m\x1B[38;2;194;201;214m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;40;70;129m\x1B[48;2;130;148;180m▀\x1B[0m \x1B[38;2;153;153;162m▀\x1B[0m\x1B[38;2;174;176;176m▀\x1B[0m\x1B[38;2;226;221;211m▀\x1B[0m   \x1B[38;2;32;41;69m\x1B[48;2;0;0;0m▀\x1B[0m\x1B[38;2;214;218;227m\x1B[48;2;102;112;133m▀\x1B[0m\x1B[38;2;234;239;247m\x1B[48;2;177;191;215m▀\x1B[0m\x1B[38;2;68;97;145m\x1B[48;2;35;57;102m▀\x1B[0m \x1B[38;2;0;0;24m▄\x1B[0m\x1B[38;2;68;71;85m\x1B[48;2;226;225;225m▀\x1B[0m\x1B[38;2;204;204;206m\x1B[48;2;230;235;243m▀\x1B[0m\x1B[38;2;251;254;255m\x1B[48;2;67;89;130m▀\x1B[0m\x1B[38;2;78;97;133m\x1B[48;2;0;0;31m▀\x1B[0m\x1B[38;2;0;0;19m▀\x1B[0m ",
			"        \x1B[38;2;70;90;117m▀\x1B[0m\x1B[38;2;201;206;215m\x1B[48;2;69;79;107m▀\x1B[0m\x1B[38;2;231;235;242m\x1B[48;2;219;226;238m▀\x1B[0m\x1B[38;2;200;205;212m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;218;214;214m\x1B[48;2;253;255;255m▀\x1B[0m\x1B[38;2;139;154;172m▄\x1B[0m  \x1B[38;2;212;215;222m▄\x1B[0m\x1B[38;2;92;94;102m\x1B[48;2;248;247;248m▀\x1B[0m\x1B[38;2;93;94;100m\x1B[48;2;246;249;255m▀\x1B[0m\x1B[38;2;95;97;106m\x1B[48;2;243;246;250m▀\x1B[0m\x1B[38;2;83;88;105m\x1B[48;2;241;243;245m▀\x1B[0m\x1B[38;2;105;107;115m\x1B[48;2;245;248;251m▀\x1B[0m\x1B[38;2;122;122;117m\x1B[48;2;247;250;255m▀\x1B[0m\x1B[38;2;167;167;168m\x1B[48;2;238;241;246m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;231;236;242m▀\x1B[0m\x1B[38;2;150;162;183m\x1B[48;2;238;240;244m▀\x1B[0m\x1B[38;2;102;103;107m\x1B[48;2;240;243;248m▀\x1B[0m\x1B[38;2;160;156;151m\x1B[48;2;240;247;255m▀\x1B[0m\x1B[38;2;100;102;111m\x1B[48;2;99;112;141m▀\x1B[0m ",
			"          \x1B[38;2;85;107;142m▀\x1B[0m\x1B[38;2;118;138;172m▀\x1B[0m\x1B[38;2;241;244;248m\x1B[48;2;153;163;183m▀\x1B[0m\x1B[38;2;230;233;234m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;38;50;79m\x1B[48;2;235;236;235m▀\x1B[0m\x1B[38;2;144;150;150m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;241;241;241m\x1B[48;2;215;221;235m▀\x1B[0m\x1B[38;2;205;213;225m\x1B[48;2;36;52;90m▀\x1B[0m\x1B[38;2;60;78;112m▀\x1B[0m\x1B[38;2;101;120;158m▀\x1B[0m\x1B[38;2;96;114;152m▀\x1B[0m\x1B[38;2;95;114;153m▀\x1B[0m\x1B[38;2;97;117;155m▀\x1B[0m\x1B[38;2;92;114;151m▀\x1B[0m\x1B[38;2;100;120;156m▀\x1B[0m\x1B[38;2;98;117;156m▀\x1B[0m\x1B[38;2;95;117;155m▀\x1B[0m\x1B[38;2;77;101;141m▀\x1B[0m\x1B[38;2;31;54;95m▀\x1B[0m ",
			"            \x1B[38;2;94;105;137m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;208;215;229m\x1B[48;2;182;194;217m▀\x1B[0m\x1B[38;2;248;249;251m\x1B[48;2;73;93;133m▀\x1B[0m\x1B[38;2;242;247;254m\x1B[48;2;95;115;151m▀\x1B[0m\x1B[38;2;114;129;161m\x1B[48;2;85;107;151m▀\x1B[0m             ",
			"            \x1B[38;2;193;189;184m\x1B[48;2;241;242;239m▀\x1B[0m\x1B[38;2;240;244;249m\x1B[48;2;242;244;247m▀\x1B[0m\x1B[38;2;38;62;103m\x1B[48;2;8;34;95m▀\x1B[0m\x1B[38;2;149;145;141m\x1B[48;2;255;251;237m▀\x1B[0m\x1B[38;2;176;188;207m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;116;129;146m▄\x1B[0m            ",
			"         \x1B[38;2;71;78;89m▄\x1B[0m\x1B[38;2;239;231;223m\x1B[48;2;215;216;218m▀\x1B[0m\x1B[38;2;217;224;237m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;236;239;242m\x1B[48;2;252;252;250m▀\x1B[0m\x1B[38;2;208;213;223m\x1B[48;2;145;162;195m▀\x1B[0m\x1B[38;2;0;4;66m\x1B[48;2;0;0;42m▀\x1B[0m\x1B[38;2;127;125;131m\x1B[48;2;142;140;146m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;255;255;252m▀\x1B[0m\x1B[38;2;174;189;215m\x1B[48;2;224;227;229m▀\x1B[0m\x1B[38;2;74;90;127m\x1B[48;2;249;251;251m▀\x1B[0m\x1B[38;2;50;54;68m\x1B[48;2;176;183;195m▀\x1B[0m          ",
			"         \x1B[38;2;182;186;201m\x1B[48;2;66;82;112m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;84;101;131m▀\x1B[0m\x1B[38;2;237;239;239m\x1B[48;2;74;92;122m▀\x1B[0m\x1B[38;2;198;208;226m\x1B[48;2;50;71;110m▀\x1B[0m\x1B[38;2;100;122;166m\x1B[48;2;21;38;75m▀\x1B[0m\x1B[38;2;0;0;40m▀\x1B[0m\x1B[38;2;91;112;148m▀\x1B[0m\x1B[38;2;225;230;239m\x1B[48;2;81;101;137m▀\x1B[0m\x1B[38;2;253;252;250m\x1B[48;2;85;103;136m▀\x1B[0m\x1B[38;2;255;253;250m\x1B[48;2;80;98;129m▀\x1B[0m\x1B[38;2;185;201;228m\x1B[48;2;59;83;125m▀\x1B[0m\x1B[38;2;47;71;128m\x1B[48;2;17;34;67m▀\x1B[0m         ",
			"                              ",
			"                              "
		],
		[
			"                              ",
			"                              ",
			"             \x1B[38;2;101;106;115m▄\x1B[0m\x1B[38;2;192;195;201m\x1B[48;2;250;250;252m▀\x1B[0m\x1B[38;2;212;214;218m\x1B[48;2;211;217;230m▀\x1B[0m\x1B[38;2;205;205;207m\x1B[48;2;193;200;212m▀\x1B[0m\x1B[38;2;205;207;211m\x1B[48;2;215;222;235m▀\x1B[0m\x1B[38;2;212;210;209m\x1B[48;2;200;205;215m▀\x1B[0m\x1B[38;2;167;176;194m\x1B[48;2;152;166;192m▀\x1B[0m\x1B[38;2;61;85;128m\x1B[48;2;58;81;118m▀\x1B[0m         ",
			"       \x1B[38;2;43;62;93m▄\x1B[0m   \x1B[38;2;0;0;0m▄\x1B[0m\x1B[38;2;17;24;42m\x1B[48;2;181;180;181m▀\x1B[0m\x1B[38;2;229;228;227m\x1B[48;2;253;255;255m▀\x1B[0m\x1B[38;2;181;192;214m\x1B[48;2;88;112;144m▀\x1B[0m\x1B[38;2;12;27;60m▀\x1B[0m\x1B[38;2;92;102;102m▄\x1B[0m\x1B[38;2;197;196;193m▄\x1B[0m\x1B[38;2;0;0;0m\x1B[48;2;223;219;213m▀\x1B[0m\x1B[38;2;224;220;214m▄\x1B[0m\x1B[38;2;207;205;204m▄\x1B[0m\x1B[38;2;0;0;7m\x1B[48;2;170;172;177m▀\x1B[0m\x1B[38;2;99;105;125m▄\x1B[0m       ",
			"     \x1B[38;2;155;163;174m▄\x1B[0m\x1B[38;2;194;196;200m\x1B[48;2;233;235;240m▀\x1B[0m\x1B[38;2;190;197;212m\x1B[48;2;237;240;247m▀\x1B[0m\x1B[38;2;0;17;76m\x1B[48;2;156;170;195m▀\x1B[0m \x1B[38;2;55;55;59m▄\x1B[0m\x1B[38;2;127;132;142m\x1B[48;2;242;242;238m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;180;189;212m▀\x1B[0m\x1B[38;2;133;153;183m\x1B[48;2;7;31;81m▀\x1B[0m\x1B[38;2;0;0;24m▀\x1B[0m \x1B[38;2;58;67;85m▀\x1B[0m\x1B[38;2;168;179;199m\x1B[48;2;0;0;0m▀\x1B[0m\x1B[38;2;173;182;200m\x1B[48;2;0;0;0m▀\x1B[0m\x1B[38;2;172;181;198m\x1B[48;2;7;7;7m▀\x1B[0m\x1B[38;2;167;176;193m▀\x1B[0m\x1B[38;2;247;248;249m\x1B[48;2;97;116;144m▀\x1B[0m\x1B[38;2;205;210;222m\x1B[48;2;245;245;240m▀\x1B[0m\x1B[38;2;69;91;127m\x1B[48;2;161;170;191m▀\x1B[0m      ",
			"\x1B[38;2;0;14;35m\x1B[48;2;173;185;201m▀\x1B[0m\x1B[38;2;163;168;177m▄\x1B[0m  \x1B[38;2;93;102;123m\x1B[48;2;237;237;236m▀\x1B[0m\x1B[38;2;247;247;247m\x1B[48;2;208;216;229m▀\x1B[0m\x1B[38;2;143;160;190m\x1B[48;2;17;42;88m▀\x1B[0m\x1B[38;2;144;154;173m\x1B[48;2;10;18;40m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;157;165;186m▀\x1B[0m\x1B[38;2;72;85;117m\x1B[48;2;248;248;249m▀\x1B[0m\x1B[38;2;166;166;166m\x1B[48;2;248;246;245m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;141;155;181m▀\x1B[0m\x1B[38;2;94;111;144m\x1B[48;2;0;6;75m▀\x1B[0m\x1B[38;2;111;152;222m▄\x1B[0m\x1B[38;2;66;133;249m▄\x1B[0m \x1B[38;2;25;114;238m▄\x1B[0m\x1B[38;2;119;171;250m▄\x1B[0m\x1B[38;2;0;82;237m▄\x1B[0m\x1B[38;2;255;255;250m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;255;255;255m▀\x1B[0m\x1B[38;2;255;255;247m\x1B[48;2;175;187;208m▀\x1B[0m\x1B[38;2;253;253;253m\x1B[48;2;122;137;167m▀\x1B[0m\x1B[38;2;134;147;171m\x1B[48;2;43;65;105m▀\x1B[0m\x1B[38;2;0;0;0m▀\x1B[0m  \x1B[38;2;90;102;119m▄\x1B[0m\x1B[38;2;0;12;48m\x1B[48;2;214;216;219m▀\x1B[0m\x1B[38;2;11;23;65m\x1B[48;2;122;138;165m▀\x1B[0m",
			"\x1B[38;2;158;177;209m\x1B[48;2;0;0;17m▀\x1B[0m\x1B[38;2;247;250;255m\x1B[48;2;181;187;199m▀\x1B[0m\x1B[38;2;130;148;171m\x1B[48;2;210;218;225m▀\x1B[0m\x1B[38;2;150;156;150m\x1B[48;2;214;217;224m▀\x1B[0m\x1B[38;2;253;255;255m\x1B[48;2;225;231;242m▀\x1B[0m\x1B[38;2;151;163;186m\x1B[48;2;19;42;84m▀\x1B[0m  \x1B[38;2;50;70;107m▀\x1B[0m\x1B[38;2;212;219;226m\x1B[48;2;84;101;128m▀\x1B[0m\x1B[38;2;255;255;255m▀\x1B[0m\x1B[38;2;76;83;108m\x1B[48;2;149;157;176m▀\x1B[0m\x1B[38;2;0;0;55m\x1B[48;2;0;27;80m▀\x1B[0m\x1B[38;2;116;161;238m\x1B[48;2;2;54;187m▀\x1B[0m\x1B[38;2;50;101;190m\x1B[48;2;10;68;203m▀\x1B[0m \x1B[38;2;17;131;255m\x1B[48;2;33;126;240m▀\x1B[0m\x1B[38;2;134;187;255m\x1B[48;2;4;78;234m▀\x1B[0m\x1B[38;2;4;98;255m\x1B[48;2;11;100;252m▀\x1B[0m\x1B[38;2;231;225;211m▀\x1B[0m\x1B[38;2;242;246;253m\x1B[48;2;222;227;234m▀\x1B[0m\x1B[38;2;76;95;137m\x1B[48;2;217;226;238m▀\x1B[0m\x1B[38;2;0;0;0m\x1B[48;2;27;48;84m▀\x1B[0m  \x1B[38;2;0;0;4m▄\x1B[0m\x1B[38;2;0;10;32m\x1B[48;2;166;170;176m▀\x1B[0m\x1B[38;2;210;210;214m\x1B[48;2;250;253;255m▀\x1B[0m\x1B[38;2;221;229;239m\x1B[48;2;71;97;133m▀\x1B[0m\x1B[38;2;53;72;110m\x1B[48;2;0;4;25m▀\x1B[0m",
			" \x1B[38;2;78;103;146m▀\x1B[0m\x1B[38;2;212;220;234m\x1B[48;2;76;88;113m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;117;132;164m▀\x1B[0m\x1B[38;2;151;163;185m\x1B[48;2;48;64;91m▀\x1B[0m     \x1B[38;2;160;173;198m\x1B[48;2;64;82;111m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;215;220;226m▀\x1B[0m\x1B[38;2;120;137;170m\x1B[48;2;200;208;223m▀\x1B[0m\x1B[38;2;0;45;132m▄\x1B[0m\x1B[38;2;177;188;210m▀\x1B[0m\x1B[38;2;153;153;151m\x1B[48;2;239;239;239m▀\x1B[0m\x1B[38;2;166;164;159m▀\x1B[0m   \x1B[38;2;81;90;110m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;127;142;167m▀\x1B[0m\x1B[38;2;187;199;215m\x1B[48;2;86;102;139m▀\x1B[0m\x1B[38;2;0;0;0m▄\x1B[0m\x1B[38;2;190;194;196m▄\x1B[0m\x1B[38;2;166;169;174m\x1B[48;2;252;253;255m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;113;129;160m▀\x1B[0m\x1B[38;2;140;156;182m\x1B[48;2;0;3;25m▀\x1B[0m  ",
			"           \x1B[38;2;139;151;170m\x1B[48;2;8;34;77m▀\x1B[0m\x1B[38;2;254;255;255m\x1B[48;2;137;148;169m▀\x1B[0m\x1B[38;2;159;165;177m\x1B[48;2;241;247;255m▀\x1B[0m\x1B[38;2;103;108;116m\x1B[48;2;249;251;255m▀\x1B[0m\x1B[38;2;113;125;148m▄\x1B[0m  \x1B[38;2;163;168;181m▄\x1B[0m\x1B[38;2;168;171;175m\x1B[48;2;251;252;254m▀\x1B[0m\x1B[38;2;184;183;182m\x1B[48;2;230;238;251m▀\x1B[0m\x1B[38;2;119;123;129m\x1B[48;2;227;234;243m▀\x1B[0m\x1B[38;2;111;116;128m\x1B[48;2;227;234;244m▀\x1B[0m\x1B[38;2;151;151;151m\x1B[48;2;227;235;247m▀\x1B[0m\x1B[38;2;246;243;239m\x1B[48;2;211;219;231m▀\x1B[0m\x1B[38;2;227;231;237m\x1B[48;2;206;214;226m▀\x1B[0m\x1B[38;2;172;177;187m\x1B[48;2;212;219;231m▀\x1B[0m\x1B[38;2;255;250;240m\x1B[48;2;219;228;245m▀\x1B[0m\x1B[38;2;130;134;139m\x1B[48;2;102;120;154m▀\x1B[0m ",
			"            \x1B[38;2;26;42;69m▀\x1B[0m\x1B[38;2;40;61;100m▀\x1B[0m\x1B[38;2;223;228;237m\x1B[48;2;90;102;121m▀\x1B[0m\x1B[38;2;235;238;241m\x1B[48;2;245;247;248m▀\x1B[0m\x1B[38;2;57;72;104m\x1B[48;2;225;226;226m▀\x1B[0m\x1B[38;2;183;181;181m\x1B[48;2;247;246;244m▀\x1B[0m\x1B[38;2;250;251;252m\x1B[48;2;171;183;199m▀\x1B[0m\x1B[38;2;119;134;163m\x1B[48;2;0;2;36m▀\x1B[0m\x1B[38;2;28;46;80m▀\x1B[0m\x1B[38;2;45;64;95m▀\x1B[0m\x1B[38;2;58;81;114m▀\x1B[0m\x1B[38;2;66;85;127m▀\x1B[0m\x1B[38;2;96;119;166m▀\x1B[0m\x1B[38;2;50;69;109m▀\x1B[0m\x1B[38;2;46;71;121m▀\x1B[0m\x1B[38;2;45;76;133m▀\x1B[0m\x1B[38;2;21;43;86m▀\x1B[0m ",
			"              \x1B[38;2;38;54;77m▀\x1B[0m\x1B[38;2;164;178;201m\x1B[48;2;211;217;227m▀\x1B[0m\x1B[38;2;218;223;233m\x1B[48;2;56;74;106m▀\x1B[0m\x1B[38;2;163;178;209m\x1B[48;2;131;146;176m▀\x1B[0m\x1B[38;2;46;70;122m\x1B[48;2;104;125;166m▀\x1B[0m           ",
			"              \x1B[38;2;164;164;167m\x1B[48;2;212;222;235m▀\x1B[0m\x1B[38;2;231;234;240m\x1B[48;2;239;240;242m▀\x1B[0m\x1B[38;2;45;65;102m\x1B[48;2;0;0;39m▀\x1B[0m\x1B[38;2;255;255;255m▀\x1B[0m\x1B[38;2;170;179;190m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;135;156;189m▄\x1B[0m          ",
			"           \x1B[38;2;121;121;128m▄\x1B[0m\x1B[38;2;133;133;136m\x1B[48;2;238;238;240m▀\x1B[0m\x1B[38;2;215;217;221m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;226;229;236m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;174;185;208m\x1B[48;2;140;159;198m▀\x1B[0m\x1B[38;2;0;0;48m\x1B[48;2;0;0;45m▀\x1B[0m\x1B[38;2;241;239;239m\x1B[48;2;143;158;189m▀\x1B[0m\x1B[38;2;234;238;246m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;167;180;203m\x1B[48;2;255;255;252m▀\x1B[0m\x1B[38;2;142;148;157m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;48;48;41m\x1B[48;2;103;117;147m▀\x1B[0m\x1B[38;2;0;0;31m▄\x1B[0m       ",
			"           \x1B[38;2;77;86;107m▀\x1B[0m\x1B[38;2;136;150;179m▀\x1B[0m\x1B[38;2;126;138;163m▀\x1B[0m\x1B[38;2;112;127;159m▀\x1B[0m\x1B[38;2;44;67;109m▀\x1B[0m\x1B[38;2;0;0;0m▀\x1B[0m\x1B[38;2;68;82;109m▀\x1B[0m\x1B[38;2;124;138;167m▀\x1B[0m\x1B[38;2;124;137;166m▀\x1B[0m\x1B[38;2;118;131;162m▀\x1B[0m\x1B[38;2;57;80;124m▀\x1B[0m\x1B[38;2;0;13;55m▀\x1B[0m       ",
			"                              ",
			"                              "
		],
		[
			"                              ",
			"            \x1B[38;2;162;164;167m▄\x1B[0m\x1B[38;2;199;200;205m▄\x1B[0m\x1B[38;2;196;196;202m▄\x1B[0m\x1B[38;2;196;196;196m▄\x1B[0m\x1B[38;2;194;193;192m▄\x1B[0m\x1B[38;2;200;200;203m▄\x1B[0m\x1B[38;2;185;186;194m▄\x1B[0m\x1B[38;2;72;91;130m▄\x1B[0m          ",
			"           \x1B[38;2;168;176;188m▄\x1B[0m\x1B[38;2;212;215;218m\x1B[48;2;253;254;254m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;137;153;183m▀\x1B[0m\x1B[38;2;222;230;241m\x1B[48;2;10;32;80m▀\x1B[0m\x1B[38;2;219;226;237m▀\x1B[0m\x1B[38;2;226;233;243m▀\x1B[0m\x1B[38;2;227;234;243m▀\x1B[0m\x1B[38;2;203;215;235m▀\x1B[0m\x1B[38;2;80;102;146m▀\x1B[0m          ",
			"   \x1B[38;2;132;132;140m▄\x1B[0m\x1B[38;2;148;154;163m▄\x1B[0m\x1B[38;2;31;40;62m▄\x1B[0m   \x1B[38;2;82;82;86m▄\x1B[0m\x1B[38;2;150;154;164m\x1B[48;2;201;202;206m▀\x1B[0m\x1B[38;2;238;238;239m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;207;217;235m\x1B[48;2;117;137;169m▀\x1B[0m\x1B[38;2;22;39;75m▀\x1B[0m\x1B[38;2;0;0;0m▀\x1B[0m\x1B[38;2;126;130;141m▄\x1B[0m\x1B[38;2;157;157;155m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;132;131;136m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;136;135;138m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;131;131;137m\x1B[48;2;253;253;255m▀\x1B[0m\x1B[38;2;157;157;162m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;107;114;125m\x1B[48;2;238;239;241m▀\x1B[0m\x1B[38;2;78;93;122m▄\x1B[0m       ",
			" \x1B[38;2;0;0;0m▄\x1B[0m\x1B[38;2;186;187;188m▄\x1B[0m\x1B[38;2;193;197;204m\x1B[48;2;236;240;246m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;190;200;217m▀\x1B[0m\x1B[38;2;123;137;159m\x1B[48;2;253;255;255m▀\x1B[0m\x1B[38;2;4;25;56m\x1B[48;2;114;126;149m▀\x1B[0m \x1B[38;2;9;13;18m\x1B[48;2;113;121;136m▀\x1B[0m\x1B[38;2;157;161;171m\x1B[48;2;255;255;253m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;186;196;214m▀\x1B[0m\x1B[38;2;133;154;186m\x1B[48;2;20;41;95m▀\x1B[0m   \x1B[38;2;68;85;112m▀\x1B[0m\x1B[38;2;138;157;191m▀\x1B[0m\x1B[38;2;150;165;196m▀\x1B[0m\x1B[38;2;151;165;194m▀\x1B[0m\x1B[38;2;132;149;181m▀\x1B[0m\x1B[38;2;166;181;205m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;181;193;202m▀\x1B[0m\x1B[38;2;176;186;206m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;47;66;107m\x1B[48;2;118;128;157m▀\x1B[0m      ",
			"\x1B[38;2;183;180;180m▄\x1B[0m\x1B[38;2;119;123;131m\x1B[48;2;252;250;248m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;212;221;235m▀\x1B[0m\x1B[38;2;156;169;193m\x1B[48;2;38;60;92m▀\x1B[0m\x1B[38;2;75;97;139m▀\x1B[0m\x1B[38;2;237;240;245m\x1B[48;2;116;128;152m▀\x1B[0m\x1B[38;2;224;226;231m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;20;32;57m\x1B[48;2;234;232;232m▀\x1B[0m\x1B[38;2;223;222;219m\x1B[48;2;251;249;246m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;126;144;179m▀\x1B[0m\x1B[38;2;92;111;143m\x1B[48;2;0;0;36m▀\x1B[0m\x1B[38;2;0;0;0m\x1B[48;2;99;149;206m▀\x1B[0m\x1B[38;2;94;149;230m▄\x1B[0m  \x1B[38;2;68;143;220m▄\x1B[0m\x1B[38;2;6;6;43m\x1B[48;2;119;171;254m▀\x1B[0m\x1B[38;2;0;70;233m▄\x1B[0m\x1B[38;2;211;217;223m\x1B[48;2;255;249;207m▀\x1B[0m\x1B[38;2;236;236;237m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;226;231;242m▀\x1B[0m\x1B[38;2;249;248;238m\x1B[48;2;191;203;226m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;128;148;180m▀\x1B[0m\x1B[38;2;94;110;147m\x1B[48;2;40;62;111m▀\x1B[0m      ",
			"\x1B[38;2;172;176;181m\x1B[48;2;54;71;101m▀\x1B[0m\x1B[38;2;227;238;255m\x1B[48;2;45;66;102m▀\x1B[0m\x1B[38;2;59;86;130m\x1B[48;2;13;27;41m▀\x1B[0m  \x1B[38;2;4;12;43m▀\x1B[0m\x1B[38;2;147;161;187m\x1B[48;2;0;18;60m▀\x1B[0m\x1B[38;2;255;255;253m\x1B[48;2;199;212;231m▀\x1B[0m\x1B[38;2;244;246;250m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;89;106;146m\x1B[48;2;109;124;159m▀\x1B[0m \x1B[38;2;104;154;206m\x1B[48;2;9;59;182m▀\x1B[0m\x1B[38;2;126;166;242m\x1B[48;2;1;60;219m▀\x1B[0m\x1B[38;2;0;62;255m\x1B[48;2;6;91;248m▀\x1B[0m \x1B[38;2;76;178;250m\x1B[48;2;0;98;236m▀\x1B[0m\x1B[38;2;179;214;255m\x1B[48;2;2;71;240m▀\x1B[0m\x1B[38;2;0;92;255m\x1B[48;2;12;89;249m▀\x1B[0m\x1B[38;2;255;233;189m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;169;176;192m▀\x1B[0m\x1B[38;2;168;180;200m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;8;30;76m\x1B[48;2;110;127;154m▀\x1B[0m\x1B[38;2;28;57;110m▀\x1B[0m    \x1B[38;2;159;159;162m▄\x1B[0m\x1B[38;2;4;12;38m\x1B[48;2;205;211;223m▀\x1B[0m\x1B[38;2;44;57;88m▄\x1B[0m",
			"       \x1B[38;2;124;142;164m▀\x1B[0m\x1B[38;2;199;203;210m\x1B[48;2;108;122;143m▀\x1B[0m\x1B[38;2;192;199;215m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;83;94;121m\x1B[48;2;153;165;184m▀\x1B[0m\x1B[38;2;0;53;239m\x1B[48;2;0;0;0m▀\x1B[0m\x1B[38;2;8;69;211m▀\x1B[0m\x1B[38;2;236;236;236m\x1B[48;2;196;204;204m▀\x1B[0m\x1B[38;2;231;223;204m\x1B[48;2;142;142;144m▀\x1B[0m\x1B[38;2;127;151;204m\x1B[48;2;114;110;107m▀\x1B[0m\x1B[38;2;0;64;235m▀\x1B[0m\x1B[38;2;20;72;187m▀\x1B[0m \x1B[38;2;135;153;178m▀\x1B[0m\x1B[38;2;252;253;252m\x1B[48;2;155;167;186m▀\x1B[0m\x1B[38;2;206;218;234m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;0;6;49m\x1B[48;2;70;89;123m▀\x1B[0m  \x1B[38;2;110;116;123m▄\x1B[0m\x1B[38;2;120;125;135m\x1B[48;2;250;249;247m▀\x1B[0m\x1B[38;2;255;254;253m\x1B[48;2;203;217;233m▀\x1B[0m\x1B[38;2;193;206;225m\x1B[48;2;41;72;117m▀\x1B[0m\x1B[38;2;20;37;78m▀\x1B[0m",
			"        \x1B[38;2;60;83;117m▀\x1B[0m\x1B[38;2;202;213;226m\x1B[48;2;51;63;87m▀\x1B[0m\x1B[38;2;236;237;240m\x1B[48;2;229;232;236m▀\x1B[0m\x1B[38;2;26;44;96m\x1B[48;2;204;206;207m▀\x1B[0m\x1B[38;2;157;157;158m▄\x1B[0m\x1B[38;2;94;101;118m▄\x1B[0m   \x1B[38;2;171;182;188m▄\x1B[0m\x1B[38;2;6;12;36m\x1B[48;2;218;220;222m▀\x1B[0m\x1B[38;2;0;0;0m\x1B[48;2;232;231;231m▀\x1B[0m\x1B[38;2;67;90;124m\x1B[48;2;199;203;208m▀\x1B[0m\x1B[38;2;95;117;157m\x1B[48;2;44;55;75m▀\x1B[0m\x1B[38;2;39;56;95m▀\x1B[0m\x1B[38;2;102;111;123m▄\x1B[0m\x1B[38;2;85;95;112m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;244;242;240m\x1B[48;2;193;204;225m▀\x1B[0m\x1B[38;2;206;217;235m\x1B[48;2;52;74;121m▀\x1B[0m\x1B[38;2;43;70;115m▀\x1B[0m\x1B[38;2;23;30;30m▀\x1B[0m ",
			"          \x1B[38;2;167;180;200m\x1B[48;2;102;127;168m▀\x1B[0m\x1B[38;2;226;234;252m\x1B[48;2;38;69;130m▀\x1B[0m\x1B[38;2;249;251;255m\x1B[48;2;167;183;209m▀\x1B[0m\x1B[38;2;234;238;244m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;71;86;119m\x1B[48;2;197;201;209m▀\x1B[0m\x1B[38;2;29;42;71m▄\x1B[0m\x1B[38;2;102;112;132m\x1B[48;2;231;232;232m▀\x1B[0m\x1B[38;2;236;236;236m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;230;236;244m\x1B[48;2;125;140;163m▀\x1B[0m\x1B[38;2;151;169;198m\x1B[48;2;0;0;9m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;99;122;154m▀\x1B[0m\x1B[38;2;234;235;233m\x1B[48;2;211;218;229m▀\x1B[0m\x1B[38;2;251;248;243m\x1B[48;2;221;227;238m▀\x1B[0m\x1B[38;2;249;248;245m\x1B[48;2;216;221;232m▀\x1B[0m\x1B[38;2;255;255;252m\x1B[48;2;208;214;225m▀\x1B[0m\x1B[38;2;220;223;228m\x1B[48;2;218;223;232m▀\x1B[0m\x1B[38;2;243;242;237m\x1B[48;2;226;232;242m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;226;232;240m▀\x1B[0m\x1B[38;2;251;255;255m\x1B[48;2;213;224;244m▀\x1B[0m\x1B[38;2;72;89;113m\x1B[48;2;62;77;108m▀\x1B[0m",
			"            \x1B[38;2;12;48;103m▀\x1B[0m\x1B[38;2;187;195;210m\x1B[48;2;128;150;187m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;219;225;240m▀\x1B[0m\x1B[38;2;218;218;218m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;252;251;246m\x1B[48;2;179;190;212m▀\x1B[0m\x1B[38;2;157;175;205m\x1B[48;2;33;55;103m▀\x1B[0m   \x1B[38;2;51;87;153m▀\x1B[0m\x1B[38;2;36;65;138m▀\x1B[0m\x1B[38;2;49;85;148m▀\x1B[0m\x1B[38;2;62;96;151m▀\x1B[0m\x1B[38;2;48;82;144m▀\x1B[0m\x1B[38;2;51;87;153m▀\x1B[0m\x1B[38;2;45;82;157m▀\x1B[0m\x1B[38;2;30;67;142m▀\x1B[0m ",
			"             \x1B[38;2;197;205;221m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;146;164;199m\x1B[48;2;180;189;205m▀\x1B[0m\x1B[38;2;67;83;113m▀\x1B[0m\x1B[38;2;128;144;180m\x1B[48;2;237;234;237m▀\x1B[0m\x1B[38;2;55;72;114m\x1B[48;2;128;139;160m▀\x1B[0m            ",
			"           \x1B[38;2;245;245;245m▄\x1B[0m\x1B[38;2;214;214;214m\x1B[48;2;236;238;242m▀\x1B[0m\x1B[38;2;255;255;255m▀\x1B[0m\x1B[38;2;167;173;183m\x1B[48;2;133;144;167m▀\x1B[0m \x1B[38;2;252;251;250m\x1B[48;2;253;251;248m▀\x1B[0m\x1B[38;2;241;244;246m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;135;151;177m\x1B[48;2;161;177;210m▀\x1B[0m\x1B[38;2;121;138;171m▄\x1B[0m          ",
			"         \x1B[38;2;35;41;47m\x1B[48;2;147;153;167m▀\x1B[0m\x1B[38;2;208;211;214m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;253;252;250m▀\x1B[0m\x1B[38;2;245;244;242m\x1B[48;2;242;243;243m▀\x1B[0m\x1B[38;2;236;240;241m\x1B[48;2;198;209;229m▀\x1B[0m\x1B[38;2;90;111;151m\x1B[48;2;85;104;147m▀\x1B[0m \x1B[38;2;239;240;242m\x1B[48;2;131;150;192m▀\x1B[0m\x1B[38;2;236;238;238m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;218;221;227m\x1B[48;2;253;253;251m▀\x1B[0m\x1B[38;2;242;245;247m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;118;128;142m\x1B[48;2;182;194;220m▀\x1B[0m\x1B[38;2;37;57;97m▄\x1B[0m        ",
			"         \x1B[38;2;96;112;140m▀\x1B[0m\x1B[38;2;121;135;162m▀\x1B[0m\x1B[38;2;112;126;154m▀\x1B[0m\x1B[38;2;110;126;158m▀\x1B[0m\x1B[38;2;50;70;111m▀\x1B[0m\x1B[38;2;27;44;81m▀\x1B[0m \x1B[38;2;75;89;116m▀\x1B[0m\x1B[38;2;120;135;166m▀\x1B[0m\x1B[38;2;113;128;157m▀\x1B[0m\x1B[38;2;116;134;166m▀\x1B[0m\x1B[38;2;77;100;146m▀\x1B[0m\x1B[38;2;23;50;90m▀\x1B[0m        ",
			"                              "
		],
		[
			"                              ",
			"            \x1B[38;2;156;161;171m\x1B[48;2;206;206;210m▀\x1B[0m\x1B[38;2;159;163;175m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;160;158;166m\x1B[48;2;230;237;249m▀\x1B[0m\x1B[38;2;159;158;167m\x1B[48;2;225;232;243m▀\x1B[0m\x1B[38;2;160;159;166m\x1B[48;2;224;230;243m▀\x1B[0m\x1B[38;2;158;156;161m\x1B[48;2;232;238;248m▀\x1B[0m\x1B[38;2;155;158;169m\x1B[48;2;221;230;249m▀\x1B[0m\x1B[38;2;86;104;140m\x1B[48;2;104;124;167m▀\x1B[0m          ",
			"          \x1B[38;2;63;67;75m▄\x1B[0m\x1B[38;2;109;114;124m\x1B[48;2;215;215;215m▀\x1B[0m\x1B[38;2;254;252;251m\x1B[48;2;218;226;241m▀\x1B[0m\x1B[38;2;165;176;196m\x1B[48;2;47;66;100m▀\x1B[0m\x1B[38;2;44;68;112m▀\x1B[0m\x1B[38;2;85;115;176m▀\x1B[0m\x1B[38;2;56;90;157m\x1B[48;2;71;73;78m▀\x1B[0m\x1B[38;2;73;108;170m\x1B[48;2;73;76;85m▀\x1B[0m\x1B[38;2;46;81;148m\x1B[48;2;73;73;85m▀\x1B[0m\x1B[38;2;31;62;130m\x1B[48;2;74;78;88m▀\x1B[0m\x1B[38;2;70;74;86m▄\x1B[0m\x1B[38;2;75;79;97m▄\x1B[0m        ",
			"  \x1B[38;2;0;0;4m▄\x1B[0m\x1B[38;2;138;138;148m\x1B[48;2;175;177;183m▀\x1B[0m\x1B[38;2;111;124;151m\x1B[48;2;246;249;251m▀\x1B[0m\x1B[38;2;73;92;123m▄\x1B[0m   \x1B[38;2;178;185;195m▄\x1B[0m\x1B[38;2;216;216;219m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;165;182;204m▀\x1B[0m\x1B[38;2;98;113;143m\x1B[48;2;18;35;59m▀\x1B[0m\x1B[38;2;0;0;0m▀\x1B[0m \x1B[38;2;121;125;137m\x1B[48;2;72;83;101m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;166;181;204m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;163;176;202m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;170;183;207m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;165;178;202m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;187;197;218m▀\x1B[0m\x1B[38;2;245;244;245m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;69;77;92m\x1B[48;2;179;186;200m▀\x1B[0m\x1B[38;2;57;73;107m▄\x1B[0m      ",
			" \x1B[38;2;77;86;99m▄\x1B[0m\x1B[38;2;188;190;195m\x1B[48;2;249;249;250m▀\x1B[0m\x1B[38;2;242;244;249m\x1B[48;2;204;213;225m▀\x1B[0m\x1B[38;2;234;235;242m\x1B[48;2;124;140;175m▀\x1B[0m\x1B[38;2;216;226;238m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;83;99;127m\x1B[48;2;169;178;198m▀\x1B[0m \x1B[38;2;133;151;179m\x1B[48;2;255;255;251m▀\x1B[0m\x1B[38;2;242;245;247m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;209;215;227m\x1B[48;2;115;136;171m▀\x1B[0m\x1B[38;2;66;95;144m\x1B[48;2;0;5;65m▀\x1B[0m       \x1B[38;2;244;244;244m▄\x1B[0m\x1B[38;2;246;238;230m▄\x1B[0m\x1B[38;2;159;168;181m\x1B[48;2;218;215;208m▀\x1B[0m\x1B[38;2;255;255;255m▀\x1B[0m\x1B[38;2;154;164;186m\x1B[48;2;160;171;195m▀\x1B[0m\x1B[38;2;0;4;46m\x1B[48;2;0;0;42m▀\x1B[0m     ",
			"\x1B[38;2;35;45;50m\x1B[48;2;104;108;118m▀\x1B[0m\x1B[38;2;232;233;230m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;234;240;252m\x1B[48;2;81;102;141m▀\x1B[0m\x1B[38;2;82;111;157m\x1B[48;2;0;3;32m▀\x1B[0m\x1B[38;2;35;52;85m▀\x1B[0m\x1B[38;2;202;208;220m\x1B[48;2;3;17;47m▀\x1B[0m\x1B[38;2;243;242;239m\x1B[48;2;211;217;228m▀\x1B[0m\x1B[38;2;193;196;198m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;255;255;250m\x1B[48;2;221;226;236m▀\x1B[0m\x1B[38;2;178;190;210m\x1B[48;2;57;75;109m▀\x1B[0m\x1B[38;2;23;39;65m\x1B[48;2;0;0;0m▀\x1B[0m\x1B[38;2;31;73;134m\x1B[48;2;128;167;213m▀\x1B[0m\x1B[38;2;37;85;157m\x1B[48;2;179;215;255m▀\x1B[0m\x1B[38;2;0;64;219m▄\x1B[0m \x1B[38;2;7;82;176m\x1B[48;2;12;119;250m▀\x1B[0m\x1B[38;2;35;94;183m\x1B[48;2;175;219;255m▀\x1B[0m\x1B[38;2;0;66;203m\x1B[48;2;12;93;248m▀\x1B[0m \x1B[38;2;254;255;255m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;252;251;252m\x1B[48;2;200;206;218m▀\x1B[0m\x1B[38;2;244;246;250m\x1B[48;2;46;67;110m▀\x1B[0m\x1B[38;2;207;217;233m\x1B[48;2;35;50;80m▀\x1B[0m\x1B[38;2;86;106;138m\x1B[48;2;0;0;11m▀\x1B[0m      ",
			"\x1B[38;2;49;61;85m▀\x1B[0m\x1B[38;2;92;114;152m\x1B[48;2;0;0;4m▀\x1B[0m\x1B[38;2;16;39;78m▀\x1B[0m   \x1B[38;2;117;133;160m\x1B[48;2;0;0;0m▀\x1B[0m\x1B[38;2;232;235;239m\x1B[48;2;146;149;155m▀\x1B[0m\x1B[38;2;240;240;243m\x1B[48;2;255;255;254m▀\x1B[0m\x1B[38;2;104;117;158m\x1B[48;2;178;186;211m▀\x1B[0m\x1B[38;2;0;0;33m\x1B[48;2;0;0;35m▀\x1B[0m\x1B[38;2;20;78;181m\x1B[48;2;3;49;158m▀\x1B[0m\x1B[38;2;26;77;219m\x1B[48;2;3;57;194m▀\x1B[0m\x1B[38;2;0;87;240m\x1B[48;2;61;94;170m▀\x1B[0m \x1B[38;2;0;106;251m\x1B[48;2;48;111;214m▀\x1B[0m\x1B[38;2;26;88;224m\x1B[48;2;2;68;222m▀\x1B[0m\x1B[38;2;7;90;253m\x1B[48;2;14;72;192m▀\x1B[0m \x1B[38;2;190;197;203m\x1B[48;2;125;137;151m▀\x1B[0m\x1B[38;2;235;239;243m\x1B[48;2;251;253;255m▀\x1B[0m\x1B[38;2;50;63;92m\x1B[48;2;162;180;209m▀\x1B[0m     \x1B[38;2;33;41;58m▄\x1B[0m\x1B[38;2;27;37;56m▄\x1B[0m\x1B[38;2;10;15;42m▄\x1B[0m",
			"        \x1B[38;2;175;185;207m\x1B[48;2;113;126;142m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;248;250;254m▀\x1B[0m\x1B[38;2;99;120;153m\x1B[48;2;200;207;217m▀\x1B[0m\x1B[38;2;62;78;101m▄\x1B[0m \x1B[38;2;215;208;202m▀\x1B[0m\x1B[38;2;155;158;158m\x1B[48;2;62;67;67m▀\x1B[0m\x1B[38;2;149;145;138m▀\x1B[0m    \x1B[38;2;217;221;229m\x1B[48;2;106;124;144m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;218;230;249m▀\x1B[0m\x1B[38;2;120;133;158m\x1B[48;2;113;127;164m▀\x1B[0m\x1B[38;2;0;0;23m▄\x1B[0m \x1B[38;2;32;32;40m▄\x1B[0m\x1B[38;2;26;36;57m\x1B[48;2;195;196;199m▀\x1B[0m\x1B[38;2;230;229;227m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;230;238;253m\x1B[48;2;132;151;183m▀\x1B[0m\x1B[38;2;32;49;91m\x1B[48;2;24;44;82m▀\x1B[0m",
			"         \x1B[38;2;137;142;153m\x1B[48;2;0;0;9m▀\x1B[0m\x1B[38;2;248;250;254m\x1B[48;2;192;195;204m▀\x1B[0m\x1B[38;2;119;136;157m\x1B[48;2;253;253;252m▀\x1B[0m\x1B[38;2;18;22;25m\x1B[48;2;240;239;237m▀\x1B[0m\x1B[38;2;28;28;35m\x1B[48;2;151;156;170m▀\x1B[0m\x1B[38;2;0;0;52m▄\x1B[0m  \x1B[38;2;150;164;175m▄\x1B[0m\x1B[38;2;211;216;211m\x1B[48;2;221;224;226m▀\x1B[0m\x1B[38;2;255;255;255m▀\x1B[0m\x1B[38;2;86;96;114m\x1B[48;2;227;232;237m▀\x1B[0m\x1B[38;2;20;44;81m\x1B[48;2;91;108;132m▀\x1B[0m\x1B[38;2;24;45;85m▀\x1B[0m\x1B[38;2;50;55;65m▄\x1B[0m\x1B[38;2;46;59;75m\x1B[48;2;209;212;215m▀\x1B[0m\x1B[38;2;195;196;198m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;244;249;255m\x1B[48;2;96;115;151m▀\x1B[0m\x1B[38;2;113;134;172m\x1B[48;2;0;8;63m▀\x1B[0m\x1B[38;2;0;10;53m▀\x1B[0m ",
			"          \x1B[38;2;131;145;171m▀\x1B[0m\x1B[38;2;142;158;193m▀\x1B[0m\x1B[38;2;230;235;244m\x1B[48;2;120;141;185m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;234;237;242m▀\x1B[0m\x1B[38;2;176;184;197m\x1B[48;2;245;246;245m▀\x1B[0m\x1B[38;2;130;139;157m▄\x1B[0m\x1B[38;2;113;120;134m\x1B[48;2;201;201;203m▀\x1B[0m\x1B[38;2;231;233;234m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;238;241;248m\x1B[48;2;93;110;137m▀\x1B[0m\x1B[38;2;135;149;179m\x1B[48;2;0;0;0m▀\x1B[0m\x1B[38;2;242;245;250m\x1B[48;2;97;110;142m▀\x1B[0m\x1B[38;2;237;241;246m\x1B[48;2;226;231;238m▀\x1B[0m\x1B[38;2;75;86;108m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;179;184;190m\x1B[48;2;255;255;253m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;253;254;253m▀\x1B[0m\x1B[38;2;137;153;184m\x1B[48;2;252;252;248m▀\x1B[0m\x1B[38;2;36;50;75m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;255;255;252m▄\x1B[0m\x1B[38;2;246;249;252m▄\x1B[0m\x1B[38;2;50;66;96m▄\x1B[0m",
			"             \x1B[38;2;136;147;176m\x1B[48;2;85;94;118m▀\x1B[0m\x1B[38;2;251;252;252m\x1B[48;2;178;191;216m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;201;209;220m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;186;198;219m▀\x1B[0m\x1B[38;2;164;179;204m\x1B[48;2;61;83;128m▀\x1B[0m\x1B[38;2;0;20;60m▀\x1B[0m  \x1B[38;2;152;172;201m▀\x1B[0m\x1B[38;2;185;195;213m▀\x1B[0m\x1B[38;2;181;192;211m▀\x1B[0m\x1B[38;2;185;196;216m▀\x1B[0m\x1B[38;2;186;196;214m▀\x1B[0m\x1B[38;2;176;188;208m▀\x1B[0m\x1B[38;2;188;197;214m▀\x1B[0m\x1B[38;2;165;180;207m▀\x1B[0m\x1B[38;2;33;53;90m▀\x1B[0m",
			"             \x1B[38;2;131;134;141m\x1B[48;2;184;184;186m▀\x1B[0m\x1B[38;2;183;194;215m\x1B[48;2;189;196;211m▀\x1B[0m\x1B[38;2;0;0;39m▀\x1B[0m\x1B[38;2;133;144;167m\x1B[48;2;204;205;204m▀\x1B[0m\x1B[38;2;140;161;193m\x1B[48;2;181;191;207m▀\x1B[0m\x1B[38;2;0;0;28m▄\x1B[0m           ",
			"          \x1B[38;2;50;59;72m▄\x1B[0m\x1B[38;2;222;222;224m▄\x1B[0m\x1B[38;2;145;155;171m\x1B[48;2;217;223;235m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;242;243;243m▀\x1B[0m\x1B[38;2;181;190;204m\x1B[48;2;130;145;174m▀\x1B[0m \x1B[38;2;184;188;189m\x1B[48;2;194;197;196m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;243;244;246m▀\x1B[0m\x1B[38;2;140;147;163m\x1B[48;2;120;138;171m▀\x1B[0m\x1B[38;2;123;137;158m▄\x1B[0m\x1B[38;2;62;68;89m▄\x1B[0m         ",
			"         \x1B[38;2;57;57;74m\x1B[48;2;133;139;154m▀\x1B[0m\x1B[38;2;184;184;185m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;241;242;242m▀\x1B[0m\x1B[38;2;244;243;242m\x1B[48;2;240;242;245m▀\x1B[0m\x1B[38;2;230;232;236m\x1B[48;2;175;188;215m▀\x1B[0m\x1B[38;2;71;93;139m\x1B[48;2;59;79;125m▀\x1B[0m \x1B[38;2;162;170;188m\x1B[48;2;100;121;161m▀\x1B[0m\x1B[38;2;249;250;250m\x1B[48;2;246;249;255m▀\x1B[0m\x1B[38;2;230;231;233m\x1B[48;2;240;241;242m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;245;245;244m▀\x1B[0m\x1B[38;2;173;179;188m\x1B[48;2;208;217;238m▀\x1B[0m\x1B[38;2;19;34;68m\x1B[48;2;64;86;132m▀\x1B[0m        ",
			"         \x1B[38;2;64;79;99m▀\x1B[0m\x1B[38;2;95;111;142m▀\x1B[0m\x1B[38;2;85;99;130m▀\x1B[0m\x1B[38;2;81;97;128m▀\x1B[0m\x1B[38;2;47;69;110m▀\x1B[0m\x1B[38;2;19;34;66m▀\x1B[0m \x1B[38;2;82;101;120m▀\x1B[0m\x1B[38;2;85;103;139m▀\x1B[0m\x1B[38;2;82;98;132m▀\x1B[0m\x1B[38;2;82;101;137m▀\x1B[0m\x1B[38;2;65;88;130m▀\x1B[0m\x1B[38;2;27;49;90m▀\x1B[0m        ",
			"                              "
		],
		[
			"                              ",
			"            \x1B[38;2;121;123;133m▄\x1B[0m\x1B[38;2;117;120;132m▄\x1B[0m\x1B[38;2;112;113;123m▄\x1B[0m\x1B[38;2;113;112;118m▄\x1B[0m\x1B[38;2;113;113;120m▄\x1B[0m\x1B[38;2;117;116;124m▄\x1B[0m\x1B[38;2;94;97;112m▄\x1B[0m           ",
			"           \x1B[38;2;162;164;174m▄\x1B[0m\x1B[38;2;216;219;221m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;142;155;182m▀\x1B[0m\x1B[38;2;253;253;253m\x1B[48;2;91;114;158m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;112;137;182m▀\x1B[0m\x1B[38;2;252;253;253m\x1B[48;2;115;139;192m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;108;132;177m▀\x1B[0m\x1B[38;2;205;215;235m\x1B[48;2;79;109;162m▀\x1B[0m\x1B[38;2;33;59;104m▀\x1B[0m          ",
			"   \x1B[38;2;96;99;103m▄\x1B[0m\x1B[38;2;123;131;149m▄\x1B[0m\x1B[38;2;7;14;42m▄\x1B[0m   \x1B[38;2;28;46;75m▄\x1B[0m\x1B[38;2;90;93;112m\x1B[48;2;219;220;225m▀\x1B[0m\x1B[38;2;238;238;239m\x1B[48;2;247;251;255m▀\x1B[0m\x1B[38;2;167;178;203m\x1B[48;2;75;93;132m▀\x1B[0m\x1B[38;2;28;48;90m▀\x1B[0m \x1B[38;2;145;145;145m\x1B[48;2;193;195;200m▀\x1B[0m\x1B[38;2;75;75;79m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;115;115;111m\x1B[48;2;252;252;252m▀\x1B[0m\x1B[38;2;86;84;89m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;87;90;100m\x1B[48;2;252;252;252m▀\x1B[0m\x1B[38;2;100;107;123m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;85;92;115m\x1B[48;2;125;131;144m▀\x1B[0m\x1B[38;2;0;0;0m▄\x1B[0m       ",
			"  \x1B[38;2;165;166;170m▄\x1B[0m\x1B[38;2;173;176;184m\x1B[48;2;250;251;254m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;202;210;228m▀\x1B[0m\x1B[38;2;130;145;170m\x1B[48;2;247;251;254m▀\x1B[0m\x1B[38;2;0;0;7m\x1B[48;2;120;134;164m▀\x1B[0m \x1B[38;2;107;118;138m▄\x1B[0m\x1B[38;2;182;187;196m\x1B[48;2;242;241;239m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;225;232;246m▀\x1B[0m\x1B[38;2;125;143;171m\x1B[48;2;37;57;89m▀\x1B[0m\x1B[38;2;0;9;46m▀\x1B[0m  \x1B[38;2;115;125;150m▀\x1B[0m\x1B[38;2;172;184;212m▀\x1B[0m\x1B[38;2;161;172;199m▀\x1B[0m\x1B[38;2;166;177;203m▀\x1B[0m\x1B[38;2;150;164;190m▀\x1B[0m\x1B[38;2;221;225;231m\x1B[48;2;48;72;105m▀\x1B[0m\x1B[38;2;237;240;245m\x1B[48;2;250;249;247m▀\x1B[0m\x1B[38;2;104;117;138m\x1B[48;2;249;254;255m▀\x1B[0m\x1B[38;2;18;24;43m\x1B[48;2;105;125;164m▀\x1B[0m      ",
			"\x1B[38;2;114;114;120m▄\x1B[0m\x1B[38;2;88;95;107m\x1B[48;2;245;243;240m▀\x1B[0m\x1B[38;2;244;245;246m\x1B[48;2;192;201;218m▀\x1B[0m\x1B[38;2;188;198;220m\x1B[48;2;35;50;87m▀\x1B[0m\x1B[38;2;89;109;146m\x1B[48;2;0;0;0m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;142;151;171m▀\x1B[0m\x1B[38;2;208;216;228m\x1B[48;2;248;251;255m▀\x1B[0m\x1B[38;2;4;34;83m\x1B[48;2;220;221;223m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;249;248;247m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;124;134;159m▀\x1B[0m\x1B[38;2;124;147;187m\x1B[48;2;0;18;54m▀\x1B[0m\x1B[38;2;68;139;218m▄\x1B[0m\x1B[38;2;69;112;189m▄\x1B[0m  \x1B[38;2;60;130;212m▄\x1B[0m\x1B[38;2;20;26;53m\x1B[48;2;69;122;207m▀\x1B[0m \x1B[38;2;243;243;243m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;251;249;247m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;217;224;238m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;189;202;226m▀\x1B[0m\x1B[38;2;219;228;246m\x1B[48;2;82;103;141m▀\x1B[0m\x1B[38;2;83;107;159m\x1B[48;2;0;14;42m▀\x1B[0m      ",
			"\x1B[38;2;166;168;176m\x1B[48;2;44;60;85m▀\x1B[0m\x1B[38;2;226;237;250m\x1B[48;2;58;80;111m▀\x1B[0m\x1B[38;2;40;62;103m▀\x1B[0m  \x1B[38;2;0;6;41m▀\x1B[0m\x1B[38;2;135;149;176m\x1B[48;2;44;71;119m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;202;213;227m▀\x1B[0m\x1B[38;2;206;212;226m\x1B[48;2;253;254;255m▀\x1B[0m\x1B[38;2;28;42;87m\x1B[48;2;125;140;169m▀\x1B[0m \x1B[38;2;102;176;245m\x1B[48;2;5;74;215m▀\x1B[0m\x1B[38;2;102;143;234m\x1B[48;2;2;60;207m▀\x1B[0m\x1B[38;2;0;11;225m\x1B[48;2;6;70;223m▀\x1B[0m \x1B[38;2;82;164;244m\x1B[48;2;6;86;209m▀\x1B[0m\x1B[38;2;109;152;241m\x1B[48;2;2;60;221m▀\x1B[0m\x1B[38;2;0;0;124m\x1B[48;2;0;24;117m▀\x1B[0m\x1B[38;2;255;255;241m\x1B[48;2;97;93;93m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;250;251;254m▀\x1B[0m\x1B[38;2;92;108;142m\x1B[48;2;202;210;221m▀\x1B[0m\x1B[38;2;0;5;59m▀\x1B[0m        ",
			"       \x1B[38;2;128;144;165m▀\x1B[0m\x1B[38;2;235;237;237m\x1B[48;2;143;153;169m▀\x1B[0m\x1B[38;2;203;213;226m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;17;39;78m\x1B[48;2;112;124;144m▀\x1B[0m\x1B[38;2;0;51;203m\x1B[48;2;0;0;0m▀\x1B[0m\x1B[38;2;13;58;170m▀\x1B[0m\x1B[38;2;183;183;183m\x1B[48;2;130;130;130m▀\x1B[0m\x1B[38;2;210;204;190m\x1B[48;2;122;122;123m▀\x1B[0m\x1B[38;2;66;96;172m▀\x1B[0m\x1B[38;2;0;61;221m▀\x1B[0m  \x1B[38;2;200;209;221m\x1B[48;2;74;87;106m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;239;241;246m▀\x1B[0m\x1B[38;2;105;123;149m\x1B[48;2;192;203;222m▀\x1B[0m\x1B[38;2;3;25;73m▄\x1B[0m   \x1B[38;2;97;105;116m▄\x1B[0m\x1B[38;2;105;115;136m▄\x1B[0m\x1B[38;2;39;55;103m▄\x1B[0m ",
			"        \x1B[38;2;26;42;64m▀\x1B[0m\x1B[38;2;211;213;218m\x1B[48;2;92;100;117m▀\x1B[0m\x1B[38;2;235;240;245m\x1B[48;2;253;255;255m▀\x1B[0m\x1B[38;2;73;107;150m\x1B[48;2;207;209;208m▀\x1B[0m\x1B[38;2;160;161;164m▄\x1B[0m\x1B[38;2;64;73;94m▄\x1B[0m   \x1B[38;2;189;195;198m▄\x1B[0m\x1B[38;2;253;252;249m▄\x1B[0m\x1B[38;2;255;255;255m▄\x1B[0m\x1B[38;2;88;102;126m\x1B[48;2;90;102;126m▀\x1B[0m\x1B[38;2;75;96;133m\x1B[48;2;0;0;0m▀\x1B[0m\x1B[38;2;9;25;60m▀\x1B[0m \x1B[38;2;52;64;85m▄\x1B[0m\x1B[38;2;57;70;102m\x1B[48;2;195;197;204m▀\x1B[0m\x1B[38;2;198;200;201m\x1B[48;2;252;255;255m▀\x1B[0m\x1B[38;2;229;238;254m\x1B[48;2;99;126;168m▀\x1B[0m\x1B[38;2;63;95;154m\x1B[48;2;0;0;26m▀\x1B[0m ",
			"          \x1B[38;2;142;150;173m\x1B[48;2;36;54;81m▀\x1B[0m\x1B[38;2;206;213;231m\x1B[48;2;0;28;89m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;185;191;206m▀\x1B[0m\x1B[38;2;195;206;222m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;28;42;70m\x1B[48;2;148;156;172m▀\x1B[0m\x1B[38;2;69;74;92m▄\x1B[0m\x1B[38;2;147;153;162m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;238;239;238m\x1B[48;2;247;251;255m▀\x1B[0m\x1B[38;2;223;231;244m\x1B[48;2;83;106;146m▀\x1B[0m\x1B[38;2;231;236;245m\x1B[48;2;111;126;161m▀\x1B[0m\x1B[38;2;235;242;249m\x1B[48;2;248;249;250m▀\x1B[0m\x1B[38;2;81;103;129m\x1B[48;2;186;194;209m▀\x1B[0m\x1B[38;2;0;16;66m▄\x1B[0m\x1B[38;2;225;228;225m▄\x1B[0m\x1B[38;2;174;182;190m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;253;255;255m\x1B[48;2;148;160;184m▀\x1B[0m\x1B[38;2;122;145;178m\x1B[48;2;0;0;46m▀\x1B[0m\x1B[38;2;0;3;30m▀\x1B[0m  ",
			"            \x1B[38;2;59;75;103m\x1B[48;2;0;0;16m▀\x1B[0m\x1B[38;2;202;208;217m\x1B[48;2;141;153;178m▀\x1B[0m\x1B[38;2;255;255;252m\x1B[48;2;236;240;248m▀\x1B[0m\x1B[38;2;240;238;234m\x1B[48;2;247;249;252m▀\x1B[0m\x1B[38;2;240;242;247m\x1B[48;2;157;174;207m▀\x1B[0m\x1B[38;2;89;110;144m\x1B[48;2;1;24;74m▀\x1B[0m\x1B[38;2;0;0;15m▀\x1B[0m \x1B[38;2;129;144;171m\x1B[48;2;0;12;64m▀\x1B[0m\x1B[38;2;250;253;255m\x1B[48;2;137;150;174m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;171;179;196m▀\x1B[0m\x1B[38;2;255;255;253m\x1B[48;2;166;176;194m▀\x1B[0m\x1B[38;2;254;254;252m\x1B[48;2;162;171;187m▀\x1B[0m\x1B[38;2;249;249;249m\x1B[48;2;164;172;188m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;168;176;195m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;164;173;190m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;165;175;196m▀\x1B[0m\x1B[38;2;103;123;152m\x1B[48;2;76;93;121m▀\x1B[0m",
			"       \x1B[38;2;20;26;33m▄\x1B[0m\x1B[38;2;251;255;255m▄\x1B[0m\x1B[38;2;212;212;214m▄\x1B[0m\x1B[38;2;79;73;68m▄\x1B[0m\x1B[38;2;250;250;250m▄\x1B[0m\x1B[38;2;231;229;225m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;244;248;254m\x1B[48;2;170;180;195m▀\x1B[0m\x1B[38;2;65;85;122m\x1B[48;2;0;4;43m▀\x1B[0m\x1B[38;2;21;35;65m▀\x1B[0m\x1B[38;2;129;149;185m\x1B[48;2;66;76;100m▀\x1B[0m\x1B[38;2;164;178;201m\x1B[48;2;217;219;223m▀\x1B[0m\x1B[38;2;10;31;72m\x1B[48;2;179;189;210m▀\x1B[0m\x1B[38;2;16;41;79m▄\x1B[0m \x1B[38;2;6;12;30m▀\x1B[0m\x1B[38;2;0;0;0m▀\x1B[0m \x1B[38;2;0;0;0m▀\x1B[0m\x1B[38;2;0;0;0m▀\x1B[0m\x1B[38;2;0;0;0m▀\x1B[0m\x1B[38;2;0;0;0m▀\x1B[0m\x1B[38;2;0;0;0m▀\x1B[0m ",
			"      \x1B[38;2;53;64;83m\x1B[48;2;41;53;77m▀\x1B[0m\x1B[38;2;208;210;210m\x1B[48;2;172;186;212m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;244;247;249m▀\x1B[0m\x1B[38;2;229;233;237m\x1B[48;2;255;252;246m▀\x1B[0m\x1B[38;2;96;106;126m\x1B[48;2;234;235;235m▀\x1B[0m\x1B[38;2;255;255;250m\x1B[48;2;255;255;253m▀\x1B[0m\x1B[38;2;232;236;242m\x1B[48;2;123;140;172m▀\x1B[0m\x1B[38;2;63;80;111m\x1B[48;2;0;0;23m▀\x1B[0m   \x1B[38;2;123;138;160m\x1B[48;2;41;55;75m▀\x1B[0m\x1B[38;2;241;243;248m\x1B[48;2;182;189;200m▀\x1B[0m\x1B[38;2;189;199;210m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;34;63;117m\x1B[48;2;178;189;212m▀\x1B[0m\x1B[38;2;64;86;125m▄\x1B[0m        ",
			"       \x1B[38;2;2;19;47m▀\x1B[0m\x1B[38;2;83;103;146m\x1B[48;2;0;0;53m▀\x1B[0m\x1B[38;2;169;184;216m\x1B[48;2;25;47;92m▀\x1B[0m\x1B[38;2;244;244;245m\x1B[48;2;105;127;168m▀\x1B[0m\x1B[38;2;158;173;205m\x1B[48;2;64;93;148m▀\x1B[0m\x1B[38;2;36;53;100m▀\x1B[0m   \x1B[38;2;0;5;54m▄\x1B[0m\x1B[38;2;175;179;188m\x1B[48;2;191;200;214m▀\x1B[0m\x1B[38;2;253;252;251m\x1B[48;2;241;242;244m▀\x1B[0m\x1B[38;2;249;247;241m\x1B[48;2;216;225;238m▀\x1B[0m\x1B[38;2;165;177;203m\x1B[48;2;48;68;108m▀\x1B[0m\x1B[38;2;45;68;113m▀\x1B[0m        ",
			"          \x1B[38;2;8;26;61m▀\x1B[0m\x1B[38;2;26;44;80m▀\x1B[0m     \x1B[38;2;56;74;106m▀\x1B[0m\x1B[38;2;64;81;115m▀\x1B[0m\x1B[38;2;54;73;108m▀\x1B[0m\x1B[38;2;33;48;72m▀\x1B[0m         ",
			"                              "
		],
		[
			"                              ",
			"            \x1B[38;2;117;125;144m▄\x1B[0m\x1B[38;2;119;123;136m▄\x1B[0m\x1B[38;2;116;120;134m▄\x1B[0m\x1B[38;2;119;124;140m▄\x1B[0m\x1B[38;2;118;122;133m▄\x1B[0m\x1B[38;2;119;126;139m▄\x1B[0m\x1B[38;2;78;91;119m▄\x1B[0m           ",
			"          \x1B[38;2;60;69;94m▄\x1B[0m\x1B[38;2;158;166;176m\x1B[48;2;232;233;236m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;212;217;231m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;109;129;162m▀\x1B[0m\x1B[38;2;254;254;254m\x1B[48;2;134;157;191m▀\x1B[0m\x1B[38;2;254;254;255m\x1B[48;2;136;161;202m▀\x1B[0m\x1B[38;2;255;255;253m\x1B[48;2;150;170;212m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;130;156;204m▀\x1B[0m\x1B[38;2;108;129;171m\x1B[48;2;53;87;140m▀\x1B[0m           ",
			"   \x1B[38;2;80;83;94m▄\x1B[0m\x1B[38;2;50;57;76m▄\x1B[0m\x1B[38;2;0;0;13m▄\x1B[0m   \x1B[38;2;131;135;140m▄\x1B[0m\x1B[38;2;159;166;176m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;177;189;209m▀\x1B[0m\x1B[38;2;87;103;139m\x1B[48;2;11;30;68m▀\x1B[0m\x1B[38;2;0;0;14m▀\x1B[0m\x1B[38;2;130;137;144m▄\x1B[0m\x1B[38;2;43;48;60m\x1B[48;2;247;247;248m▀\x1B[0m\x1B[38;2;42;51;67m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;44;51;71m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;57;62;80m\x1B[48;2;253;255;255m▀\x1B[0m\x1B[38;2;55;61;76m\x1B[48;2;253;252;250m▀\x1B[0m\x1B[38;2;51;58;74m\x1B[48;2;238;238;238m▀\x1B[0m\x1B[38;2;76;87;120m▄\x1B[0m        ",
			" \x1B[38;2;6;12;24m▄\x1B[0m\x1B[38;2;185;186;187m▄\x1B[0m\x1B[38;2;229;231;231m\x1B[48;2;222;227;238m▀\x1B[0m\x1B[38;2;236;237;241m\x1B[48;2;227;231;239m▀\x1B[0m\x1B[38;2;100;122;153m\x1B[48;2;210;220;233m▀\x1B[0m\x1B[38;2;67;99;155m▄\x1B[0m \x1B[38;2;133;137;150m\x1B[48;2;180;188;197m▀\x1B[0m\x1B[38;2;233;232;229m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;242;249;255m\x1B[48;2;102;122;157m▀\x1B[0m\x1B[38;2;83;107;143m\x1B[48;2;0;14;42m▀\x1B[0m  \x1B[38;2;29;37;54m▀\x1B[0m\x1B[38;2;119;130;152m▀\x1B[0m\x1B[38;2;126;138;160m▀\x1B[0m\x1B[38;2;129;140;161m▀\x1B[0m\x1B[38;2;123;133;155m▀\x1B[0m\x1B[38;2;147;156;173m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;132;140;156m▀\x1B[0m\x1B[38;2;190;196;210m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;65;82;110m\x1B[48;2;178;188;206m▀\x1B[0m       ",
			"\x1B[38;2;138;142;149m▄\x1B[0m\x1B[38;2;110;119;134m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;170;184;208m▀\x1B[0m\x1B[38;2;137;154;187m\x1B[48;2;3;29;88m▀\x1B[0m\x1B[38;2;159;172;200m\x1B[48;2;72;96;130m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;186;195;209m▀\x1B[0m\x1B[38;2;146;162;190m\x1B[48;2;244;242;239m▀\x1B[0m\x1B[38;2;112;121;133m\x1B[48;2;240;239;238m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;228;234;243m▀\x1B[0m\x1B[38;2;200;209;226m\x1B[48;2;80;94;123m▀\x1B[0m\x1B[38;2;13;34;76m\x1B[48;2;15;66;116m▀\x1B[0m\x1B[38;2;117;167;243m▄\x1B[0m\x1B[38;2;34;82;153m▄\x1B[0m \x1B[38;2;0;96;198m▄\x1B[0m\x1B[38;2;73;133;214m▄\x1B[0m\x1B[38;2;20;94;236m▄\x1B[0m \x1B[38;2;255;255;255m\x1B[48;2;252;252;253m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;246;247;250m▀\x1B[0m\x1B[38;2;235;232;224m\x1B[48;2;227;234;246m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;164;178;205m▀\x1B[0m\x1B[38;2;138;154;183m\x1B[48;2;41;58;86m▀\x1B[0m       ",
			"\x1B[38;2;170;172;179m\x1B[48;2;59;72;98m▀\x1B[0m\x1B[38;2;229;238;253m\x1B[48;2;65;84;118m▀\x1B[0m\x1B[38;2;59;81;110m▀\x1B[0m  \x1B[38;2;61;71;93m▀\x1B[0m\x1B[38;2;228;234;243m\x1B[48;2;89;103;126m▀\x1B[0m\x1B[38;2;255;255;255m▀\x1B[0m\x1B[38;2;130;147;176m\x1B[48;2;183;192;211m▀\x1B[0m\x1B[38;2;38;46;77m▄\x1B[0m\x1B[38;2;69;173;255m\x1B[48;2;0;94;245m▀\x1B[0m\x1B[38;2;203;237;255m\x1B[48;2;7;71;223m▀\x1B[0m\x1B[38;2;38;85;168m\x1B[48;2;2;38;132m▀\x1B[0m \x1B[38;2;0;118;255m\x1B[48;2;0;109;255m▀\x1B[0m\x1B[38;2;156;207;255m\x1B[48;2;10;87;239m▀\x1B[0m\x1B[38;2;49;113;251m\x1B[48;2;10;84;242m▀\x1B[0m \x1B[38;2;255;255;252m\x1B[48;2;169;176;190m▀\x1B[0m\x1B[38;2;203;209;220m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;45;71;118m\x1B[48;2;110;123;147m▀\x1B[0m\x1B[38;2;38;53;102m▀\x1B[0m        ",
			"      \x1B[38;2;15;19;39m▀\x1B[0m\x1B[38;2;214;215;218m\x1B[48;2;108;130;156m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;232;239;247m▀\x1B[0m\x1B[38;2;140;151;181m\x1B[48;2;227;230;237m▀\x1B[0m\x1B[38;2;0;8;64m\x1B[48;2;27;43;71m▀\x1B[0m\x1B[38;2;0;66;240m▀\x1B[0m\x1B[38;2;103;117;161m\x1B[48;2;96;88;88m▀\x1B[0m\x1B[38;2;216;199;174m\x1B[48;2;153;156;157m▀\x1B[0m\x1B[38;2;138;154;174m\x1B[48;2;174;174;168m▀\x1B[0m\x1B[38;2;15;90;230m▀\x1B[0m\x1B[38;2;3;89;255m▀\x1B[0m \x1B[38;2;113;132;170m▀\x1B[0m\x1B[38;2;223;224;227m\x1B[48;2;128;140;158m▀\x1B[0m\x1B[38;2;207;216;233m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;5;31;69m\x1B[48;2;105;122;151m▀\x1B[0m    \x1B[38;2;120;127;137m▄\x1B[0m\x1B[38;2;104;113;133m▄\x1B[0m\x1B[38;2;37;54;84m▄\x1B[0m ",
			"        \x1B[38;2;117;131;152m\x1B[48;2;55;62;82m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;213;216;218m▀\x1B[0m\x1B[38;2;132;147;176m\x1B[48;2;221;224;230m▀\x1B[0m\x1B[38;2;160;160;166m▄\x1B[0m\x1B[38;2;126;128;139m▄\x1B[0m\x1B[38;2;60;72;109m▄\x1B[0m   \x1B[38;2;155;159;163m▄\x1B[0m\x1B[38;2;3;11;30m\x1B[48;2;247;244;242m▀\x1B[0m\x1B[38;2;52;67;93m\x1B[48;2;165;174;186m▀\x1B[0m\x1B[38;2;116;133;163m\x1B[48;2;0;18;53m▀\x1B[0m\x1B[38;2;61;81;119m▀\x1B[0m  \x1B[38;2;0;0;0m▄\x1B[0m\x1B[38;2;35;41;58m\x1B[48;2;225;225;225m▀\x1B[0m\x1B[38;2;222;222;222m\x1B[48;2;254;255;255m▀\x1B[0m\x1B[38;2;224;231;248m\x1B[48;2;84;103;143m▀\x1B[0m\x1B[38;2;37;58;103m\x1B[48;2;0;0;4m▀\x1B[0m ",
			"         \x1B[38;2;116;131;152m\x1B[48;2;63;85;113m▀\x1B[0m\x1B[38;2;225;234;246m\x1B[48;2;29;48;76m▀\x1B[0m\x1B[38;2;242;246;253m\x1B[48;2;91;110;139m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;248;249;251m▀\x1B[0m\x1B[38;2;120;134;164m\x1B[48;2;231;232;234m▀\x1B[0m\x1B[38;2;109;123;152m▄\x1B[0m\x1B[38;2;156;156;161m▄\x1B[0m\x1B[38;2;155;161;167m\x1B[48;2;253;251;249m▀\x1B[0m\x1B[38;2;250;250;250m\x1B[48;2;198;209;226m▀\x1B[0m\x1B[38;2;239;244;250m\x1B[48;2;43;74;123m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;171;181;200m▀\x1B[0m\x1B[38;2;152;164;183m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;0;0;0m\x1B[48;2;129;138;151m▀\x1B[0m \x1B[38;2;0;0;5m\x1B[48;2;145;148;153m▀\x1B[0m\x1B[38;2;138;141;147m\x1B[48;2;253;253;250m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;127;143;168m▀\x1B[0m\x1B[38;2;107;126;159m\x1B[48;2;12;30;57m▀\x1B[0m\x1B[38;2;0;4;41m▀\x1B[0m  ",
			"            \x1B[38;2;112;125;152m\x1B[48;2;86;95;111m▀\x1B[0m\x1B[38;2;252;253;254m\x1B[48;2;204;214;227m▀\x1B[0m\x1B[38;2;251;251;249m\x1B[48;2;237;240;245m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;241;245;251m▀\x1B[0m\x1B[38;2;199;206;222m\x1B[48;2;94;110;148m▀\x1B[0m\x1B[38;2;54;78;124m\x1B[48;2;0;0;9m▀\x1B[0m \x1B[38;2;53;67;98m▀\x1B[0m\x1B[38;2;210;219;232m\x1B[48;2;104;133;170m▀\x1B[0m\x1B[38;2;255;255;253m\x1B[48;2;188;199;216m▀\x1B[0m\x1B[38;2;244;242;238m\x1B[48;2;192;203;220m▀\x1B[0m\x1B[38;2;255;255;253m\x1B[48;2;185;196;215m▀\x1B[0m\x1B[38;2;254;255;255m\x1B[48;2;185;196;214m▀\x1B[0m\x1B[38;2;243;243;238m\x1B[48;2;191;201;216m▀\x1B[0m\x1B[38;2;255;255;253m\x1B[48;2;185;195;213m▀\x1B[0m\x1B[38;2;255;253;248m\x1B[48;2;192;200;216m▀\x1B[0m\x1B[38;2;253;253;251m\x1B[48;2;168;179;202m▀\x1B[0m\x1B[38;2;98;116;147m\x1B[48;2;58;78;116m▀\x1B[0m",
			"        \x1B[38;2;157;161;167m▄\x1B[0m\x1B[38;2;127;130;124m▄\x1B[0m\x1B[38;2;88;88;83m▄\x1B[0m\x1B[38;2;218;216;215m▄\x1B[0m\x1B[38;2;238;238;239m\x1B[48;2;247;250;253m▀\x1B[0m\x1B[38;2;174;185;206m\x1B[48;2;95;107;133m▀\x1B[0m\x1B[38;2;7;24;60m▀\x1B[0m\x1B[38;2;50;68;107m\x1B[48;2;0;0;37m▀\x1B[0m\x1B[38;2;136;155;193m\x1B[48;2;191;200;217m▀\x1B[0m\x1B[38;2;78;97;128m\x1B[48;2;146;164;188m▀\x1B[0m\x1B[38;2;0;0;0m▄\x1B[0m           ",
			"      \x1B[38;2;39;50;70m▄\x1B[0m\x1B[38;2;240;236;230m\x1B[48;2;181;193;217m▀\x1B[0m\x1B[38;2;255;255;250m\x1B[48;2;255;255;253m▀\x1B[0m\x1B[38;2;145;158;176m\x1B[48;2;235;237;238m▀\x1B[0m\x1B[38;2;163;177;195m\x1B[48;2;237;238;238m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;233;237;241m▀\x1B[0m\x1B[38;2;160;175;201m\x1B[48;2;72;92;127m▀\x1B[0m\x1B[38;2;8;37;82m▀\x1B[0m  \x1B[38;2;247;249;247m\x1B[48;2;168;182;198m▀\x1B[0m\x1B[38;2;226;234;244m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;44;65;102m\x1B[48;2;216;220;227m▀\x1B[0m\x1B[38;2;121;139;172m▄\x1B[0m          ",
			"      \x1B[38;2;6;12;25m▀\x1B[0m\x1B[38;2;25;45;87m▀\x1B[0m\x1B[38;2;121;141;182m\x1B[48;2;6;28;71m▀\x1B[0m\x1B[38;2;228;231;235m\x1B[48;2;73;93;134m▀\x1B[0m\x1B[38;2;240;241;243m\x1B[48;2;142;161;202m▀\x1B[0m\x1B[38;2;110;132;174m\x1B[48;2;30;50;92m▀\x1B[0m\x1B[38;2;7;26;70m▀\x1B[0m \x1B[38;2;48;54;65m▄\x1B[0m\x1B[38;2;119;122;128m\x1B[48;2;230;234;237m▀\x1B[0m\x1B[38;2;248;247;244m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;247;245;240m\x1B[48;2;250;253;255m▀\x1B[0m\x1B[38;2;215;220;231m\x1B[48;2;99;123;164m▀\x1B[0m\x1B[38;2;98;119;163m\x1B[48;2;1;21;61m▀\x1B[0m\x1B[38;2;0;6;62m▀\x1B[0m         ",
			"         \x1B[38;2;11;23;61m▀\x1B[0m\x1B[38;2;23;40;78m▀\x1B[0m   \x1B[38;2;38;46;61m▀\x1B[0m\x1B[38;2;128;144;180m▀\x1B[0m\x1B[38;2;141;160;195m▀\x1B[0m\x1B[38;2;127;147;180m▀\x1B[0m\x1B[38;2;51;72;112m▀\x1B[0m           ",
			"                              "
		],
		[
			"                              ",
			"            \x1B[38;2;198;200;200m▄\x1B[0m\x1B[38;2;235;234;235m▄\x1B[0m\x1B[38;2;230;229;228m▄\x1B[0m\x1B[38;2;223;222;218m▄\x1B[0m\x1B[38;2;223;222;220m▄\x1B[0m\x1B[38;2;236;234;232m▄\x1B[0m\x1B[38;2;171;179;193m▄\x1B[0m\x1B[38;2;0;18;60m▄\x1B[0m          ",
			"          \x1B[38;2;0;0;10m▄\x1B[0m\x1B[38;2;52;59;76m\x1B[48;2;183;185;190m▀\x1B[0m\x1B[38;2;227;227;228m\x1B[48;2;231;236;248m▀\x1B[0m\x1B[38;2;232;234;240m\x1B[48;2;53;68;105m▀\x1B[0m\x1B[38;2;175;183;199m\x1B[48;2;0;0;0m▀\x1B[0m\x1B[38;2;190;197;212m\x1B[48;2;9;9;23m▀\x1B[0m\x1B[38;2;188;196;213m\x1B[48;2;0;0;0m▀\x1B[0m\x1B[38;2;193;199;213m\x1B[48;2;0;0;0m▀\x1B[0m\x1B[38;2;130;148;181m\x1B[48;2;0;0;0m▀\x1B[0m\x1B[38;2;34;62;106m▀\x1B[0m          ",
			"   \x1B[38;2;150;152;162m▄\x1B[0m\x1B[38;2;155;158;166m▄\x1B[0m\x1B[38;2;58;72;101m▄\x1B[0m   \x1B[38;2;122;122;124m▄\x1B[0m\x1B[38;2;125;128;132m\x1B[48;2;239;238;237m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;213;221;231m▀\x1B[0m\x1B[38;2;141;155;181m\x1B[48;2;73;97;131m▀\x1B[0m\x1B[38;2;0;7;42m▀\x1B[0m \x1B[38;2;151;148;146m\x1B[48;2;160;168;187m▀\x1B[0m\x1B[38;2;136;137;138m\x1B[48;2;247;251;255m▀\x1B[0m\x1B[38;2;117;117;121m\x1B[48;2;226;230;241m▀\x1B[0m\x1B[38;2;147;144;140m\x1B[48;2;230;236;246m▀\x1B[0m\x1B[38;2;140;139;137m\x1B[48;2;231;236;247m▀\x1B[0m\x1B[38;2;104;108;117m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;67;71;80m\x1B[48;2;175;184;203m▀\x1B[0m\x1B[38;2;0;4;48m▄\x1B[0m       ",
			" \x1B[38;2;57;91;120m▄\x1B[0m\x1B[38;2;75;85;101m\x1B[48;2;207;212;216m▀\x1B[0m\x1B[38;2;230;233;238m\x1B[48;2;219;224;235m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;153;166;193m▀\x1B[0m\x1B[38;2;171;184;206m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;42;65;115m\x1B[48;2;148;153;167m▀\x1B[0m\x1B[38;2;0;0;0m▄\x1B[0m\x1B[38;2;0;6;26m\x1B[48;2;203;205;209m▀\x1B[0m\x1B[38;2;184;188;193m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;250;252;255m\x1B[48;2;140;154;182m▀\x1B[0m\x1B[38;2;84;104;141m\x1B[48;2;5;11;41m▀\x1B[0m   \x1B[38;2;23;35;63m▀\x1B[0m\x1B[38;2;21;34;67m▀\x1B[0m\x1B[38;2;18;32;62m▀\x1B[0m\x1B[38;2;12;25;56m▀\x1B[0m\x1B[38;2;0;12;47m▀\x1B[0m\x1B[38;2;167;172;181m\x1B[48;2;106;111;120m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;252;249;243m▀\x1B[0m\x1B[38;2;120;133;156m\x1B[48;2;176;188;210m▀\x1B[0m\x1B[38;2;0;0;17m\x1B[48;2;0;0;71m▀\x1B[0m      ",
			"\x1B[38;2;172;173;176m▄\x1B[0m\x1B[38;2;208;208;210m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;94;116;149m▀\x1B[0m\x1B[38;2;97;119;160m\x1B[48;2;0;13;36m▀\x1B[0m\x1B[38;2;38;72;133m▀\x1B[0m\x1B[38;2;189;200;218m\x1B[48;2;63;82;115m▀\x1B[0m\x1B[38;2;255;255;251m\x1B[48;2;221;226;235m▀\x1B[0m\x1B[38;2;156;164;179m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;240;238;233m\x1B[48;2;244;246;249m▀\x1B[0m\x1B[38;2;218;227;239m\x1B[48;2;104;126;161m▀\x1B[0m\x1B[38;2;38;57;86m\x1B[48;2;0;0;22m▀\x1B[0m\x1B[38;2;0;18;163m\x1B[48;2;114;166;233m▀\x1B[0m\x1B[38;2;4;63;235m\x1B[48;2;63;119;235m▀\x1B[0m  \x1B[38;2;0;64;219m\x1B[48;2;128;192;252m▀\x1B[0m\x1B[38;2;14;68;210m\x1B[48;2;99;152;254m▀\x1B[0m \x1B[38;2;218;220;223m\x1B[48;2;250;244;231m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;225;231;242m▀\x1B[0m\x1B[38;2;255;255;253m\x1B[48;2;109;128;165m▀\x1B[0m\x1B[38;2;249;252;255m\x1B[48;2;96;114;149m▀\x1B[0m\x1B[38;2;104;121;152m\x1B[48;2;9;15;38m▀\x1B[0m       ",
			"\x1B[38;2;119;129;147m▀\x1B[0m\x1B[38;2;143;159;190m\x1B[48;2;0;0;22m▀\x1B[0m\x1B[38;2;0;0;33m▀\x1B[0m   \x1B[38;2;88;101;134m▀\x1B[0m\x1B[38;2;241;240;242m\x1B[48;2;171;183;204m▀\x1B[0m\x1B[38;2;239;241;246m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;116;129;172m\x1B[48;2;128;143;167m▀\x1B[0m\x1B[38;2;0;8;66m\x1B[48;2;0;0;5m▀\x1B[0m\x1B[38;2;77;119;193m\x1B[48;2;6;50;175m▀\x1B[0m\x1B[38;2;42;93;208m\x1B[48;2;2;55;177m▀\x1B[0m  \x1B[38;2;90;149;213m\x1B[48;2;5;74;203m▀\x1B[0m\x1B[38;2;68;113;214m\x1B[48;2;2;62;195m▀\x1B[0m \x1B[38;2;204;202;204m\x1B[48;2;77;94;127m▀\x1B[0m\x1B[38;2;249;253;255m\x1B[48;2;229;232;234m▀\x1B[0m\x1B[38;2;76;91;124m\x1B[48;2;190;199;212m▀\x1B[0m\x1B[38;2;16;42;75m▄\x1B[0m        ",
			"       \x1B[38;2;9;25;57m▀\x1B[0m\x1B[38;2;166;174;188m\x1B[48;2;60;72;98m▀\x1B[0m\x1B[38;2;233;235;237m\x1B[48;2;239;242;250m▀\x1B[0m\x1B[38;2;73;80;108m\x1B[48;2;173;181;197m▀\x1B[0m\x1B[38;2;0;20;79m▄\x1B[0m\x1B[38;2;91;110;149m▀\x1B[0m\x1B[38;2;254;255;254m▀\x1B[0m\x1B[38;2;227;222;216m▀\x1B[0m\x1B[38;2;98;116;156m▀\x1B[0m\x1B[38;2;0;24;103m▀\x1B[0m  \x1B[38;2;164;171;183m\x1B[48;2;32;43;68m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;185;200;222m▀\x1B[0m\x1B[38;2;122;136;162m\x1B[48;2;117;134;167m▀\x1B[0m\x1B[38;2;0;0;6m▄\x1B[0m   \x1B[38;2;145;147;147m▄\x1B[0m\x1B[38;2;188;191;201m▄\x1B[0m\x1B[38;2;49;60;90m▄\x1B[0m ",
			"         \x1B[38;2;184;192;207m\x1B[48;2;48;65;102m▀\x1B[0m\x1B[38;2;216;224;238m\x1B[48;2;210;217;229m▀\x1B[0m\x1B[38;2;90;107;136m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;117;113;117m\x1B[48;2;245;245;247m▀\x1B[0m\x1B[38;2;155;160;172m▄\x1B[0m   \x1B[38;2;177;180;182m▄\x1B[0m\x1B[38;2;242;242;242m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;106;112;124m\x1B[48;2;241;243;247m▀\x1B[0m\x1B[38;2;0;31;76m\x1B[48;2;103;113;132m▀\x1B[0m\x1B[38;2;20;40;69m▀\x1B[0m  \x1B[38;2;17;23;35m▄\x1B[0m\x1B[38;2;153;156;163m\x1B[48;2;221;221;221m▀\x1B[0m\x1B[38;2;229;228;227m\x1B[48;2;244;250;255m▀\x1B[0m\x1B[38;2;183;198;220m\x1B[48;2;46;75;118m▀\x1B[0m\x1B[38;2;26;45;81m▀\x1B[0m ",
			"          \x1B[38;2;106;120;147m▀\x1B[0m\x1B[38;2;103;117;143m▀\x1B[0m\x1B[38;2;237;241;246m\x1B[48;2;172;192;218m▀\x1B[0m\x1B[38;2;209;212;216m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;35;53;86m\x1B[48;2;188;195;206m▀\x1B[0m\x1B[38;2;215;219;224m▄\x1B[0m\x1B[38;2;233;235;237m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;156;173;204m▀\x1B[0m\x1B[38;2;166;180;203m▀\x1B[0m\x1B[38;2;226;230;237m\x1B[48;2;89;98;127m▀\x1B[0m\x1B[38;2;239;241;247m\x1B[48;2;239;244;253m▀\x1B[0m\x1B[38;2;76;90;116m\x1B[48;2;221;222;222m▀\x1B[0m\x1B[38;2;175;175;176m▄\x1B[0m\x1B[38;2;181;181;184m▄\x1B[0m\x1B[38;2;194;195;196m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;232;235;242m\x1B[48;2;192;197;209m▀\x1B[0m\x1B[38;2;63;79;117m\x1B[48;2;168;171;181m▀\x1B[0m\x1B[38;2;255;255;255m▄\x1B[0m\x1B[38;2;255;255;255m▄\x1B[0m\x1B[38;2;136;153;174m▄\x1B[0m",
			"             \x1B[38;2;194;202;214m\x1B[48;2;187;196;212m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;155;168;194m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;127;139;165m▀\x1B[0m\x1B[38;2;208;214;224m\x1B[48;2;112;132;169m▀\x1B[0m\x1B[38;2;30;51;85m\x1B[48;2;25;45;80m▀\x1B[0m  \x1B[38;2;150;164;191m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;128;144;177m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;126;144;183m▀\x1B[0m\x1B[38;2;254;254;254m\x1B[48;2;121;139;179m▀\x1B[0m\x1B[38;2;249;251;254m\x1B[48;2;130;150;187m▀\x1B[0m\x1B[38;2;252;252;254m\x1B[48;2;127;144;184m▀\x1B[0m\x1B[38;2;254;254;254m\x1B[48;2;127;141;179m▀\x1B[0m\x1B[38;2;255;255;254m\x1B[48;2;124;142;180m▀\x1B[0m\x1B[38;2;253;255;255m\x1B[48;2;111;132;174m▀\x1B[0m\x1B[38;2;99;121;154m\x1B[48;2;43;73;112m▀\x1B[0m",
			"            \x1B[38;2;167;167;167m\x1B[48;2;222;218;212m▀\x1B[0m\x1B[38;2;247;248;249m\x1B[48;2;234;240;250m▀\x1B[0m\x1B[38;2;95;105;129m\x1B[48;2;97;121;163m▀\x1B[0m\x1B[38;2;0;0;0m▀\x1B[0m\x1B[38;2;195;202;217m\x1B[48;2;187;191;198m▀\x1B[0m\x1B[38;2;75;85;106m\x1B[48;2;225;231;238m▀\x1B[0m\x1B[38;2;55;80;131m▄\x1B[0m           ",
			"         \x1B[38;2;98;101;111m▄\x1B[0m\x1B[38;2;255;248;248m\x1B[48;2;224;224;224m▀\x1B[0m\x1B[38;2;189;192;203m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;209;213;218m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;182;192;212m\x1B[48;2;120;133;160m▀\x1B[0m\x1B[38;2;23;57;123m\x1B[48;2;0;0;0m▀\x1B[0m \x1B[38;2;128;139;162m\x1B[48;2;79;93;130m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;232;234;240m▀\x1B[0m\x1B[38;2;193;202;211m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;163;168;178m\x1B[48;2;226;228;233m▀\x1B[0m\x1B[38;2;67;79;106m▄\x1B[0m         ",
			"         \x1B[38;2;70;82;109m▀\x1B[0m\x1B[38;2;218;227;239m\x1B[48;2;49;73;110m▀\x1B[0m\x1B[38;2;251;248;243m\x1B[48;2;113;132;174m▀\x1B[0m\x1B[38;2;255;254;245m\x1B[48;2;209;217;231m▀\x1B[0m\x1B[38;2;147;159;183m\x1B[48;2;153;168;198m▀\x1B[0m\x1B[38;2;0;6;51m\x1B[48;2;0;11;64m▀\x1B[0m \x1B[38;2;178;180;185m\x1B[48;2;234;234;235m▀\x1B[0m\x1B[38;2;255;255;250m\x1B[48;2;255;255;253m▀\x1B[0m\x1B[38;2;255;255;247m\x1B[48;2;191;199;218m▀\x1B[0m\x1B[38;2;187;198;220m\x1B[48;2;45;68;113m▀\x1B[0m\x1B[38;2;37;56;93m\x1B[48;2;0;16;41m▀\x1B[0m         ",
			"           \x1B[38;2;25;44;87m▀\x1B[0m\x1B[38;2;67;91;140m▀\x1B[0m\x1B[38;2;60;82;125m▀\x1B[0m\x1B[38;2;9;28;66m▀\x1B[0m \x1B[38;2;97;115;149m▀\x1B[0m\x1B[38;2;99;118;158m▀\x1B[0m\x1B[38;2;34;57;101m▀\x1B[0m\x1B[38;2;21;39;63m▀\x1B[0m          ",
			"                              "
		],
		[
			"                              ",
			"           \x1B[38;2;9;9;23m▄\x1B[0m\x1B[38;2;65;69;82m▄\x1B[0m\x1B[38;2;189;190;189m▄\x1B[0m\x1B[38;2;59;64;74m\x1B[48;2;237;233;224m▀\x1B[0m\x1B[38;2;106;116;136m\x1B[48;2;236;241;250m▀\x1B[0m\x1B[38;2;34;50;87m\x1B[48;2;70;93;138m▀\x1B[0m             ",
			"         \x1B[38;2;108;146;177m▄\x1B[0m\x1B[38;2;130;135;138m\x1B[48;2;243;246;247m▀\x1B[0m\x1B[38;2;212;213;213m\x1B[48;2;228;232;240m▀\x1B[0m\x1B[38;2;253;251;247m\x1B[48;2;136;154;185m▀\x1B[0m\x1B[38;2;247;250;255m\x1B[48;2;54;71;106m▀\x1B[0m\x1B[38;2;187;200;221m\x1B[48;2;1;11;40m▀\x1B[0m\x1B[38;2;80;100;134m\x1B[48;2;11;11;11m▀\x1B[0m\x1B[38;2;36;54;85m▀\x1B[0m\x1B[38;2;97;100;103m▄\x1B[0m\x1B[38;2;148;149;151m▄\x1B[0m\x1B[38;2;136;139;144m▄\x1B[0m\x1B[38;2;45;61;95m▄\x1B[0m         ",
			"         \x1B[38;2;184;189;197m\x1B[48;2;251;248;241m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;244;248;254m▀\x1B[0m\x1B[38;2;93;107;142m\x1B[48;2;82;100;138m▀\x1B[0m\x1B[38;2;0;0;33m▀\x1B[0m\x1B[38;2;106;111;121m▄\x1B[0m\x1B[38;2;21;30;38m\x1B[48;2;234;235;236m▀\x1B[0m\x1B[38;2;130;136;141m\x1B[48;2;238;244;255m▀\x1B[0m\x1B[38;2;202;200;197m\x1B[48;2;227;234;247m▀\x1B[0m\x1B[38;2;222;220;217m\x1B[48;2;139;158;190m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;51;77;117m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;192;202;216m▀\x1B[0m\x1B[38;2;208;216;230m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;82;102;141m\x1B[48;2;216;223;237m▀\x1B[0m\x1B[38;2;49;74;93m\x1B[48;2;76;104;156m▀\x1B[0m       ",
			"        \x1B[38;2;80;87;120m\x1B[48;2;128;131;143m▀\x1B[0m\x1B[38;2;255;253;247m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;195;204;224m\x1B[48;2;148;160;182m▀\x1B[0m\x1B[38;2;28;50;98m\x1B[48;2;0;7;30m▀\x1B[0m \x1B[38;2;107;115;136m▀\x1B[0m\x1B[38;2;148;164;193m\x1B[48;2;0;3;29m▀\x1B[0m\x1B[38;2;70;89;122m▀\x1B[0m\x1B[38;2;10;28;60m▀\x1B[0m\x1B[38;2;10;27;69m\x1B[48;2;97;101;117m▀\x1B[0m\x1B[38;2;180;183;187m▄\x1B[0m\x1B[38;2;0;0;0m\x1B[48;2;212;212;211m▀\x1B[0m\x1B[38;2;252;251;245m\x1B[48;2;253;253;255m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;158;174;198m▀\x1B[0m\x1B[38;2;110;138;183m\x1B[48;2;8;31;62m▀\x1B[0m       ",
			"  \x1B[38;2;97;91;97m▄\x1B[0m\x1B[38;2;67;80;108m▄\x1B[0m\x1B[38;2;11;30;71m▄\x1B[0m  \x1B[38;2;0;7;33m▄\x1B[0m\x1B[38;2;162;166;171m\x1B[48;2;214;215;217m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;195;206;224m▀\x1B[0m\x1B[38;2;110;131;165m\x1B[48;2;19;35;71m▀\x1B[0m    \x1B[38;2;38;94;194m▄\x1B[0m\x1B[38;2;18;82;218m▄\x1B[0m\x1B[38;2;118;122;132m▀\x1B[0m\x1B[38;2;255;253;250m\x1B[48;2;214;216;218m▀\x1B[0m\x1B[38;2;212;221;236m\x1B[48;2;243;247;252m▀\x1B[0m\x1B[38;2;78;102;147m\x1B[48;2;95;121;156m▀\x1B[0m\x1B[38;2;43;74;136m▀\x1B[0m        ",
			" \x1B[38;2;22;31;58m▄\x1B[0m\x1B[38;2;206;206;209m\x1B[48;2;245;244;242m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;226;229;232m▀\x1B[0m\x1B[38;2;172;182;199m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;80;96;125m\x1B[48;2;199;210;228m▀\x1B[0m\x1B[38;2;59;88;134m▄\x1B[0m\x1B[38;2;208;208;208m\x1B[48;2;208;208;203m▀\x1B[0m\x1B[38;2;255;253;250m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;137;153;185m\x1B[48;2;91;110;148m▀\x1B[0m\x1B[38;2;0;7;25m▀\x1B[0m\x1B[38;2;0;43;197m\x1B[48;2;116;168;240m▀\x1B[0m\x1B[38;2;4;53;214m\x1B[48;2;73;129;223m▀\x1B[0m \x1B[38;2;0;33;112m▀\x1B[0m\x1B[38;2;155;201;255m\x1B[48;2;21;90;207m▀\x1B[0m\x1B[38;2;93;140;236m\x1B[48;2;19;72;199m▀\x1B[0m\x1B[38;2;8;85;221m▄\x1B[0m\x1B[38;2;113;122;133m▀\x1B[0m\x1B[38;2;247;248;249m\x1B[48;2;112;128;152m▀\x1B[0m\x1B[38;2;206;215;228m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;28;57;106m\x1B[48;2;208;218;233m▀\x1B[0m\x1B[38;2;61;82;115m▄\x1B[0m   \x1B[38;2;90;96;109m▄\x1B[0m\x1B[38;2;107;116;138m▄\x1B[0m  ",
			" \x1B[38;2;66;75;91m\x1B[48;2;167;169;171m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;226;233;245m▀\x1B[0m\x1B[38;2;128;142;172m\x1B[48;2;55;80;128m▀\x1B[0m\x1B[38;2;104;123;155m\x1B[48;2;15;39;63m▀\x1B[0m\x1B[38;2;255;255;254m\x1B[48;2;129;147;176m▀\x1B[0m\x1B[38;2;237;240;245m\x1B[48;2;242;244;249m▀\x1B[0m\x1B[38;2;255;255;254m\x1B[48;2;255;255;250m▀\x1B[0m\x1B[38;2;200;210;228m\x1B[48;2;231;234;240m▀\x1B[0m\x1B[38;2;47;60;105m\x1B[48;2;106;126;171m▀\x1B[0m\x1B[38;2;0;49;77m▄\x1B[0m\x1B[38;2;83;141;226m\x1B[48;2;5;55;177m▀\x1B[0m\x1B[38;2;69;123;229m\x1B[48;2;0;57;214m▀\x1B[0m\x1B[38;2;0;80;255m\x1B[48;2;63;97;141m▀\x1B[0m\x1B[38;2;249;234;209m▄\x1B[0m\x1B[38;2;0;62;187m\x1B[48;2;220;214;204m▀\x1B[0m\x1B[38;2;3;54;169m▀\x1B[0m   \x1B[38;2;146;157;178m\x1B[48;2;68;81;113m▀\x1B[0m\x1B[38;2;196;209;232m\x1B[48;2;24;44;76m▀\x1B[0m\x1B[38;2;52;75;114m\x1B[48;2;7;23;54m▀\x1B[0m  \x1B[38;2;71;79;92m\x1B[48;2;176;181;190m▀\x1B[0m\x1B[38;2;225;226;227m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;212;217;232m\x1B[48;2;70;94;129m▀\x1B[0m\x1B[38;2;75;103;158m▀\x1B[0m ",
			"\x1B[38;2;195;199;211m\x1B[48;2;196;196;197m▀\x1B[0m\x1B[38;2;255;255;255m▀\x1B[0m\x1B[38;2;151;163;188m\x1B[48;2;79;97;135m▀\x1B[0m\x1B[38;2;9;29;69m▀\x1B[0m  \x1B[38;2;100;116;141m▀\x1B[0m\x1B[38;2;214;217;224m\x1B[48;2;53;70;98m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;161;175;200m▀\x1B[0m\x1B[38;2;204;211;227m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;70;93;135m\x1B[48;2;183;194;211m▀\x1B[0m\x1B[38;2;6;57;165m\x1B[48;2;25;41;73m▀\x1B[0m\x1B[38;2;0;47;142m▀\x1B[0m\x1B[38;2;147;145;141m▀\x1B[0m\x1B[38;2;175;176;178m▀\x1B[0m\x1B[38;2;183;189;195m▀\x1B[0m  \x1B[38;2;73;80;100m\x1B[48;2;175;177;182m▀\x1B[0m\x1B[38;2;52;61;79m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;41;47;54m\x1B[48;2;206;209;214m▀\x1B[0m\x1B[38;2;75;98;130m▄\x1B[0m  \x1B[38;2;242;242;236m\x1B[48;2;159;158;157m▀\x1B[0m\x1B[38;2;252;255;255m\x1B[48;2;229;235;247m▀\x1B[0m\x1B[38;2;142;157;183m\x1B[48;2;47;73;122m▀\x1B[0m\x1B[38;2;2;17;41m▀\x1B[0m\x1B[38;2;77;84;102m▄\x1B[0m\x1B[38;2;42;59;85m▄\x1B[0m",
			"\x1B[38;2;130;139;158m\x1B[48;2;3;22;64m▀\x1B[0m\x1B[38;2;148;161;193m\x1B[48;2;8;28;72m▀\x1B[0m\x1B[38;2;28;44;79m▀\x1B[0m     \x1B[38;2;7;35;85m▀\x1B[0m\x1B[38;2;130;142;167m\x1B[48;2;22;35;58m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;140;156;179m▀\x1B[0m\x1B[38;2;186;193;202m\x1B[48;2;247;250;254m▀\x1B[0m\x1B[38;2;130;134;142m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;148;154;164m\x1B[48;2;249;251;255m▀\x1B[0m\x1B[38;2;34;57;88m\x1B[48;2;134;151;176m▀\x1B[0m  \x1B[38;2;121;130;144m\x1B[48;2;232;234;231m▀\x1B[0m\x1B[38;2;235;235;237m\x1B[48;2;216;224;238m▀\x1B[0m\x1B[38;2;210;217;227m\x1B[48;2;30;55;104m▀\x1B[0m\x1B[38;2;242;244;248m\x1B[48;2;80;94;125m▀\x1B[0m\x1B[38;2;213;219;226m\x1B[48;2;222;229;243m▀\x1B[0m\x1B[38;2;87;102;129m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;60;68;84m\x1B[48;2;246;245;242m▀\x1B[0m\x1B[38;2;213;214;215m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;194;200;211m\x1B[48;2;249;251;253m▀\x1B[0m\x1B[38;2;172;177;185m\x1B[48;2;215;223;236m▀\x1B[0m\x1B[38;2;217;214;211m\x1B[48;2;180;195;217m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;109;130;161m▀\x1B[0m\x1B[38;2;127;147;178m\x1B[48;2;49;70;103m▀\x1B[0m",
			"          \x1B[38;2;13;35;62m▀\x1B[0m\x1B[38;2;108;125;154m\x1B[48;2;11;11;28m▀\x1B[0m\x1B[38;2;95;111;146m\x1B[48;2;0;0;0m▀\x1B[0m\x1B[38;2;226;227;230m\x1B[48;2;118;131;156m▀\x1B[0m\x1B[38;2;240;244;246m\x1B[48;2;253;255;255m▀\x1B[0m\x1B[38;2;89;100;121m\x1B[48;2;255;253;249m▀\x1B[0m\x1B[38;2;182;183;183m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;171;188;215m▀\x1B[0m\x1B[38;2;114;129;157m\x1B[48;2;23;55;105m▀\x1B[0m\x1B[38;2;3;18;49m▀\x1B[0m \x1B[38;2;102;121;151m▀\x1B[0m\x1B[38;2;183;192;208m\x1B[48;2;3;11;52m▀\x1B[0m\x1B[38;2;149;157;178m\x1B[48;2;0;4;25m▀\x1B[0m\x1B[38;2;115;131;162m▀\x1B[0m\x1B[38;2;79;98;129m▀\x1B[0m\x1B[38;2;37;66;107m▀\x1B[0m\x1B[38;2;0;15;54m▀\x1B[0m\x1B[38;2;5;11;34m▀\x1B[0m ",
			"            \x1B[38;2;0;14;28m▄\x1B[0m\x1B[38;2;130;148;190m\x1B[48;2;194;198;205m▀\x1B[0m\x1B[38;2;181;193;219m\x1B[48;2;119;135;167m▀\x1B[0m\x1B[38;2;224;227;234m\x1B[48;2;0;10;37m▀\x1B[0m\x1B[38;2;192;203;222m\x1B[48;2;137;153;184m▀\x1B[0m\x1B[38;2;51;73;109m\x1B[48;2;68;82;114m▀\x1B[0m            ",
			"           \x1B[38;2;172;174;178m▄\x1B[0m\x1B[38;2;106;113;119m\x1B[48;2;255;255;254m▀\x1B[0m\x1B[38;2;243;247;251m\x1B[48;2;184;196;217m▀\x1B[0m\x1B[38;2;91;105;133m\x1B[48;2;23;57;115m▀\x1B[0m \x1B[38;2;250;250;250m\x1B[48;2;255;255;252m▀\x1B[0m\x1B[38;2;108;115;130m\x1B[48;2;219;223;228m▀\x1B[0m\x1B[38;2;74;95;131m▄\x1B[0m           ",
			"        \x1B[38;2;182;182;179m▄\x1B[0m\x1B[38;2;158;161;161m\x1B[48;2;233;232;229m▀\x1B[0m\x1B[38;2;155;159;168m\x1B[48;2;254;255;255m▀\x1B[0m\x1B[38;2;220;222;228m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;255;255;254m\x1B[48;2;185;198;218m▀\x1B[0m\x1B[38;2;105;124;160m\x1B[48;2;40;61;103m▀\x1B[0m \x1B[38;2;116;116;123m▄\x1B[0m\x1B[38;2;255;253;251m\x1B[48;2;236;234;230m▀\x1B[0m\x1B[38;2;231;237;246m\x1B[48;2;238;238;235m▀\x1B[0m\x1B[38;2;147;162;192m\x1B[48;2;253;253;252m▀\x1B[0m\x1B[38;2;78;81;95m\x1B[48;2;208;211;217m▀\x1B[0m\x1B[38;2;31;41;72m▄\x1B[0m         ",
			"       \x1B[38;2;0;0;0m▀\x1B[0m\x1B[38;2;188;194;201m\x1B[48;2;56;76;100m▀\x1B[0m\x1B[38;2;240;245;252m\x1B[48;2;62;82;119m▀\x1B[0m\x1B[38;2;219;223;229m\x1B[48;2;57;77;113m▀\x1B[0m\x1B[38;2;216;224;237m\x1B[48;2;51;72;113m▀\x1B[0m\x1B[38;2;97;123;171m\x1B[48;2;15;34;71m▀\x1B[0m\x1B[38;2;22;43;88m▀\x1B[0m \x1B[38;2;151;159;174m\x1B[48;2;54;69;93m▀\x1B[0m\x1B[38;2;246;250;255m\x1B[48;2;66;86;122m▀\x1B[0m\x1B[38;2;225;229;236m\x1B[48;2;59;81;118m▀\x1B[0m\x1B[38;2;230;233;239m\x1B[48;2;55;75;110m▀\x1B[0m\x1B[38;2;171;187;220m\x1B[48;2;39;62;103m▀\x1B[0m\x1B[38;2;46;74;125m\x1B[48;2;9;34;76m▀\x1B[0m         ",
			"                              "
		],
		[
			"            \x1B[38;2;36;53;77m\x1B[48;2;73;94;138m▀\x1B[0m\x1B[38;2;74;84;109m\x1B[48;2;238;245;255m▀\x1B[0m\x1B[38;2;103;108;127m\x1B[48;2;246;245;243m▀\x1B[0m\x1B[38;2;0;0;0m\x1B[48;2;140;145;157m▀\x1B[0m\x1B[38;2;86;88;98m▄\x1B[0m             ",
			"        \x1B[38;2;66;66;75m▄\x1B[0m\x1B[38;2;97;100;112m▄\x1B[0m  \x1B[38;2;44;59;94m▀\x1B[0m\x1B[38;2;154;169;199m\x1B[48;2;20;37;67m▀\x1B[0m\x1B[38;2;241;245;250m\x1B[48;2;65;83;119m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;129;147;187m▀\x1B[0m\x1B[38;2;251;250;244m\x1B[48;2;185;193;215m▀\x1B[0m\x1B[38;2;188;189;189m\x1B[48;2;249;250;249m▀\x1B[0m\x1B[38;2;75;78;90m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;18;26;52m\x1B[48;2;183;185;190m▀\x1B[0m          ",
			"     \x1B[38;2;24;21;27m▄\x1B[0m\x1B[38;2;0;0;23m\x1B[48;2;160;170;187m▀\x1B[0m\x1B[38;2;78;90;104m\x1B[48;2;242;246;252m▀\x1B[0m\x1B[38;2;227;228;229m\x1B[48;2;252;252;253m▀\x1B[0m\x1B[38;2;255;251;244m\x1B[48;2;188;199;219m▀\x1B[0m\x1B[38;2;201;199;197m\x1B[48;2;229;235;245m▀\x1B[0m\x1B[38;2;149;150;155m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;51;56;74m\x1B[48;2;248;247;245m▀\x1B[0m\x1B[38;2;184;184;188m▄\x1B[0m\x1B[38;2;92;97;111m▄\x1B[0m\x1B[38;2;20;28;55m\x1B[48;2;85;93;102m▀\x1B[0m\x1B[38;2;33;48;82m▀\x1B[0m\x1B[38;2;96;115;153m\x1B[48;2;17;35;82m▀\x1B[0m\x1B[38;2;232;235;240m\x1B[48;2;194;205;225m▀\x1B[0m\x1B[38;2;195;197;200m\x1B[48;2;229;228;224m▀\x1B[0m\x1B[38;2;0;0;0m\x1B[48;2;81;86;97m▀\x1B[0m         ",
			"     \x1B[38;2;90;99;119m\x1B[48;2;64;78;106m▀\x1B[0m\x1B[38;2;255;255;255m▀\x1B[0m\x1B[38;2;216;215;214m\x1B[48;2;207;207;205m▀\x1B[0m\x1B[38;2;87;109;144m\x1B[48;2;19;21;32m▀\x1B[0m\x1B[38;2;41;62;99m\x1B[48;2;7;7;0m▀\x1B[0m\x1B[38;2;53;66;98m▀\x1B[0m\x1B[38;2;116;132;164m\x1B[48;2;3;12;35m▀\x1B[0m\x1B[38;2;189;200;217m\x1B[48;2;13;28;62m▀\x1B[0m\x1B[38;2;247;248;250m\x1B[48;2;66;81;113m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;110;129;157m▀\x1B[0m\x1B[38;2;153;161;167m\x1B[48;2;42;55;70m▀\x1B[0m \x1B[38;2;37;55;95m\x1B[48;2;0;0;21m▀\x1B[0m\x1B[38;2;158;169;193m\x1B[48;2;108;128;166m▀\x1B[0m\x1B[38;2;255;255;255m▀\x1B[0m\x1B[38;2;68;73;87m\x1B[48;2;97;104;119m▀\x1B[0m         ",
			"     \x1B[38;2;0;0;0m▀\x1B[0m\x1B[38;2;158;168;186m\x1B[48;2;57;76;96m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;76;94;128m▀\x1B[0m\x1B[38;2;242;242;241m\x1B[48;2;194;203;221m▀\x1B[0m\x1B[38;2;197;198;200m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;82;87;97m\x1B[48;2;99;102;115m▀\x1B[0m   \x1B[38;2;2;10;36m▀\x1B[0m   \x1B[38;2;103;121;156m\x1B[48;2;39;61;109m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;220;228;247m▀\x1B[0m\x1B[38;2;217;217;216m\x1B[48;2;217;216;213m▀\x1B[0m\x1B[38;2;42;49;53m▄\x1B[0m        ",
			"      \x1B[38;2;82;117;159m▄\x1B[0m\x1B[38;2;86;105;138m\x1B[48;2;229;239;251m▀\x1B[0m\x1B[38;2;238;241;244m\x1B[48;2;254;255;255m▀\x1B[0m\x1B[38;2;233;233;233m\x1B[48;2;124;136;155m▀\x1B[0m\x1B[38;2;57;66;79m▀\x1B[0m\x1B[38;2;0;41;142m\x1B[48;2;39;135;255m▀\x1B[0m\x1B[38;2;3;23;104m\x1B[48;2;124;182;255m▀\x1B[0m\x1B[38;2;7;107;215m▄\x1B[0m    \x1B[38;2;45;64;106m\x1B[48;2;0;5;59m▀\x1B[0m\x1B[38;2;177;188;212m\x1B[48;2;117;138;178m▀\x1B[0m\x1B[38;2;255;255;249m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;104;111;117m\x1B[48;2;111;115;123m▀\x1B[0m   \x1B[38;2;0;3;18m▄\x1B[0m\x1B[38;2;55;62;81m▄\x1B[0m\x1B[38;2;66;75;96m▄\x1B[0m  ",
			"    \x1B[38;2;0;13;45m\x1B[48;2;0;0;35m▀\x1B[0m\x1B[38;2;85;95;112m\x1B[48;2;175;189;211m▀\x1B[0m\x1B[38;2;198;205;212m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;252;253;255m\x1B[48;2;134;154;185m▀\x1B[0m\x1B[38;2;168;187;216m\x1B[48;2;5;52;115m▀\x1B[0m \x1B[38;2;0;92;255m\x1B[48;2;13;90;214m▀\x1B[0m\x1B[38;2;63;126;233m\x1B[48;2;4;67;223m▀\x1B[0m\x1B[38;2;161;184;245m\x1B[48;2;0;50;214m▀\x1B[0m\x1B[38;2;0;83;210m\x1B[48;2;6;82;225m▀\x1B[0m \x1B[38;2;0;72;205m▄\x1B[0m\x1B[38;2;2;42;148m\x1B[48;2;169;211;255m▀\x1B[0m\x1B[38;2;0;53;196m\x1B[48;2;66;127;231m▀\x1B[0m\x1B[38;2;7;23;45m\x1B[48;2;0;0;65m▀\x1B[0m\x1B[38;2;117;139;180m\x1B[48;2;98;121;168m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;247;253;255m▀\x1B[0m\x1B[38;2;191;193;193m\x1B[48;2;219;218;212m▀\x1B[0m \x1B[38;2;96;109;131m▄\x1B[0m\x1B[38;2;28;49;85m\x1B[48;2;212;218;230m▀\x1B[0m\x1B[38;2;146;156;174m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;255;253;251m▀\x1B[0m\x1B[38;2;186;190;192m\x1B[48;2;221;221;220m▀\x1B[0m\x1B[38;2;0;0;0m▄\x1B[0m ",
			" \x1B[38;2;31;55;87m▄\x1B[0m\x1B[38;2;92;104;123m▄\x1B[0m\x1B[38;2;112;122;142m▄\x1B[0m\x1B[38;2;11;30;54m▀\x1B[0m\x1B[38;2;57;76;108m\x1B[48;2;13;13;27m▀\x1B[0m\x1B[38;2;130;148;177m\x1B[48;2;0;0;19m▀\x1B[0m\x1B[38;2;29;51;85m▀\x1B[0m   \x1B[38;2;7;77;243m▀\x1B[0m\x1B[38;2;5;55;183m\x1B[48;2;163;159;147m▀\x1B[0m\x1B[38;2;173;173;173m▄\x1B[0m \x1B[38;2;0;94;248m\x1B[48;2;15;88;205m▀\x1B[0m\x1B[38;2;102;140;222m\x1B[48;2;0;52;220m▀\x1B[0m\x1B[38;2;46;114;232m\x1B[48;2;2;72;220m▀\x1B[0m \x1B[38;2;70;86;124m\x1B[48;2;64;98;163m▀\x1B[0m\x1B[38;2;191;203;222m\x1B[48;2;196;206;224m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;255;252;245m▀\x1B[0m\x1B[38;2;195;200;206m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;241;243;242m\x1B[48;2;240;244;249m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;133;149;180m▀\x1B[0m\x1B[38;2;189;201;224m\x1B[48;2;40;68;130m▀\x1B[0m\x1B[38;2;176;190;217m\x1B[48;2;100;116;154m▀\x1B[0m\x1B[38;2;254;253;249m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;75;79;101m\x1B[48;2;147;147;162m▀\x1B[0m ",
			" \x1B[38;2;113;148;201m\x1B[48;2;41;62;100m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;171;185;205m▀\x1B[0m\x1B[38;2;172;179;185m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;29;55;81m\x1B[48;2;124;130;143m▀\x1B[0m\x1B[38;2;0;0;0m▄\x1B[0m      \x1B[38;2;135;140;156m▀\x1B[0m\x1B[38;2;172;173;173m▀\x1B[0m\x1B[38;2;130;129;125m▀\x1B[0m\x1B[38;2;22;38;99m▀\x1B[0m\x1B[38;2;7;69;202m▀\x1B[0m\x1B[38;2;6;24;72m▄\x1B[0m\x1B[38;2;0;28;56m\x1B[48;2;137;150;174m▀\x1B[0m\x1B[38;2;152;173;198m\x1B[48;2;244;246;248m▀\x1B[0m\x1B[38;2;253;252;248m\x1B[48;2;251;252;253m▀\x1B[0m\x1B[38;2;255;255;253m\x1B[48;2;155;170;192m▀\x1B[0m\x1B[38;2;195;204;219m\x1B[48;2;31;45;77m▀\x1B[0m\x1B[38;2;82;102;136m\x1B[48;2;0;0;0m▀\x1B[0m\x1B[38;2;16;38;94m▀\x1B[0m \x1B[38;2;67;85;126m\x1B[48;2;26;42;76m▀\x1B[0m\x1B[38;2;242;246;252m\x1B[48;2;187;199;220m▀\x1B[0m\x1B[38;2;209;211;213m\x1B[48;2;255;255;251m▀\x1B[0m\x1B[38;2;23;30;40m\x1B[48;2;81;84;94m▀\x1B[0m",
			"  \x1B[38;2;96;124;165m▀\x1B[0m\x1B[38;2;219;228;243m\x1B[48;2;64;85;126m▀\x1B[0m\x1B[38;2;244;245;248m\x1B[48;2;228;232;240m▀\x1B[0m\x1B[38;2;83;97;126m\x1B[48;2;227;230;237m▀\x1B[0m\x1B[38;2;62;73;99m▄\x1B[0m\x1B[38;2;88;110;141m\x1B[48;2;150;161;177m▀\x1B[0m\x1B[38;2;99;107;123m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;96;103;114m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;64;67;79m\x1B[48;2;156;162;175m▀\x1B[0m\x1B[38;2;0;0;0m▄\x1B[0m  \x1B[38;2;27;34;48m\x1B[48;2;140;152;161m▀\x1B[0m\x1B[38;2;94;102;114m\x1B[48;2;253;255;255m▀\x1B[0m\x1B[38;2;109;115;129m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;146;158;176m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;222;232;244m▀\x1B[0m\x1B[38;2;215;221;228m\x1B[48;2;56;77;111m▀\x1B[0m\x1B[38;2;95;112;144m\x1B[48;2;13;18;23m▀\x1B[0m     \x1B[38;2;0;0;0m▀\x1B[0m\x1B[38;2;105;118;146m\x1B[48;2;45;57;88m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;215;227;248m▀\x1B[0m\x1B[38;2;143;146;155m\x1B[48;2;131;136;154m▀\x1B[0m",
			"\x1B[38;2;52;62;88m\x1B[48;2;87;107;145m▀\x1B[0m\x1B[38;2;78;87;109m\x1B[48;2;254;255;255m▀\x1B[0m\x1B[38;2;202;206;211m\x1B[48;2;255;255;253m▀\x1B[0m\x1B[38;2;98;105;127m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;144;157;181m\x1B[48;2;255;255;247m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;251;248;243m▀\x1B[0m\x1B[38;2;170;179;192m\x1B[48;2;255;255;250m▀\x1B[0m\x1B[38;2;231;229;228m\x1B[48;2;239;245;250m▀\x1B[0m\x1B[38;2;218;221;229m\x1B[48;2;104;120;145m▀\x1B[0m\x1B[38;2;193;200;214m\x1B[48;2;58;81;114m▀\x1B[0m\x1B[38;2;251;255;255m\x1B[48;2;216;225;241m▀\x1B[0m\x1B[38;2;114;124;141m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;201;207;217m▄\x1B[0m\x1B[38;2;194;201;206m▄\x1B[0m\x1B[38;2;203;204;207m\x1B[48;2;253;253;252m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;185;199;224m▀\x1B[0m\x1B[38;2;176;185;202m\x1B[48;2;50;69;110m▀\x1B[0m\x1B[38;2;152;164;190m\x1B[48;2;0;0;33m▀\x1B[0m\x1B[38;2;94;109;131m\x1B[48;2;23;30;38m▀\x1B[0m        \x1B[38;2;63;75;92m▀\x1B[0m\x1B[38;2;63;80;113m▀\x1B[0m\x1B[38;2;52;69;95m▀\x1B[0m",
			"\x1B[38;2;50;69;102m▀\x1B[0m\x1B[38;2;140;155;189m▀\x1B[0m\x1B[38;2;172;185;204m▀\x1B[0m\x1B[38;2;166;178;201m▀\x1B[0m\x1B[38;2;168;180;202m▀\x1B[0m\x1B[38;2;170;181;201m▀\x1B[0m\x1B[38;2;183;191;211m▀\x1B[0m\x1B[38;2;127;141;165m▀\x1B[0m\x1B[38;2;20;40;74m▀\x1B[0m\x1B[38;2;0;0;0m▀\x1B[0m\x1B[38;2;89;104;132m▀\x1B[0m\x1B[38;2;232;236;241m\x1B[48;2;107;128;162m▀\x1B[0m\x1B[38;2;255;255;253m\x1B[48;2;162;177;203m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;172;185;206m▀\x1B[0m\x1B[38;2;238;238;238m\x1B[48;2;154;172;210m▀\x1B[0m\x1B[38;2;62;83;122m\x1B[48;2;51;66;104m▀\x1B[0m\x1B[38;2;0;0;20m▀\x1B[0m             ",
			"          \x1B[38;2;176;181;184m▄\x1B[0m\x1B[38;2;181;192;204m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;80;102;138m\x1B[48;2;138;144;157m▀\x1B[0m\x1B[38;2;0;2;42m▀\x1B[0m\x1B[38;2;103;116;148m\x1B[48;2;122;123;137m▀\x1B[0m\x1B[38;2;181;192;214m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;61;81;122m\x1B[48;2;126;132;141m▀\x1B[0m             ",
			"      \x1B[38;2;30;35;53m▄\x1B[0m\x1B[38;2;173;174;177m▄\x1B[0m\x1B[38;2;160;162;168m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;136;141;152m\x1B[48;2;252;252;253m▀\x1B[0m\x1B[38;2;206;214;229m\x1B[48;2;255;253;248m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;216;221;229m▀\x1B[0m\x1B[38;2;143;167;209m\x1B[48;2;71;95;139m▀\x1B[0m \x1B[38;2;101;127;172m\x1B[48;2;17;45;107m▀\x1B[0m\x1B[38;2;243;247;254m\x1B[48;2;194;200;214m▀\x1B[0m\x1B[38;2;244;243;237m\x1B[48;2;248;248;248m▀\x1B[0m\x1B[38;2;146;158;172m\x1B[48;2;136;155;191m▀\x1B[0m\x1B[38;2;203;211;221m▄\x1B[0m\x1B[38;2;97;95;102m▄\x1B[0m\x1B[38;2;0;0;0m▄\x1B[0m         ",
			"      \x1B[38;2;43;60;91m▀\x1B[0m\x1B[38;2;176;194;220m\x1B[48;2;2;13;57m▀\x1B[0m\x1B[38;2;193;202;219m\x1B[48;2;16;43;97m▀\x1B[0m\x1B[38;2;198;207;221m\x1B[48;2;46;73;125m▀\x1B[0m\x1B[38;2;238;241;245m\x1B[48;2;90;110;156m▀\x1B[0m\x1B[38;2;145;161;191m\x1B[48;2;81;100;147m▀\x1B[0m\x1B[38;2;36;61;102m▀\x1B[0m  \x1B[38;2;146;155;173m\x1B[48;2;77;99;130m▀\x1B[0m\x1B[38;2;244;244;242m\x1B[48;2;250;254;255m▀\x1B[0m\x1B[38;2;209;212;217m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;253;254;253m\x1B[48;2;255;255;252m▀\x1B[0m\x1B[38;2;222;221;222m\x1B[48;2;241;244;249m▀\x1B[0m\x1B[38;2;59;61;77m\x1B[48;2;123;147;194m▀\x1B[0m\x1B[38;2;23;47;92m▄\x1B[0m        ",
			"         \x1B[38;2;2;24;62m▀\x1B[0m\x1B[38;2;20;42;82m▀\x1B[0m\x1B[38;2;30;48;85m▀\x1B[0m   \x1B[38;2;66;94;127m▀\x1B[0m\x1B[38;2;126;145;177m▀\x1B[0m\x1B[38;2;130;146;175m▀\x1B[0m\x1B[38;2;134;149;173m▀\x1B[0m\x1B[38;2;115;134;165m▀\x1B[0m\x1B[38;2;46;70;114m▀\x1B[0m\x1B[38;2;21;40;77m▀\x1B[0m        "
		],
		[
			"                              ",
			"            \x1B[38;2;138;142;149m▄\x1B[0m\x1B[38;2;152;155;161m▄\x1B[0m\x1B[38;2;158;161;170m▄\x1B[0m\x1B[38;2;157;159;166m▄\x1B[0m\x1B[38;2;154;155;158m▄\x1B[0m\x1B[38;2;159;162;169m▄\x1B[0m\x1B[38;2;96;111;137m▄\x1B[0m           ",
			"          \x1B[38;2;87;95;103m▄\x1B[0m\x1B[38;2;205;207;210m\x1B[48;2;221;222;220m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;234;239;246m▀\x1B[0m\x1B[38;2;248;250;255m\x1B[48;2;67;85;125m▀\x1B[0m\x1B[38;2;245;249;254m\x1B[48;2;49;64;104m▀\x1B[0m\x1B[38;2;247;250;255m\x1B[48;2;48;65;106m▀\x1B[0m\x1B[38;2;243;246;252m\x1B[48;2;46;62;108m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;48;67;111m▀\x1B[0m\x1B[38;2;117;136;171m\x1B[48;2;39;57;97m▀\x1B[0m           ",
			"   \x1B[38;2;249;249;255m▄\x1B[0m\x1B[38;2;185;190;205m▄\x1B[0m    \x1B[38;2;155;157;171m▄\x1B[0m\x1B[38;2;160;161;165m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;186;193;205m▀\x1B[0m\x1B[38;2;103;123;158m\x1B[48;2;4;16;48m▀\x1B[0m\x1B[38;2;19;38;70m▀\x1B[0m\x1B[38;2;117;124;130m▄\x1B[0m\x1B[38;2;232;230;233m▄\x1B[0m\x1B[38;2;31;31;27m\x1B[48;2;238;238;238m▀\x1B[0m\x1B[38;2;28;24;16m\x1B[48;2;230;230;229m▀\x1B[0m\x1B[38;2;34;29;25m\x1B[48;2;234;234;236m▀\x1B[0m\x1B[38;2;40;43;50m\x1B[48;2;235;235;235m▀\x1B[0m\x1B[38;2;35;39;57m\x1B[48;2;225;225;224m▀\x1B[0m\x1B[38;2;114;136;165m▄\x1B[0m        ",
			"  \x1B[38;2;0;2;19m\x1B[48;2;170;171;175m▀\x1B[0m\x1B[38;2;210;211;214m\x1B[48;2;229;234;242m▀\x1B[0m\x1B[38;2;222;229;239m\x1B[48;2;233;237;245m▀\x1B[0m\x1B[38;2;91;115;150m\x1B[48;2;198;205;217m▀\x1B[0m\x1B[38;2;44;60;97m▄\x1B[0m \x1B[38;2;27;33;38m\x1B[48;2;139;146;161m▀\x1B[0m\x1B[38;2;239;241;238m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;249;254;255m\x1B[48;2;146;161;190m▀\x1B[0m\x1B[38;2;76;92;129m\x1B[48;2;2;18;49m▀\x1B[0m  \x1B[38;2;42;53;74m▀\x1B[0m\x1B[38;2;128;146;177m▀\x1B[0m\x1B[38;2;135;151;183m▀\x1B[0m\x1B[38;2;135;151;184m▀\x1B[0m\x1B[38;2;136;153;186m▀\x1B[0m\x1B[38;2;156;168;193m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;106;113;128m▀\x1B[0m\x1B[38;2;182;194;210m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;77;97;123m\x1B[48;2;177;188;207m▀\x1B[0m       ",
			"\x1B[38;2;0;0;0m\x1B[48;2;190;192;195m▀\x1B[0m\x1B[38;2;118;122;129m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;165;178;201m▀\x1B[0m\x1B[38;2;131;147;175m\x1B[48;2;8;41;106m▀\x1B[0m\x1B[38;2;135;153;181m\x1B[48;2;66;88;144m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;195;204;217m▀\x1B[0m\x1B[38;2;150;160;176m\x1B[48;2;248;247;243m▀\x1B[0m\x1B[38;2;88;95;114m\x1B[48;2;222;221;221m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;248;250;253m▀\x1B[0m\x1B[38;2;204;213;229m\x1B[48;2;102;124;159m▀\x1B[0m\x1B[38;2;59;82;125m▀\x1B[0m       \x1B[38;2;153;153;154m\x1B[48;2;206;207;208m▀\x1B[0m\x1B[38;2;212;212;209m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;214;211;204m\x1B[48;2;243;247;255m▀\x1B[0m\x1B[38;2;255;255;254m\x1B[48;2;165;180;204m▀\x1B[0m\x1B[38;2;140;158;188m\x1B[48;2;21;42;80m▀\x1B[0m       ",
			"\x1B[38;2;168;170;176m\x1B[48;2;65;83;110m▀\x1B[0m\x1B[38;2;204;215;232m\x1B[48;2;55;71;101m▀\x1B[0m\x1B[38;2;31;51;85m▀\x1B[0m  \x1B[38;2;63;77;108m▀\x1B[0m\x1B[38;2;206;212;224m\x1B[48;2;65;78;111m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;248;248;247m▀\x1B[0m\x1B[38;2;155;167;194m\x1B[48;2;201;209;223m▀\x1B[0m\x1B[38;2;0;18;91m\x1B[48;2;79;107;163m▀\x1B[0m\x1B[38;2;137;137;122m▀\x1B[0m\x1B[38;2;175;175;176m\x1B[48;2;155;155;155m▀\x1B[0m\x1B[38;2;208;208;211m▀\x1B[0m \x1B[38;2;120;120;120m\x1B[48;2;137;137;137m▀\x1B[0m\x1B[38;2;163;164;165m▀\x1B[0m\x1B[38;2;161;158;158m\x1B[48;2;204;198;192m▀\x1B[0m \x1B[38;2;215;215;215m\x1B[48;2;176;189;208m▀\x1B[0m\x1B[38;2;211;218;231m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;42;68;118m\x1B[48;2;107;123;145m▀\x1B[0m         ",
			"       \x1B[38;2;152;156;168m\x1B[48;2;15;25;50m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;222;224;228m▀\x1B[0m\x1B[38;2;154;169;199m\x1B[48;2;223;227;235m▀\x1B[0m\x1B[38;2;0;0;0m\x1B[48;2;29;45;79m▀\x1B[0m \x1B[38;2;95;99;99m▀\x1B[0m\x1B[38;2;179;179;185m\x1B[48;2;182;182;180m▀\x1B[0m\x1B[38;2;201;201;201m\x1B[48;2;175;175;173m▀\x1B[0m   \x1B[38;2;19;35;66m▀\x1B[0m\x1B[38;2;201;203;210m\x1B[48;2;121;130;150m▀\x1B[0m\x1B[38;2;210;220;229m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;7;32;69m\x1B[48;2;110;127;153m▀\x1B[0m    \x1B[38;2;94;105;121m▄\x1B[0m\x1B[38;2;91;100;123m▄\x1B[0m\x1B[38;2;38;46;76m▄\x1B[0m ",
			"        \x1B[38;2;122;135;160m\x1B[48;2;0;0;20m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;205;208;216m▀\x1B[0m\x1B[38;2;146;159;184m\x1B[48;2;236;240;246m▀\x1B[0m\x1B[38;2;172;176;179m▄\x1B[0m\x1B[38;2;142;145;153m▄\x1B[0m\x1B[38;2;0;0;22m▄\x1B[0m   \x1B[38;2;185;187;187m▄\x1B[0m\x1B[38;2;205;204;202m▄\x1B[0m\x1B[38;2;51;59;82m\x1B[48;2;132;140;153m▀\x1B[0m\x1B[38;2;114;128;156m\x1B[48;2;4;12;36m▀\x1B[0m\x1B[38;2;48;64;94m▀\x1B[0m   \x1B[38;2;31;37;48m\x1B[48;2;198;201;207m▀\x1B[0m\x1B[38;2;238;238;238m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;227;234;248m\x1B[48;2;112;136;179m▀\x1B[0m\x1B[38;2;49;64;104m▀\x1B[0m ",
			"         \x1B[38;2;132;152;182m▀\x1B[0m\x1B[38;2;221;227;241m\x1B[48;2;66;81;118m▀\x1B[0m\x1B[38;2;241;243;248m\x1B[48;2;68;83;120m▀\x1B[0m\x1B[38;2;254;255;255m\x1B[48;2;232;235;236m▀\x1B[0m\x1B[38;2;104;113;133m\x1B[48;2;251;253;253m▀\x1B[0m\x1B[38;2;70;88;122m▄\x1B[0m\x1B[38;2;149;156;161m▄\x1B[0m\x1B[38;2;128;131;138m\x1B[48;2;255;254;253m▀\x1B[0m\x1B[38;2;245;246;247m\x1B[48;2;198;209;225m▀\x1B[0m\x1B[38;2;238;241;248m\x1B[48;2;61;86;130m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;192;202;218m▀\x1B[0m\x1B[38;2;166;176;193m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;120;128;145m▄\x1B[0m \x1B[38;2;0;0;0m\x1B[48;2;156;159;162m▀\x1B[0m\x1B[38;2;185;187;190m\x1B[48;2;254;255;255m▀\x1B[0m\x1B[38;2;254;255;255m\x1B[48;2;115;132;166m▀\x1B[0m\x1B[38;2;115;132;159m\x1B[48;2;0;0;29m▀\x1B[0m\x1B[38;2;7;21;44m▀\x1B[0m  ",
			"            \x1B[38;2;139;147;171m\x1B[48;2;125;142;181m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;187;198;218m▀\x1B[0m\x1B[38;2;218;220;222m\x1B[48;2;253;254;251m▀\x1B[0m\x1B[38;2;239;237;234m\x1B[48;2;229;235;244m▀\x1B[0m\x1B[38;2;234;239;243m\x1B[48;2;101;122;160m▀\x1B[0m\x1B[38;2;74;104;143m▀\x1B[0m \x1B[38;2;53;69;94m▀\x1B[0m\x1B[38;2;215;221;230m\x1B[48;2;111;129;156m▀\x1B[0m\x1B[38;2;242;242;242m\x1B[48;2;201;212;225m▀\x1B[0m\x1B[38;2;197;196;194m\x1B[48;2;204;213;231m▀\x1B[0m\x1B[38;2;237;235;234m\x1B[48;2;195;204;222m▀\x1B[0m\x1B[38;2;253;254;251m\x1B[48;2;190;200;218m▀\x1B[0m\x1B[38;2;212;214;217m\x1B[48;2;202;209;223m▀\x1B[0m\x1B[38;2;255;255;251m\x1B[48;2;197;207;223m▀\x1B[0m\x1B[38;2;255;254;246m\x1B[48;2;197;206;220m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;178;192;215m▀\x1B[0m\x1B[38;2;88;106;133m\x1B[48;2;45;62;90m▀\x1B[0m",
			"            \x1B[38;2;255;255;255m\x1B[48;2;202;199;192m▀\x1B[0m\x1B[38;2;190;201;224m\x1B[48;2;247;253;255m▀\x1B[0m\x1B[38;2;78;95;132m\x1B[48;2;0;42;122m▀\x1B[0m\x1B[38;2;123;138;165m\x1B[48;2;255;255;250m▀\x1B[0m\x1B[38;2;104;125;170m\x1B[48;2;201;209;224m▀\x1B[0m\x1B[38;2;5;33;60m▄\x1B[0m            ",
			"          \x1B[38;2;135;137;139m▄\x1B[0m\x1B[38;2;52;70;96m\x1B[48;2;149;160;177m▀\x1B[0m\x1B[38;2;224;225;226m\x1B[48;2;219;224;230m▀\x1B[0m\x1B[38;2;229;231;236m\x1B[48;2;173;184;201m▀\x1B[0m\x1B[38;2;0;0;28m\x1B[48;2;0;0;0m▀\x1B[0m\x1B[38;2;246;244;240m\x1B[48;2;255;255;249m▀\x1B[0m\x1B[38;2;255;255;255m▀\x1B[0m\x1B[38;2;173;186;205m\x1B[48;2;162;178;203m▀\x1B[0m\x1B[38;2;84;101;132m▄\x1B[0m           ",
			"        \x1B[38;2;13;30;61m▄\x1B[0m\x1B[38;2;167;167;165m\x1B[48;2;214;219;228m▀\x1B[0m\x1B[38;2;255;255;251m\x1B[48;2;249;250;252m▀\x1B[0m\x1B[38;2;249;250;251m\x1B[48;2;238;239;240m▀\x1B[0m\x1B[38;2;255;255;249m\x1B[48;2;199;210;228m▀\x1B[0m\x1B[38;2;146;164;195m\x1B[48;2;95;117;156m▀\x1B[0m\x1B[38;2;0;0;15m\x1B[48;2;0;0;25m▀\x1B[0m\x1B[38;2;225;228;235m\x1B[48;2;118;145;191m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;226;232;243m▀\x1B[0m\x1B[38;2;235;236;234m\x1B[48;2;245;244;246m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;246;247;247m▀\x1B[0m\x1B[38;2;212;218;223m\x1B[48;2;168;183;212m▀\x1B[0m\x1B[38;2;16;33;58m\x1B[48;2;40;61;106m▀\x1B[0m         ",
			"        \x1B[38;2;37;45;60m▀\x1B[0m\x1B[38;2;70;88;120m▀\x1B[0m\x1B[38;2;77;92;128m▀\x1B[0m\x1B[38;2;72;86;121m▀\x1B[0m\x1B[38;2;55;78;123m▀\x1B[0m\x1B[38;2;19;39;74m▀\x1B[0m \x1B[38;2;67;72;76m▀\x1B[0m\x1B[38;2;71;88;121m▀\x1B[0m\x1B[38;2;75;89;124m▀\x1B[0m\x1B[38;2;73;87;121m▀\x1B[0m\x1B[38;2;46;70;117m▀\x1B[0m\x1B[38;2;21;51;89m▀\x1B[0m         ",
			"                              "
		],
		[
			"                              ",
			"            \x1B[38;2;130;133;140m▄\x1B[0m\x1B[38;2;159;161;168m▄\x1B[0m\x1B[38;2;154;156;161m▄\x1B[0m\x1B[38;2;158;160;167m▄\x1B[0m\x1B[38;2;155;158;162m▄\x1B[0m\x1B[38;2;161;164;169m▄\x1B[0m\x1B[38;2;99;109;135m▄\x1B[0m           ",
			"          \x1B[38;2;58;66;77m▄\x1B[0m\x1B[38;2;148;153;157m\x1B[48;2;221;223;223m▀\x1B[0m\x1B[38;2;246;247;246m\x1B[48;2;244;248;251m▀\x1B[0m\x1B[38;2;251;254;255m\x1B[48;2;60;76;112m▀\x1B[0m\x1B[38;2;244;247;252m\x1B[48;2;48;63;104m▀\x1B[0m\x1B[38;2;243;246;252m\x1B[48;2;43;60;106m▀\x1B[0m\x1B[38;2;243;246;252m\x1B[48;2;48;63;106m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;43;61;104m▀\x1B[0m\x1B[38;2;128;145;177m\x1B[48;2;27;42;81m▀\x1B[0m\x1B[38;2;0;0;9m▀\x1B[0m          ",
			"   \x1B[38;2;255;255;255m▄\x1B[0m\x1B[38;2;141;144;153m▄\x1B[0m    \x1B[38;2;131;140;152m▄\x1B[0m\x1B[38;2;188;191;196m\x1B[48;2;255;255;252m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;188;196;214m▀\x1B[0m\x1B[38;2;124;141;166m\x1B[48;2;8;27;68m▀\x1B[0m\x1B[38;2;0;3;27m▀\x1B[0m\x1B[38;2;52;59;75m▄\x1B[0m\x1B[38;2;28;28;19m\x1B[48;2;222;223;227m▀\x1B[0m\x1B[38;2;30;25;20m\x1B[48;2;238;237;235m▀\x1B[0m\x1B[38;2;30;27;27m\x1B[48;2;234;235;236m▀\x1B[0m\x1B[38;2;40;40;28m\x1B[48;2;233;233;234m▀\x1B[0m\x1B[38;2;48;48;59m\x1B[48;2;230;228;226m▀\x1B[0m\x1B[38;2;37;40;57m\x1B[48;2;227;227;228m▀\x1B[0m\x1B[38;2;79;91;114m▄\x1B[0m        ",
			"  \x1B[38;2;32;37;48m\x1B[48;2;178;182;184m▀\x1B[0m\x1B[38;2;238;238;238m\x1B[48;2;224;230;239m▀\x1B[0m\x1B[38;2;233;239;248m\x1B[48;2;233;237;241m▀\x1B[0m\x1B[38;2;72;92;127m\x1B[48;2;201;207;215m▀\x1B[0m\x1B[38;2;48;71;114m▄\x1B[0m \x1B[38;2;21;29;42m\x1B[48;2;126;129;140m▀\x1B[0m\x1B[38;2;214;214;214m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;246;248;252m\x1B[48;2;133;146;172m▀\x1B[0m\x1B[38;2;63;82;122m\x1B[48;2;0;12;43m▀\x1B[0m  \x1B[38;2;47;56;69m▀\x1B[0m\x1B[38;2;132;146;174m▀\x1B[0m\x1B[38;2;137;153;184m▀\x1B[0m\x1B[38;2;135;151;181m▀\x1B[0m\x1B[38;2;138;153;185m▀\x1B[0m\x1B[38;2;141;154;182m▀\x1B[0m\x1B[38;2;242;243;245m\x1B[48;2;119;121;133m▀\x1B[0m\x1B[38;2;196;203;213m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;73;89;117m\x1B[48;2;193;201;218m▀\x1B[0m       ",
			"\x1B[38;2;132;134;137m▄\x1B[0m\x1B[38;2;144;149;156m\x1B[48;2;247;245;242m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;193;203;224m▀\x1B[0m\x1B[38;2;137;151;173m\x1B[48;2;43;62;105m▀\x1B[0m\x1B[38;2;132;149;172m\x1B[48;2;60;88;129m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;186;195;212m▀\x1B[0m\x1B[38;2;149;159;177m\x1B[48;2;250;248;241m▀\x1B[0m\x1B[38;2;71;78;92m\x1B[48;2;220;220;219m▀\x1B[0m\x1B[38;2;242;241;239m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;221;229;242m\x1B[48;2;104;117;145m▀\x1B[0m\x1B[38;2;60;77;107m\x1B[48;2;0;23;115m▀\x1B[0m\x1B[38;2;48;108;227m▄\x1B[0m\x1B[38;2;37;98;212m▄\x1B[0m \x1B[38;2;0;61;158m▄\x1B[0m\x1B[38;2;45;108;217m▄\x1B[0m\x1B[38;2;35;94;221m▄\x1B[0m \x1B[38;2;184;184;184m\x1B[48;2;246;248;248m▀\x1B[0m\x1B[38;2;203;203;200m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;211;210;206m\x1B[48;2;240;244;255m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;180;195;218m▀\x1B[0m\x1B[38;2;177;189;210m\x1B[48;2;67;93;125m▀\x1B[0m       ",
			"\x1B[38;2;161;165;176m\x1B[48;2;61;77;105m▀\x1B[0m\x1B[38;2;222;230;243m\x1B[48;2;60;80;114m▀\x1B[0m\x1B[38;2;37;56;95m▀\x1B[0m  \x1B[38;2;62;77;105m▀\x1B[0m\x1B[38;2;210;218;233m\x1B[48;2;62;85;128m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;231;234;237m▀\x1B[0m\x1B[38;2;204;212;224m\x1B[48;2;228;234;240m▀\x1B[0m\x1B[38;2;73;56;85m\x1B[48;2;99;94;122m▀\x1B[0m\x1B[38;2;0;128;255m\x1B[48;2;0;152;255m▀\x1B[0m\x1B[38;2;150;206;255m\x1B[48;2;6;95;234m▀\x1B[0m\x1B[38;2;53;124;251m\x1B[48;2;5;92;235m▀\x1B[0m \x1B[38;2;0;88;244m\x1B[48;2;0;90;220m▀\x1B[0m\x1B[38;2;145;192;255m\x1B[48;2;3;69;226m▀\x1B[0m\x1B[38;2;65;126;246m\x1B[48;2;7;81;234m▀\x1B[0m \x1B[38;2;246;242;237m\x1B[48;2;141;156;174m▀\x1B[0m\x1B[38;2;230;234;242m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;36;55;104m\x1B[48;2;122;135;161m▀\x1B[0m\x1B[38;2;39;71;119m▀\x1B[0m        ",
			"       \x1B[38;2;161;166;174m\x1B[48;2;73;79;96m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;249;248;247m▀\x1B[0m\x1B[38;2;133;151;179m\x1B[48;2;236;241;249m▀\x1B[0m\x1B[38;2;0;0;25m\x1B[48;2;74;94;135m▀\x1B[0m\x1B[38;2;3;98;255m▀\x1B[0m\x1B[38;2;62;137;238m▀\x1B[0m\x1B[38;2;255;255;243m\x1B[48;2;233;239;239m▀\x1B[0m\x1B[38;2;210;213;227m\x1B[48;2;242;242;242m▀\x1B[0m\x1B[38;2;18;85;239m▀\x1B[0m\x1B[38;2;5;90;255m▀\x1B[0m \x1B[38;2;11;35;74m▀\x1B[0m\x1B[38;2;207;211;219m\x1B[48;2;179;190;204m▀\x1B[0m\x1B[38;2;209;217;227m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;0;24;78m\x1B[48;2;122;138;169m▀\x1B[0m    \x1B[38;2;113;125;141m▄\x1B[0m\x1B[38;2;89;102;125m▄\x1B[0m\x1B[38;2;28;42;85m▄\x1B[0m ",
			"        \x1B[38;2;112;129;159m\x1B[48;2;0;0;15m▀\x1B[0m\x1B[38;2;250;253;255m\x1B[48;2;160;173;195m▀\x1B[0m\x1B[38;2;156;165;179m\x1B[48;2;248;249;251m▀\x1B[0m\x1B[38;2;0;0;16m\x1B[48;2;169;173;177m▀\x1B[0m\x1B[38;2;150;153;159m▄\x1B[0m    \x1B[38;2;198;200;205m▄\x1B[0m\x1B[38;2;199;196;196m▄\x1B[0m\x1B[38;2;24;29;56m\x1B[48;2;189;191;197m▀\x1B[0m\x1B[38;2;100;112;135m\x1B[48;2;32;45;71m▀\x1B[0m\x1B[38;2;53;67;99m\x1B[48;2;0;0;0m▀\x1B[0m  \x1B[38;2;0;6;31m▄\x1B[0m\x1B[38;2;32;41;61m\x1B[48;2;177;183;189m▀\x1B[0m\x1B[38;2;231;231;230m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;224;233;251m\x1B[48;2;99;126;167m▀\x1B[0m\x1B[38;2;26;45;90m\x1B[48;2;0;0;22m▀\x1B[0m ",
			"         \x1B[38;2;102;120;147m▀\x1B[0m\x1B[38;2;213;221;235m\x1B[48;2;52;66;98m▀\x1B[0m\x1B[38;2;243;247;255m\x1B[48;2;87;109;150m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;231;237;243m▀\x1B[0m\x1B[38;2;153;163;180m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;62;78;107m▄\x1B[0m\x1B[38;2;92;97;107m▄\x1B[0m\x1B[38;2;153;153;157m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;250;250;250m\x1B[48;2;191;200;219m▀\x1B[0m\x1B[38;2;236;239;246m\x1B[48;2;47;68;117m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;180;187;204m▀\x1B[0m\x1B[38;2;189;198;212m\x1B[48;2;255;255;255m▀\x1B[0m\x1B[38;2;43;59;81m\x1B[48;2;131;141;159m▀\x1B[0m \x1B[38;2;178;180;182m▄\x1B[0m\x1B[38;2;196;198;201m\x1B[48;2;255;255;254m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;133;149;181m▀\x1B[0m\x1B[38;2;123;138;164m\x1B[48;2;0;13;52m▀\x1B[0m\x1B[38;2;2;15;46m▀\x1B[0m  ",
			"            \x1B[38;2;154;168;188m\x1B[48;2;100;127;163m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;157;174;203m▀\x1B[0m\x1B[38;2;217;219;220m\x1B[48;2;250;251;251m▀\x1B[0m\x1B[38;2;241;240;236m\x1B[48;2;235;241;249m▀\x1B[0m\x1B[38;2;232;237;246m\x1B[48;2;101;116;151m▀\x1B[0m\x1B[38;2;76;92;129m▀\x1B[0m \x1B[38;2;47;59;94m▀\x1B[0m\x1B[38;2;203;209;223m\x1B[48;2;82;100;128m▀\x1B[0m\x1B[38;2;255;253;249m\x1B[48;2;199;209;222m▀\x1B[0m\x1B[38;2;255;252;244m\x1B[48;2;197;206;224m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;192;202;220m▀\x1B[0m\x1B[38;2;255;255;249m\x1B[48;2;190;200;217m▀\x1B[0m\x1B[38;2;219;221;224m\x1B[48;2;199;207;222m▀\x1B[0m\x1B[38;2;255;255;254m\x1B[48;2;196;206;224m▀\x1B[0m\x1B[38;2;255;255;249m\x1B[48;2;199;208;224m▀\x1B[0m\x1B[38;2;255;255;251m\x1B[48;2;181;194;218m▀\x1B[0m\x1B[38;2;93;107;135m\x1B[48;2;58;77;106m▀\x1B[0m",
			"            \x1B[38;2;255;255;255m\x1B[48;2;222;219;213m▀\x1B[0m\x1B[38;2;175;189;216m\x1B[48;2;251;255;255m▀\x1B[0m\x1B[38;2;83;105;145m\x1B[48;2;11;29;68m▀\x1B[0m\x1B[38;2;128;144;175m\x1B[48;2;224;219;213m▀\x1B[0m\x1B[38;2;98;118;157m\x1B[48;2;190;202;216m▀\x1B[0m    \x1B[38;2;10;24;48m▀\x1B[0m        ",
			"          \x1B[38;2;138;140;142m▄\x1B[0m\x1B[38;2;3;20;51m\x1B[48;2;128;140;162m▀\x1B[0m\x1B[38;2;201;201;203m\x1B[48;2;202;210;222m▀\x1B[0m\x1B[38;2;237;238;243m\x1B[48;2;171;180;199m▀\x1B[0m\x1B[38;2;0;5;42m\x1B[48;2;0;0;30m▀\x1B[0m\x1B[38;2;212;208;205m\x1B[48;2;229;226;222m▀\x1B[0m\x1B[38;2;255;255;255m▀\x1B[0m\x1B[38;2;170;181;200m\x1B[48;2;174;188;212m▀\x1B[0m\x1B[38;2;102;115;139m▄\x1B[0m\x1B[38;2;82;86;93m▄\x1B[0m          ",
			"        \x1B[38;2;0;8;35m▄\x1B[0m\x1B[38;2;226;223;223m\x1B[48;2;210;213;222m▀\x1B[0m\x1B[38;2;250;249;248m\x1B[48;2;248;248;251m▀\x1B[0m\x1B[38;2;248;249;250m\x1B[48;2;236;236;239m▀\x1B[0m\x1B[38;2;245;244;238m\x1B[48;2;206;215;232m▀\x1B[0m\x1B[38;2;142;158;194m\x1B[48;2;92;115;161m▀\x1B[0m\x1B[38;2;0;0;44m\x1B[48;2;0;5;34m▀\x1B[0m\x1B[38;2;206;210;222m\x1B[48;2;116;140;185m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;230;235;247m▀\x1B[0m\x1B[38;2;237;237;235m\x1B[48;2;243;243;244m▀\x1B[0m\x1B[38;2;255;255;255m\x1B[48;2;245;245;244m▀\x1B[0m\x1B[38;2;196;201;208m\x1B[48;2;180;194;219m▀\x1B[0m\x1B[38;2;19;34;65m\x1B[48;2;44;67;117m▀\x1B[0m         ",
			"        \x1B[38;2;37;45;67m▀\x1B[0m\x1B[38;2;67;83;119m▀\x1B[0m\x1B[38;2;75;90;128m▀\x1B[0m\x1B[38;2;74;87;124m▀\x1B[0m\x1B[38;2;58;78;123m▀\x1B[0m\x1B[38;2;23;43;83m▀\x1B[0m  \x1B[38;2;75;92;128m▀\x1B[0m\x1B[38;2;74;89;125m▀\x1B[0m\x1B[38;2;72;87;125m▀\x1B[0m\x1B[38;2;52;75;122m▀\x1B[0m\x1B[38;2;23;51;100m▀\x1B[0m         ",
			"                              "
		]
	]
};
//#endregion
//#region src/yly/yly-programs.ts
const F = {
	standSmile: 0,
	standArmsUp: 1,
	reachRight: 2,
	reachWide: 3,
	clawSoftLeft: 4,
	clawSoftRight: 5,
	strideLeft: 6,
	strideRight: 7,
	leanBack: 8,
	leanLow: 9,
	crouch: 10,
	neutralMouth: 11,
	standSmileAlt: 12
};
const YLY_CLIPS = {
	idle: {
		loop: true,
		bob: 0,
		steps: [
			{
				frame: F.standSmile,
				ms: 2600
			},
			{
				frame: F.neutralMouth,
				ms: 140
			},
			{
				frame: F.standSmile,
				ms: 3200
			},
			{
				frame: F.clawSoftLeft,
				ms: 420
			},
			{
				frame: F.standSmileAlt,
				ms: 4200
			},
			{
				frame: F.neutralMouth,
				ms: 120
			},
			{
				frame: F.standSmileAlt,
				ms: 2400
			},
			{
				frame: F.clawSoftRight,
				ms: 380
			}
		]
	},
	thinking: {
		loop: true,
		bob: 1,
		steps: [
			{
				frame: F.leanBack,
				ms: 320
			},
			{
				frame: F.leanLow,
				ms: 300
			},
			{
				frame: F.crouch,
				ms: 260
			},
			{
				frame: F.leanLow,
				ms: 300
			}
		]
	},
	walking: {
		loop: true,
		bob: 1,
		steps: [
			{
				frame: F.strideLeft,
				ms: 150
			},
			{
				frame: F.standSmileAlt,
				ms: 130
			},
			{
				frame: F.strideRight,
				ms: 150
			},
			{
				frame: F.standSmile,
				ms: 130
			}
		]
	},
	tool: {
		loop: true,
		bob: 0,
		steps: [
			{
				frame: F.reachRight,
				ms: 180
			},
			{
				frame: F.reachWide,
				ms: 200
			},
			{
				frame: F.clawSoftRight,
				ms: 160
			},
			{
				frame: F.reachWide,
				ms: 200
			}
		]
	},
	typing: {
		loop: true,
		bob: 0,
		steps: [
			{
				frame: F.clawSoftLeft,
				ms: 190
			},
			{
				frame: F.standSmileAlt,
				ms: 170
			},
			{
				frame: F.clawSoftRight,
				ms: 190
			},
			{
				frame: F.standSmile,
				ms: 170
			}
		]
	},
	success: {
		loop: false,
		next: "idle",
		bob: 2,
		steps: [
			{
				frame: F.standArmsUp,
				ms: 180
			},
			{
				frame: F.reachWide,
				ms: 200
			},
			{
				frame: F.standArmsUp,
				ms: 180
			},
			{
				frame: F.reachWide,
				ms: 200
			},
			{
				frame: F.standSmile,
				ms: 240
			}
		]
	},
	error: {
		loop: false,
		next: "idle",
		bob: 0,
		steps: [
			{
				frame: F.neutralMouth,
				ms: 1100
			},
			{
				frame: F.leanBack,
				ms: 420
			},
			{
				frame: F.neutralMouth,
				ms: 520
			}
		]
	},
	sleeping: {
		loop: true,
		bob: 0,
		steps: [{
			frame: F.neutralMouth,
			ms: 3800
		}, {
			frame: F.crouch,
			ms: 900
		}]
	}
};
/** Terminal size presets (cols x rows) mirroring the mockup's responsive sizes. */
const YLY_SIZE_PRESETS = {
	small: {
		cols: 16,
		rows: 9
	},
	medium: {
		cols: 22,
		rows: 12
	},
	large: {
		cols: 30,
		rows: 16
	}
};
//#endregion
//#region src/yly/yly-pet.ts
function blank(cols) {
	return " ".repeat(cols);
}
/** Random rest (paused) length in ms — the pet holds a static frame, no motion. */
function randomRestMs() {
	return 4e3 + Math.random() * 8e3;
}
/** Random active (animating) burst length in ms. */
function randomActiveMs() {
	return 1600 + Math.random() * 3200;
}
var YlyPet = class {
	tui;
	state = "idle";
	step = 0;
	phase = "active";
	activeElapsed = 0;
	restDuration;
	activeDuration;
	restMs;
	activeMs;
	timer;
	constructor(tui, options = {}) {
		this.tui = tui;
		this.restMs = options.restMs ?? randomRestMs;
		this.activeMs = options.activeMs ?? randomActiveMs;
		this.restDuration = this.restMs();
		this.activeDuration = this.activeMs();
	}
	setMode(state) {
		if (state === this.state) return;
		this.state = state;
		this.step = 0;
		this.phase = "active";
		this.activeElapsed = 0;
		this.activeDuration = this.activeMs();
		this.invalidate();
		this.tui.requestRender();
		this.restart();
	}
	clip() {
		return YLY_CLIPS[this.state];
	}
	restart() {
		if (this.timer !== void 0) clearTimeout(this.timer);
		if (this.phase === "rest") {
			this.timer = setTimeout(() => this.activate(), this.restDuration);
			return;
		}
		const step = this.clip().steps[this.step] ?? this.clip().steps[0];
		if (step === void 0) return;
		this.timer = setTimeout(() => this.advance(), step.ms);
	}
	activate() {
		this.phase = "active";
		this.step = 0;
		this.activeElapsed = 0;
		this.activeDuration = this.activeMs();
		this.invalidate();
		this.tui.requestRender();
		this.restart();
	}
	deactivate() {
		this.phase = "rest";
		this.step = 0;
		this.restDuration = this.restMs();
		this.invalidate();
		this.tui.requestRender();
		this.restart();
	}
	advance() {
		const clip = this.clip();
		const step = clip.steps[this.step] ?? clip.steps[0];
		if (step !== void 0) this.activeElapsed += step.ms;
		const next = this.step + 1;
		if (next >= clip.steps.length) if (clip.loop) this.step = 0;
		else if (clip.next !== void 0) {
			this.state = clip.next;
			this.step = 0;
		} else this.step = 0;
		else this.step = next;
		if (this.activeElapsed >= this.activeDuration) {
			this.deactivate();
			return;
		}
		this.invalidate();
		this.tui.requestRender();
		this.restart();
	}
	start() {
		this.restart();
	}
	stop() {
		if (this.timer !== void 0) {
			clearTimeout(this.timer);
			this.timer = void 0;
		}
	}
	invalidate() {}
	sizeForCols(width) {
		if (width >= 132) return "large";
		if (width >= 112) return "medium";
		if (width >= 92) return "small";
		return null;
	}
	render(_width) {
		const cols = this.tui.terminal.columns;
		const size = this.sizeForCols(cols);
		if (size === null) return [];
		const preset = YLY_SIZE_PRESETS[size];
		const clip = this.clip();
		const step = clip.steps[this.step] ?? clip.steps[0];
		let rows = [...YLY_FRAMES[size]?.[step?.frame ?? 0] ?? []];
		const bob = this.phase === "rest" ? 0 : clip.bob ?? 0;
		for (let i = 0; i < bob; i++) if (this.step % 2 === 0) rows = [blank(preset.cols), ...rows.slice(0, -1)];
		else rows = [...rows.slice(1), blank(preset.cols)];
		return rows;
	}
};
//#endregion
//#region src/tui/miniTextField.ts
/**
* A tiny hand-rolled single-line text buffer (value + cursor, insert/
* backspace/delete/left/right/home/end) shared by the handful of overlays
* that need one embedded field inside otherwise-custom keyboard handling
* (`QuestionOverlay`'s free-text answer, `TrajectoryOverlay`'s filter,
* `ProviderForm`'s fields, `ModelListEditor`'s add-id field) — replacing
* `ink-text-input` without wrestling with pi-tui's focus model, which only
* tracks one focused `Component` at a time and has no built-in way to
* delegate keystrokes to a field nested inside a larger custom overlay.
* @module @tomowang/dsh-tui/tui/miniTextField
*/
const BRACKETED_PASTE_START = "\x1B[200~";
const BRACKETED_PASTE_END = "\x1B[201~";
/** Extract the content of one bracketed-paste sequence, or `undefined` if `data` is not one. */
function extractBracketedPaste(data) {
	if (!data.startsWith(BRACKETED_PASTE_START)) return void 0;
	const end = data.indexOf(BRACKETED_PASTE_END);
	if (end === -1) return void 0;
	return data.slice(6, end);
}
function emptyMiniTextField(value = "") {
	return {
		value,
		cursor: value.length
	};
}
/** Apply one keystroke, or return `undefined` if this field doesn't handle it (so the caller can fall through to its own bindings, e.g. Enter/Escape/Tab). */
function miniTextFieldInput(state, data) {
	if (matchesKey(data, Key.left)) return {
		...state,
		cursor: Math.max(0, state.cursor - 1)
	};
	if (matchesKey(data, Key.right)) return {
		...state,
		cursor: Math.min(state.value.length, state.cursor + 1)
	};
	if (matchesKey(data, Key.home) || matchesKey(data, Key.ctrl("a"))) return {
		...state,
		cursor: 0
	};
	if (matchesKey(data, Key.end) || matchesKey(data, Key.ctrl("e"))) return {
		...state,
		cursor: state.value.length
	};
	if (matchesKey(data, Key.backspace)) {
		if (state.cursor === 0) return state;
		return {
			value: state.value.slice(0, state.cursor - 1) + state.value.slice(state.cursor),
			cursor: state.cursor - 1
		};
	}
	if (matchesKey(data, Key.delete)) {
		if (state.cursor >= state.value.length) return state;
		return {
			value: state.value.slice(0, state.cursor) + state.value.slice(state.cursor + 1),
			cursor: state.cursor
		};
	}
	const paste = extractBracketedPaste(data);
	if (paste !== void 0) {
		const text = paste.replace(/[\r\n]+/g, "");
		if (text.length === 0) return state;
		return {
			value: state.value.slice(0, state.cursor) + text + state.value.slice(state.cursor),
			cursor: state.cursor + text.length
		};
	}
	if (data.length > 0 && !data.startsWith("\x1B") && data !== "\r" && data !== "\n" && data !== "	") return {
		value: state.value.slice(0, state.cursor) + data + state.value.slice(state.cursor),
		cursor: state.cursor + data.length
	};
}
/** Render the field's text, optionally with an inverse-video cursor block at the cursor position. */
function renderMiniTextField(state, cursorVisible, mask) {
	const display = mask === void 0 ? state.value : mask.repeat(state.value.length);
	if (!cursorVisible) return display;
	return `${display.slice(0, state.cursor)}\x1b[7m${display[state.cursor] ?? " "}\x1b[0m${display.slice(state.cursor + 1)}`;
}
//#endregion
//#region src/tui/modelProfile/ModelProfileOverlay.ts
const bold$9 = (s) => `\x1b[1m${s}\x1b[0m`;
const secondary$9 = fg(theme.secondary);
const muted$10 = fg(theme.muted);
const errorColor$5 = fg(theme.error);
const invert$5 = (s) => `\x1b[7m${s}\x1b[0m`;
var ModelProfileOverlay = class {
	store;
	actions;
	confirmDelete;
	formKeySeen = -1;
	route = emptyMiniTextField();
	displayName = emptyMiniTextField();
	api = emptyMiniTextField();
	baseURL = emptyMiniTextField();
	apiKeyDraft = emptyMiniTextField();
	models = [];
	showModels = false;
	focused = 0;
	modelDraftId = emptyMiniTextField();
	modelSelected = 0;
	modelInputFocused = false;
	constructor(store, actions) {
		this.store = store;
		this.actions = actions;
	}
	invalidate() {}
	textFields(draft) {
		return draft.isNew ? [
			"route",
			"displayName",
			"api",
			"baseURL",
			"apiKey"
		] : [
			"displayName",
			"api",
			"baseURL",
			"apiKey"
		];
	}
	/** Reinitialize form-local state from the store's draft when `formKey` changes — the equivalent of the old `key={formKey}` remount. */
	syncFormState(mp) {
		if (mp.view !== "form" || mp.draft === void 0) return void 0;
		const draft = mp.draft;
		if (mp.formKey !== this.formKeySeen) {
			this.formKeySeen = mp.formKey;
			this.route = emptyMiniTextField(draft.route);
			this.displayName = emptyMiniTextField(draft.displayName);
			this.api = emptyMiniTextField(draft.api);
			this.baseURL = emptyMiniTextField(draft.baseURL);
			this.apiKeyDraft = emptyMiniTextField("");
			this.models = [...draft.models];
			this.showModels = false;
			this.focused = 0;
			this.modelDraftId = emptyMiniTextField();
			this.modelSelected = 0;
			this.modelInputFocused = false;
		}
		return draft;
	}
	buildDraft(draft) {
		return {
			...draft,
			route: draft.isNew ? this.route.value.trim() : draft.route,
			displayName: this.displayName.value,
			api: this.api.value,
			baseURL: this.baseURL.value,
			apiKeyDraft: this.apiKeyDraft.value,
			models: this.models
		};
	}
	render(_width) {
		const overlay = this.store.getSnapshot().overlay;
		if (overlay.kind !== "modelProfile") return [];
		const mp = overlay.modelProfile;
		const draft = this.syncFormState(mp);
		if (draft !== void 0) return this.showModels ? this.renderModelListEditor(mp) : this.renderForm(draft, mp);
		return this.renderList(mp);
	}
	renderList(mp) {
		const { providers, selected, busy, error } = mp;
		const lines = [bold$9(secondary$9("Model providers"))];
		if (error !== void 0) lines.push(errorColor$5(error));
		if (busy && providers === void 0) lines.push(muted$10("Loading…"));
		providers?.forEach((row, index) => {
			const marker = row.configured ? "● " : "○ ";
			const active = row.live ? " (active)" : "";
			const noKey = row.apiKeyConfigured ? "" : " [no api key]";
			const confirm = this.confirmDelete === index ? " — press d again to delete" : "";
			const text = `${index === selected ? "› " : "  "}${marker}${row.displayName}${active}${noKey}${confirm}`;
			lines.push(index === selected ? invert$5(text) : text);
		});
		if (providers?.length === 0) lines.push(muted$10("No providers configured yet — press a to add one."));
		lines.push(muted$10("↑↓ select · enter edit · a add · d delete · s set active model · esc close"));
		return lines;
	}
	handleListInput(data, mp) {
		const { providers, selected } = mp;
		if (matchesKey(data, Key.escape)) {
			this.actions.closeModelProfile();
			return;
		}
		if (providers === void 0 || providers.length === 0) {
			if (data === "a") this.actions.createProvider();
			return;
		}
		if (matchesKey(data, Key.up)) {
			this.confirmDelete = void 0;
			this.actions.selectProvider(Math.max(0, selected - 1));
			return;
		}
		if (matchesKey(data, Key.down)) {
			this.confirmDelete = void 0;
			this.actions.selectProvider(Math.min(providers.length - 1, selected + 1));
			return;
		}
		if (matchesKey(data, Key.enter)) {
			this.actions.editProvider(providers[selected].route);
			return;
		}
		if (data === "a") {
			this.actions.createProvider();
			return;
		}
		if (data === "s") {
			const row = providers[selected];
			const model = row.models[0];
			if (model !== void 0) this.actions.setActiveModel(row.route, model.id);
			return;
		}
		if (data === "d") {
			if (this.confirmDelete === selected) {
				this.confirmDelete = void 0;
				this.actions.deleteProvider(providers[selected]);
			} else this.confirmDelete = selected;
			return;
		}
		this.confirmDelete = void 0;
	}
	renderForm(draft, mp) {
		const textFields = this.textFields(draft);
		const modelsRow = textFields.length;
		const saveRow = textFields.length + 1;
		const fieldState = {
			route: this.route,
			displayName: this.displayName,
			api: this.api,
			baseURL: this.baseURL,
			apiKey: this.apiKeyDraft
		};
		const labels = {
			route: "Route",
			displayName: "Name",
			api: "Protocol",
			baseURL: "Base URL",
			apiKey: draft.apiKeyConfigured ? "API key (set — leave blank to keep)" : "API key"
		};
		const lines = [bold$9(secondary$9(draft.isNew ? "Add provider" : `Edit ${draft.displayName || draft.route}`))];
		if (mp.error !== void 0) lines.push(errorColor$5(mp.error));
		textFields.forEach((field, index) => {
			const isFocused = this.focused === index;
			const mask = field === "apiKey" ? "*" : void 0;
			const prefix = `${isFocused ? "› " : "  "}${labels[field]}: `;
			lines.push(`${prefix}${renderMiniTextField(fieldState[field], isFocused, mask)}`);
		});
		const modelsText = `${this.focused === modelsRow ? "› " : "  "}Models (${this.models.length}) — enter to edit`;
		lines.push(this.focused === modelsRow ? invert$5(modelsText) : modelsText);
		const saveText = `${this.focused === saveRow ? "› " : "  "}${mp.busy ? "Saving…" : "Save"}`;
		lines.push(this.focused === saveRow ? invert$5(saveText) : saveText);
		lines.push(muted$10("tab/shift+tab move · enter confirm field / activate row · esc cancel"));
		return lines;
	}
	handleFormInput(data, draft) {
		const textFields = this.textFields(draft);
		const modelsRow = textFields.length;
		const saveRow = textFields.length + 1;
		const rowCount = textFields.length + 2;
		if (matchesKey(data, Key.escape)) {
			this.actions.backToProviderList();
			return;
		}
		if (matchesKey(data, "shift+tab")) {
			this.focused = (this.focused - 1 + rowCount) % rowCount;
			return;
		}
		if (matchesKey(data, Key.tab)) {
			this.focused = (this.focused + 1) % rowCount;
			return;
		}
		if (matchesKey(data, Key.enter) && this.focused === modelsRow) {
			this.showModels = true;
			return;
		}
		if (matchesKey(data, Key.enter) && this.focused === saveRow) {
			this.actions.saveProvider(this.buildDraft(draft));
			return;
		}
		if (matchesKey(data, Key.enter) && this.focused < textFields.length) {
			this.focused = (this.focused + 1) % rowCount;
			return;
		}
		if (this.focused < textFields.length) {
			const field = textFields[this.focused];
			const next = miniTextFieldInput({
				route: this.route,
				displayName: this.displayName,
				api: this.api,
				baseURL: this.baseURL,
				apiKey: this.apiKeyDraft
			}[field], data);
			if (next === void 0) return;
			if (field === "route") this.route = next;
			else if (field === "displayName") this.displayName = next;
			else if (field === "api") this.api = next;
			else if (field === "baseURL") this.baseURL = next;
			else this.apiKeyDraft = next;
		}
	}
	renderModelListEditor(mp) {
		const lines = [bold$9(secondary$9("Models"))];
		this.models.forEach((model, index) => {
			const isSelected = !this.modelInputFocused && index === this.modelSelected;
			const text = `${isSelected ? "› " : "  "}${model.id}${model.name === void 0 ? "" : ` — ${model.name}`}`;
			lines.push(isSelected ? invert$5(text) : text);
		});
		if (this.models.length === 0) lines.push(muted$10("No models yet."));
		lines.push(`${this.modelInputFocused ? "› " : "  "}Add id: ${renderMiniTextField(this.modelDraftId, this.modelInputFocused)}`);
		if (mp.busy) lines.push(muted$10("Discovering…"));
		if (mp.discovered !== void 0) if (mp.discovered.length === 0) lines.push(muted$10("No models discovered."));
		else {
			lines.push(muted$10("Discovered — tab to the id field and type one to adopt it:"));
			for (const model of mp.discovered) lines.push(muted$10(`  ${model.id}${model.name === void 0 ? "" : ` — ${model.name}`}`));
		}
		lines.push(muted$10("tab toggle list/input · ↑↓ select · x remove · g discover · esc back"));
		return lines;
	}
	addModel(id) {
		const trimmed = id.trim();
		if (trimmed === "" || this.models.some((model) => model.id === trimmed)) return;
		const overlay = this.store.getSnapshot().overlay;
		const found = (overlay.kind === "modelProfile" ? overlay.modelProfile.discovered : void 0)?.find((model) => model.id === trimmed);
		this.models = [...this.models, found === void 0 ? { id: trimmed } : { ...found }];
		this.modelDraftId = emptyMiniTextField();
	}
	handleModelListEditorInput(data, draft) {
		if (matchesKey(data, Key.escape)) {
			this.showModels = false;
			return;
		}
		if (matchesKey(data, Key.tab)) {
			this.modelInputFocused = !this.modelInputFocused;
			return;
		}
		if (this.modelInputFocused) {
			if (matchesKey(data, Key.enter)) {
				this.addModel(this.modelDraftId.value);
				return;
			}
			const next = miniTextFieldInput(this.modelDraftId, data);
			if (next !== void 0) this.modelDraftId = next;
			return;
		}
		if (data === "g") {
			this.actions.discoverModelsForDraft(this.buildDraft(draft));
			return;
		}
		if (this.models.length === 0) return;
		if (matchesKey(data, Key.up)) {
			this.modelSelected = Math.max(0, this.modelSelected - 1);
			return;
		}
		if (matchesKey(data, Key.down)) {
			this.modelSelected = Math.min(this.models.length - 1, this.modelSelected + 1);
			return;
		}
		if (data === "x") {
			this.models = this.models.filter((_, index) => index !== this.modelSelected);
			this.modelSelected = Math.max(0, Math.min(this.modelSelected, this.models.length - 1));
		}
	}
	handleInput(data) {
		const overlay = this.store.getSnapshot().overlay;
		if (overlay.kind !== "modelProfile") return;
		const mp = overlay.modelProfile;
		const draft = this.syncFormState(mp);
		if (draft !== void 0) {
			if (this.showModels) this.handleModelListEditorInput(data, draft);
			else this.handleFormInput(data, draft);
			return;
		}
		this.handleListInput(data, mp);
	}
};
//#endregion
//#region src/tui/login/LoginOverlay.ts
const bold$8 = (s) => `\x1b[1m${s}\x1b[0m`;
const secondary$8 = fg(theme.secondary);
const muted$9 = fg(theme.muted);
const errorColor$4 = fg(theme.error);
const invert$4 = (s) => `\x1b[7m${s}\x1b[0m`;
var LoginOverlay = class {
	store;
	actions;
	promptField = emptyMiniTextField();
	promptCursor = 0;
	constructor(store, actions) {
		this.store = store;
		this.actions = actions;
	}
	invalidate() {}
	renderList(login) {
		const lines = [bold$8(secondary$8("Sign in"))];
		if (login.error !== void 0) lines.push(errorColor$4(login.error));
		if (login.busy && login.flows === void 0) lines.push(muted$9("Loading…"));
		login.flows?.forEach((flow, index) => {
			const marker = flow.inFlight ? "· " : "○ ";
			const signingIn = login.signingIn === flow.key ? " — signing in…" : "";
			const text = `${index === login.selected ? "› " : "  "}${marker}${flow.label}${signingIn}`;
			lines.push(index === login.selected ? invert$4(text) : text);
		});
		if (login.flows?.length === 0) lines.push(muted$9("No sign-in providers are available in this profile."));
		lines.push(muted$9("↑↓ select · enter sign in · esc close"));
		return lines;
	}
	renderPrompt(prompt) {
		const lines = [bold$8(secondary$8("Sign in"))];
		lines.push(prompt.message);
		if (prompt.kind === "select") {
			prompt.options.forEach((option, index) => {
				const row = `${index === this.promptCursor ? "› " : "  "}${option.label}`;
				lines.push(index === this.promptCursor ? invert$4(row) : row);
				if (option.description !== void 0) lines.push(muted$9(`    ${option.description}`));
			});
			lines.push(muted$9("↑↓ choose · enter select · esc cancel"));
		} else {
			const mask = prompt.kind === "secret" ? "•" : void 0;
			const placeholder = prompt.placeholder ?? (prompt.kind === "secret" ? "API key" : "code");
			const field = this.promptField.value === "" ? `(${placeholder})` : renderMiniTextField(this.promptField, true, mask);
			lines.push(`> ${field}`);
			lines.push(muted$9("type + enter submit · esc cancel"));
		}
		return lines;
	}
	render(_width) {
		const overlay = this.store.getSnapshot().overlay;
		if (overlay.kind !== "login") return [];
		const { prompt } = overlay.login;
		return prompt === void 0 ? this.renderList(overlay.login) : this.renderPrompt(prompt);
	}
	handleInput(data) {
		const overlay = this.store.getSnapshot().overlay;
		if (overlay.kind !== "login") return;
		const { prompt } = overlay.login;
		if (prompt !== void 0) this.handlePromptInput(data, prompt);
		else this.handleListInput(data, overlay.login);
	}
	handlePromptInput(data, prompt) {
		if (matchesKey(data, Key.escape)) {
			this.actions.answerAuthorizationPrompt("");
			return;
		}
		if (prompt.kind === "select") {
			if (matchesKey(data, Key.up)) {
				this.promptCursor = Math.max(0, this.promptCursor - 1);
				return;
			}
			if (matchesKey(data, Key.down)) {
				this.promptCursor = Math.min(prompt.options.length - 1, this.promptCursor + 1);
				return;
			}
			if (matchesKey(data, Key.enter)) this.actions.answerAuthorizationPrompt(prompt.options[this.promptCursor].id);
			return;
		}
		if (matchesKey(data, Key.enter)) {
			this.actions.answerAuthorizationPrompt(this.promptField.value.trim());
			return;
		}
		const next = miniTextFieldInput(this.promptField, data);
		if (next !== void 0) this.promptField = next;
	}
	handleListInput(data, login) {
		if (matchesKey(data, Key.escape)) {
			this.actions.closeLogin();
			return;
		}
		const flows = login.flows;
		if (flows === void 0 || flows.length === 0) return;
		if (matchesKey(data, Key.up)) {
			this.actions.selectLoginFlow(Math.max(0, login.selected - 1));
			return;
		}
		if (matchesKey(data, Key.down)) {
			this.actions.selectLoginFlow(Math.min(flows.length - 1, login.selected + 1));
			return;
		}
		if (matchesKey(data, Key.enter)) this.actions.beginAuthorization(flows[login.selected].key);
	}
};
//#endregion
//#region src/tui/trajectory/layout.ts
const LABEL_LIMIT = 100;
function prettyJson(raw) {
	try {
		return JSON.stringify(JSON.parse(raw), null, 2);
	} catch {
		return raw;
	}
}
/** The row's kind tag (USER/CONTEXT) already names the source, so the label itself carries no redundant prefix. */
function userLabel(data) {
	const { source } = data;
	if (source.kind === "user") return truncate(textOf(data.content), LABEL_LIMIT);
	if (source.kind === "plugin") {
		const summary = source.form === "notice" ? source.summary : void 0;
		return `${source.plugin}${summary === void 0 ? "" : ` · ${summary}`}`;
	}
	if (source.kind === "goal") return `goal · round ${source.round}`;
	return source.kind;
}
/**
* Fold the session log into ledger rows, in seq order.
* @param events - the session's durable event log (replay + live, already seq-deduped by `TuiStore`).
* @param collapsedTurns - turns whose non-first content row should fold into one `'collapsed'` summary row.
*/
function buildTrajectoryRows(events, collapsedTurns) {
	const rows = [];
	const stepsByTurn = /* @__PURE__ */ new Map();
	const pendingCalls = /* @__PURE__ */ new Map();
	const openTurnRows = /* @__PURE__ */ new Map();
	let currentTurn = 0;
	let currentStep = 0;
	for (const event of events) switch (event.type) {
		case "turn/start": {
			currentTurn = event.data.turn;
			const draft = {
				kind: "turn",
				turn: currentTurn,
				aborted: void 0
			};
			openTurnRows.set(currentTurn, draft);
			rows.push(draft);
			break;
		}
		case "turn/end": {
			const draft = openTurnRows.get(event.data.turn);
			const { reason } = event.data;
			if (draft !== void 0 && reason.kind === "error") draft.aborted = `${reason.error.code}: ${reason.error.message}`;
			else if (draft !== void 0 && reason.kind === "aborted") draft.aborted = "turn canceled";
			break;
		}
		case "step/start": {
			currentStep = event.data.step;
			let steps = stepsByTurn.get(event.data.turn);
			if (steps === void 0) {
				steps = /* @__PURE__ */ new Set();
				stepsByTurn.set(event.data.turn, steps);
			}
			steps.add(event.data.step);
			rows.push({
				kind: "step",
				turn: event.data.turn,
				step: event.data.step
			});
			break;
		}
		case "user/message": {
			const label = userLabel(event.data);
			const text = textOf(event.data.content);
			const record = {
				id: `${event.seq}`,
				kind: event.data.source.kind === "user" ? "user" : "context",
				turn: currentTurn,
				step: currentStep,
				seq: event.seq,
				startedAt: event.time,
				completedAt: void 0,
				label,
				isError: false,
				summary: label,
				payload: text === "" ? void 0 : text,
				result: void 0,
				reasoning: void 0,
				source: event.data.source,
				toolName: void 0
			};
			rows.push({
				kind: "record",
				record
			});
			break;
		}
		case "assistant/message": {
			const content = event.data.message.content;
			const text = textOf(content);
			const reasoningText = reasoningOf(content);
			const displaySource = text === "" ? reasoningText : text;
			const label = displaySource === "" ? "(tool calls only)" : truncate(displaySource, LABEL_LIMIT);
			const record = {
				id: `${event.seq}`,
				kind: "assistant",
				turn: event.data.turn,
				step: event.data.step,
				seq: event.seq,
				startedAt: event.time,
				completedAt: void 0,
				label,
				isError: false,
				summary: label,
				payload: text === "" ? void 0 : text,
				result: void 0,
				reasoning: reasoningText === "" ? void 0 : reasoningText,
				source: void 0,
				toolName: void 0
			};
			rows.push({
				kind: "record",
				record
			});
			break;
		}
		case "tool/call": {
			const label = `${event.data.name} ${truncate(event.data.arguments, LABEL_LIMIT)}`;
			const record = {
				id: event.data.callId,
				kind: "tool",
				turn: event.data.turn,
				step: event.data.step,
				seq: event.seq,
				startedAt: event.time,
				completedAt: void 0,
				label,
				isError: false,
				summary: label,
				payload: prettyJson(event.data.arguments),
				result: void 0,
				reasoning: void 0,
				source: void 0,
				toolName: event.data.name
			};
			pendingCalls.set(event.data.callId, record);
			rows.push({
				kind: "record",
				record
			});
			break;
		}
		case "tool/result": {
			const [block] = event.data.message.content;
			const failed = event.data.error !== void 0 || block.isError === true;
			const resultText = event.data.error !== void 0 ? `${event.data.error.code}: ${event.data.error.name}` : textOf(block.content);
			const callId = event.data.message.source.callId;
			const pending = pendingCalls.get(callId);
			if (pending !== void 0) {
				pending.completedAt = event.time;
				pending.isError = failed;
				pending.result = resultText;
				pending.summary = `${pending.label} → ${failed ? "error" : "ok"}`;
				pendingCalls.delete(callId);
			} else {
				const label = `(unmatched result) ${truncate(resultText, LABEL_LIMIT)}`;
				const record = {
					id: `${event.seq}`,
					kind: "tool",
					turn: event.data.turn,
					step: event.data.step,
					seq: event.seq,
					startedAt: event.time,
					completedAt: event.time,
					label,
					isError: failed,
					summary: label,
					payload: void 0,
					result: resultText,
					reasoning: void 0,
					source: void 0,
					toolName: void 0
				};
				rows.push({
					kind: "record",
					record
				});
			}
			break;
		}
		case "request/header": {
			if (event.data.reason === "initial") break;
			const label = `config ${event.data.reason} updated`;
			const record = {
				id: `${event.seq}`,
				kind: "header",
				turn: currentTurn,
				step: currentStep,
				seq: event.seq,
				startedAt: event.time,
				completedAt: void 0,
				label,
				isError: false,
				summary: label,
				payload: JSON.stringify(event.data.header, null, 2),
				result: void 0,
				reasoning: void 0,
				source: void 0,
				toolName: void 0
			};
			rows.push({
				kind: "record",
				record
			});
			break;
		}
		default: break;
	}
	return collapseRows(rows.filter((row) => row.kind !== "step" || (stepsByTurn.get(row.turn)?.size ?? 0) > 1), collapsedTurns);
}
/** Fold every row of a collapsed turn after its first content row into one summary row. */
function collapseRows(rows, collapsedTurns) {
	if (collapsedTurns.size === 0) return rows;
	const out = [];
	let seenFirstInTurn = false;
	let pendingCount = 0;
	let pendingTurn = -1;
	const flush = () => {
		if (pendingCount > 0) {
			out.push({
				kind: "collapsed",
				turn: pendingTurn,
				count: pendingCount
			});
			pendingCount = 0;
		}
	};
	for (const row of rows) {
		if (row.kind === "turn") {
			flush();
			seenFirstInTurn = false;
			pendingTurn = row.turn;
			out.push(row);
			continue;
		}
		const turn = row.kind === "step" ? row.turn : row.kind === "record" ? row.record.turn : pendingTurn;
		if (!collapsedTurns.has(turn)) {
			out.push(row);
			continue;
		}
		if (!seenFirstInTurn) {
			seenFirstInTurn = true;
			out.push(row);
			continue;
		}
		pendingCount += 1;
	}
	flush();
	return out;
}
//#endregion
//#region src/tui/trajectory/TrajectoryLedger.ts
const bold$7 = (s) => `\x1b[1m${s}\x1b[0m`;
const invert$3 = (s) => `\x1b[7m${s}\x1b[0m`;
const secondary$7 = fg(theme.secondary);
const muted$8 = fg(theme.muted);
const errorColor$3 = fg(theme.error);
function recordGlyph(record) {
	if (record.kind === "tool") return record.isError ? "✖" : "⚙";
	if (record.kind === "header") return "⊕";
	return " ";
}
/** Kind tags, matching the web ledger's USER/CONTEXT/ASSISTANT/TOOL wording exactly (`header` has no web counterpart). */
const KIND_TAG = {
	user: "USER",
	context: "CONTEXT",
	assistant: "ASSISTANT",
	tool: "TOOL",
	header: "HEADER"
};
const KIND_TAG_WIDTH = Math.max(...Object.values(KIND_TAG).map((tag) => tag.length));
/** Mirrors the web ledger's per-row kind tag coloring (assistant violet, tool amber, user brand blue, context mint, header neutral). */
function kindColor(kind) {
	switch (kind) {
		case "user": return theme.primary;
		case "context": return theme.success;
		case "assistant": return theme.reasoning;
		case "tool": return theme.warning;
		case "header": return theme.muted;
	}
}
function recordLine(record, selected) {
	const tag = bold$7(fg(kindColor(record.kind))(KIND_TAG[record.kind].padEnd(KIND_TAG_WIDTH)));
	const body = `${selected ? "› " : "  "}${tag} ${recordGlyph(record)} ${record.label}`;
	const withColor = record.isError ? errorColor$3(body) : record.kind === "header" ? muted$8(body) : body;
	return selected ? invert$3(withColor) : withColor;
}
function buildLedgerLines(rows, selectedId) {
	return rows.map((row) => {
		switch (row.kind) {
			case "turn": return bold$7(secondary$7(`── Turn ${row.turn} ──${row.aborted === void 0 ? "" : ` ⚠ ${row.aborted}`}`));
			case "step": return muted$8(`  Step ${row.step}`);
			case "collapsed": return muted$8(`  … ${row.count} record${row.count === 1 ? "" : "s"} collapsed`);
			case "record": return recordLine(row.record, row.record.id === selectedId);
		}
	});
}
//#endregion
//#region src/tui/trajectory/detail.ts
const violet = fg(theme.reasoning);
function formatTime(ms) {
	return new Date(ms).toLocaleTimeString();
}
function summaryText(record) {
	const lines = [
		`kind      ${record.kind}`,
		`turn/step ${record.turn}/${record.step}`,
		`started   ${formatTime(record.startedAt)}`
	];
	if (record.completedAt !== void 0) lines.push(`duration  ${record.completedAt - record.startedAt}ms`);
	if (record.isError) lines.push("status    error");
	return lines.join("\n");
}
function timingText(record) {
	if (record.completedAt === void 0) return `started ${formatTime(record.startedAt)}\n(no completion recorded)`;
	return [
		`started   ${formatTime(record.startedAt)}`,
		`completed ${formatTime(record.completedAt)}`,
		`duration  ${record.completedAt - record.startedAt}ms`
	].join("\n");
}
/** Rendered Preview tab: reasoning (if any) ahead of the visible text, mirroring the transcript's own reasoning-then-answer framing (`formatStreamingText` in `render.ts`). */
function previewText(record) {
	const parts = [];
	if (record.reasoning !== void 0) parts.push(violet("✦ thinking"), violet(record.reasoning));
	if (record.payload !== void 0) parts.push(renderMarkdown(record.payload));
	return parts.length === 0 ? "(no content)" : parts.join("\n\n");
}
/** Raw tab: same content as `previewText`, unrendered — the markdown/plain source as the log carries it. */
function rawText(record) {
	const parts = [];
	if (record.reasoning !== void 0) parts.push(`[thinking]\n${record.reasoning}`);
	if (record.payload !== void 0) parts.push(record.payload);
	return parts.length === 0 ? "(no content)" : parts.join("\n\n");
}
/** Source tab: the raw `user/message` event's `source` descriptor, pretty-printed. */
function sourceText(record) {
	if (record.source === void 0) return "(no source)";
	try {
		return JSON.stringify(record.source, null, 2);
	} catch {
		return "(unserializable source)";
	}
}
/** Schema tab: the tool's own declared `{name, description, parameters}` (`ToolSchema`, via `getTool`) — the live registry's schema, not a per-request snapshot, so it can drift from what an older call actually saw if the tool changed mid-session. */
function schemaText(record, getTool) {
	const tool = record.toolName === void 0 ? void 0 : getTool?.(record.toolName);
	if (tool === void 0) return "Schema unavailable";
	return JSON.stringify({
		name: tool.name,
		description: tool.description,
		parameters: tool.parameters
	}, null, 2);
}
/** Render the content of one detail-pane tab for the selected record. */
function buildDetail(record, tab, getTool) {
	switch (tab) {
		case "summary": return summaryText(record);
		case "payload": return record.payload ?? "(no payload)";
		case "result": return record.result ?? "—";
		case "timing": return timingText(record);
		case "preview": return previewText(record);
		case "raw": return rawText(record);
		case "source": return sourceText(record);
		case "schema": return schemaText(record, getTool);
	}
}
//#endregion
//#region src/tui/trajectory/types.ts
/**
* Which detail tabs apply to a record, mirroring the web ledger's per-kind
* split: a markdown record (user/context/assistant) gets Summary/Preview/Raw
* plus Source only when the underlying event actually carried one (user and
* context always do; assistant never does — see `layout.ts`). Everything
* else (tool, header) gets Summary plus whichever of Payload/Result the
* record actually has, and — tool records only — Schema, always followed by
* Timing.
*/
function detailTabsFor(record) {
	if (record.kind === "user" || record.kind === "context" || record.kind === "assistant") {
		const tabs = [
			"summary",
			"preview",
			"raw"
		];
		if (record.source !== void 0) tabs.push("source");
		return tabs;
	}
	const tabs = ["summary"];
	if (record.payload !== void 0) tabs.push("payload");
	if (record.result !== void 0) tabs.push("result");
	if (record.kind === "tool") tabs.push("schema");
	tabs.push("timing");
	return tabs;
}
//#endregion
//#region src/tui/trajectory/TrajectoryDetail.ts
/**
* Pure line-builder for the `/trajectory` overlay's tabbed detail pane —
* tabs vary by the selected record's kind (see `detailTabsFor`), content
* word-wrapped to the pane's width and line-clamped to fit its height
* budget. Wrapping matters here specifically because `buildDetail`'s
* Preview/Raw/Payload/Schema content can be arbitrarily long prose or JSON
* with no line breaks of its own — unlike a browser, the terminal won't wrap
* it for us.
* @module @tomowang/dsh-tui/tui/trajectory/TrajectoryDetail
*/
const muted$7 = fg(theme.muted);
/** Left padding for the panel's body, under its flush-left tab-bar heading — mirrors the ledger's own "Turn" header / indented "Step" row convention (`TrajectoryLedger.ts`). */
const DETAIL_INDENT = "  ";
/** Right padding, matching `DETAIL_INDENT`'s width — reserved purely by wrapping short of the pane's edge, since there's no trailing character to place there. */
const DETAIL_RIGHT_PADDING = 2;
function buildDetailLines(record, tab, maxLines, getTool, width) {
	const wrapWidth = Math.max(1, width - 2 - DETAIL_RIGHT_PADDING);
	const lines = record === void 0 ? [] : wrapTextWithAnsi(buildDetail(record, tab, getTool), wrapWidth);
	const shown = lines.slice(0, maxLines);
	const hidden = lines.length - shown.length;
	const out = [(record === void 0 ? [] : detailTabsFor(record)).map((candidate) => candidate === tab ? `[${candidate}]` : ` ${candidate} `).join(" ")];
	if (record === void 0) out.push(`${DETAIL_INDENT}${muted$7("(no record selected)")}`);
	else out.push(...shown.map((line) => `${DETAIL_INDENT}${line}`));
	if (hidden > 0) out.push(`${DETAIL_INDENT}${muted$7(`… ${hidden} more line${hidden === 1 ? "" : "s"}`)}`);
	return out;
}
//#endregion
//#region src/tui/trajectory/TrajectoryOverlay.ts
const bold$6 = (s) => `\x1b[1m${s}\x1b[0m`;
const secondary$6 = fg(theme.secondary);
const muted$6 = fg(theme.muted);
var TrajectoryOverlay = class {
	tui;
	store;
	actions;
	getTool;
	collapsedTurns = /* @__PURE__ */ new Set();
	filter = emptyMiniTextField();
	filterFocused = false;
	detailTab = "summary";
	selectedId;
	scrollOffset = 0;
	lastSelectedTurn;
	constructor(tui, store, actions, getTool) {
		this.tui = tui;
		this.store = store;
		this.actions = actions;
		this.getTool = getTool;
	}
	invalidate() {}
	heights() {
		const availableRows = Math.max(10, this.tui.terminal.rows - 1);
		const remaining = Math.max(6, availableRows - 4);
		const detailContentHeight = Math.max(2, Math.floor(remaining / 2));
		return {
			ledgerHeight: Math.max(3, remaining - detailContentHeight - 1),
			detailContentHeight
		};
	}
	computeRows() {
		const events = this.store.getSnapshot().events;
		const rows = buildTrajectoryRows(events, this.collapsedTurns);
		const query = this.filter.value.trim().toLowerCase();
		const filteredRows = query === "" ? rows : rows.filter((row) => row.kind === "record" && (row.record.label.toLowerCase().includes(query) || row.record.summary.toLowerCase().includes(query)));
		return {
			filteredRows,
			records: filteredRows.filter((row) => row.kind === "record")
		};
	}
	render(width) {
		const { filteredRows, records } = this.computeRows();
		const selectedIndex = this.selectedId === void 0 ? -1 : records.findIndex((row) => row.record.id === this.selectedId);
		const effectiveIndex = selectedIndex === -1 ? records.length - 1 : selectedIndex;
		const selectedRecord = records[effectiveIndex]?.record;
		if (selectedRecord !== void 0) this.lastSelectedTurn = selectedRecord.turn;
		if (selectedRecord !== void 0 && !detailTabsFor(selectedRecord).includes(this.detailTab)) this.detailTab = "summary";
		const selectedRowIndex = selectedRecord === void 0 ? -1 : filteredRows.findIndex((row) => row.kind === "record" && row.record.id === selectedRecord.id);
		const { ledgerHeight, detailContentHeight } = this.heights();
		const maxOffset = Math.max(0, filteredRows.length - ledgerHeight);
		if (selectedRowIndex < this.scrollOffset) this.scrollOffset = selectedRowIndex;
		else if (selectedRowIndex >= this.scrollOffset + ledgerHeight) this.scrollOffset = selectedRowIndex - ledgerHeight + 1;
		this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, maxOffset));
		const windowedRows = filteredRows.slice(this.scrollOffset, this.scrollOffset + ledgerHeight);
		const lines = [
			bold$6(secondary$6(`Trajectory${this.filter.value === "" ? "" : ` — filter: ${this.filter.value}`}${records.length === 0 ? "" : ` (${effectiveIndex + 1}/${records.length})`}`)),
			...buildLedgerLines(windowedRows, selectedRecord?.id),
			"",
			...buildDetailLines(selectedRecord, this.detailTab, detailContentHeight, this.getTool, width),
			""
		];
		if (this.filterFocused) lines.push(`/ ${renderMiniTextField(this.filter, true)}`);
		else lines.push(muted$6("↑↓ select · tab detail · c collapse · / filter · esc close"));
		return lines;
	}
	moveSelection(delta) {
		const { records } = this.computeRows();
		if (records.length === 0) return;
		const selectedIndex = this.selectedId === void 0 ? -1 : records.findIndex((row) => row.record.id === this.selectedId);
		const effectiveIndex = selectedIndex === -1 ? records.length - 1 : selectedIndex;
		const next = Math.min(records.length - 1, Math.max(0, effectiveIndex + delta));
		this.selectedId = records[next].record.id;
	}
	selectedRecord() {
		const { records } = this.computeRows();
		const selectedIndex = this.selectedId === void 0 ? -1 : records.findIndex((row) => row.record.id === this.selectedId);
		return records[selectedIndex === -1 ? records.length - 1 : selectedIndex]?.record;
	}
	cycleTab(delta) {
		const record = this.selectedRecord();
		if (record === void 0) return;
		const tabs = detailTabsFor(record);
		const index = tabs.indexOf(this.detailTab);
		const next = ((index === -1 ? 0 : index) + delta + tabs.length) % tabs.length;
		this.detailTab = tabs[next];
	}
	toggleCollapse() {
		const turn = this.selectedRecord()?.turn ?? this.lastSelectedTurn;
		if (turn === void 0) return;
		if (this.collapsedTurns.has(turn)) this.collapsedTurns.delete(turn);
		else this.collapsedTurns.add(turn);
	}
	handleInput(data) {
		if (this.filterFocused) {
			if (matchesKey(data, Key.escape)) {
				this.filterFocused = false;
				return;
			}
			if (matchesKey(data, Key.enter)) {
				this.filterFocused = false;
				return;
			}
			const next = miniTextFieldInput(this.filter, data);
			if (next !== void 0) this.filter = next;
			return;
		}
		if (matchesKey(data, Key.escape)) {
			this.actions.closeTrajectory();
			return;
		}
		if (matchesKey(data, Key.up)) {
			this.moveSelection(-1);
			return;
		}
		if (matchesKey(data, Key.down)) {
			this.moveSelection(1);
			return;
		}
		if (matchesKey(data, "shift+tab")) {
			this.cycleTab(-1);
			return;
		}
		if (matchesKey(data, Key.tab)) {
			this.cycleTab(1);
			return;
		}
		if (data === "c") {
			this.toggleCollapse();
			return;
		}
		if (data === "/") this.filterFocused = true;
	}
};
//#endregion
//#region src/tui/toolCards/ToolCardsOverlay.ts
const bold$5 = (s) => `\x1b[1m${s}\x1b[0m`;
const secondary$5 = fg(theme.secondary);
const muted$5 = fg(theme.muted);
/** Stable identity for a row across its pending → resolved transition — the call's own `seq` when there is one, so `collapsed`/scroll state survives its result landing. */
function rowKey(row) {
	return (row.call ?? row.result).seq;
}
function summaryOf(row, options) {
	if (row.result !== void 0) return formatToolCardSummary(row.result, options);
	if (row.call !== void 0) return formatToolCardSummary(row.call, options);
	return "";
}
/** Full detail for a row: the call's presentation, then the result's, blank-line separated when both are present. */
function detailOf(row, options) {
	const callLines = row.call === void 0 ? [] : formatToolCardDetail(row.call, options);
	const resultLines = row.result === void 0 ? [] : formatToolCardDetail(row.result, options);
	if (callLines.length === 0) return resultLines;
	if (resultLines.length === 0) return callLines;
	return [
		...callLines,
		"",
		...resultLines
	];
}
var ToolCardsOverlay = class {
	tui;
	store;
	actions;
	getTool;
	getToolCall;
	selected;
	collapsed = /* @__PURE__ */ new Set();
	scrollOffset = 0;
	lastRowKey;
	lastOpen = false;
	constructor(tui, store, actions, getTool, getToolCall) {
		this.tui = tui;
		this.store = store;
		this.actions = actions;
		this.getTool = getTool;
		this.getToolCall = getToolCall;
	}
	invalidate() {}
	/** Pairs `tool/call`/`tool/result` events by `callId`, in call order; an orphaned result (no call in the log) gets its own trailing row. */
	cards() {
		const rows = [];
		const indexByCallId = /* @__PURE__ */ new Map();
		for (const event of this.store.getSnapshot().events) if (event.type === "tool/call") {
			indexByCallId.set(event.data.callId, rows.length);
			rows.push({
				call: event,
				result: void 0
			});
		} else if (event.type === "tool/result") {
			const index = indexByCallId.get(event.data.message.source.callId);
			if (index === void 0) rows.push({
				call: void 0,
				result: event
			});
			else rows[index] = {
				...rows[index],
				result: event
			};
		}
		return rows;
	}
	contentRows() {
		const availableRows = Math.max(6, this.tui.terminal.rows - 1);
		return Math.max(1, availableRows - 4);
	}
	render(_width) {
		const cards = this.cards();
		const index = cards.length === 0 ? 0 : Math.min(this.selected ?? cards.length - 1, cards.length - 1);
		const row = cards[index];
		const key = row === void 0 ? void 0 : rowKey(row);
		const open = key !== void 0 && !this.collapsed.has(key);
		if (key !== this.lastRowKey || open !== this.lastOpen) {
			this.scrollOffset = 0;
			this.lastRowKey = key;
			this.lastOpen = open;
		}
		const options = {
			replay: false,
			getTool: this.getTool,
			getToolCall: this.getToolCall
		};
		const contentRows = this.contentRows();
		const summary = row === void 0 ? void 0 : summaryOf(row, options);
		const detailLines = row === void 0 || !open ? void 0 : detailOf(row, options);
		const totalDetailLines = detailLines?.length ?? 0;
		const maxScrollOffset = Math.max(0, totalDetailLines - contentRows);
		const clampedOffset = Math.min(this.scrollOffset, maxScrollOffset);
		const visibleDetailLines = detailLines?.slice(clampedOffset, clampedOffset + contentRows);
		const scrollHint = totalDetailLines <= contentRows ? "" : ` · lines ${clampedOffset + 1}-${Math.min(totalDetailLines, clampedOffset + contentRows)} of ${totalDetailLines}`;
		const lines = [bold$5(secondary$5(`Tool Cards${cards.length === 0 ? "" : ` (${index + 1}/${cards.length})`}${open ? scrollHint : ""}`))];
		if (row === void 0) lines.push(muted$5("No tool cards in this session yet."));
		else if (open) lines.push(...visibleDetailLines ?? []);
		else lines.push(`▸ ${summary ?? ""}`);
		lines.push("");
		lines.push(muted$5(`↑↓ select · PgUp/PgDn/Home/End scroll · Enter/Space ${open ? "collapse" : "expand"} · Ctrl+O/Esc close`));
		return lines;
	}
	move(delta) {
		const cards = this.cards();
		if (cards.length === 0) return;
		const current = this.selected ?? cards.length - 1;
		this.selected = Math.max(0, Math.min(cards.length - 1, current + delta));
	}
	scroll(delta, maxScrollOffset) {
		this.scrollOffset = Math.max(0, Math.min(maxScrollOffset, this.scrollOffset + delta));
	}
	toggle() {
		const cards = this.cards();
		const row = cards[cards.length === 0 ? 0 : Math.min(this.selected ?? cards.length - 1, cards.length - 1)];
		if (row === void 0) return;
		const key = rowKey(row);
		if (this.collapsed.has(key)) this.collapsed.delete(key);
		else this.collapsed.add(key);
	}
	handleInput(data) {
		if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("o")) || data === "q") {
			this.actions.closeToolCards();
			return;
		}
		const cards = this.cards();
		const row = cards[cards.length === 0 ? 0 : Math.min(this.selected ?? cards.length - 1, cards.length - 1)];
		const key = row === void 0 ? void 0 : rowKey(row);
		const open = key !== void 0 && !this.collapsed.has(key);
		const contentRows = this.contentRows();
		const options = {
			replay: false,
			getTool: this.getTool,
			getToolCall: this.getToolCall
		};
		const detailLines = row === void 0 || !open ? void 0 : detailOf(row, options);
		const maxScrollOffset = Math.max(0, (detailLines?.length ?? 0) - contentRows);
		if (matchesKey(data, Key.pageUp)) return this.scroll(-contentRows, maxScrollOffset);
		if (matchesKey(data, Key.pageDown)) return this.scroll(contentRows, maxScrollOffset);
		if (matchesKey(data, Key.home)) return this.scroll(-maxScrollOffset, maxScrollOffset);
		if (matchesKey(data, Key.end)) return this.scroll(maxScrollOffset, maxScrollOffset);
		if (matchesKey(data, Key.up) || matchesKey(data, Key.ctrl("p"))) {
			this.move(-1);
			return;
		}
		if (matchesKey(data, Key.down) || matchesKey(data, Key.ctrl("n"))) {
			this.move(1);
			return;
		}
		if (matchesKey(data, Key.enter) || data === " ") this.toggle();
	}
};
//#endregion
//#region src/tui/context/ContextOverlay.ts
const bold$4 = (s) => `\x1b[1m${s}\x1b[0m`;
const secondary$4 = fg(theme.secondary);
const muted$4 = fg(theme.muted);
const BAR_WIDTH = 30;
function bar(widthPercent) {
	const filled = Math.round(widthPercent / 100 * BAR_WIDTH);
	return "█".repeat(Math.max(0, Math.min(BAR_WIDTH, filled))).padEnd(BAR_WIDTH, "░");
}
var ContextOverlay = class {
	store;
	actions;
	constructor(store, actions) {
		this.store = store;
		this.actions = actions;
	}
	invalidate() {}
	render(_width) {
		const { contextPressure, contextBreakdown } = this.store.getSnapshot().stats;
		const occupancy = contextOccupancy(contextPressure);
		const rows = contextBreakdownRows(occupancy, contextBreakdown);
		const lines = [bold$4(secondary$4("Context usage"))];
		if (occupancy === null) lines.push(muted$4("No usage reported yet — send a message first."));
		else {
			lines.push(`${occupancy.percent}% of context used`);
			lines.push(muted$4(`~${formatTokens(occupancy.usedTokens)} / ${formatTokens(occupancy.contextWindow)}`));
			lines.push("");
			if (rows.length === 0) lines.push(muted$4("No composition breakdown yet."));
			else for (const row of rows) lines.push(`${row.label.padEnd(14)} ${secondary$4(bar(row.width))} ${formatTokens(row.tokens)}`);
		}
		lines.push("");
		lines.push(muted$4("esc close"));
		return lines;
	}
	handleInput(data) {
		if (matchesKey(data, Key.escape) || data === "q") {
			this.actions.closeContext();
			return;
		}
	}
};
//#endregion
//#region src/tui/plugins/PluginsOverlay.ts
const bold$3 = (s) => `\x1b[1m${s}\x1b[0m`;
const secondary$3 = fg(theme.secondary);
const muted$3 = fg(theme.muted);
const errorColor$2 = fg(theme.error);
const success$1 = fg(theme.success);
const STATE_LABEL = {
	pending: "pending",
	loading: "loading",
	active: "active",
	failed: "failed",
	disposed: "disposed",
	unloading: "unloading"
};
function rowLabel(row) {
	if (row.state !== void 0) return STATE_LABEL[row.state];
	return row.disabled ? "off" : "···";
}
function rowColor(row) {
	if (row.disabled) return muted$3;
	if (row.state === "failed") return errorColor$2;
	if (row.state === "active") return success$1;
}
var PluginsOverlay = class {
	tui;
	rows;
	actions;
	scrollOffset = 0;
	constructor(tui, rows, actions) {
		this.tui = tui;
		this.rows = rows;
		this.actions = actions;
	}
	invalidate() {}
	listHeight() {
		const availableRows = Math.max(10, this.tui.terminal.rows - 1);
		return Math.max(3, availableRows - 2);
	}
	maxOffset() {
		return Math.max(0, this.rows.length - this.listHeight());
	}
	render(_width) {
		const listHeight = this.listHeight();
		const offset = Math.min(this.scrollOffset, this.maxOffset());
		const windowedRows = this.rows.slice(offset, offset + listHeight);
		const activeCount = this.rows.filter((row) => row.state === "active").length;
		const failedCount = this.rows.filter((row) => row.state === "failed").length;
		const lines = [bold$3(secondary$3(`Plugins (${this.rows.length}) — ${activeCount} active${failedCount === 0 ? "" : `, ${failedCount} failed`}`))];
		for (const row of windowedRows) {
			const color = rowColor(row);
			const label = color === void 0 ? rowLabel(row).padEnd(8) : color(rowLabel(row).padEnd(8));
			const id = row.disabled ? muted$3(` ${row.id}`) : ` ${row.id}`;
			lines.push(`${label}${id}${muted$3(` (${row.name})`)}`);
		}
		lines.push(muted$3("↑↓ scroll · esc close"));
		return lines;
	}
	handleInput(data) {
		if (matchesKey(data, Key.escape) || data === "q") {
			this.actions.closePlugins();
			return;
		}
		const listHeight = this.listHeight();
		const maxOffset = this.maxOffset();
		if (matchesKey(data, Key.up)) {
			this.scrollOffset = Math.max(0, this.scrollOffset - 1);
			return;
		}
		if (matchesKey(data, Key.down)) {
			this.scrollOffset = Math.min(maxOffset, this.scrollOffset + 1);
			return;
		}
		if (matchesKey(data, Key.pageUp)) {
			this.scrollOffset = Math.max(0, this.scrollOffset - listHeight);
			return;
		}
		if (matchesKey(data, Key.pageDown)) this.scrollOffset = Math.min(maxOffset, this.scrollOffset + listHeight);
	}
};
//#endregion
//#region src/tui/agentPresets/AgentPresetsOverlay.ts
const bold$2 = (s) => `\x1b[1m${s}\x1b[0m`;
const secondary$2 = fg(theme.secondary);
const muted$2 = fg(theme.muted);
const errorColor$1 = fg(theme.error);
const invert$2 = (s) => `\x1b[7m${s}\x1b[0m`;
var AgentPresetsOverlay = class {
	store;
	actions;
	constructor(store, actions) {
		this.store = store;
		this.actions = actions;
	}
	invalidate() {}
	render(_width) {
		const overlay = this.store.getSnapshot().overlay;
		if (overlay.kind !== "agentPresets") return [];
		const { rows, selected, current, blank, busy, error } = overlay.agentPresets;
		const lines = [bold$2(secondary$2("Agent presets"))];
		if (error !== void 0) lines.push(errorColor$1(error));
		if (busy && rows.length === 0) lines.push(muted$2("Loading…"));
		rows.forEach((row, index) => {
			const marker = row.id === current ? "● " : "○ ";
			const trust = row.trust === "user" ? " (custom)" : "";
			const row0 = `${index === selected ? "› " : "  "}${marker}${row.label}${trust}`;
			lines.push(index === selected ? invert$2(row0) : row0);
			if (row.broken !== void 0) lines.push(errorColor$1(`    broken: ${row.broken}`));
			else if (row.description !== void 0) lines.push(muted$2(`    ${row.description}`));
		});
		if (rows.length === 0 && !busy) lines.push(muted$2("No agent presets configured in this profile."));
		lines.push(muted$2(blank ? "↑↓ select · enter apply · esc close" : "session already started — preset is fixed · esc close"));
		return lines;
	}
	handleInput(data) {
		const overlay = this.store.getSnapshot().overlay;
		if (overlay.kind !== "agentPresets") return;
		const { rows, selected, blank } = overlay.agentPresets;
		if (matchesKey(data, Key.escape) || data === "q") {
			this.actions.closeAgentPresets();
			return;
		}
		if (rows.length === 0) return;
		if (matchesKey(data, Key.up)) {
			this.actions.selectAgentPresetRow(Math.max(0, selected - 1));
			return;
		}
		if (matchesKey(data, Key.down)) {
			this.actions.selectAgentPresetRow(Math.min(rows.length - 1, selected + 1));
			return;
		}
		if (matchesKey(data, Key.enter) && blank) {
			const row = rows[selected];
			if (row.broken === void 0) this.actions.applyAgentPreset(row.id);
		}
	}
};
//#endregion
//#region src/tui/interaction/ApprovalOverlay.ts
const bold$1 = (s) => `\x1b[1m${s}\x1b[0m`;
const warning = fg(theme.warning);
const muted$1 = fg(theme.muted);
const success = fg(theme.success);
const errorColor = fg(theme.error);
const invert$1 = (s) => `\x1b[7m${s}\x1b[0m`;
const CHOICES = [{
	outcome: "allowed-once",
	label: "Allow once"
}, {
	outcome: "rejected",
	label: "Reject"
}];
var ApprovalOverlay = class {
	approval;
	actions;
	selected = 0;
	constructor(approval, actions) {
		this.approval = approval;
		this.actions = actions;
	}
	invalidate() {}
	render(_width) {
		const lines = [bold$1(warning("Approval requested"))];
		const idSuffix = this.approval.callId === void 0 ? "" : muted$1(` (${this.approval.callId})`);
		lines.push(`Tool: ${bold$1(this.approval.toolName)}${idSuffix}`);
		if (this.approval.reason !== void 0) lines.push(muted$1(this.approval.reason));
		CHOICES.forEach((choice, index) => {
			const color = choice.outcome === "rejected" ? errorColor : success;
			const text = `${index === this.selected ? "› " : "  "}${choice.label}`;
			lines.push(color(index === this.selected ? invert$1(text) : text));
		});
		lines.push(muted$1("↑↓ select · enter confirm · y allow · n/esc reject"));
		return lines;
	}
	handleInput(data) {
		if (data === "y") {
			this.actions.answerApproval("allowed-once");
			return;
		}
		if (data === "n" || matchesKey(data, Key.escape)) {
			this.actions.answerApproval("rejected");
			return;
		}
		if (matchesKey(data, Key.up) || matchesKey(data, Key.left)) {
			this.selected = (this.selected - 1 + CHOICES.length) % CHOICES.length;
			return;
		}
		if (matchesKey(data, Key.down) || matchesKey(data, Key.right)) {
			this.selected = (this.selected + 1) % CHOICES.length;
			return;
		}
		if (matchesKey(data, Key.enter)) this.actions.answerApproval(CHOICES[this.selected].outcome);
	}
};
//#endregion
//#region src/tui/interaction/QuestionOverlay.ts
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const secondary$1 = fg(theme.secondary);
const muted = fg(theme.muted);
const invert = (s) => `\x1b[7m${s}\x1b[0m`;
/** Detail (e.g. a plan-review's plan markdown) line cap. */
const MAX_DETAIL_LINES = 60;
function capDetailLines(detail) {
	const lines = detail.split("\n");
	if (lines.length <= MAX_DETAIL_LINES) return lines;
	const omitted = lines.length - MAX_DETAIL_LINES;
	return [...lines.slice(0, MAX_DETAIL_LINES), `… +${omitted} more line${omitted === 1 ? "" : "s"}`];
}
var QuestionOverlay = class {
	question;
	actions;
	cursor = 0;
	toggled = /* @__PURE__ */ new Set();
	customMode;
	customField = emptyMiniTextField();
	constructor(question, actions) {
		this.question = question;
		this.actions = actions;
		this.customMode = question.options.length === 0;
	}
	invalidate() {}
	submit() {
		const custom = this.customField.value.trim();
		if (this.question.multiSelect) {
			const selected = [...this.toggled].sort((a, b) => a - b).map((index) => this.question.options[index].label);
			this.actions.answerQuestion({
				selected,
				custom: custom === "" ? void 0 : custom
			});
			return;
		}
		if (this.customMode) {
			this.actions.answerQuestion({
				selected: [],
				custom
			});
			return;
		}
		this.actions.answerQuestion({
			selected: [this.question.options[this.cursor].label],
			custom: void 0
		});
	}
	render(_width) {
		const { header, question: text, detail, options, multiSelect, approveLabel, progress } = this.question;
		const otherIndex = options.length;
		const lines = [];
		lines.push(bold(secondary$1(`${header ?? "Question"}${progress === void 0 ? "" : ` — ${progress}`}`)));
		lines.push(text);
		if (detail !== void 0) {
			lines.push("");
			for (const line of capDetailLines(detail)) lines.push(muted(line));
			lines.push("");
		}
		options.forEach((option, index) => {
			const isSelected = !this.customMode && this.cursor === index;
			const box = multiSelect ? this.toggled.has(index) ? "[x] " : "[ ] " : "";
			const approve = approveLabel === option.label ? " (approve)" : "";
			const row = `${isSelected ? "› " : "  "}${box}${option.label}${approve}`;
			lines.push(isSelected ? invert(row) : row);
			if (option.description !== void 0) lines.push(muted(`    ${option.description}`));
		});
		if (options.length > 0) {
			const isSelected = !this.customMode && this.cursor === otherIndex;
			const row = `${isSelected ? "› " : "  "}Other…`;
			lines.push(isSelected ? invert(row) : row);
		}
		if (this.customMode) lines.push(`> ${renderMiniTextField(this.customField, true)}`);
		const hint = [
			multiSelect ? "↑↓ move · space toggle · enter submit" : "↑↓ move · enter select",
			options.length === 0 ? "" : "\"Other…\" for free text",
			"esc skip"
		].filter((s) => s !== "").join(" · ");
		lines.push(muted(hint));
		return lines;
	}
	handleInput(data) {
		const { options, multiSelect } = this.question;
		const otherIndex = options.length;
		if (this.customMode) {
			if (matchesKey(data, Key.escape)) {
				if (options.length > 0) this.customMode = false;
				else this.actions.answerQuestion({
					selected: [],
					custom: void 0
				});
				return;
			}
			if (matchesKey(data, Key.enter)) {
				this.submit();
				return;
			}
			const next = miniTextFieldInput(this.customField, data);
			if (next !== void 0) this.customField = next;
			return;
		}
		if (matchesKey(data, Key.escape)) {
			this.actions.answerQuestion({
				selected: [],
				custom: void 0
			});
			return;
		}
		if (options.length === 0) return;
		if (matchesKey(data, Key.up)) {
			this.cursor = (this.cursor - 1 + options.length + 1) % (options.length + 1);
			return;
		}
		if (matchesKey(data, Key.down)) {
			this.cursor = (this.cursor + 1) % (options.length + 1);
			return;
		}
		if (data === " " && multiSelect && this.cursor < options.length) {
			if (this.toggled.has(this.cursor)) this.toggled.delete(this.cursor);
			else this.toggled.add(this.cursor);
			return;
		}
		if (matchesKey(data, Key.enter)) {
			if (this.cursor === otherIndex) {
				this.customMode = true;
				return;
			}
			this.submit();
		}
	}
};
//#endregion
//#region src/tui/TuiApp.ts
/**
* Root orchestrator: builds the pi-tui component tree once, then patches it
* imperatively from `TuiStore` change notifications — the pi-tui equivalent
* of `App.tsx` (root component) + `mount.tsx` (the `render()` call site)
* combined, since pi-tui has no JSX/reconciler to split those across.
*
* Two different update strategies are used, deliberately:
*
* - The live region (notice, queued preview, streaming text, status bar,
*   stats line, permission indicator, update hint) is a `DynamicText`/`Spinner` per row,
*   each pulling straight from `store.getSnapshot()` at render time. There is
*   no manual `setText` bookkeeping to keep in sync — every repaint just
*   reflects whatever the store currently holds. The approve/reject panel
*   (`ApprovalSlot`) is a live-region row too, but an interactive one: it
*   delegates render/input to whichever `ApprovalOverlay` is currently
*   active and takes focus while one is, rather than covering the screen.
* - The transcript is append-only: `appendNewTranscriptItems` diffs the
*   store's `events`/`shellHistory` arrays against how much has already been
*   turned into a `createTranscriptLine` child of `documentContainer`,
*   appending only the new tail. Re-formatting the whole transcript on every
*   store change would be wasteful for a long session — `ScrollView`'s own
*   viewport culling (confirmed in pi-tui's own test suite: painting a huge
*   scroll child is O(viewport), not O(content)) is what makes this safe to
*   grow without bound.
*
* Overlays (`/model`, `/trajectory`, Ctrl+O tool cards, `/context`,
* `/plugins`, `/presets`, question) are `tui.showOverlay(...)` calls keyed
* off `store.getSnapshot().overlay.kind` — see `updateOverlay`. Approval is
* the one exception: it renders inline in the dock instead (see above).
* @module @tomowang/dsh-tui/tui/TuiApp
*/
const secondary = fg(theme.secondary);
/** Full-screen panel anchored at the top — every overlay's uniform placement. */
const OVERLAY_OPTIONS = {
	anchor: "top-left",
	row: 0,
	col: 0,
	width: "100%",
	maxHeight: "100%"
};
/**
* Wraps an overlay `Component` so it always paints every cell of the
* terminal, not just however many lines its own content happens to need.
* `tui.showOverlay` composites exactly what `render()` returns onto the base
* frame at the requested position/size — it does not clear or pad the rest
* of that box — so a short overlay (e.g. a "No tool cards yet" one-liner)
* otherwise leaves the transcript/dock's last-painted content visible
* underneath it, which reads as a rendering bug (old messages "bleeding
* through" around a top-anchored panel) rather than an intentional
* takeover. Padding to the full terminal height/width here, once, means no
* individual overlay has to reimplement this.
*/
var FullScreenOverlay = class {
	inner;
	tui;
	constructor(inner, tui) {
		this.inner = inner;
		this.tui = tui;
	}
	get wantsKeyRelease() {
		return this.inner.wantsKeyRelease ?? false;
	}
	invalidate() {
		this.inner.invalidate();
	}
	handleInput(data) {
		this.inner.handleInput?.(data);
	}
	render(width) {
		const lines = this.inner.render(width);
		const height = Math.max(lines.length, this.tui.terminal.rows);
		const padded = [];
		for (let i = 0; i < height; i++) {
			const line = lines[i] ?? "";
			const pad = width - visibleWidth(line);
			padded.push(pad > 0 ? line + " ".repeat(pad) : line);
		}
		return padded;
	}
};
/**
* Dock row that delegates to whichever `ApprovalOverlay` is currently
* active, or renders nothing between approvals. Unlike the other dock rows
* (`DynamicText`, pulling read-only text from the store each render), this
* one also takes focus and forwards keystrokes — it's how the approve/reject
* panel gets shown inline, in the live region, instead of as a
* full-screen `showOverlay` panel covering the transcript.
*/
var ApprovalSlot = class {
	current;
	set(component) {
		this.current = component;
	}
	invalidate() {
		this.current?.invalidate();
	}
	render(width) {
		return this.current?.render(width) ?? [];
	}
	handleInput(data) {
		this.current?.handleInput(data);
	}
};
let activeTui;
let keybindingsConfigured = false;
/**
* Emacs-style Ctrl+P/Ctrl+N aliases, and history recall on up/down —
* matching the old hand-rolled `PromptInput` exactly. Also frees `Home`/`End`
* from `TuiAltScreen`'s default viewport-jump-to-top/bottom bindings: the
* alt-screen's own viewport navigation intercepts input *before* it reaches
* the focused component (confirmed empirically — an unmodified `Home`
* scrolled the transcript instead of moving the prompt's cursor to line
* start), which would otherwise silently break `Editor`'s own
* `cursorLineStart`/`cursorLineEnd` (`Home`/`End`/Ctrl+A/Ctrl+E) whenever the
* prompt has focus, which is effectively always. `Ctrl+A`/`Ctrl+E` still
* give line motion and `PageUp`/`PageDown`/mouse wheel still give transcript
* scroll, so unbinding the dedicated top/bottom jump is a reasonable trade.
* Configured once, globally (pi-tui's keybinding registry is module-global,
* not per-instance).
*/
function ensureKeybindings() {
	if (keybindingsConfigured) return;
	keybindingsConfigured = true;
	setKeybindings(new KeybindingsManager(TUI_KEYBINDINGS, {
		"tui.editor.cursorUp": ["up", "ctrl+p"],
		"tui.editor.cursorDown": ["down", "ctrl+n"],
		"tui.editor.historyPrevious": ["up", "ctrl+p"],
		"tui.editor.historyNext": ["down", "ctrl+n"],
		"tui.altScreen.top": [],
		"tui.altScreen.bottom": []
	}));
}
var TuiApp = class {
	options;
	tui;
	documentContainer = new Container();
	editor;
	spinner;
	pet;
	appendedEventsCount = 0;
	appendedShellCount = 0;
	currentOverlayKind = "none";
	overlayHandle;
	approvalSlot = new ApprovalSlot();
	wasRunning = false;
	stopped = false;
	/** Last title string sent to the terminal, so an unrelated store change doesn't re-issue the same OSC 0 write every render. */
	lastTerminalTitle;
	constructor(options) {
		this.options = options;
		const { store, actions } = options;
		const terminal = new ProcessTerminal();
		this.tui = new TuiAltScreen(terminal, true, void 0, {
			mouse: true,
			onRightClickPaste: () => {
				readClipboard().then((text) => this.tui.getFocusedComponent()?.handleInput?.(`\x1b[200~${text}\x1b[201~`)).catch(() => {});
			}
		});
		this.spinner = new Spinner(this.tui);
		this.pet = new YlyPet(this.tui);
		const transcriptScrollView = new ScrollView(this.documentContainer, {
			follow: "end",
			primary: true,
			overscroll: "chain"
		});
		this.editor = new CustomEditor(this.tui, actions, {
			getStatus: () => store.getSnapshot().status,
			history: options.promptHistory,
			getFileCandidates: () => this.waitForFileIndex()
		});
		const noticeText = new DynamicText(() => {
			const notice = store.getSnapshot().notice;
			return notice === void 0 ? "" : secondary(notice);
		});
		const goalText = new DynamicText(() => buildGoalBarText(store.getSnapshot().goal));
		const queuedText = new DynamicText(() => buildQueuedText(store.getSnapshot().queued));
		const streamingText = new DynamicText((width) => {
			const streaming = store.getSnapshot().streaming;
			if (streaming === void 0) return "";
			return padTranscriptText(formatStreamingText(streaming.text, streaming.reasoningText, this.spinner.current()) ?? "", width).join("\n");
		});
		const pendingToolCallsText = new DynamicText((width) => {
			const { pendingToolCalls } = store.getSnapshot();
			return padTranscriptText(formatPendingToolCalls(pendingToolCalls, this.spinner.current(), options.getTool), width).join("\n");
		});
		const shellRunLiveText = new DynamicText((width) => {
			const run = store.getSnapshot().shellRun;
			if (run === void 0) return "";
			return padTranscriptText(formatShellRunLive(run.command, run.output), width).join("\n");
		});
		const statusBarText = new DynamicText(() => {
			const state = store.getSnapshot();
			return buildStatusBarText({
				sessionId: options.sessionId,
				provider: options.provider,
				model: options.model,
				status: state.status,
				queuedCount: state.queued.length,
				presetLabel: state.preset?.current,
				eventCount: state.events.length,
				spinnerChar: this.spinner.current()
			});
		});
		const permissionText = new DynamicText(() => buildPermissionText(store.getSnapshot().permission));
		const updateHintText = new DynamicText(() => buildUpdateHintText(options.version, store.getSnapshot().updateHint));
		const statsLineText = new DynamicText(() => {
			const stats = store.getSnapshot().stats;
			return [buildStatsLine(stats.sessionStats, stats.tokenUsage), buildContextLine(stats.contextPressure)].filter((group) => group !== "").join("| ");
		});
		const dock = new VStack([
			noticeText,
			goalText,
			queuedText,
			streamingText,
			pendingToolCallsText,
			shellRunLiveText,
			statusBarText,
			this.approvalSlot,
			this.editor,
			permissionText,
			updateHintText,
			statsLineText
		], { gap: 0 });
		const headerInfo = new DynamicText(() => {
			const { provider, model, cwd } = options;
			return [
				fg(theme.primary)("ACRYL"),
				"",
				`${provider}/${model}`,
				cwd
			].join("\n");
		});
		const layoutRoot = new VStack([
			{
				component: new HStack([{
					component: this.pet,
					basis: 34,
					shrink: 0
				}, {
					component: headerInfo,
					basis: "auto",
					grow: 1
				}], {
					gap: 1,
					align: "start"
				}),
				basis: "auto",
				shrink: 0
			},
			{
				component: transcriptScrollView,
				basis: 0,
				grow: 1,
				minSize: 1
			},
			{
				component: dock,
				basis: "auto",
				shrink: 1,
				minSize: 1
			}
		], { gap: 0 });
		this.tui.setLayoutRoot(layoutRoot);
		this.tui.setFocus(this.editor);
		this.appendNewTranscriptItems(store.getSnapshot());
		this.updateTerminalTitle(store.getSnapshot().title);
		this.updatePetMode(store.getSnapshot());
		store.subscribe(() => {
			const state = store.getSnapshot();
			this.appendNewTranscriptItems(state);
			this.updateOverlay(state.overlay);
			this.updateTerminalTitle(state.title);
			this.updatePetMode(state);
			const running = state.status === "running";
			if (running !== this.wasRunning) {
				this.wasRunning = running;
				if (running) this.spinner.start();
				else this.spinner.stop();
			}
			this.tui.requestRender();
		});
	}
	/** Drive the YLY pet's mode from the live agent state (idle/thinking/tool/typing). */
	updatePetMode(state) {
		let mode = "idle";
		if (state.status === "running") if (state.pendingToolCalls.length > 0) mode = "tool";
		else if (state.streaming !== void 0 && (state.streaming.text !== "" || state.streaming.reasoningText !== "")) mode = "typing";
		else mode = "thinking";
		this.pet.setMode(mode);
	}
	/** Push the terminal window/tab title (OSC 0) when the session's title projection changes; a no-op once already reflecting the current value. */
	updateTerminalTitle(title) {
		const text = buildTerminalTitle(title);
		if (text === this.lastTerminalTitle) return;
		this.lastTerminalTitle = text;
		this.tui.terminal.setTitle(text);
	}
	start() {
		activeTui = this.tui;
		this.pet.start();
		this.tui.start();
	}
	appendNewTranscriptItems(state) {
		const { getTool, getToolCall } = this.options;
		if (state.events.length > this.appendedEventsCount) {
			for (let i = this.appendedEventsCount; i < state.events.length; i++) {
				const event = state.events[i];
				const formatted = formatEvent(event, {
					replay: event.seq <= state.replayThrough,
					getTool,
					getToolCall
				});
				if (formatted !== void 0 && formatted !== "") this.documentContainer.addChild(createTranscriptLine(formatted));
			}
			this.appendedEventsCount = state.events.length;
		}
		if (state.shellHistory.length > this.appendedShellCount) {
			for (let i = this.appendedShellCount; i < state.shellHistory.length; i++) {
				const run = state.shellHistory[i];
				this.documentContainer.addChild(createTranscriptLine(formatShellRun(run.command, run.output, run.exitCode)));
			}
			this.appendedShellCount = state.shellHistory.length;
		}
	}
	/** Loads (once, cached in the store) and resolves with the `@`-mention file index, for `CustomEditor`'s autocomplete provider. */
	waitForFileIndex() {
		const { store, actions } = this.options;
		actions.ensureFileIndex();
		const snapshot = store.getSnapshot().fileIndex;
		if (snapshot.candidates !== void 0) return Promise.resolve(snapshot.candidates);
		return new Promise((resolve) => {
			const unsubscribe = store.subscribe(() => {
				const current = store.getSnapshot().fileIndex;
				if (current.candidates !== void 0) {
					unsubscribe();
					resolve(current.candidates);
				}
			});
		});
	}
	buildOverlayComponent(overlay) {
		const { store, actions, getTool, getToolCall } = this.options;
		switch (overlay.kind) {
			case "none": return;
			case "modelProfile": return new ModelProfileOverlay(store, actions);
			case "login": return new LoginOverlay(store, actions);
			case "trajectory": return new TrajectoryOverlay(this.tui, store, actions, getTool);
			case "toolCards": return new ToolCardsOverlay(this.tui, store, actions, getTool, getToolCall);
			case "context": return new ContextOverlay(store, actions);
			case "plugins": return new PluginsOverlay(this.tui, overlay.rows, actions);
			case "agentPresets": return new AgentPresetsOverlay(store, actions);
			case "approval": return;
			case "userQuestion": return new QuestionOverlay(overlay.userQuestion, actions);
		}
	}
	updateOverlay(overlay) {
		if (overlay.kind === this.currentOverlayKind) return;
		const previousKind = this.currentOverlayKind;
		this.currentOverlayKind = overlay.kind;
		if ((overlay.kind === "approval" || overlay.kind === "userQuestion") && previousKind !== "approval" && previousKind !== "userQuestion") {
			const message = overlay.kind === "approval" ? "ACRYL is waiting for your approval" : "ACRYL is waiting for your answer";
			this.tui.terminal.write(`\x1b]9;${message}\x07`);
		}
		if (previousKind === "approval") this.approvalSlot.set(void 0);
		if (this.overlayHandle !== void 0) {
			this.overlayHandle.hide();
			this.overlayHandle = void 0;
		}
		if (overlay.kind === "approval") {
			this.approvalSlot.set(new ApprovalOverlay(overlay.approval, this.options.actions));
			this.tui.setFocus(this.approvalSlot);
			return;
		}
		this.tui.setFocus(this.editor);
		const component = this.buildOverlayComponent(overlay);
		if (component === void 0) return;
		this.overlayHandle = this.tui.showOverlay(new FullScreenOverlay(component, this.tui), OVERLAY_OPTIONS);
	}
	unmount(options) {
		if (this.stopped) return;
		this.stopped = true;
		this.spinner.stop();
		this.pet.stop();
		this.tui.stop(options);
		if (activeTui === this.tui) activeTui = void 0;
	}
	waitUntilExit() {
		return new Promise((resolve) => setTimeout(resolve, 0));
	}
};
/** Mount the interactive front door. */
function mountTui(options) {
	ensureKeybindings();
	const app = new TuiApp(options);
	app.start();
	return app;
}
/** Directory names the fallback walk never descends into. */
const WALK_EXCLUDES = /* @__PURE__ */ new Set([".git", "node_modules"]);
/**
* List candidate file paths under `cwd`, relative to `cwd`.
* @param cwd - root to list from.
* @returns tracked and untracked-but-not-gitignored paths via `git ls-files`
* when `cwd` is inside a git repo; otherwise a bounded recursive walk.
*/
async function loadFileIndex(cwd) {
	const fromGit = await listGitFiles(cwd);
	if (fromGit !== void 0) return fromGit;
	return walkDirectory(cwd);
}
function listGitFiles(cwd) {
	return new Promise((resolve) => {
		let out = "";
		let child;
		try {
			child = spawn("git", [
				"ls-files",
				"--cached",
				"--others",
				"--exclude-standard"
			], {
				cwd,
				stdio: [
					"ignore",
					"pipe",
					"ignore"
				]
			});
		} catch {
			resolve(void 0);
			return;
		}
		child.stdout.on("data", (chunk) => {
			out += chunk.toString();
		});
		child.on("error", () => resolve(void 0));
		child.on("close", (code) => {
			if (code !== 0) {
				resolve(void 0);
				return;
			}
			resolve(out.split("\n").filter((line) => line.length > 0));
		});
	});
}
async function walkDirectory(cwd) {
	const results = [];
	const queue = [cwd];
	while (queue.length > 0 && results.length < 5e3) {
		const dir = queue.shift();
		let entries;
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			if (results.length >= 5e3) break;
			if (entry.isDirectory()) {
				if (WALK_EXCLUDES.has(entry.name)) continue;
				queue.push(join(dir, entry.name));
				continue;
			}
			if (entry.isFile()) results.push(relative(cwd, join(dir, entry.name)));
		}
	}
	return results;
}
//#endregion
//#region src/tui/auth-guidance.ts
function logoutSuccessMessage(provider) {
	return `Removed stored authentication for ${provider.trim() === "" ? "provider" : provider}.`;
}
function logoutNoneMessage() {
	return "No active provider is selected; nothing to log out.";
}
/** Canonical ACRYL version string used by the CLI and the release smoke checks. */
const ACRYL_VERSION = createRequire(import.meta.url)("../package.json").version;
//#endregion
//#region src/tui-app/session.ts
/**
* ACRYL terminal host adapter: brings up one normal local runtime, opens or
* resumes one native durable DSH session through a runtime-owned bridge,
* projects the durable log into `TuiStore`, and drives the pi-tui shell.
*
* Session-inspector overlays (/trajectory, /tools, /context, /plugins) and the
* /model /presets /goal /plan /compact commands are wired to the runtime so the
* TUI shows the same capabilities the web surface does. `/clear` flushes the
* current session and re-attaches a fresh one (durable history stays on disk).
*/
const TUI_VERSION = ACRYL_VERSION;
const PROMPT_HISTORY_LIMIT = 200;
function failUnknown(status) {
	return status === "running" ? "running" : "idle";
}
function toolPreview(ctx) {
	return (name) => ctx.get("tools")?.get(name);
}
function fiberStateLabel(state) {
	return {
		active: "active",
		pending: "pending",
		loading: "loading",
		failed: "failed",
		unloading: "unloading",
		disposed: "disposed"
	}[String(state)] ?? void 0;
}
function pluginRows(ctx) {
	const loader = ctx.get("loader");
	if (loader === void 0) return void 0;
	return [...loader.entries()].map((entry) => ({
		id: entry.id,
		name: entry.options.name,
		disabled: entry.disabled,
		group: Boolean(entry.options.group),
		state: entry.fiber === void 0 ? void 0 : fiberStateLabel(entry.fiber.state)
	}));
}
function sessionBlank(session) {
	return !session.events.some((event) => event.type === "turn/start");
}
/** Read a nested value out of an untyped resolved/raw settings section. */
function getAtPath(value, path) {
	let current = value;
	for (const key of path) {
		if (current === null || typeof current !== "object") return void 0;
		current = current[key];
	}
	return current;
}
/** Derive a POSIX-identifier credential ref from a provider route, e.g. `my-proxy` -> `MY_PROXY_API_KEY`. */
function deriveApiKeyRef(route) {
	const upper = route.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
	return `${/^[A-Z_]/.test(upper) ? upper : `P_${upper}`}_API_KEY`;
}
/** Open a URL in the platform's default browser (fire-and-forget). */
function openBrowser(url) {
	const platform = process.platform;
	const command = platform === "darwin" ? ["open", [url]] : platform === "win32" ? ["cmd", [
		"/c",
		"start",
		"",
		url
	]] : ["xdg-open", [url]];
	return new Promise((resolve) => {
		execFile(command[0], command[1], () => resolve());
	});
}
/** Nest a provider settings section at its path, e.g. `['providers','deepseek']` -> `{ providers: { deepseek: section } }`. */
function nestAtPath(path, section) {
	let patch = section;
	for (let index = path.length - 1; index >= 0; index--) patch = { [path[index]]: patch };
	return patch;
}
/** English display names for the shipped preset ids (the metadata is authored in Chinese, and there is no server-side locale resolution). */
const PRESET_LABELS = {
	standard: "Standard mode",
	code: "Code mode",
	minimal: "Minimal mode",
	cordis: "Creator mode"
};
const HELP_TEXT = [
	"available commands:",
	"  /help        show this help",
	"  /model       manage LLM provider profiles",
	"  /trajectory  browse the turn/step event ledger",
	"  /tools       browse and expand tool cards",
	"  /context     show context-window usage",
	"  /plugins     show the loaded plugin tree",
	"  /presets     view/switch agent presets",
	"  /goal        set or view the long-running goal",
	"  /plan        enter plan mode",
	"  /compact     summarize and compact session history",
	"  /clear       flush the session and start a new one",
	"  /exit, /quit exit ACRYL",
	"any text submits; Ctrl+C cancels; Ctrl+D | Ctrl+C exits"
].join("\n");
async function attachSession(host, resumeId) {
	const bridge = createAcrylSessionBridge(host.ctx, {
		profile: host.profile,
		generationId: randomUUID(),
		attachment: "owner",
		cwd: process.cwd()
	});
	const store = new TuiStore({ events: [] });
	let signal = () => {};
	const exitPromise = new Promise((resolve) => {
		signal = resolve;
	});
	const id = await bridge.open(resumeId);
	storeSetStatus(store, await bridge.snapshot(id));
	bridge.subscribeEvents(id, (event) => {
		store.appendEvent(event);
		bridge.snapshot(id).then((next) => storeSetStatus(store, next));
	});
	const agent = host.ctx.agents?.get?.(SessionId(id));
	const session = agent?.session;
	const history = [];
	async function loadProviders() {
		const settingsSvc = host.ctx.get("settings");
		const credentialsSvc = host.ctx.get("credentials");
		const llmSvc = host.ctx.get("llm");
		if (settingsSvc === void 0 || credentialsSvc === void 0 || llmSvc === void 0) {
			store.updateModelProfile({
				providers: [],
				busy: false,
				error: "Model provider settings are not available in this profile."
			});
			return;
		}
		const configurable = llmSvc.listConfigurableProviders();
		const live = new Set(llmSvc.listProviders().map((provider) => provider.id));
		const descriptors = settingsSvc.describe({ redactSecrets: true });
		const byNs = new Map(descriptors.map((descriptor) => [descriptor.ns, descriptor]));
		const rows = [];
		for (const entry of configurable) {
			const descriptor = byNs.get(entry.settingsNs);
			const value = descriptor === void 0 ? void 0 : getAtPath(descriptor.value, entry.settingsPath);
			const userValue = descriptor === void 0 ? void 0 : getAtPath(descriptor.user, entry.settingsPath);
			const apiKeyRef = value?.apiKeyEnv ?? deriveApiKeyRef(entry.provider);
			const info = await credentialsSvc.describe(apiKeyRef);
			rows.push({
				route: entry.provider,
				displayName: value?.displayName ?? entry.displayName,
				settingsNs: entry.settingsNs,
				settingsPath: entry.settingsPath,
				configured: userValue !== void 0,
				live: live.has(entry.provider),
				api: value?.api,
				baseURL: value?.baseURL,
				apiKeyRef,
				apiKeyConfigured: info.configured,
				models: value?.models ?? [],
				revision: descriptor?.revision
			});
		}
		store.updateModelProfile({
			providers: rows,
			busy: false,
			error: void 0,
			selected: 0
		});
	}
	async function loadAuthorizationFlows() {
		const authSvc = host.ctx.get("authorization");
		if (authSvc === void 0) {
			store.updateLogin({
				flows: [],
				busy: false,
				error: "Sign-in is not available in this profile."
			});
			return;
		}
		try {
			const list = authSvc.list();
			store.updateLogin({
				flows: list,
				busy: false,
				error: void 0
			});
		} catch (error) {
			store.updateLogin({
				busy: false,
				error: error instanceof Error ? error.message : String(error)
			});
		}
	}
	async function loadAgentPresets() {
		const presetsSvc = host.ctx.get("agentPresets");
		if (presetsSvc === void 0) {
			store.updateAgentPresets({
				rows: [],
				busy: false,
				error: void 0
			});
			return;
		}
		try {
			const rows = (await presetsSvc.list()).map((preset) => ({
				id: preset.id,
				label: PRESET_LABELS[preset.id] ?? preset.name ?? preset.id,
				description: preset.description,
				trust: preset.trust,
				broken: preset.broken
			}));
			store.updateAgentPresets({
				rows,
				busy: false,
				error: void 0
			});
		} catch (error) {
			store.updateAgentPresets({
				busy: false,
				error: error instanceof Error ? error.message : String(error)
			});
		}
	}
	let pendingPromptResolve;
	const actions = {
		send(text) {
			store.setNotice(void 0);
			bridge.submitPrompt({
				sessionId: id,
				text
			}).catch((error) => {
				store.setNotice(error instanceof Error ? error.message : String(error));
			});
		},
		cancel() {
			bridge.cancel(id).catch(() => {});
		},
		shutdown() {
			signal("exit");
		},
		help() {
			store.setNotice(HELP_TEXT);
		},
		recordHistory(line) {
			history.push(line);
			if (history.length > PROMPT_HISTORY_LIMIT) history.shift();
		},
		clear() {
			store.setNotice("clearing…");
			signal("clear");
		},
		cyclePermission() {
			store.setNotice("permission cycling is not composed in this profile yet");
		},
		compact() {
			const compaction = host.ctx.get("compaction");
			if (compaction === void 0 || agent === void 0) return store.setNotice("compaction is not available in this profile");
			store.setNotice("compacting…");
			compaction.compactNow(agent, new AbortController().signal).then((result) => store.setNotice(result === null ? "no compactable history yet" : void 0)).catch((error) => {
				const message = error instanceof ManualCompactionError ? error.code : error instanceof Error ? error.message : String(error);
				store.setNotice(`compaction failed: ${message}`);
			});
		},
		plan(rawInput) {
			const planMode = host.ctx.get("planMode");
			if (planMode === void 0 || agent === void 0) return store.setNotice("plan mode is not available in this profile");
			const message = rawInput.trim();
			if (message === "off") {
				planMode.set(agent, false);
				store.setNotice("Plan mode off.");
				return;
			}
			const outcome = planMode.set(agent, true);
			if (message !== "") agent.steer(createUserMessage({
				content: [{
					type: "text",
					text: message
				}],
				source: { kind: "user" }
			}));
			store.setNotice(outcome === "committed" ? "Plan mode on. Use /plan off to leave." : "Entering plan mode (applies from the next step). Use /plan off to leave.");
		},
		goal(command) {
			const goals = host.ctx.get("goals");
			if (goals === void 0 || agent === void 0) return store.setNotice("goal mode is not available in this profile");
			try {
				const current = goals.get(agent);
				switch (command.kind) {
					case "show":
						store.setNotice(current === void 0 ? "No goal is currently set. Use /goal <objective> to set one." : `Goal: ${current.objective}`);
						return;
					case "invalid-edit":
						store.setNotice("Goal editing requires a replacement objective.");
						return;
					case "create":
						store.setNotice(`Goal created: ${goals.create(agent, { objective: command.objective }).objective}`);
						return;
					case "edit":
						if (current === void 0) return store.setNotice("No goal to edit.");
						store.setNotice(`Goal updated: ${goals.edit(agent, {
							id: current.id,
							revision: current.revision
						}, { objective: command.objective }).objective}`);
						return;
					case "pause":
						if (current === void 0) return store.setNotice("No goal to pause.");
						goals.pause(agent, {
							id: current.id,
							revision: current.revision
						});
						return store.setNotice("Goal paused.");
					case "resume":
						if (current === void 0) return store.setNotice("No goal to resume.");
						goals.resume(agent, {
							id: current.id,
							revision: current.revision
						});
						return store.setNotice("Goal resumed.");
					case "clear":
						if (current === void 0) return store.setNotice("No goal to clear.");
						goals.clear(agent, {
							id: current.id,
							revision: current.revision
						});
						return store.setNotice("Goal cleared.");
				}
			} catch (error) {
				store.setNotice(error instanceof GoalError ? "The goal command is not valid for the current state. Run /goal to view available commands." : `goal command failed: ${error instanceof Error ? error.message : String(error)}`);
			}
		},
		runShell() {
			store.setNotice("shell mode is not composed in this profile yet");
		},
		ensureFileIndex() {
			if (store.getSnapshot().fileIndex.candidates !== void 0) return;
			loadFileIndex(process.cwd()).then((candidates) => store.setFileIndex(candidates));
		},
		openModelProfile() {
			store.openModelProfile();
			loadProviders();
		},
		login() {
			store.openLogin();
			loadAuthorizationFlows();
		},
		closeLogin() {
			store.closeOverlay();
		},
		selectLoginFlow(index) {
			store.updateLogin({ selected: index });
		},
		beginAuthorization(key) {
			(async () => {
				const authSvc = host.ctx.get("authorization");
				if (authSvc === void 0) {
					store.setNotice("Sign-in is not available in this profile.");
					return;
				}
				const overlay = store.getSnapshot().overlay;
				const flow = overlay.kind === "login" ? overlay.login.flows?.find((entry) => entry.key === key) : void 0;
				if (flow === void 0) return;
				store.updateLogin({ signingIn: key });
				const interaction = {
					notify(notice) {
						if (notice.url !== void 0) openBrowser(notice.url);
						const parts = [notice.message];
						if (notice.url !== void 0) parts.push(notice.url);
						if (notice.code !== void 0) parts.push(`Code: ${notice.code}`);
						store.setNotice(parts.join("\n"));
					},
					async prompt(prompt) {
						return await new Promise((resolve, reject) => {
							if (prompt.signal?.aborted) {
								reject(/* @__PURE__ */ new Error("authorization prompt withdrawn"));
								return;
							}
							pendingPromptResolve = resolve;
							const state = prompt.kind === "select" ? {
								kind: "select",
								message: prompt.message,
								options: (prompt.options ?? []).map((option) => ({
									id: option.id,
									label: option.label,
									description: option.description
								}))
							} : {
								kind: prompt.kind,
								message: prompt.message,
								placeholder: prompt.placeholder
							};
							store.updateLogin({ prompt: state });
							prompt.signal?.addEventListener("abort", () => {
								if (pendingPromptResolve === resolve) pendingPromptResolve = void 0;
								store.updateLogin({ prompt: void 0 });
								reject(/* @__PURE__ */ new Error("authorization prompt withdrawn"));
							}, { once: true });
						});
					}
				};
				try {
					if ((await authSvc.begin({
						key,
						interaction
					})).status === "authorized") {
						store.setNotice(`Signed in to ${flow.label}.`);
						loadAuthorizationFlows();
					} else store.setNotice("Sign-in cancelled.");
				} catch (error) {
					store.setNotice(`Sign-in failed: ${error instanceof Error ? error.message : String(error)}`);
				} finally {
					store.updateLogin({ signingIn: void 0 });
				}
			})();
		},
		answerAuthorizationPrompt(value) {
			const resolve = pendingPromptResolve;
			pendingPromptResolve = void 0;
			store.updateLogin({ prompt: void 0 });
			if (resolve !== void 0) resolve(value);
		},
		logout() {
			(async () => {
				const credentialsSvc = host.ctx.get("credentials");
				if (credentialsSvc === void 0) {
					store.setNotice("Credentials are not available in this profile.");
					return;
				}
				const selection = host.ctx.get("agentDefaultModel")?.currentSelection?.();
				const overlay = store.getSnapshot().overlay;
				const rows = overlay.kind === "modelProfile" ? overlay.modelProfile.providers : void 0;
				const row = rows?.find((entry) => entry.route === selection?.provider) ?? (rows !== void 0 && rows.length === 1 ? rows[0] : void 0);
				if (row === void 0) {
					store.setNotice(logoutNoneMessage());
					return;
				}
				try {
					await credentialsSvc.unset(row.apiKeyRef);
					store.setNotice(logoutSuccessMessage(row.displayName));
					loadProviders();
				} catch (error) {
					store.setNotice(`logout failed: ${error instanceof Error ? error.message : String(error)}`);
				}
			})();
		},
		openTrajectory() {
			store.openTrajectory();
		},
		openToolCards() {
			store.openToolCards();
		},
		openContext() {
			store.openContext();
		},
		openPlugins() {
			const rows = pluginRows(host.ctx);
			if (rows === void 0) store.setNotice("/plugins: loader tree is not composed in this profile");
			else store.openPlugins(rows);
		},
		openAgentPresets() {
			store.openAgentPresets({
				current: void 0,
				blank: session === void 0 ? true : sessionBlank(session)
			});
			loadAgentPresets();
		},
		closeModelProfile() {
			store.closeOverlay();
		},
		backToProviderList() {
			store.updateModelProfile({ view: "list" });
		},
		selectProvider(index) {
			store.updateModelProfile({ selected: index });
		},
		createProvider() {
			store.updateModelProfile({
				view: "form",
				draft: void 0
			});
		},
		editProvider(route) {
			const overlay = store.getSnapshot().overlay;
			if (overlay.kind !== "modelProfile") return;
			const row = overlay.modelProfile.providers?.find((entry) => entry.route === route);
			if (row === void 0) return;
			const draft = {
				route: row.route,
				isNew: false,
				settingsNs: row.settingsNs,
				settingsPath: row.settingsPath,
				displayName: row.displayName,
				api: row.api ?? "",
				baseURL: row.baseURL ?? "",
				apiKeyRef: row.apiKeyRef,
				apiKeyConfigured: row.apiKeyConfigured,
				apiKeyDraft: "",
				models: row.models,
				revision: row.revision
			};
			store.updateModelProfile({
				view: "form",
				draft,
				formKey: overlay.modelProfile.formKey + 1
			});
		},
		saveProvider(draft) {
			(async () => {
				const settingsSvc = host.ctx.get("settings");
				const credentialsSvc = host.ctx.get("credentials");
				if (settingsSvc === void 0 || credentialsSvc === void 0) {
					store.setNotice("Provider settings are not available in this profile.");
					return;
				}
				try {
					const key = draft.apiKeyDraft.trim();
					if (key !== "") await credentialsSvc.set(draft.apiKeyRef, key);
					const section = {
						displayName: draft.displayName,
						api: draft.api,
						baseURL: draft.baseURL,
						apiKeyEnv: draft.apiKeyRef,
						models: draft.models
					};
					await settingsSvc.update(draft.settingsNs, nestAtPath(draft.settingsPath, section), draft.revision);
					store.setNotice(`Saved ${draft.displayName || draft.route}.`);
					store.updateModelProfile({ view: "list" });
					loadProviders();
				} catch (error) {
					store.setNotice(`save failed: ${error instanceof Error ? error.message : String(error)}`);
				}
			})();
		},
		deleteProvider(row) {
			(async () => {
				const settingsSvc = host.ctx.get("settings");
				const credentialsSvc = host.ctx.get("credentials");
				if (settingsSvc === void 0 || credentialsSvc === void 0) {
					store.setNotice("Provider settings are not available in this profile.");
					return;
				}
				try {
					await credentialsSvc.unset(row.apiKeyRef);
					await settingsSvc.update(row.settingsNs, nestAtPath(row.settingsPath, {}), row.revision);
					store.setNotice(`Removed ${row.displayName}.`);
					loadProviders();
				} catch (error) {
					store.setNotice(`delete failed: ${error instanceof Error ? error.message : String(error)}`);
				}
			})();
		},
		discoverModelsForDraft() {},
		setActiveModel() {},
		closeTrajectory() {
			store.closeOverlay();
		},
		closeToolCards() {
			store.closeOverlay();
		},
		closeContext() {
			store.closeOverlay();
		},
		closePlugins() {
			store.closeOverlay();
		},
		closeAgentPresets() {
			store.closeOverlay();
		},
		selectAgentPresetRow() {},
		applyAgentPreset() {},
		answerApproval() {},
		answerQuestion() {}
	};
	const selection = host.ctx.get("agentDefaultModel")?.currentSelection();
	const instance = mountTui({
		store,
		actions,
		sessionId: id,
		provider: selection?.provider ?? "",
		model: selection?.model ?? "",
		version: TUI_VERSION,
		cwd: process.cwd(),
		promptHistory: history,
		getTool: toolPreview(host.ctx),
		getToolCall: store.getToolCall
	});
	return Object.freeze({
		id,
		store,
		actions,
		instance,
		bridge,
		exitPromise,
		async dispose(preserveScreen) {
			instance.unmount({ preserveScreen });
			await bridge.dispose();
		}
	});
}
function storeSetStatus(store, snapshot) {
	store.setStatus(failUnknown(snapshot.agentStatus));
}
/** Mount one interactive pi-tui session over the bridge; loop over `/clear` re-attaches. */
async function runAcrylTui(options) {
	const host = await startDirectHost({ profile: options.profile });
	let current;
	let settled = false;
	try {
		current = await attachSession(host, options.resumeSessionId);
		for (;;) {
			if (await current.exitPromise === "exit") break;
			await current.dispose(true);
			current = await attachSession(host, void 0);
		}
		const sessionId = current.id;
		const resumeHint = stripSessionIdPrefix(sessionId);
		await current.dispose(false);
		await host.dispose();
		settled = true;
		return Object.freeze({
			sessionId,
			resumeHint,
			async dispose() {
				if (settled) return;
				settled = true;
				await host.dispose();
			}
		});
	} catch (error) {
		await current?.dispose(false).catch(() => {});
		await host.dispose();
		throw error;
	}
}
//#endregion
//#region src/cli/grammar.ts
const HOST_COMMANDS = /* @__PURE__ */ new Set([
	"tui",
	"gui",
	"web"
]);
function hostCommand(value) {
	return HOST_COMMANDS.has(value) ? value : void 0;
}
function parseAcrylArgs(args) {
	let command;
	let profile;
	let resumeSessionId;
	let json = false;
	let version = false;
	let help = false;
	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		if (argument === void 0) continue;
		if (argument === "--version" || argument === "-v") {
			if (version) throw new Error("--version may be provided only once");
			version = true;
			continue;
		}
		if (argument === "--help" || argument === "-h") {
			if (help) throw new Error("--help may be provided only once");
			help = true;
			continue;
		}
		if (argument === "--profile") {
			if (profile !== void 0) throw new Error("--profile may be provided only once");
			const value = args[index + 1];
			if (value === void 0 || value.startsWith("--") || value.trim() === "") throw new Error("--profile requires a value");
			profile = value;
			index += 1;
			continue;
		}
		if (argument === "--resume") {
			if (resumeSessionId !== void 0) throw new Error("--resume may be provided only once");
			const value = args[index + 1];
			if (value === void 0 || value.startsWith("--") || value.trim() === "") throw new Error("--resume requires a session id");
			resumeSessionId = value;
			index += 1;
			continue;
		}
		if (argument === "--json") {
			if (json) throw new Error("--json may be provided only once");
			json = true;
			continue;
		}
		if (argument.startsWith("-")) throw new Error(`unknown option: ${argument}`);
		const parsed = hostCommand(argument);
		if (command === void 0) {
			if (parsed === void 0) throw new Error(`unknown command: ${argument}`);
			command = parsed;
			continue;
		}
		throw new Error(`unexpected argument for ${command}: ${argument}`);
	}
	const resolvedCommand = command ?? "tui";
	if (!version && !help && profile === void 0 && resumeSessionId === void 0) return {
		command: resolvedCommand,
		json,
		version,
		help
	};
	return {
		command: resolvedCommand,
		json,
		version,
		help,
		...profile === void 0 ? {} : { profile },
		...resumeSessionId === void 0 ? {} : { resumeSessionId }
	};
}
//#endregion
//#region src/cli/run.ts
/** Boot the DSH browser surface as one ACRYL runtime, print its URL, and serve until a termination signal. */
async function serveWeb() {
	const runtime = await bootAcrylWebProfile({ cmdlineArgs: [] });
	const stopped = new Promise((resolve) => {
		const onSignal = () => resolve();
		process.once("SIGINT", onSignal);
		process.once("SIGTERM", onSignal);
	});
	const url = runtime.url;
	process.stdout.write(`ACRYL web: ${url}\n`);
	await stopped;
	await runtime.dispose();
	return { url };
}
const defaults = {
	startDirectHost,
	runTui: runAcrylTui,
	runWeb: serveWeb,
	exit: (code) => {
		process.exitCode = code;
	},
	write: (line) => {
		process.stdout.write(`${line}\n`);
	}
};
function statusLine(host) {
	return JSON.stringify({
		mode: "direct",
		profile: host.profile,
		generationId: host.generationId
	});
}
/**
* Run the direct ACRYL terminal host. `--json` is a short-lived, scriptable
* headless readiness probe; interactive mode mounts the pi-tui session via the
* runtime bridge until a normal exit, then prints a resumable session id.
*/
async function runAcryl(args, supplied = {}) {
	const dependencies = {
		...defaults,
		...supplied
	};
	const invocation = parseAcrylArgs(args);
	if (invocation.help) {
		dependencies.write([
			"ACRYL - Agent Context Relay Yielding Lifecycles",
			"",
			`Usage: acryl [command] [options]`,
			"",
			"Commands:",
			"  tui    Run the terminal client (default)",
			"  web    Serve the local ACRYL web runtime",
			"  gui    [reserved] launch the Desktop surface (not wired in this build)",
			"",
			"Options:",
			"  -h, --help          Show this help",
			"  -v, --version       Print the ACRYL version",
			"  --json              Emit machine-readable output",
			"  --profile <name>    Use a named ACRYL profile",
			"  --resume <id>       Resume a session",
			""
		].join("\n"));
		return;
	}
	if (invocation.version) {
		dependencies.write(ACRYL_VERSION);
		return;
	}
	if (invocation.command === "gui") throw new Error("ACRYL gui host is not implemented; the desktop (Electron) surface is not wired into this build yet. Use `pnpm acryl` for the terminal surface.");
	if (invocation.command === "web") {
		if (invocation.json) {
			const host = await bootAcrylWebProfile({ cmdlineArgs: [] });
			try {
				dependencies.write(host.url);
			} finally {
				await host.dispose();
			}
			return;
		}
		const result = await dependencies.runWeb({ profile: invocation.profile ?? "web" });
		dependencies.write(`serving at ${result.url}`);
		return;
	}
	if (invocation.json) {
		const host = await dependencies.startDirectHost({ profile: invocation.profile ?? "acryl" });
		try {
			dependencies.write(statusLine(host));
		} finally {
			await host.dispose();
		}
		return;
	}
	if (!process.stdin.isTTY || !process.stdout.isTTY) {
		dependencies.write("acryl-tui: stdin and stdout must both be TTYs; use `acryl tui --json` for a headless probe");
		dependencies.exit(1);
		return;
	}
	const result = await dependencies.runTui({
		profile: invocation.profile ?? "acryl",
		resumeSessionId: invocation.resumeSessionId
	});
	dependencies.write(`resume with: acryl tui --resume ${result.resumeHint}`);
}
//#endregion
//#region src/bin.ts
function isEntrypoint() {
	const entrypoint = process.argv[1];
	if (entrypoint === void 0) return false;
	try {
		return realpathSync(entrypoint) === realpathSync(fileURLToPath(import.meta.url));
	} catch {
		return resolve(entrypoint) === fileURLToPath(import.meta.url);
	}
}
if (isEntrypoint()) (async () => {
	const script = process.argv[1];
	if (script === void 0) throw new Error("ACRYL Node entrypoint is unavailable");
	if (await relaunchWithExposedInternals({
		execArgv: process.execArgv,
		script,
		args: process.argv.slice(2)
	})) return;
	await runAcryl(process.argv.slice(2));
})().catch((cause) => {
	const message = cause instanceof Error ? cause.message : String(cause);
	process.stderr.write(`acryl: ${message}\n`);
	process.exitCode = 1;
});
//#endregion
export { parseAcrylArgs, runAcryl };

//# sourceMappingURL=bin.js.map