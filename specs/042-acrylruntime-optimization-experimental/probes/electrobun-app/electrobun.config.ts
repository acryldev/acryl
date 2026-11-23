import type { ElectrobunConfig } from "electrobun";

export default {
	app: {
		name: "acryl-frozen",
		identifier: "dev.acryl.frozenprobe",
		version: "0.0.1",
	},
	build: {
		mainProcess: "bun",
		cottontail: {
			entrypoint: "src/bun/index.ts",
		},
		views: {
			mainview: {
				entrypoint: "src/mainview/index.ts",
			},
		},
		copy: {
			"src/mainview/index.html": "views/mainview/index.html",
			"src/mainview/index.css": "views/mainview/index.css",
			"<built bun-app>/acryl-bun": "host/acryl-bun",
			"<built bun-app>/payload": "host/payload",
		},
		mac: {
			bundleCEF: false,
		},
		linux: {
			bundleCEF: false,
		},
		win: {
			bundleCEF: false,
		},
	},
} satisfies ElectrobunConfig;
