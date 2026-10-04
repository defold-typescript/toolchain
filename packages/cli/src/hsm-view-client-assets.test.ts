import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { loadClientAssets } from "./hsm-view-client-assets";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "hsm-view-client-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("loadClientAssets", () => {
  test("reads the bundled script and stylesheet", () => {
    writeFileSync(path.join(dir, "main.js"), "console.log('viewer');");
    writeFileSync(path.join(dir, "styles.css"), "body{margin:0}");

    expect(loadClientAssets(dir)).toEqual({
      js: "console.log('viewer');",
      css: "body{margin:0}",
    });
  });

  test("names the build command when the client was never built", () => {
    expect(() => loadClientAssets(path.join(dir, "missing"))).toThrow(
      "bun run --cwd packages/cli build:hsm-view-client",
    );
  });

  test("names the build command when one asset is missing", () => {
    writeFileSync(path.join(dir, "main.js"), "");

    expect(() => loadClientAssets(dir)).toThrow("bun run --cwd packages/cli build:hsm-view-client");
  });
});
