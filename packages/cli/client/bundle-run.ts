// Runs the built viewer bundle against a session on a machine file and prints what it rendered
// into #root. It runs as its own process because the bundle carries its own React, which no test
// can unmount, and work React schedules after a test would fire into a removed window.
import { requireHsmSourceDir } from "@defold-typescript/transpiler";
import { loadClientAssets } from "../src/hsm-view-client-assets";
import { createHsmViewApp } from "../src/hsm-view-server";
import { createSession } from "../src/hsm-view-session";
import { registerDom } from "./test-dom";

const RENDER_WAIT_MS = 10_000;

const [file, expected] = process.argv.slice(2);
if (file === undefined || expected === undefined) {
  throw new Error("usage: bun client/bundle-run.ts <machine file> <text to wait for>");
}

class SilentEventSource {
  addEventListener(): void {}
  close(): void {}
}

const session = createSession({ file, hsmSourceDir: requireHsmSourceDir() });
const app = createHsmViewApp({ session, client: { js: "", css: "" } });
registerDom();
globalThis.fetch = ((url: string, init?: RequestInit) => app.request(url, init)) as typeof fetch;
Object.assign(globalThis, { EventSource: SilentEventSource });
document.body.innerHTML = '<div id="root"></div>';

new Function(loadClientAssets().js)();

const root = document.getElementById("root");
const deadline = Date.now() + RENDER_WAIT_MS;
while (!(root?.textContent ?? "").includes(expected) && Date.now() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, 20));
}
process.stdout.write(root?.textContent ?? "");
process.exit(0);
