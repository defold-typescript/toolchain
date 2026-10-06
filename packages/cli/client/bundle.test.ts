import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { requireHsmSourceDir } from "@defold-typescript/transpiler";
import { loadClientAssets } from "../src/hsm-view-client-assets";
import { createHsmViewApp } from "../src/hsm-view-server";
import { createSession } from "../src/hsm-view-session";
import { registerDom, unregisterDom, waitFor } from "./test-dom";

const LAMP = `import { defineMachine } from "@defold-typescript/types/hsm";
export const lamp = defineMachine("lamp")({
  initial: "/off",
  states: {
    off: { on: { TOGGLE: "/on" } },
    on: { on: { TOGGLE: "/off" } },
  },
});
`;

class SilentEventSource {
  addEventListener(): void {}
  close(): void {}
}

let dir: string;
const nativeFetch = globalThis.fetch;
const nativeEventSource = globalThis.EventSource;

beforeAll(registerDom);
afterAll(unregisterDom);

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "hsm-view-bundle-"));
});

afterEach(() => {
  globalThis.fetch = nativeFetch;
  Object.assign(globalThis, { EventSource: nativeEventSource });
  document.body.innerHTML = "";
  rmSync(dir, { recursive: true, force: true });
});

// The page runs the bundle the client build wrote, never these sources, so only running that
// bundle catches a build setting that breaks it.
test("the built client renders the picked machine and its source into #root", async () => {
  const file = path.join(dir, "main.ts");
  writeFileSync(file, LAMP);
  const session = createSession({ file, hsmSourceDir: requireHsmSourceDir() });
  const app = createHsmViewApp({ session, client: { js: "", css: "" } });
  globalThis.fetch = ((url: string, init?: RequestInit) => app.request(url, init)) as typeof fetch;
  Object.assign(globalThis, { EventSource: SilentEventSource });
  document.body.innerHTML = '<div id="root"></div>';

  new Function(loadClientAssets().js)();

  const root = document.getElementById("root");
  await waitFor(() => {
    expect(root?.textContent).toContain('defineMachine("lamp")');
  });
});
