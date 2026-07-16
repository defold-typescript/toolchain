import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runSetTarget } from "./set-target";

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-set-target-"));
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

function writePkg(value: unknown): void {
  writeFileSync(path.join(cwd, "package.json"), `${JSON.stringify(value, null, 2)}\n`);
}

function readPkgFile(): string {
  return readFileSync(path.join(cwd, "package.json"), "utf8");
}

function pinOf(): string {
  const pkg = JSON.parse(readPkgFile()) as {
    "defold-typescript": { "defold-target": string };
  };
  return pkg["defold-typescript"]["defold-target"];
}

describe("runSetTarget", () => {
  test("rewrites the pin, preserves sibling keys, and reports the transition", () => {
    writePkg({
      name: "g",
      "defold-typescript": { "defold-target": "1.12.4", extensions: { a: 1 } },
    });

    const result = runSetTarget({ cwd, token: "1.13.0" });

    expect(result).toEqual({
      ok: true,
      from: "1.12.4",
      to: "1.13.0",
      written: ["package.json"],
    });
    const pkg = JSON.parse(readPkgFile()) as {
      name: string;
      "defold-typescript": { "defold-target": string; extensions: unknown };
    };
    expect(pkg.name).toBe("g");
    expect(pkg["defold-typescript"]["defold-target"]).toBe("1.13.0");
    expect(pkg["defold-typescript"].extensions).toEqual({ a: 1 });
  });

  test("setting the pinned value writes nothing and leaves the file byte-identical", () => {
    writePkg({ "defold-typescript": { "defold-target": "1.12.4" } });
    const before = readPkgFile();

    const result = runSetTarget({ cwd, token: "1.12.4" });

    expect(result.ok).toBe(true);
    expect(result.written).toEqual([]);
    expect(result.from).toBe("1.12.4");
    expect(result.to).toBe("1.12.4");
    expect(readPkgFile()).toBe(before);
  });

  test("a garbage token is rejected, naming set-target and the accepted forms; file untouched", () => {
    writePkg({ "defold-typescript": { "defold-target": "1.12.4" } });
    const before = readPkgFile();

    const result = runSetTarget({ cwd, token: "nonsense" });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("set-target");
    expect(result.error).toContain("stable|beta|alpha");
    expect(result.written).toEqual([]);
    expect(readPkgFile()).toBe(before);
  });

  test("--detected writes the detected editor version", () => {
    writePkg({ "defold-typescript": { "defold-target": "1.12.4" } });

    const result = runSetTarget({ cwd, detected: true, detect: () => "1.13.0" });

    expect(result.ok).toBe(true);
    expect(result.to).toBe("1.13.0");
    expect(result.written).toEqual(["package.json"]);
    expect(pinOf()).toBe("1.13.0");
  });

  test("--detected with no installed editor errors and never falls back to current-stable", () => {
    writePkg({ "defold-typescript": { "defold-target": "1.12.4" } });
    const before = readPkgFile();

    const result = runSetTarget({ cwd, detected: true, detect: () => null });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("no installed Defold editor");
    expect(result.written).toEqual([]);
    expect(readPkgFile()).toBe(before);
  });

  test("a missing package.json is a clean error, not a throw", () => {
    const result = runSetTarget({ cwd, token: "1.13.0" });

    expect(result.ok).toBe(false);
    expect(result.written).toEqual([]);
    expect(result.error).toBeDefined();
  });
});
