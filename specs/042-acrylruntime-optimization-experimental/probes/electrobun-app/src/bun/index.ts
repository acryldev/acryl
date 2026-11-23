import { BrowserWindow } from "electrobun/main";
import { existsSync } from "node:fs";
import { join } from "node:path";

// Probe 2 (specs/042): the bundled, compiled Bun host is a child of this process; the window is a system webview on its URL.
const candidates = [
	join(import.meta.dir, "..", "host"),
	join(import.meta.dir, "host"),
	join(process.cwd(), "host"),
	join(process.cwd(), "..", "host"),
	join(import.meta.dir, "..", "..", "host"),
];
console.log("[probe] import.meta.dir =", import.meta.dir, " cwd =", process.cwd());
const hostDir = candidates.find((dir) => existsSync(join(dir, "acryl-bun")));
if (hostDir === undefined) throw new Error("host folder not found; tried " + candidates.join(", "));

const home = process.env.PROBE_HOME ?? join(process.env.HOME ?? "/tmp", ".acryl-frozen-probe");
const host = Bun.spawn([join(hostDir, "acryl-bun")], {
	env: { ...process.env, ACRYL_HOME: join(home, "acryl"), DSH_HOME: join(home, "dsh"), HOME: join(home, "home") },
	stdout: "pipe",
	stderr: "inherit",
});

let url: string | undefined;
const decoder = new TextDecoder();
let buffered = "";
for await (const chunk of host.stdout) {
	buffered += decoder.decode(chunk);
	const found = /http:\/\/127\.0\.0\.1:\d+\/\?token=\S+/.exec(buffered);
	if (found !== null) { url = found[0]; break; }
}
if (url === undefined) throw new Error("the host exited before printing its URL");
console.log("[probe] host url ready");

new BrowserWindow({
	title: "ACRYL (frozen probe)",
	url,
	frame: { width: 1280, height: 800, x: 120, y: 80 },
});

process.on("exit", () => { host.kill(); });
