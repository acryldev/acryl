window.__ModuleLoader__.load({
	id: "acryl-app-shell",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		require("@deepseek-ai/dsh-client-ui-renderer/client");
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/layout-state.ts
		const SIDEBAR_COLLAPSED = 56;
		const MACOS_SIDEBAR_COLLAPSED = 90;
		const SIDEBAR_AUTO_COLLAPSE = 1024;
		/** The right panel may take at most this share of the window. */
		const DETAILS_MAX_RATIO = .7;
		/** First-open width of the right panel, as a share of the window. */
		const DETAILS_DEFAULT_RATIO = .45;
		/**
		* Solve the three column widths for one frame width.
		* @param viewport - available frame width in px.
		* @param sidebar - sidebar width preference in px (0 = collapsed to the rail).
		* @param details - requested right panel width in px (0 = no track).
		* @param collapsedWidth - rail width, which differs per platform.
		* @returns actual widths. The right track shrinks to fit or is removed; only without it may the
		* center fall below its minimum.
		*/
		function computeDesktopColumns(viewport, sidebar, details, collapsedWidth = 56) {
			const sidebarWidth = sidebar === 0 ? collapsedWidth : clamp(sidebar, 264, 420);
			const available = viewport - sidebarWidth - 400;
			const detailsWidth = details === 0 || available < 300 ? 0 : Math.min(available, clamp(details, 300, viewport * DETAILS_MAX_RATIO));
			return {
				sidebar: sidebarWidth,
				center: Math.max(0, viewport - sidebarWidth - detailsWidth),
				details: detailsWidth
			};
		}
		/**
		* The frame's whole layout decision, as in upstream DSH: two solves, one for the room the panel
		* would have if docked (reported to it) and one for the columns actually laid out.
		*/
		function solveFrame(viewport, panels, railWidth) {
			const narrow = viewport < SIDEBAR_AUTO_COLLAPSE;
			const collapsed = narrow ? !panels.narrowExpanded : panels.sidebar === 0;
			const sidebarPreference = collapsed ? 0 : panels.sidebar === 0 ? 280 : panels.sidebar;
			const detailsPreference = panels.details === 0 ? viewport * DETAILS_DEFAULT_RATIO : panels.details;
			const normal = computeDesktopColumns(viewport, !panels.detailsShown && narrow ? 0 : sidebarPreference, detailsPreference, railWidth);
			return {
				narrow,
				collapsed,
				normal,
				columns: computeDesktopColumns(viewport, sidebarPreference, panels.detailsTrack ? detailsPreference : 0, railWidth),
				rightbar: {
					width: normal.details,
					viewportWidth: viewport,
					canShow: normal.details > 0
				}
			};
		}
		function clamp(value, min, max) {
			return Math.min(max, Math.max(min, Math.round(value)));
		}
		/**
		* ACRYL's frame state. It is the layout service of the page in advanced mode, so it implements DSH 0.2's whole `ILayout`: besides the
		* panel transitions it reports which keyed `main` panel (settings, plugin manager, ...) is open (`panelInfo`/`selectPanel`) and hands
		* out navigation abort signals (`beginNavigation`), which upstream's sidebars and session views call.
		*/
		var DesktopLayoutState = class {
			snapshot = Object.freeze({
				sidebar: 280,
				details: 0,
				narrow: false,
				narrowExpanded: false,
				detailsShown: false,
				detailsTrack: false,
				detailsFullscreen: false
			});
			listeners = /* @__PURE__ */ new Set();
			viewport = 0;
			panel = Object.freeze({ activePanelId: null });
			panelListeners = /* @__PURE__ */ new Set();
			navigation;
			/** Which keyed `main` panel is open; `null` means the ACRYL main surface (the canvas, or the conversation). */
			panelInfo = {
				getSnapshot: () => this.panel,
				subscribe: (listener) => {
					this.panelListeners.add(listener);
					return () => {
						this.panelListeners.delete(listener);
					};
				}
			};
			selectPanel(panelId) {
				if (this.panel.activePanelId === panelId) return;
				this.panel = Object.freeze({ activePanelId: panelId });
				for (const listener of this.panelListeners) listener();
			}
			/** Cancels the previous navigation and returns the signal of the new one. */
			beginNavigation() {
				this.navigation?.abort();
				this.navigation = new AbortController();
				return this.navigation.signal;
			}
			getSnapshot() {
				return this.snapshot;
			}
			subscribe(listener) {
				this.listeners.add(listener);
				return () => {
					this.listeners.delete(listener);
				};
			}
			/** Report the frame width, which the default and the limits of the right panel depend on. */
			setViewport(width) {
				this.viewport = width;
			}
			toggleSidebar() {
				if (this.snapshot.narrow) {
					this.publish({
						...this.snapshot,
						narrowExpanded: !this.snapshot.narrowExpanded
					});
					return;
				}
				this.publish({
					...this.snapshot,
					sidebar: this.snapshot.sidebar === 0 ? 280 : 0
				});
			}
			setNarrow(narrow) {
				if (this.snapshot.narrow === narrow) return;
				this.publish({
					...this.snapshot,
					narrow,
					narrowExpanded: false
				});
			}
			/**
			* The right panel reports it is open, and how it is presented. Called by the right sidebar
			* through `ctx.layout`; the frame then gives it a column (`track`) or lets it cover the window.
			*/
			openRightbar(track, fullscreen) {
				const current = this.snapshot;
				if (current.detailsShown && current.detailsTrack === track && current.detailsFullscreen === fullscreen) return;
				const details = current.details === 0 && this.viewport > 0 ? Math.max(300, Math.round(this.viewport * DETAILS_DEFAULT_RATIO)) : current.details;
				this.publish({
					...current,
					details,
					detailsShown: true,
					detailsTrack: track,
					detailsFullscreen: fullscreen,
					narrowExpanded: current.detailsShown ? current.narrowExpanded : false
				});
			}
			closeRightbar() {
				const current = this.snapshot;
				if (!current.detailsShown && !current.detailsTrack && !current.detailsFullscreen) return;
				this.publish({
					...current,
					detailsShown: false,
					detailsTrack: false,
					detailsFullscreen: false
				});
			}
			/** Compatibility name for {@link openRightbar} as a docked panel. */
			openDetails() {
				this.openRightbar(true, false);
			}
			/** Compatibility name for {@link closeRightbar}. */
			closeDetails() {
				this.closeRightbar();
			}
			setSidebar(width) {
				this.publish({
					...this.snapshot,
					sidebar: clamp(width, 264, 420)
				});
			}
			setDetails(width) {
				const max = Math.max(300, this.viewport > 0 ? this.viewport * DETAILS_MAX_RATIO : width);
				this.publish({
					...this.snapshot,
					details: clamp(width, 300, max)
				});
			}
			publish(next) {
				this.snapshot = Object.freeze(next);
				for (const listener of this.listeners) listener();
			}
		};
		//#endregion
		//#region src/client/AdvancedFrame.tsx
		/** Desktop-owned transparent frame around the unchanged product surfaces. */
		function AdvancedFrame({ layout, platform, wrapMain, wrapRightbar, renderSlot }) {
			const panels = (0, react.useSyncExternalStore)((0, react.useCallback)((listener) => layout.subscribe(listener), [layout]), (0, react.useCallback)(() => layout.getSnapshot(), [layout]));
			const activePanelId = (0, react.useSyncExternalStore)(layout.panelInfo.subscribe, () => layout.panelInfo.getSnapshot().activePanelId);
			const frameRef = (0, react.useRef)(null);
			const [viewport, setViewport] = (0, react.useState)(() => window.innerWidth);
			(0, react.useEffect)(() => {
				const element = frameRef.current;
				if (element === null) return;
				layout.setViewport(element.getBoundingClientRect().width);
				let raf = null;
				const observer = new ResizeObserver(() => {
					raf ??= requestAnimationFrame(() => {
						raf = null;
						const width = element.getBoundingClientRect().width;
						if (width > 0) {
							setViewport(width);
							layout.setViewport(width);
						}
					});
				});
				observer.observe(element);
				return () => {
					observer.disconnect();
					if (raf !== null) cancelAnimationFrame(raf);
				};
			}, []);
			const { narrow, collapsed, normal, columns, rightbar } = solveFrame(viewport, panels, platform === "darwin" ? 90 : 56);
			(0, react.useEffect)(() => {
				layout.setNarrow(narrow);
			}, [layout, narrow]);
			const sidebarOwnerWidth = collapsed ? 56 : columns.sidebar;
			const columnsRef = (0, react.useRef)(columns);
			columnsRef.current = columns;
			const normalRef = (0, react.useRef)(normal);
			normalRef.current = normal;
			const sidebarBase = (0, react.useRef)(0);
			const detailsBase = (0, react.useRef)(0);
			const [dragging, setDragging] = (0, react.useState)(false);
			const onDragEnd = (0, react.useCallback)(() => {
				setDragging(false);
			}, []);
			const onSidebarStart = (0, react.useCallback)(() => {
				sidebarBase.current = columnsRef.current.sidebar;
				setDragging(true);
			}, []);
			const onDetailsStart = (0, react.useCallback)(() => {
				detailsBase.current = normalRef.current.details;
				setDragging(true);
			}, []);
			const onSidebarDrag = (0, react.useCallback)((dx) => {
				layout.setSidebar(sidebarBase.current + dx);
			}, [layout]);
			const onDetailsDrag = (0, react.useCallback)((dx) => {
				layout.setDetails(detailsBase.current - dx);
			}, [layout]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: frameRef,
				className: "dshDesktopFrame",
				"data-desktop-platform": platform,
				"data-sidebar-collapsed": collapsed || void 0,
				"data-details-collapsed": columns.details === 0 || void 0,
				"data-details-fullscreen": panels.detailsFullscreen || void 0,
				"data-dragging": dragging || void 0,
				style: { gridTemplateColumns: `${columns.sidebar}px minmax(0, 1fr) ${columns.details}px` },
				children: [
					platform === "darwin" && collapsed && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dshDesktopLeading",
						"data-acryl-slot": "shell.leading",
						children: renderSlot("shell.leading", {})
					}),
					platform === "darwin" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dshDesktopMacCaptionRow",
						"aria-hidden": "true"
					}),
					platform === "win32" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dshDesktopWindowsCaptionRow",
						"aria-hidden": "true"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("aside", {
						className: "dshDesktopSidebarSurface",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dshDesktopUpstreamSidebar",
							"data-acryl-slot": "sidebar",
							children: renderSlot("desktop.sidebar", {
								collapsed,
								width: sidebarOwnerWidth,
								renderUpstream: () => renderSlot("sidebar", {
									collapsed,
									width: sidebarOwnerWidth
								}),
								onToggleCollapse: () => {
									layout.toggleSidebar();
								}
							})
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("main", {
						className: "dshDesktopConversationSurface",
						"data-acryl-slot": "desktop.main",
						children: (() => {
							const main = activePanelId !== null ? renderSlot("main", {}, { entryKey: activePanelId }) : renderSlot("desktop.main", { renderConversation: () => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								"data-acryl-slot": "conversation",
								children: renderSlot("main", {}, { entryKey: "conversation" })
							}) });
							return wrapMain === void 0 ? main : wrapMain(main);
						})()
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("aside", {
						className: "dshDesktopDetailsSurface",
						"data-acryl-slot": "rightbar",
						children: (() => {
							const panel = renderSlot("rightbar", rightbar);
							return wrapRightbar === void 0 ? panel : wrapRightbar(panel);
						})()
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dshDesktopOverlay",
						"data-shell-overlay": true,
						children: renderSlot("shell.overlay", {})
					}),
					!collapsed && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ResizeHandle, {
						side: "sidebar",
						left: columns.sidebar,
						onStart: onSidebarStart,
						onDrag: onSidebarDrag,
						onEnd: onDragEnd
					}),
					panels.detailsShown && !panels.detailsFullscreen && normal.details > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ResizeHandle, {
						side: "details",
						left: viewport - normal.details,
						onStart: onDetailsStart,
						onDrag: onDetailsDrag,
						onEnd: onDragEnd
					})
				]
			});
		}
		function ResizeHandle(props) {
			const [dragging, setDragging] = (0, react.useState)(false);
			const origin = (0, react.useRef)(0);
			const latest = (0, react.useRef)(0);
			const frame = (0, react.useRef)(null);
			const callbacks = (0, react.useRef)({
				onStart: props.onStart,
				onDrag: props.onDrag,
				onEnd: props.onEnd
			});
			callbacks.current = {
				onStart: props.onStart,
				onDrag: props.onDrag,
				onEnd: props.onEnd
			};
			const onPointerDown = (0, react.useCallback)((event) => {
				event.preventDefault();
				event.currentTarget.setPointerCapture(event.pointerId);
				origin.current = event.clientX;
				latest.current = event.clientX;
				callbacks.current.onStart();
				setDragging(true);
			}, []);
			const onPointerMove = (0, react.useCallback)((event) => {
				if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
				latest.current = event.clientX;
				frame.current ??= requestAnimationFrame(() => {
					frame.current = null;
					callbacks.current.onDrag(latest.current - origin.current);
				});
			}, []);
			const onPointerUp = (0, react.useCallback)((event) => {
				if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
				event.currentTarget.releasePointerCapture(event.pointerId);
				if (frame.current !== null) {
					cancelAnimationFrame(frame.current);
					frame.current = null;
				}
				callbacks.current.onDrag(latest.current - origin.current);
				setDragging(false);
				callbacks.current.onEnd();
			}, []);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dshDesktopResizeHandle",
				"data-side": props.side,
				"data-dragging": dragging || void 0,
				style: { left: props.left },
				onPointerDown,
				onPointerMove,
				onPointerUp
			});
		}
		//#endregion
		//#region src/client/layout-service.ts
		/**
		* Provide the advanced layout service for one plugin-fiber lifetime.
		* @param ctx - active browser Cordis context.
		* @param layout - desktop-owned layout implementation.
		* @returns disposer for the service registration.
		*/
		function provideDesktopLayout(ctx, layout) {
			const dispose = ctx.reflect.provide("layout", layout);
			return () => {
				dispose();
			};
		}
		//#endregion
		//#region src/client/chrome-metrics.ts
		/**
		* Native window chrome the shell leaves room for, in CSS pixels. Only the Electron platforms have any;
		* on Web and Linux the frame reserves nothing. These are the same numbers Electron's main process uses to
		* size the title-bar overlay (`apps/acryl-desktop/src/shell/window-chrome.ts`), and a test compares the two
		* files so they cannot drift.
		*/
		/** Height reserved above the macOS sidebar content. */
		const MACOS_TITLEBAR_HEIGHT = 20;
		/** Height of the macOS native drag hit regions. */
		const MACOS_DRAG_REGION_HEIGHT = 32;
		/** Width reserved for the macOS traffic lights before the empty drag strip. */
		const MACOS_TRAFFIC_LIGHT_SAFE_WIDTH = 80;
		/** Windows title-bar overlay height. */
		const WINDOWS_TITLEBAR_HEIGHT = 32;
		/** Width reserved for the three native Windows caption controls. */
		const WINDOWS_CAPTION_CONTROLS_WIDTH = 138;
		//#endregion
		//#region src/client/styles.ts
		/** Advanced-shell stylesheet kept as a plain string so the package client bundle stays self-contained. */
		const ADVANCED_STYLES = `
html, body, #root { width: 100%; height: 100%; }
body[data-dsh-desktop-mode="advanced"] { margin: 0; background: transparent !important; }
.dshDesktopFrame { position: relative; display: grid; grid-template-rows: 100%; width: 100%; height: 100%; overflow: hidden; background: transparent; transition: grid-template-columns var(--ds-transition-duration-slow) var(--ds-ease-in-out); }
.dshDesktopSidebarSurface { --dsw-specific-sidebar-fill: transparent; position: relative; grid-column: 1; grid-row: 1; min-width: 0; overflow: hidden; background: transparent; border-right: 1px solid var(--dsw-alias-border-l1); }
.dshDesktopUpstreamSidebar { box-sizing: border-box; width: 100%; height: 100%; }
.dshDesktopFrame[data-desktop-platform="darwin"] .dshDesktopUpstreamSidebar { padding-top: 20px; -webkit-app-region: no-drag; }
.dshDesktopFrame[data-desktop-platform="darwin"][data-sidebar-collapsed] .dshDesktopUpstreamSidebar { width: 56px; margin: 0 auto; }
.dshDesktopFrame[data-desktop-platform="darwin"] { grid-template-rows: 20px minmax(0, 1fr); }
.dshDesktopFrame[data-desktop-platform="darwin"] .dshDesktopSidebarSurface { grid-row: 1 / -1; -webkit-app-region: no-drag; }
.dshDesktopFrame[data-desktop-platform="darwin"] .dshDesktopConversationSurface,
.dshDesktopFrame[data-desktop-platform="darwin"] .dshDesktopDetailsSurface { grid-row: 2; }
.dshDesktopFrame[data-desktop-platform="darwin"] .dshDesktopSidebarSurface::before { content: ""; position: absolute; top: 0; right: 0; left: 80px; height: 32px; user-select: none; -webkit-app-region: drag; }
.dshDesktopMacCaptionRow { position: relative; grid-column: 2 / -1; grid-row: 1; min-width: 0; background: var(--dsw-alias-bg-base); }
.dshDesktopMacCaptionRow::before { content: ""; position: absolute; top: 0; right: 0; left: 0; height: 32px; user-select: none; -webkit-app-region: drag; }
.dshDesktopConversationSurface { grid-column: 2; grid-row: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; background: var(--dsw-alias-bg-base); }
.dshDesktopDetailsSurface { grid-column: 3; grid-row: 1; position: relative; min-width: 0; min-height: 0; overflow: visible; background: var(--dsw-alias-bg-base); border-left: 1px solid var(--dsw-alias-border-l2); }
.dshDesktopFrame[data-details-collapsed] .dshDesktopDetailsSurface { border-left: none; }
.dshDesktopFrame[data-desktop-platform="win32"] { grid-template-rows: 32px minmax(0, 1fr); }
.dshDesktopFrame[data-desktop-platform="win32"] .dshDesktopSidebarSurface { grid-row: 1 / -1; }
.dshDesktopFrame[data-desktop-platform="win32"] .dshDesktopConversationSurface,
.dshDesktopFrame[data-desktop-platform="win32"] .dshDesktopDetailsSurface { grid-row: 2; }
.dshDesktopWindowsCaptionRow { position: relative; grid-column: 2 / -1; grid-row: 1; min-width: 0; background: var(--dsw-alias-bg-base); }
.dshDesktopWindowsCaptionRow::before { content: ""; position: absolute; inset: 0 138px 0 0; user-select: none; -webkit-app-region: drag; }
.dshDesktopFrame[data-dragging] { transition: none; }
.dshDesktopFrame[data-details-fullscreen] { transition: none; }
.dshDesktopOverlay { position: absolute; z-index: 1000; inset: 0; pointer-events: none; }
.dshDesktopOverlay > * { pointer-events: auto; }
.dshDesktopResizeHandle { position: absolute; z-index: 50; top: 0; bottom: 0; width: 8px; margin-left: -4px; cursor: col-resize; touch-action: none; -webkit-app-region: no-drag; transition: left var(--ds-transition-duration-slow) var(--ds-ease-in-out); }
.dshDesktopFrame[data-dragging] .dshDesktopResizeHandle { transition: none; }
.dshDesktopNoDrag, button, input, textarea, select, a, [role="button"], [role="dialog"], [role="presentation"] { -webkit-app-region: no-drag; }
[role="dialog"], [aria-modal="true"] { -webkit-app-region: no-drag !important; }
html:has([aria-modal="true"]) .dshDesktopWindowsCaptionRow::before,
html:has([aria-modal="true"]) .dshDesktopMacCaptionRow::before,
html:has([aria-modal="true"]) .dshDesktopSidebarSurface,
html:has([aria-modal="true"]) .dshDesktopSidebarSurface::before { -webkit-app-region: no-drag !important; }
@media (prefers-reduced-motion: reduce) {
  .dshDesktopFrame,
  .dshDesktopResizeHandle { transition: none !important; }
}

`;
		/** Install and remove the advanced shell's global native-window styles. @returns the style disposer. */
		function installAdvancedStyles() {
			const style = document.createElement("style");
			style.dataset.plugin = "acryl-workspace";
			style.dataset.pluginCss = "acryl-workspace/advanced-shell";
			style.textContent = ADVANCED_STYLES;
			document.head.appendChild(style);
			return () => {
				style.remove();
			};
		}
		//#endregion
		//#region src/client/theme-presenter.ts
		const DARK_ATTRIBUTE = "data-ds-dark-theme";
		/** Projects the resolved theme service snapshot onto the desktop document. */
		var DesktopThemePresenter = class {
			appliedTokens = [];
			themeColorMeta = document.createElement("meta");
			constructor() {
				this.themeColorMeta.name = "theme-color";
			}
			/** @param snapshot - current resolved palette and token overrides. */
			apply(snapshot) {
				const scheme = snapshot.active.colorScheme;
				document.documentElement.style.colorScheme = scheme;
				if (scheme === "dark") document.body.setAttribute(DARK_ATTRIBUTE, "");
				else document.body.removeAttribute(DARK_ATTRIBUTE);
				for (const name of this.appliedTokens) document.body.style.removeProperty(name);
				this.appliedTokens = [];
				for (const [name, value] of Object.entries(snapshot.active.tokens)) {
					document.body.style.setProperty(name, value);
					this.appliedTokens.push(name);
				}
				this.themeColorMeta.content = getComputedStyle(document.body).backgroundColor;
				if (!this.themeColorMeta.isConnected) document.head.appendChild(this.themeColorMeta);
			}
			/** Remove only DOM state owned by this presenter. */
			dispose() {
				document.documentElement.style.removeProperty("color-scheme");
				document.body.removeAttribute(DARK_ATTRIBUTE);
				for (const name of this.appliedTokens) document.body.style.removeProperty(name);
				this.appliedTokens = [];
				this.themeColorMeta.remove();
			}
		};
		//#endregion
		//#region src/client/advanced-shell.ts
		function DefaultDesktopMain({ renderConversation }) {
			return renderConversation();
		}
		function DefaultDesktopSidebar({ renderUpstream }) {
			return renderUpstream();
		}
		/**
		* Claim the three-column desktop/web app frame for this plugin's own UI: register `desktop.main` and
		* `desktop.sidebar` (falling back to the unchanged upstream chat and sidebar until something replaces
		* them), mount the layout service, theme presenter and chrome styles, and own the `root` slot that
		* composes everything into `AdvancedFrame`. Call once, from the plugin that is this Blend's main-surface
		* owner (the IDE's `plugins/acryl-workspace`, or a domain plugin like a GTD or accounting Blend) - never
		* from more than one plugin in the same program, since `root` is a single slot.
		* @param ctx - active browser Cordis context.
		* @param environment - validated mode and platform marker (`resolveShellEnvironment`).
		* @param hooks - optional column wrappers (a terminal dock, or anything else a caller wants beneath/beside
		* the main or details column); this package has no opinion on what they wrap.
		*/
		function applyAdvancedShell(ctx, environment, hooks = {}) {
			if (environment.mode !== "advanced") throw new Error(`acryl-app-shell: advanced shell received mode ${JSON.stringify(environment.mode)}`);
			const desktopLayout = new DesktopLayoutState();
			ctx.effect(() => provideDesktopLayout(ctx, desktopLayout), "acryl-app-shell: layout service");
			ctx.effect(() => ctx.slots.provideRoot({ hooks: { panelInfo: desktopLayout.panelInfo } }), "acryl-app-shell: panel info");
			ctx.effect(() => {
				document.body.dataset.dshDesktopMode = "advanced";
				document.body.dataset.dshDesktopPlatform = environment.platform;
				const removeStyles = installAdvancedStyles();
				return () => {
					removeStyles();
					delete document.body.dataset.dshDesktopMode;
					delete document.body.dataset.dshDesktopPlatform;
				};
			}, "acryl-app-shell: advanced shell styles");
			ctx.slots.inject("desktop.main", () => ctx.slots.register({
				name: "desktop.main",
				priority: 100
			}, DefaultDesktopMain));
			ctx.slots.inject("desktop.sidebar", () => ctx.slots.register({
				name: "desktop.sidebar",
				priority: 100
			}, DefaultDesktopSidebar));
			ctx.effect(() => {
				const presenter = new DesktopThemePresenter();
				presenter.apply(ctx.theme.getTheme());
				const off = ctx.on("theme/change", (snapshot) => {
					presenter.apply(snapshot);
				});
				return () => {
					off();
					presenter.dispose();
				};
			}, "acryl-app-shell: theme presenter");
			ctx.effect(() => ctx.slots.register({
				name: "root",
				children: {
					"desktop.main": {
						kind: "single",
						scope: "root"
					},
					"desktop.sidebar": {
						kind: "single",
						scope: "root"
					},
					"sidebar": {
						kind: "single",
						scope: "root"
					},
					"main": {
						kind: "keyed",
						scope: "root"
					},
					"rightbar": {
						kind: "single",
						scope: "root"
					},
					"shell.overlay": {
						kind: "list",
						scope: "root"
					},
					"shell.leading": {
						kind: "single",
						scope: "root"
					}
				},
				inject: () => ({
					layout: desktopLayout,
					platform: environment.platform,
					...hooks
				})
			}, AdvancedFrame), "acryl-app-shell: advanced root slot");
		}
		//#endregion
		//#region src/client/environment.ts
		/** What a page without Electron's markers renders. */
		const WEB_SHELL_ENVIRONMENT = Object.freeze({
			mode: "advanced",
			platform: "web"
		});
		const MODES = /* @__PURE__ */ new Set(["compatibility", "advanced"]);
		const DESKTOP_PLATFORMS = /* @__PURE__ */ new Set([
			"darwin",
			"win32",
			"linux"
		]);
		/**
		* @param hash - the page's URL fragment, with or without the leading `#`.
		* @returns the environment the Electron markers describe, or the Web environment when there are none.
		* @throws when exactly one marker is present or a value is not recognized: a half-marked page is a Host bug.
		*/
		function resolveShellEnvironment(hash) {
			const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
			const mode = params.get("dsh-desktop-mode");
			const platform = params.get("dsh-desktop-platform");
			if (mode === null && platform === null) return WEB_SHELL_ENVIRONMENT;
			if (!MODES.has(mode)) throw new Error(`acryl-workspace: invalid or missing dsh-desktop-mode ${JSON.stringify(mode)}`);
			if (!DESKTOP_PLATFORMS.has(platform)) throw new Error(`acryl-workspace: invalid or missing dsh-desktop-platform ${JSON.stringify(platform)}`);
			return {
				mode,
				platform
			};
		}
		//#endregion
		//#region src/client/index.ts
		/**
		* The generic three-column desktop/web app frame: sidebar column, main surface, resizable details column,
		* platform title-bar spacing, theme presentation. One plugin claims it for its own UI (`applyAdvancedShell`),
		* via the same `desktop.main`/`desktop.sidebar` slot contract regardless of which domain the caller is -
		* the IDE (`plugins/acryl-workspace`) and a GTD, accounting or any other Blend's own main-surface plugin
		* all use exactly this, never a Host-served page of their own (see
		* `specs/036-cordis-ecosystem-and-acryl-blends/blend-instance-design.md` section 0 for why).
		*
		* This module is a library another plugin's own client code calls into (`applyAdvancedShell`), not a plugin
		* in its own right - but the browser boot sequence (`deepseek-harness` `client/web`'s `runPluginBoot`)
		* activates every row with a declared `dsh.client` bundle as its own Cordis plugin, same as the Host side
		* already does for this package (`src/index.ts`'s own no-op `apply`). `apply`/`name` here are that same
		* no-op, for the same reason: nothing for the browser to own by merely being present, no slot owned without
		* a caller invoking `applyAdvancedShell` itself.
		*/
		/** Stable Cordis plugin name, matching the Host side. */
		const name = "acryl-app-shell";
		/** No browser-side resources to acquire by merely registering this bundle. */
		function apply() {}
		//#endregion
		exports.AdvancedFrame = AdvancedFrame;
		exports.DesktopLayoutState = DesktopLayoutState;
		exports.DesktopThemePresenter = DesktopThemePresenter;
		exports.MACOS_DRAG_REGION_HEIGHT = MACOS_DRAG_REGION_HEIGHT;
		exports.MACOS_SIDEBAR_COLLAPSED = MACOS_SIDEBAR_COLLAPSED;
		exports.MACOS_TITLEBAR_HEIGHT = MACOS_TITLEBAR_HEIGHT;
		exports.MACOS_TRAFFIC_LIGHT_SAFE_WIDTH = MACOS_TRAFFIC_LIGHT_SAFE_WIDTH;
		exports.SIDEBAR_COLLAPSED = SIDEBAR_COLLAPSED;
		exports.WEB_SHELL_ENVIRONMENT = WEB_SHELL_ENVIRONMENT;
		exports.WINDOWS_CAPTION_CONTROLS_WIDTH = WINDOWS_CAPTION_CONTROLS_WIDTH;
		exports.WINDOWS_TITLEBAR_HEIGHT = WINDOWS_TITLEBAR_HEIGHT;
		exports.apply = apply;
		exports.applyAdvancedShell = applyAdvancedShell;
		exports.installAdvancedStyles = installAdvancedStyles;
		exports.name = name;
		exports.provideDesktopLayout = provideDesktopLayout;
		exports.resolveShellEnvironment = resolveShellEnvironment;
		exports.solveFrame = solveFrame;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map