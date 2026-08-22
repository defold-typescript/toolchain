import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { loadApiTargetsRegistry } from "./api-registry";
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

    const result = runSetTarget({ cwd, token: "1.13.1" });

    expect(result).toEqual({
      ok: true,
      from: "1.12.4",
      to: "1.13.1",
      written: ["package.json"],
    });
    const pkg = JSON.parse(readPkgFile()) as {
      name: string;
      "defold-typescript": { "defold-target": string; extensions: unknown };
    };
    expect(pkg.name).toBe("g");
    expect(pkg["defold-typescript"]["defold-target"]).toBe("1.13.1");
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

  test("a malformed version suffix is rejected, naming set-target and the accepted forms; file untouched", () => {
    writePkg({ "defold-typescript": { "defold-target": "1.12.4" } });
    const before = readPkgFile();

    const result = runSetTarget({ cwd, token: "1.13.1garbage" });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("set-target");
    expect(result.error).toContain("stable|beta|alpha");
    expect(result.written).toEqual([]);
    expect(readPkgFile()).toBe(before);
  });

  test("a channel token is accepted and written, proving channels persist through validation", () => {
    writePkg({ "defold-typescript": { "defold-target": "1.12.4" } });

    const result = runSetTarget({ cwd, token: "beta" });

    expect(result.ok).toBe(true);
    expect(result.to).toBe("beta");
    expect(result.written).toEqual(["package.json"]);
    expect(pinOf()).toBe("beta");
  });

  test("--detected writes the detected editor version", () => {
    writePkg({ "defold-typescript": { "defold-target": "1.12.4" } });

    const result = runSetTarget({ cwd, detected: true, detect: () => "1.13.1" });

    expect(result.ok).toBe(true);
    expect(result.to).toBe("1.13.1");
    expect(result.written).toEqual(["package.json"]);
    expect(pinOf()).toBe("1.13.1");
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
    const result = runSetTarget({ cwd, token: "1.13.1" });

    expect(result.ok).toBe(false);
    expect(result.written).toEqual([]);
    expect(result.error).toBeDefined();
  });
});

describe("runSetTarget registry membership", () => {
  const registered = loadApiTargetsRegistry().map((entry) => entry.id.replace(/^defold-/, ""));

  test("a well-formed version the registry cannot provide is rejected; file untouched", () => {
    writePkg({ "defold-typescript": { "defold-target": "1.12.4" } });
    const before = readPkgFile();

    const result = runSetTarget({ cwd, token: "1.42.99" });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("set-target");
    expect(result.error).toContain("1.42.99");
    expect(result.written).toEqual([]);
    expect(readPkgFile()).toBe(before);
  });

  test("the rejection lists the resolvable targets so the user can pick one", () => {
    writePkg({ "defold-typescript": { "defold-target": "1.12.4" } });

    const result = runSetTarget({
      cwd,
      token: "1.42.99",
      resolvableTargets: ["1.13.1", "1.12.4"],
    });

    expect(result.error).toContain("1.13.1, 1.12.4");
  });

  test("every registered version is accepted and written", () => {
    expect(registered.length).toBeGreaterThan(0);

    for (const version of registered) {
      writePkg({ "defold-typescript": { "defold-target": "0.0.0-none" } });

      const result = runSetTarget({ cwd, token: version });

      expect(result.ok).toBe(true);
      expect(result.written).toEqual(["package.json"]);
      expect(pinOf()).toBe(version);
    }
  });

  test("channel tokens bypass the membership check", () => {
    for (const channel of ["stable", "beta", "alpha"]) {
      writePkg({ "defold-typescript": { "defold-target": "1.12.4" } });

      const result = runSetTarget({ cwd, token: channel, resolvableTargets: ["1.13.1"] });

      expect(result.ok).toBe(true);
      expect(pinOf()).toBe(channel);
    }
  });

  test("--detected naming an unregistered installed version is rejected without writing", () => {
    writePkg({ "defold-typescript": { "defold-target": "1.12.4" } });
    const before = readPkgFile();

    const result = runSetTarget({
      cwd,
      detected: true,
      detect: () => "1.42.99",
      resolvableTargets: ["1.13.1", "1.12.4"],
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("1.42.99");
    expect(result.error).toContain("1.13.1, 1.12.4");
    expect(result.written).toEqual([]);
    expect(readPkgFile()).toBe(before);
  });

  test("an unavailable registry rejects a concrete version; file untouched", () => {
    writePkg({ "defold-typescript": { "defold-target": "1.12.4" } });
    const before = readPkgFile();

    const result = runSetTarget({ cwd, token: "1.42.99", resolvableTargets: [] });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("API registry is unavailable");
    expect(result.written).toEqual([]);
    expect(readPkgFile()).toBe(before);
  });

  test("an unavailable registry rejects --detected too; file untouched", () => {
    writePkg({ "defold-typescript": { "defold-target": "1.12.4" } });
    const before = readPkgFile();

    const result = runSetTarget({
      cwd,
      detected: true,
      detect: () => "1.42.99",
      resolvableTargets: [],
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("API registry is unavailable");
    expect(result.written).toEqual([]);
    expect(readPkgFile()).toBe(before);
  });

  test("channel tokens stay writable when the registry is unavailable", () => {
    for (const channel of ["stable", "beta", "alpha"]) {
      writePkg({ "defold-typescript": { "defold-target": "1.12.4" } });

      const result = runSetTarget({ cwd, token: channel, resolvableTargets: [] });

      expect(result.ok).toBe(true);
      expect(result.written).toEqual(["package.json"]);
      expect(pinOf()).toBe(channel);
    }
  });

  test("a token already equal to an unprovidable pin is still rejected", () => {
    writePkg({ "defold-typescript": { "defold-target": "1.42.99" } });

    const result = runSetTarget({ cwd, token: "1.42.99", resolvableTargets: ["1.13.1"] });

    expect(result.ok).toBe(false);
    expect(result.written).toEqual([]);
  });
});
