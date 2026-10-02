import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runBuild } from "./build";
import { hsmSourceFiles, resolveHsmSourceDir, runVendorHsm } from "./vendor-hsm";

const HSM_SOURCE_DIR = path.resolve(import.meta.dir, "../../hsm/src");

const DEFAULT_TSCONFIG = JSON.stringify(
  {
    compilerOptions: { target: "ES2022", module: "ESNext", strict: true },
    include: ["src/**/*.ts"],
  },
  null,
  2,
);

const HSM_SCRIPT = `import { defineScript } from "@defold-typescript/types";
import { type MessageEvent, messageEvents } from "./vendor/hsm/defold";
import { defineMachine } from "./vendor/hsm/index";

type Ev = MessageEvent<"trigger_response"> | { type: "CLOSE" };

const door = defineMachine<{ opened: number }, Ev>()({
  initial: "closed",
  states: {
    closed: { on: { trigger_response: "open" } },
    open: { on: { CLOSE: "closed" } },
  },
});

const events = messageEvents(["trigger_response"]);

export default defineScript({
  init() {
    return { machine: door.start({ opened: 0 }) };
  },
  update(self, dt) {
    self.machine.update(dt);
  },
  on_message(self, message_id, message) {
    const event = events.toEvent(message_id, message);
    if (event !== undefined) {
      self.machine.send(event);
    }
  },
});
`;

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-vendor-hsm-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function writeFile(rel: string, contents: string): void {
  const abs = path.join(tmp, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, contents);
}

describe("hsmSourceFiles", () => {
  test("lists the shipped modules and never a test, declaration or snapshot", () => {
    const files = hsmSourceFiles(HSM_SOURCE_DIR);

    expect(files).toEqual(["defold.ts", "index.ts"]);
    for (const name of files) {
      expect(name).not.toMatch(/\.test\.ts$/);
      expect(name).not.toMatch(/\.d\.ts$/);
      expect(name).not.toContain("__snapshots__");
    }
  });
});

describe("resolveHsmSourceDir", () => {
  test("prefers the workspace sibling over a built dist copy", () => {
    const cliRoot = path.join(tmp, "packages/cli");
    mkdirSync(path.join(tmp, "packages/hsm/src"), { recursive: true });
    mkdirSync(path.join(cliRoot, "dist/hsm"), { recursive: true });

    expect(resolveHsmSourceDir(cliRoot)).toBe(path.join(tmp, "packages/hsm/src"));
  });

  test("falls back to the copy shipped in dist", () => {
    const cliRoot = path.join(tmp, "node_modules/@defold-typescript/cli");
    mkdirSync(path.join(cliRoot, "dist/hsm"), { recursive: true });

    expect(resolveHsmSourceDir(cliRoot)).toBe(path.join(cliRoot, "dist/hsm"));
  });

  test("returns null when neither layout carries the source", () => {
    const cliRoot = path.join(tmp, "cli");
    mkdirSync(cliRoot, { recursive: true });

    expect(resolveHsmSourceDir(cliRoot)).toBeNull();
  });
});

describe("runVendorHsm", () => {
  test("copies every module byte-for-byte and stamps the version", () => {
    const result = runVendorHsm({ cwd: tmp, sourceDir: HSM_SOURCE_DIR, version: "1.2.3" });

    for (const name of ["index.ts", "defold.ts"]) {
      expect(readFileSync(path.join(tmp, "src/vendor/hsm", name))).toEqual(
        readFileSync(path.join(HSM_SOURCE_DIR, name)),
      );
    }
    expect(readFileSync(path.join(tmp, "src/vendor/hsm/VERSION"), "utf8")).toBe("1.2.3\n");
    expect(result).toEqual({
      version: "1.2.3",
      previousVersion: null,
      written: ["src/vendor/hsm/defold.ts", "src/vendor/hsm/index.ts", "src/vendor/hsm/VERSION"],
    });
  });

  test("a re-run upgrades in place and leaves unrelated files alone", () => {
    runVendorHsm({ cwd: tmp, sourceDir: HSM_SOURCE_DIR, version: "1.2.3" });
    writeFile("src/vendor/hsm/notes.md", "my notes\n");
    writeFile("src/vendor/hsm/index.ts", "// stale\n");

    const result = runVendorHsm({ cwd: tmp, sourceDir: HSM_SOURCE_DIR, version: "1.2.4" });

    expect(result.previousVersion).toBe("1.2.3");
    expect(result.version).toBe("1.2.4");
    expect(readFileSync(path.join(tmp, "src/vendor/hsm/VERSION"), "utf8")).toBe("1.2.4\n");
    expect(readFileSync(path.join(tmp, "src/vendor/hsm/index.ts"))).toEqual(
      readFileSync(path.join(HSM_SOURCE_DIR, "index.ts")),
    );
    expect(readFileSync(path.join(tmp, "src/vendor/hsm/notes.md"), "utf8")).toBe("my notes\n");
  });

  test("a missing source names hsm and writes nothing", () => {
    expect(() => runVendorHsm({ cwd: tmp, sourceDir: null, version: "1.2.3" })).toThrow(/hsm/);
    expect(existsSync(path.join(tmp, "src/vendor/hsm"))).toBe(false);
  });

  test("the vendored source builds in a real project", () => {
    writeFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeFile("src/main.ts", HSM_SCRIPT);
    runVendorHsm({ cwd: tmp, sourceDir: HSM_SOURCE_DIR, version: "1.2.3" });

    const result = runBuild({ cwd: tmp });

    expect(result.written).toContain("src/main.ts.script");
    expect(result.written).toContain("src/vendor/hsm/index.lua");
    expect(result.written).toContain("src/vendor/hsm/defold.lua");
  });
});
