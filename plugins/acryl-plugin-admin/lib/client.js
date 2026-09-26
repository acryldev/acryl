window.__ModuleLoader__.load({
	id: "acryl-plugin-admin",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/lifecycle/plugin-lifecycle-style-classes.ts
		/** Stable global class names shared by the lifecycle component and owned stylesheet. */
		const pluginLifecycleClasses = Object.freeze({
			section: "dshPluginLifecycleSection",
			toolbar: "dshPluginLifecycleToolbar",
			catalogHeading: "dshPluginLifecycleCatalogHeading",
			cardHeader: "dshPluginLifecycleCardHeader",
			summary: "dshPluginLifecycleSummary",
			actions: "dshPluginLifecycleActions",
			catalog: "dshPluginLifecycleCatalog",
			search: "dshPluginLifecycleSearch",
			cards: "dshPluginLifecycleCards",
			card: "dshPluginLifecycleCard",
			chevron: "dshPluginLifecycleChevron",
			details: "dshPluginLifecycleDetails",
			danger: "dshPluginLifecycleDanger",
			protected: "dshPluginLifecycleProtected",
			status: "dshPluginLifecycleStatus",
			failure: "dshPluginLifecycleFailure",
			architectureSummary: "dshPluginArchitectureSummary",
			plane: "dshPluginArchitecturePlane",
			planeHeader: "dshPluginArchitecturePlaneHeader",
			stats: "dshPluginArchitectureStats",
			fiberList: "dshPluginArchitectureFiberList",
			fiber: "dshPluginArchitectureFiber",
			fiberHeader: "dshPluginArchitectureFiberHeader",
			fiberMeta: "dshPluginArchitectureFiberMeta",
			phase: "dshPluginArchitecturePhase",
			nativeDetails: "dshPluginArchitectureNativeDetails",
			chips: "dshPluginArchitectureChips",
			chip: "dshPluginArchitectureChip",
			effectTree: "dshPluginArchitectureEffectTree"
		});
		//#endregion
		//#region src/client/architecture/PluginArchitectureSettingsTab.tsx
		function phaseLabel$1(phase, t) {
			if (phase === "loading") return t("loadingPhase");
			if (phase === "active") return t("active");
			if (phase === "unloading") return t("unloading");
			return t(phase);
		}
		function dependencyLabel(dependency, t) {
			if (dependency.status === "resolved") return `${dependency.name} · ${t("resolvedBy")} #${String(dependency.providerFiberUid)}`;
			return `${dependency.name} · ${t(dependency.status)}`;
		}
		function effectTree(effects) {
			if (effects.length === 0) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
				className: pluginLifecycleClasses.effectTree,
				children: effects.map((effect, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: effect.label }), effectTree(effect.children)] }, `${effect.label}-${String(index)}`))
			});
		}
		function matches$1(fiber, query) {
			if (query === "") return true;
			return [
				fiber.name,
				fiber.loaderEntryId ?? "",
				fiber.moduleName ?? "",
				...fiber.dependencies.map((dependency) => dependency.name),
				...fiber.providedServices
			].some((value) => value.toLocaleLowerCase().includes(query));
		}
		function FiberCard({ fiber, t }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", {
				className: pluginLifecycleClasses.fiber,
				"data-fiber-uid": fiber.uid,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("summary", {
					className: pluginLifecycleClasses.fiberHeader,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: fiber.name }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", { children: ["Fiber #", fiber.uid] })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: pluginLifecycleClasses.phase,
						"data-phase": fiber.phase,
						children: phaseLabel$1(fiber.phase, t)
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: pluginLifecycleClasses.nativeDetails,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
							className: pluginLifecycleClasses.fiberMeta,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("parentFiber") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: fiber.parentUid === null ? t("rootFiber") : `#${String(fiber.parentUid)}` })] }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("loaderEntry") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: fiber.loaderEntryId ?? t("none") }) })] }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("module") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: fiber.moduleName ?? t("none") }) })] })
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", { children: t("dependencies") }), fiber.dependencies.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("none") }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: pluginLifecycleClasses.chips,
							children: fiber.dependencies.map((dependency) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: pluginLifecycleClasses.chip,
								"data-status": dependency.status,
								children: dependencyLabel(dependency, t)
							}, dependency.name))
						})] }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", { children: t("provides") }), fiber.providedServices.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("none") }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: pluginLifecycleClasses.chips,
							children: fiber.providedServices.map((service) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
								className: pluginLifecycleClasses.chip,
								children: service
							}, service))
						})] }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", { children: t("effects") }), fiber.effects.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("none") }) : effectTree(fiber.effects)] })
					]
				})] })
			});
		}
		function Plane({ snapshot, query, t }) {
			const filtered = snapshot.fibers.filter((fiber) => matches$1(fiber, query));
			const active = snapshot.fibers.filter((fiber) => fiber.phase === "active").length;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: pluginLifecycleClasses.plane,
				"data-cordis-plane": snapshot.plane,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
					className: pluginLifecycleClasses.planeHeader,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: snapshot.plane === "host" ? t("host") : t("client") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "Cordis Context" })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: pluginLifecycleClasses.stats,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
								t("fibers"),
								": ",
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: snapshot.fibers.length })
							] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
								t("active"),
								": ",
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: active })
							] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
								t("services"),
								": ",
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: snapshot.services.length })
							] })
						]
					})]
				}), filtered.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: pluginLifecycleClasses.status,
					children: t("empty")
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
					className: pluginLifecycleClasses.fiberList,
					children: filtered.map((fiber) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FiberCard, {
						fiber,
						t
					}, fiber.uid))
				})]
			});
		}
		/** Read-only explorer over the two actual Cordis contexts. */
		function PluginArchitectureSettingsTab({ api, t }) {
			const [request, setRequest] = (0, react.useState)(0);
			const [query, setQuery] = (0, react.useState)("");
			const [state, setState] = (0, react.useState)({ status: "loading" });
			(0, react.useEffect)(() => {
				let current = true;
				api.read().then((snapshot) => {
					if (current) setState({
						status: "ready",
						snapshot
					});
				}, (cause) => {
					if (current) setState({
						status: "error",
						message: cause instanceof Error ? cause.message : String(cause)
					});
				});
				return () => {
					current = false;
				};
			}, [api, request]);
			const normalizedQuery = (0, react.useMemo)(() => query.trim().toLocaleLowerCase(), [query]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: pluginLifecycleClasses.section,
				"aria-busy": state.status === "loading",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: pluginLifecycleClasses.architectureSummary,
						children: t("architectureIntro")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: pluginLifecycleClasses.search,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							"aria-hidden": "true",
							children: "⌕"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "search",
							value: query,
							placeholder: t("search"),
							"aria-label": t("search"),
							onChange: (event) => {
								setQuery(event.currentTarget.value);
							}
						})]
					}),
					state.status === "loading" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: pluginLifecycleClasses.status,
						children: t("loading")
					}) : null,
					state.status === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: pluginLifecycleClasses.failure,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
							role: "alert",
							children: [
								t("error"),
								" ",
								state.message
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => {
								setState({ status: "loading" });
								setRequest((value) => value + 1);
							},
							children: t("retry")
						})]
					}) : null,
					state.status === "ready" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Plane, {
						snapshot: state.snapshot.host,
						query: normalizedQuery,
						t
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Plane, {
						snapshot: state.snapshot.client,
						query: normalizedQuery,
						t
					})] }) : null
				]
			});
		}
		//#endregion
		//#region src/client/lifecycle/PluginLifecycleSettingsTab.tsx
		const PHASE_KEYS = {
			pending: "pending",
			loading: "loadingPhase",
			active: "active",
			failed: "failed",
			unloading: "unloading"
		};
		function phaseLabel(phase, t) {
			return phase === null ? t("notMounted") : t(PHASE_KEYS[phase]);
		}
		function moduleShortName(moduleName) {
			return (moduleName.startsWith("@") ? moduleName.slice(moduleName.indexOf("/") + 1) : moduleName).replace(/^cordis:/, "").replace(/^cordis-plugin-/, "").replace(/^dsh-(?:host-|client-|plugin-)?/, "");
		}
		function matches(entry, query) {
			if (query.length === 0) return true;
			return [
				entry.moduleName,
				entry.entryId,
				entry.clientPackage ?? ""
			].some((value) => value.toLocaleLowerCase().includes(query));
		}
		function clientLabel(entry, t) {
			if (entry.clientPackage === null) return t("notApplicable");
			return entry.clientMounted ? phaseLabel(entry.clientPhase, t) : t("notMounted");
		}
		function PluginLifecycleSettingsTab({ api, t }) {
			const catalogId = (0, react.useId)();
			const [request, setRequest] = (0, react.useState)(0);
			const [query, setQuery] = (0, react.useState)("");
			const [expanded, setExpanded] = (0, react.useState)(null);
			const [pending, setPending] = (0, react.useState)(null);
			const [busy, setBusy] = (0, react.useState)(false);
			const [actionError, setActionError] = (0, react.useState)(null);
			const [state, setState] = (0, react.useState)({ status: "loading" });
			(0, react.useEffect)(() => {
				let current = true;
				api.read().then((snapshot) => {
					if (current) setState({
						status: "ready",
						snapshot
					});
				}, (cause) => {
					if (current) setState({
						status: "error",
						message: cause instanceof Error ? cause.message : String(cause)
					});
				});
				return () => {
					current = false;
				};
			}, [api, request]);
			const normalizedQuery = query.trim().toLocaleLowerCase();
			const filtered = (0, react.useMemo)(() => state.status === "ready" ? state.snapshot.entries.filter((entry) => matches(entry, normalizedQuery)) : [], [normalizedQuery, state]);
			const retry = () => {
				setState({ status: "loading" });
				setRequest((value) => value + 1);
			};
			const execute = async (action, entryId) => {
				setBusy(true);
				setActionError(null);
				try {
					if (action === "enable" && entryId !== void 0) await api.enable(entryId);
					else if (action === "disable" && entryId !== void 0) await api.disable(entryId);
					else await api.reload(entryId);
				} catch (cause) {
					setBusy(false);
					setPending(null);
					setActionError(cause instanceof Error ? cause.message : String(cause));
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: pluginLifecycleClasses.section,
				"aria-busy": state.status === "loading" || busy,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: pluginLifecycleClasses.toolbar,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("shortcut") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							disabled: busy,
							onClick: () => {
								execute("reload");
							},
							children: t("reloadAll")
						})]
					}),
					actionError !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: pluginLifecycleClasses.failure,
						role: "alert",
						children: actionError
					}) : null,
					state.status === "loading" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: pluginLifecycleClasses.status,
						children: t("loading")
					}) : null,
					state.status === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: pluginLifecycleClasses.failure,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
							role: "alert",
							children: [
								t("error"),
								" ",
								state.message
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: retry,
							children: t("retry")
						})]
					}) : null,
					state.status === "ready" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: pluginLifecycleClasses.catalog,
						children: [
							state.snapshot.blend !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
								className: pluginLifecycleClasses.status,
								"data-desktop-blend": state.snapshot.blend.id,
								children: [
									t("blend"),
									": ",
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: state.snapshot.blend.id }),
									" ",
									state.snapshot.blend.version,
									" - ",
									state.snapshot.blend.rows,
									" ",
									t("blendRows"),
									" ",
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: state.snapshot.blend.lockPath })
								]
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: pluginLifecycleClasses.search,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									"aria-hidden": "true",
									children: "⌕"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "search",
									value: query,
									placeholder: t("search"),
									"aria-label": t("search"),
									onChange: (event) => {
										setQuery(event.currentTarget.value);
									}
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: pluginLifecycleClasses.catalogHeading,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("catalog") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: filtered.length })]
							}),
							filtered.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: pluginLifecycleClasses.status,
								children: t("empty")
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
								className: pluginLifecycleClasses.cards,
								children: filtered.map((entry) => {
									const title = moduleShortName(entry.moduleName);
									const open = expanded === entry.entryId;
									const detailId = `${catalogId}-${encodeURIComponent(entry.entryId)}`;
									const confirmingDisable = pending?.entryId === entry.entryId && pending.action === "disable";
									return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
										className: pluginLifecycleClasses.card,
										"data-plugin-entry": entry.entryId,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
											className: pluginLifecycleClasses.cardHeader,
											type: "button",
											"aria-expanded": open,
											"aria-controls": detailId,
											onClick: () => {
												setExpanded((current) => current === entry.entryId ? null : entry.entryId);
											},
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
												title: entry.moduleName,
												children: title
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												className: pluginLifecycleClasses.summary,
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
														"data-mounted": entry.hostPhase === "active",
														children: [
															t("host"),
															": ",
															phaseLabel(entry.hostPhase, t)
														]
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
														"data-mounted": entry.clientMounted,
														children: [
															t("client"),
															": ",
															clientLabel(entry, t)
														]
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: pluginLifecycleClasses.chevron,
														"aria-hidden": "true",
														children: "⌄"
													})
												]
											})]
										}), open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: pluginLifecycleClasses.details,
											id: detailId,
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: entry.entryId }),
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", { children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("configuration") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: t(entry.enabled ? "enabled" : "disabled") })] }),
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("host") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: phaseLabel(entry.hostPhase, t) })] }),
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("client") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: clientLabel(entry, t) })] })
												] }),
												entry.mutable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
													className: pluginLifecycleClasses.actions,
													children: entry.enabled ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [confirmingDisable ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
														entry.dependents.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
															className: pluginLifecycleClasses.protected,
															children: [
																t("alsoDisables"),
																": ",
																entry.dependents.join(", ")
															]
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
															type: "button",
															className: pluginLifecycleClasses.danger,
															disabled: busy,
															onClick: () => {
																execute("disable", entry.entryId);
															},
															children: t("confirmDisable")
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
															type: "button",
															disabled: busy,
															onClick: () => {
																setPending(null);
															},
															children: t("cancel")
														})
													] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
														type: "button",
														disabled: busy,
														onClick: () => {
															setPending({
																entryId: entry.entryId,
																action: "disable"
															});
														},
														children: t("disable")
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
														type: "button",
														disabled: busy || confirmingDisable,
														onClick: () => {
															execute("reload", entry.entryId);
														},
														children: t("reload")
													})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
														type: "button",
														disabled: busy,
														onClick: () => {
															execute("enable", entry.entryId);
														},
														children: t("enable")
													})
												}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
													className: pluginLifecycleClasses.protected,
													children: [
														/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("strong", { children: [t("protected"), ":"] }),
														" ",
														entry.protectedReason
													]
												})
											]
										}) : null]
									}, entry.entryId);
								})
							})
						]
					}) : null
				]
			});
		}
		//#endregion
		//#region src/architecture/contract.ts
		const PLUGIN_ARCHITECTURE_PATH = "/api/acryl-plugin-admin/architecture";
		//#endregion
		//#region src/architecture/inspector.ts
		const MAX_FIBERS$1 = 2048;
		const MAX_SERVICES$1 = 4096;
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
			if (result.length > MAX_FIBERS$1) throw new Error("Cordis context exceeds the inspection Fiber limit");
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
			if (services.length > MAX_SERVICES$1) throw new Error("Cordis context exceeds the inspection service limit");
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
		//#region src/client/architecture/plugin-architecture-api.ts
		const MAX_FIBERS = 2048;
		const MAX_SERVICES = 4096;
		const MAX_EFFECTS = 512;
		const MAX_DEPTH = 12;
		const MAX_STRING$1 = 512;
		function isRecord$1(value) {
			return value !== null && typeof value === "object" && !Array.isArray(value);
		}
		function hasExactKeys$1(record, expected) {
			const actual = Object.keys(record).sort();
			const keys = [...expected].sort();
			return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
		}
		function stringValue(value, field, allowEmpty = false) {
			if (typeof value !== "string" || !allowEmpty && value.length === 0 || value.length > MAX_STRING$1) throw new Error(`acryl-plugin-admin: invalid Cordis architecture ${field}`);
			return value;
		}
		function uidValue(value, nullable = false) {
			if (nullable && value === null) return null;
			if (!Number.isSafeInteger(value) || value < 0) throw new Error("acryl-plugin-admin: invalid Cordis architecture Fiber UID");
			return value;
		}
		function effectValue(value, depth, budget) {
			if (depth > MAX_DEPTH || --budget.remaining < 0 || !isRecord$1(value) || !hasExactKeys$1(value, ["label", "children"]) || !Array.isArray(value.children)) throw new Error("acryl-plugin-admin: invalid Cordis architecture effect");
			return Object.freeze({
				label: stringValue(value.label, "effect label", true),
				children: Object.freeze(value.children.map((child) => effectValue(child, depth + 1, budget)))
			});
		}
		function dependencyValue(value) {
			if (!isRecord$1(value) || !hasExactKeys$1(value, [
				"name",
				"status",
				"providerFiberUid"
			])) throw new Error("acryl-plugin-admin: invalid Cordis architecture dependency");
			const status = value.status;
			if (status !== "resolved" && status !== "available" && status !== "missing") throw new Error("acryl-plugin-admin: invalid Cordis architecture dependency status");
			const providerFiberUid = uidValue(value.providerFiberUid, true);
			if (status === "resolved" !== (providerFiberUid !== null)) throw new Error("acryl-plugin-admin: inconsistent Cordis architecture dependency");
			return Object.freeze({
				name: stringValue(value.name, "dependency name"),
				status,
				providerFiberUid
			});
		}
		function fiberValue(value) {
			if (!isRecord$1(value) || !hasExactKeys$1(value, [
				"uid",
				"name",
				"phase",
				"parentUid",
				"loaderEntryId",
				"moduleName",
				"dependencies",
				"providedServices",
				"effects"
			]) || !Array.isArray(value.dependencies) || !Array.isArray(value.providedServices) || !Array.isArray(value.effects) || value.effects.length > MAX_EFFECTS) throw new Error("acryl-plugin-admin: invalid Cordis architecture Fiber");
			const phase = value.phase;
			if (phase !== "pending" && phase !== "loading" && phase !== "active" && phase !== "failed" && phase !== "unloading") throw new Error("acryl-plugin-admin: invalid Cordis architecture Fiber phase");
			const nullableString = (field, name) => field === null ? null : stringValue(field, name);
			const providedServices = value.providedServices.map((service) => stringValue(service, "service name"));
			if (new Set(providedServices).size !== providedServices.length) throw new Error("acryl-plugin-admin: duplicate Cordis architecture provided service");
			const effectBudget = { remaining: MAX_EFFECTS };
			return Object.freeze({
				uid: uidValue(value.uid),
				name: stringValue(value.name, "Fiber name"),
				phase,
				parentUid: uidValue(value.parentUid, true),
				loaderEntryId: nullableString(value.loaderEntryId, "Loader entry"),
				moduleName: nullableString(value.moduleName, "module name"),
				dependencies: Object.freeze(value.dependencies.map(dependencyValue)),
				providedServices: Object.freeze(providedServices),
				effects: Object.freeze(value.effects.map((effect) => effectValue(effect, 0, effectBudget)))
			});
		}
		function serviceValue(value) {
			if (!isRecord$1(value) || !hasExactKeys$1(value, [
				"name",
				"providerFiberUid",
				"providerName",
				"providerPhase"
			])) throw new Error("acryl-plugin-admin: invalid Cordis architecture service");
			const providerPhase = value.providerPhase;
			if (providerPhase !== "pending" && providerPhase !== "loading" && providerPhase !== "active" && providerPhase !== "failed" && providerPhase !== "unloading") throw new Error("acryl-plugin-admin: invalid Cordis architecture service phase");
			return Object.freeze({
				name: stringValue(value.name, "service name"),
				providerFiberUid: uidValue(value.providerFiberUid),
				providerName: stringValue(value.providerName, "service provider"),
				providerPhase
			});
		}
		function parseCordisPlaneSnapshot(value, expectedPlane) {
			if (!isRecord$1(value) || !hasExactKeys$1(value, [
				"plane",
				"fibers",
				"services"
			]) || value.plane !== expectedPlane || !Array.isArray(value.fibers) || !Array.isArray(value.services) || value.fibers.length > MAX_FIBERS || value.services.length > MAX_SERVICES) throw new Error("acryl-plugin-admin: invalid Cordis architecture snapshot");
			const fibers = value.fibers.map(fiberValue);
			if (new Set(fibers.map((fiber) => fiber.uid)).size !== fibers.length) throw new Error("acryl-plugin-admin: duplicate Cordis architecture Fiber UID");
			return Object.freeze({
				plane: expectedPlane,
				fibers: Object.freeze(fibers),
				services: Object.freeze(value.services.map(serviceValue))
			});
		}
		async function responseValue(response) {
			const value = await response.json().catch(() => void 0);
			if (!response.ok) {
				const message = isRecord$1(value) && typeof value.error === "string" ? value.error : `request failed (${String(response.status)})`;
				throw new Error(message);
			}
			return value;
		}
		/** Create a live two-plane inspector. Host is fetched; Client is projected locally. */
		function createPluginArchitectureApi(ctx, fetcher = globalThis.fetch.bind(globalThis)) {
			return Object.freeze({ async read() {
				const host = parseCordisPlaneSnapshot(await responseValue(await fetcher(PLUGIN_ARCHITECTURE_PATH, {
					method: "GET",
					credentials: "same-origin",
					redirect: "error",
					cache: "no-store",
					headers: { "Accept": "application/json" }
				})), "host");
				const client = inspectCordisContext(ctx, "client");
				return Object.freeze({
					host,
					client
				});
			} });
		}
		//#endregion
		//#region src/lifecycle/contract.ts
		/** Renderer-safe contract for plugin lifecycle inspection and control. */
		const PLUGIN_LIFECYCLE_PATH = "/api/acryl-plugin-admin/lifecycle";
		const PLUGIN_LIFECYCLE_ENABLE_PATH = "/api/acryl-plugin-admin/lifecycle/enable";
		const PLUGIN_LIFECYCLE_DISABLE_PATH = "/api/acryl-plugin-admin/lifecycle/disable";
		const PLUGIN_LIFECYCLE_RELOAD_PATH = "/api/acryl-plugin-admin/lifecycle/reload";
		//#endregion
		//#region src/client/lifecycle/plugin-lifecycle-api.ts
		const MAX_ENTRIES = 4096;
		const MAX_STRING = 2048;
		const ACTIVE_FIBER_STATE = 2;
		function isRecord(value) {
			return value !== null && typeof value === "object" && !Array.isArray(value);
		}
		function hasExactKeys(record, expected) {
			const actual = Object.keys(record).sort();
			const keys = [...expected].sort();
			return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
		}
		function parseString(value, field) {
			if (typeof value !== "string" || value.length === 0 || value.length > MAX_STRING) throw new Error(`acryl-plugin-admin: invalid plugin lifecycle ${field}`);
			return value;
		}
		function parsePhase(value) {
			if (value === null || value === "pending" || value === "loading" || value === "active" || value === "failed" || value === "unloading") return value;
			throw new Error("acryl-plugin-admin: invalid plugin lifecycle Fiber phase");
		}
		function parseEntry(value) {
			if (!isRecord(value) || !hasExactKeys(value, [
				"entryId",
				"moduleName",
				"enabled",
				"hostPhase",
				"clientPackage",
				"clientInBootGraph",
				"mutable",
				"protectedReason",
				"dependents"
			])) throw new Error("acryl-plugin-admin: invalid plugin lifecycle entry");
			const clientPackage = value.clientPackage === null ? null : parseString(value.clientPackage, "client package");
			if (typeof value.enabled !== "boolean" || typeof value.clientInBootGraph !== "boolean" || typeof value.mutable !== "boolean" || value.protectedReason !== null && (typeof value.protectedReason !== "string" || value.protectedReason.length > MAX_STRING)) throw new Error("acryl-plugin-admin: invalid plugin lifecycle entry flags");
			if (value.mutable === (value.protectedReason !== null)) throw new Error("acryl-plugin-admin: inconsistent plugin lifecycle mutation policy");
			if (!Array.isArray(value.dependents) || value.dependents.length > MAX_ENTRIES || value.dependents.some((id) => typeof id !== "string" || id.length > MAX_STRING)) throw new Error("acryl-plugin-admin: invalid plugin lifecycle dependents");
			return Object.freeze({
				entryId: parseString(value.entryId, "entry id"),
				moduleName: parseString(value.moduleName, "module name"),
				enabled: value.enabled,
				hostPhase: parsePhase(value.hostPhase),
				clientPackage,
				clientInBootGraph: value.clientInBootGraph,
				mutable: value.mutable,
				protectedReason: value.protectedReason,
				dependents: Object.freeze([...value.dependents])
			});
		}
		function parsePluginLifecycleSnapshot(value) {
			if (!isRecord(value) || !hasExactKeys(value, ["entries", "blend"]) || !Array.isArray(value.entries) || value.entries.length > MAX_ENTRIES) throw new Error("acryl-plugin-admin: invalid plugin lifecycle snapshot");
			const entries = value.entries.map(parseEntry);
			if (new Set(entries.map((entry) => entry.entryId)).size !== entries.length) throw new Error("acryl-plugin-admin: duplicate plugin lifecycle entry");
			return Object.freeze({
				entries: Object.freeze(entries),
				blend: value.blend === null ? null : parseBlendView(value.blend)
			});
		}
		function parseBlendView(value) {
			if (!isRecord(value) || !hasExactKeys(value, [
				"id",
				"kind",
				"version",
				"digest",
				"lockPath",
				"rows"
			]) || value.kind !== "Blueprint" && value.kind !== "Blend" || typeof value.rows !== "number" || !Number.isInteger(value.rows) || value.rows < 0 || value.rows > MAX_ENTRIES) throw new Error("acryl-plugin-admin: invalid plugin lifecycle blend view");
			return Object.freeze({
				id: parseString(value.id, "blend id"),
				kind: value.kind,
				version: parseString(value.version, "blend version"),
				digest: parseString(value.digest, "blend digest"),
				lockPath: parseString(value.lockPath, "blend lock path"),
				rows: value.rows
			});
		}
		function parseReceipt(value) {
			if (!isRecord(value) || !hasExactKeys(value, [
				"accepted",
				"action",
				"entryIds",
				"rendererReloadRequired",
				"snapshot"
			]) || value.accepted !== true || value.action !== "enable" && value.action !== "disable" && value.action !== "reload" || !Array.isArray(value.entryIds) || value.entryIds.length > MAX_ENTRIES || typeof value.rendererReloadRequired !== "boolean") throw new Error("acryl-plugin-admin: invalid plugin lifecycle receipt");
			const entryIds = value.entryIds.map((entryId) => parseString(entryId, "receipt entry id"));
			if (new Set(entryIds).size !== entryIds.length) throw new Error("acryl-plugin-admin: duplicate plugin lifecycle receipt entry");
			return Object.freeze({
				accepted: true,
				action: value.action,
				entryIds: Object.freeze(entryIds),
				rendererReloadRequired: value.rendererReloadRequired,
				snapshot: parsePluginLifecycleSnapshot(value.snapshot)
			});
		}
		function clientPhase(state) {
			switch (state) {
				case 0: return "pending";
				case 1: return "loading";
				case ACTIVE_FIBER_STATE: return "active";
				case 3: return "failed";
				case 4: return null;
				case 5: return "unloading";
				default: return null;
			}
		}
		async function readResponse(response) {
			let value;
			try {
				value = await response.json();
			} catch {
				throw new Error("acryl-plugin-admin: plugin lifecycle response was not JSON");
			}
			if (!response.ok) {
				const message = isRecord(value) && typeof value.error === "string" ? value.error : `Plugin lifecycle request failed (${String(response.status)}).`;
				throw new Error(message);
			}
			return value;
		}
		function post(fetcher, path, entryId) {
			return fetcher(path, {
				method: "POST",
				credentials: "same-origin",
				redirect: "error",
				headers: {
					"Accept": "application/json",
					"Content-Type": "application/json"
				},
				body: JSON.stringify(entryId === void 0 ? {} : { entryId })
			});
		}
		function mergeClientSnapshot(snapshot, loader) {
			const phases = /* @__PURE__ */ new Map();
			for (const entry of loader.entries()) phases.set(entry.options.name, entry.fiber === void 0 ? null : clientPhase(entry.fiber.state));
			return Object.freeze({
				entries: Object.freeze(snapshot.entries.map((entry) => {
					const phase = entry.clientPackage === null ? null : phases.get(entry.clientPackage) ?? null;
					return Object.freeze({
						...entry,
						clientPhase: phase,
						clientMounted: phase !== null
					});
				})),
				blend: snapshot.blend
			});
		}
		/** Create the lifecycle client with explicit fetch, Loader, and reload seams. */
		function createPluginLifecycleApi(loader, fetcher = globalThis.fetch.bind(globalThis), reloadPage = () => {
			globalThis.location.reload();
		}) {
			const mutate = async (path, entryId) => {
				if (!parseReceipt(await readResponse(await post(fetcher, path, entryId))).rendererReloadRequired) throw new Error("acryl-plugin-admin: lifecycle receipt omitted the required renderer reload");
				reloadPage();
			};
			return Object.freeze({
				async read() {
					return mergeClientSnapshot(parsePluginLifecycleSnapshot(await readResponse(await fetcher(PLUGIN_LIFECYCLE_PATH, {
						method: "GET",
						credentials: "same-origin",
						redirect: "error",
						cache: "no-store",
						headers: { "Accept": "application/json" }
					}))), loader);
				},
				enable: (entryId) => mutate(PLUGIN_LIFECYCLE_ENABLE_PATH, entryId),
				disable: (entryId) => mutate(PLUGIN_LIFECYCLE_DISABLE_PATH, entryId),
				reload: (entryId) => mutate(PLUGIN_LIFECYCLE_RELOAD_PATH, entryId)
			});
		}
		//#endregion
		//#region src/client/lifecycle/plugin-lifecycle-locales.ts
		const en = {
			tab: "Lifecycle",
			loading: "Loading plugin lifecycle…",
			error: "Plugin lifecycle could not be loaded.",
			retry: "Retry",
			search: "Search plugins",
			catalog: "Host and Client plugins",
			empty: "No plugins match this search.",
			host: "Host",
			client: "Client",
			configuration: "Configuration",
			enabled: "Enabled",
			disabled: "Disabled",
			mounted: "Mounted",
			notMounted: "Not mounted",
			notApplicable: "No Client face",
			pending: "Pending",
			loadingPhase: "Loading",
			active: "Mounted",
			failed: "Failed",
			unloading: "Unmounting",
			protected: "Protected",
			enable: "Enable",
			disable: "Disable",
			reload: "Reload",
			reloadAll: "Reload managed plugins",
			confirmDisable: "Confirm disable",
			alsoDisables: "Disabling this also disables",
			blend: "Active BLEND",
			blendRows: "rows from",
			cancel: "Cancel",
			shortcut: "Session shortcut: /reload [loader-entry-id]",
			architectureTab: "Architecture",
			architectureIntro: "Live native Cordis Fibers, injected dependencies, services, and owned effects. Host and Client are independent contexts.",
			fibers: "Fibers",
			services: "Services",
			dependencies: "Injects",
			provides: "Provides",
			effects: "Owned effects",
			loaderEntry: "Loader entry",
			module: "Module",
			parentFiber: "Parent Fiber",
			rootFiber: "Root Fiber",
			available: "Available",
			missing: "Missing",
			resolvedBy: "Resolved by Fiber",
			none: "None"
		};
		const zh = {
			tab: "生命周期",
			loading: "正在加载插件生命周期…",
			error: "无法加载插件生命周期。",
			retry: "重试",
			search: "搜索插件",
			catalog: "Host 与 Client 插件",
			empty: "没有匹配的插件。",
			host: "Host",
			client: "Client",
			configuration: "配置",
			enabled: "已启用",
			disabled: "已禁用",
			mounted: "已挂载",
			notMounted: "未挂载",
			notApplicable: "无 Client 端",
			pending: "等待中",
			loadingPhase: "加载中",
			active: "已挂载",
			failed: "失败",
			unloading: "正在卸载",
			protected: "受保护",
			enable: "启用",
			disable: "禁用",
			reload: "重新加载",
			reloadAll: "重新加载受管插件",
			confirmDisable: "确认禁用",
			alsoDisables: "禁用此项也会禁用",
			blend: "活动 BLEND",
			blendRows: "行来自",
			cancel: "取消",
			shortcut: "会话快捷命令：/reload [loader-entry-id]",
			architectureTab: "架构",
			architectureIntro: "实时原生 Cordis Fiber、注入依赖、服务与所拥有的 effect。Host 与 Client 是独立上下文。",
			fibers: "Fiber",
			services: "服务",
			dependencies: "注入依赖",
			provides: "提供服务",
			effects: "所拥有的 effect",
			loaderEntry: "Loader 条目",
			module: "模块",
			parentFiber: "父 Fiber",
			rootFiber: "根 Fiber",
			available: "可用",
			missing: "缺失",
			resolvedBy: "由 Fiber 提供",
			none: "无"
		};
		//#endregion
		//#region src/client/lifecycle/plugin-lifecycle-styles.ts
		/** Lifecycle-owned styles for the plugin lifecycle Settings tab. */
		const STYLE_ID = "dsh-plugin-lifecycle-styles";
		const CSS = `
.dshPluginLifecycleSection {
  display: grid;
  gap: 16px;
  padding: 4px 0 24px;
  color: var(--dsw-alias-label-primary);
}

.dshPluginLifecycleToolbar,
.dshPluginLifecycleCatalogHeading,
.dshPluginLifecycleCardHeader,
.dshPluginLifecycleSummary,
.dshPluginLifecycleActions {
  display: flex;
  align-items: center;
}

.dshPluginLifecycleToolbar {
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-3);
}

.dshPluginLifecycleToolbar p {
  margin: 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
}

.dshPluginLifecycleSection button {
  min-height: 30px;
  padding: 6px 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 7px;
  color: inherit;
  background: var(--dsw-alias-bg-layer-1);
  cursor: pointer;
  font: inherit;
}

.dshPluginLifecycleSection button:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}

.dshPluginLifecycleSection button:disabled {
  cursor: wait;
  opacity: 0.55;
}

.dshPluginLifecycleCatalog {
  display: grid;
  gap: 12px;
}

.dshPluginLifecycleSearch {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
}

.dshPluginLifecycleSearch input {
  width: 100%;
  min-height: 38px;
  border: 0;
  outline: 0;
  color: inherit;
  background: transparent;
  font: inherit;
}

.dshPluginLifecycleCatalogHeading {
  justify-content: space-between;
}

.dshPluginLifecycleCatalogHeading h3 {
  margin: 0;
  font-size: 14px;
}

.dshPluginLifecycleCatalogHeading span {
  color: var(--dsw-alias-label-tertiary);
  font-variant-numeric: tabular-nums;
}

.dshPluginLifecycleCards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.dshPluginLifecycleCard {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-3);
}

.dshPluginLifecycleCardHeader {
  width: 100%;
  min-height: 48px !important;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px 10px;
  border: 0 !important;
  border-radius: 0 !important;
  color: var(--dsw-alias-label-primary);
  text-align: left;
  background: transparent !important;
}

.dshPluginLifecycleCardHeader strong {
  flex: 1 1 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dshPluginLifecycleSummary {
  flex: 1 1 auto;
  width: 100%;
  gap: 8px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
}

.dshPluginLifecycleSummary span {
  padding: 3px 6px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-1);
}

.dshPluginLifecycleSummary span[data-mounted='true'] {
  color: var(--dsw-alias-state-success-primary);
  background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 10%, transparent);
}

.dshPluginLifecycleChevron {
  margin-left: auto;
  transition: transform 120ms ease;
}

.dshPluginLifecycleCardHeader[aria-expanded='true'] .dshPluginLifecycleChevron {
  transform: rotate(180deg);
}

.dshPluginLifecycleDetails {
  display: grid;
  gap: 12px;
  padding: 0 12px 14px;
  border-top: 1px solid var(--dsw-alias-border-l2);
}

.dshPluginLifecycleDetails code {
  overflow-wrap: anywhere;
  padding-top: 12px;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
}

.dshPluginLifecycleDetails dl {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
}

.dshPluginLifecycleDetails dl div {
  display: grid;
  gap: 3px;
}

.dshPluginLifecycleDetails dt {
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
}

.dshPluginLifecycleDetails dd {
  margin: 0;
  font-size: 12px;
}

.dshPluginLifecycleActions {
  flex-wrap: wrap;
  gap: 8px;
}

.dshPluginLifecycleDanger {
  border-color: var(--dsw-alias-state-error-primary) !important;
  color: var(--dsw-alias-state-error-primary) !important;
}

.dshPluginLifecycleProtected,
.dshPluginLifecycleStatus,
.dshPluginLifecycleFailure {
  margin: 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
}

.dshPluginLifecycleFailure {
  color: var(--dsw-alias-state-error-primary);
}

.dshPluginArchitectureSummary {
  margin: 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 1.55;
}

.dshPluginArchitecturePlane {
  display: grid;
  gap: 10px;
  padding-top: 4px;
}

.dshPluginArchitecturePlane + .dshPluginArchitecturePlane {
  margin-top: 8px;
  padding-top: 20px;
  border-top: 1px solid var(--dsw-alias-border-l2);
}

.dshPluginArchitecturePlaneHeader {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}

.dshPluginArchitecturePlaneHeader h3,
.dshPluginArchitecturePlaneHeader p {
  margin: 0;
}

.dshPluginArchitecturePlaneHeader h3 {
  font-size: 17px;
}

.dshPluginArchitecturePlaneHeader p {
  margin-top: 2px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
}

.dshPluginArchitectureStats {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
}

.dshPluginArchitectureStats span {
  padding: 3px 7px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-1);
}

.dshPluginArchitectureFiberList {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.dshPluginArchitectureFiber {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-3);
}

.dshPluginArchitectureFiber summary {
  list-style: none;
}

.dshPluginArchitectureFiber summary::-webkit-details-marker {
  display: none;
}

.dshPluginArchitectureFiberHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 52px;
  padding: 10px 12px;
  cursor: pointer;
}

.dshPluginArchitectureFiberHeader:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

.dshPluginArchitectureFiberHeader > span:first-child {
  display: grid;
  min-width: 0;
}

.dshPluginArchitectureFiberHeader strong {
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dshPluginArchitectureFiberHeader small {
  color: var(--dsw-alias-label-tertiary);
  font-size: 10px;
}

.dshPluginArchitecturePhase {
  flex: none;
  padding: 3px 7px;
  border-radius: 999px;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-1);
  font-size: 10px;
}

.dshPluginArchitecturePhase[data-phase='active'] {
  color: var(--dsw-alias-state-success-primary);
  background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 10%, transparent);
}

.dshPluginArchitecturePhase[data-phase='failed'],
.dshPluginArchitectureChip[data-status='missing'] {
  color: var(--dsw-alias-state-error-primary);
}

.dshPluginArchitectureNativeDetails {
  display: grid;
  gap: 12px;
  padding: 12px;
  border-top: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-module-platform);
}

.dshPluginArchitectureNativeDetails section,
.dshPluginArchitectureNativeDetails h4,
.dshPluginArchitectureNativeDetails p {
  margin: 0;
}

.dshPluginArchitectureNativeDetails section {
  display: grid;
  gap: 6px;
}

.dshPluginArchitectureNativeDetails h4 {
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
}

.dshPluginArchitectureNativeDetails p {
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
}

.dshPluginArchitectureFiberMeta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
}

.dshPluginArchitectureFiberMeta div {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.dshPluginArchitectureFiberMeta dt {
  color: var(--dsw-alias-label-tertiary);
  font-size: 10px;
}

.dshPluginArchitectureFiberMeta dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
  font-size: 11px;
}

.dshPluginArchitectureChips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.dshPluginArchitectureChip {
  max-width: 100%;
  overflow-wrap: anywhere;
  padding: 3px 6px;
  border-radius: 5px;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-1);
  font-size: 10px;
}

.dshPluginArchitectureEffectTree {
  display: grid;
  gap: 4px;
  margin: 0;
  padding-left: 17px;
  color: var(--dsw-alias-label-secondary);
  font-size: 10px;
}

.dshPluginArchitectureEffectTree .dshPluginArchitectureEffectTree {
  margin-top: 4px;
}

@media (max-width: 900px) {
  .dshPluginLifecycleCards,
  .dshPluginArchitectureFiberList {
    grid-template-columns: 1fr;
  }

  .dshPluginLifecycleToolbar {
    align-items: flex-start;
    flex-direction: column;
  }
}

`;
		/** Install one scoped stylesheet; tolerate headless Client boot. */
		function installPluginLifecycleStyles() {
			if (typeof document === "undefined") return () => {};
			if (document.getElementById(STYLE_ID) !== null) return () => {};
			const style = document.createElement("style");
			style.id = STYLE_ID;
			style.textContent = CSS;
			document.head.appendChild(style);
			return () => {
				style.remove();
			};
		}
		//#endregion
		//#region src/client/lifecycle/plugin-lifecycle-settings.ts
		const PLUGIN_LIFECYCLE_LOCALE_NAMESPACE = "acryl.pluginAdmin";
		/** Register the lifecycle page between configurable settings and read-only inventory. */
		function applyPluginLifecycleSettings(ctx) {
			const architectureApi = createPluginArchitectureApi(ctx);
			const lifecycleApi = createPluginLifecycleApi(ctx.loader);
			const t = ctx.locale.bind(PLUGIN_LIFECYCLE_LOCALE_NAMESPACE);
			ctx.effect(() => ctx.locale.register(PLUGIN_LIFECYCLE_LOCALE_NAMESPACE, {
				zh,
				en
			}), "acryl-plugin-admin: plugin lifecycle dictionaries");
			ctx.effect(() => installPluginLifecycleStyles(), "acryl-plugin-admin: plugin lifecycle styles");
			ctx.slots.inject("settings.plugins.tab", () => ctx.slots.register({
				name: "settings.plugins.tab",
				id: "architecture",
				order: 4,
				label: () => t("architectureTab"),
				locale: PLUGIN_LIFECYCLE_LOCALE_NAMESPACE,
				inject: () => ({ api: architectureApi })
			}, PluginArchitectureSettingsTab));
			ctx.slots.inject("settings.plugins.tab", () => ctx.slots.register({
				name: "settings.plugins.tab",
				id: "lifecycle",
				order: 5,
				label: () => t("tab"),
				locale: PLUGIN_LIFECYCLE_LOCALE_NAMESPACE,
				inject: () => ({ api: lifecycleApi })
			}, PluginLifecycleSettingsTab));
		}
		//#endregion
		//#region src/client/index.ts
		const name = "acryl-plugin-admin-client";
		/** `slots` for the tab contributions, `locale` for their dictionaries. */
		const inject = ["slots", "locale"];
		function apply(ctx) {
			applyPluginLifecycleSettings(ctx);
		}
		//#endregion
		exports.PluginArchitectureSettingsTab = PluginArchitectureSettingsTab;
		exports.PluginLifecycleSettingsTab = PluginLifecycleSettingsTab;
		exports.apply = apply;
		exports.applyPluginLifecycleSettings = applyPluginLifecycleSettings;
		exports.createPluginArchitectureApi = createPluginArchitectureApi;
		exports.createPluginLifecycleApi = createPluginLifecycleApi;
		exports.inject = inject;
		exports.name = name;
		exports.parseCordisPlaneSnapshot = parseCordisPlaneSnapshot;
		exports.parsePluginLifecycleSnapshot = parsePluginLifecycleSnapshot;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map