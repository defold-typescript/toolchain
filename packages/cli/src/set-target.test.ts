import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { loadApiTargetsRegistry } from "./api-registry";
import { EDITOR_PORT_FILE } from "./editor-attach";
import { type EditorProbe, editorLaneFallback, type ProbedPath } from "./installed-editor-version";
import { runSetTarget } from "./set-target";

function probeOf(
  version: string | null,
  probed: readonly ProbedPath[] = [],
): () => Promise<EditorProbe> {
  return async () => ({ version, probed });
}

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
  test("rewrites the pin, preserves sibling keys, and reports the transition", async () => {
    writePkg({
      name: "g",
      "defold-typescript": { "defold-target": "1.12.4", extensions: { a: 1 } },
    });

    const result = await runSetTarget({ cwd, token: "1.13.1" });

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

  test("setting the pinned value writes nothing and leaves the file byte-identical", async () => {
    writePkg({ "defold-typescript": { "defold-target": "1.12.4" } });
    const before = readPkgFile();

    const result = await runSetTarget({ cwd, token: "1.12.4" });

    expect(result.ok).toBe(true);
    expect(result.written).toEqual([]);
    expect(result.from).toBe("1.12.4");
    expect(result.to).toBe("1.12.4");
    expect(readPkgFile()).toBe(before);
  });

  test("a garbage token is rejected, naming set-target and the accepted forms; file untouched", async () => {
    writePkg({ "defold-typescript": { "defold-target": "1.12.4" } });
    const before = readPkgFile();

    const result = await runSetTarget({ cwd, token: "nonsense" });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("set-target");
    expect(result.error).toContain("stable|beta|alpha");
    expect(result.written).toEqual([]);
    expect(readPkgFile()).toBe(before);
  });

  test("a malformed version suffix is rejected, naming set-target and the accepted forms; file untouched", async () => {
    writePkg({ "defold-typescript": { "defold-target": "1.12.4" } });
    const before = readPkgFile();

    const result = await runSetTarget({ cwd, token: "1.13.1garbage" });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("set-target");
    expect(result.error).toContain("stable|beta|alpha");
    expect(result.written).toEqual([]);
    expect(readPkgFile()).toBe(before);
  });

  test("a channel token is accepted and written, proving channels persist through validation", async () => {
    writePkg({ "defold-typescript": { "defold-target": "1.12.4" } });

    const result = await runSetTarget({ cwd, token: "beta" });

    expect(result.ok).toBe(true);
    expect(result.to).toBe("beta");
    expect(result.written).toEqual(["package.json"]);
    expect(pinOf()).toBe("beta");
  });

  test("--detected writes the detected editor version", async () => {
    writePkg({ "defold-typescript": { "defold-target": "1.12.4" } });

    const result = await runSetTarget({ cwd, detected: true, probe: probeOf("1.13.1") });

    expect(result.ok).toBe(true);
    expect(result.to).toBe("1.13.1");
    expect(result.written).toEqual(["package.json"]);
    expect(pinOf()).toBe("1.13.1");
  });

  test("--detected with no editor detected errors and never falls back to current-stable", async () => {
    writePkg({ "defold-typescript": { "defold-target": "1.12.4" } });
    const before = readPkgFile();

    const result = await runSetTarget({
      cwd,
      detected: true,
      probe: probeOf(null, [
        { path: "/Applications/Defold.app/Contents/Resources/config", reason: "missing" },
      ]),
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("no Defold editor was detected");
    expect(result.written).toEqual([]);
    expect(readPkgFile()).toBe(before);
  });

  test("a detected miss lists every path it read, with why, and names the override", async () => {
    writePkg({ "defold-typescript": { "defold-target": "1.12.4" } });
    const before = readPkgFile();
    const probed: readonly ProbedPath[] = [
      { path: "/opt/custom/Defold/config", reason: "missing" },
      { path: "/opt/custom/Defold/Contents/Resources/config", reason: "missing" },
      { path: "/home/u/Defold/config", reason: "no-version-key" },
    ];

    const result = await runSetTarget({ cwd, detected: true, probe: probeOf(null, probed) });

    expect(result.ok).toBe(false);
    expect(result.written).toEqual([]);
    expect(readPkgFile()).toBe(before);
    const error = result.error ?? "";
    // The asserted paths and reasons come from the probe's own report, so the
    // message cannot pass by restating a path list production never produced.
    for (const entry of probed) {
      expect(error).toContain(entry.path);
    }
    expect(error).toContain("missing");
    expect(error).toContain("no-version-key");
    expect(error).toContain("DEFOLD_TYPESCRIPT_EDITOR");
  });

  test("a miss that starts at the running editor reports that entry beside the config paths", async () => {
    writePkg({ "defold-typescript": { "defold-target": "1.12.4" } });
    const before = readPkgFile();
    // The shape `probeInstalledEditor` returns when no editor is open: the port
    // file leads the report, the config candidates follow.
    const probed: readonly ProbedPath[] = [
      { path: "/proj/.internal/editor.port", reason: "no-editor-open" },
      { path: "/Applications/Defold.app/Contents/Resources/config", reason: "missing" },
    ];

    const result = await runSetTarget({ cwd, detected: true, probe: probeOf(null, probed) });

    expect(result.ok).toBe(false);
    expect(result.written).toEqual([]);
    expect(readPkgFile()).toBe(before);
    const error = result.error ?? "";
    for (const entry of probed) {
      expect(error).toContain(entry.path);
      expect(error).toContain(entry.reason);
    }
  });

  test("an editor that was asked and did not answer is named in the miss report", async () => {
    writePkg({ "defold-typescript": { "defold-target": "1.12.4" } });
    const probed: readonly ProbedPath[] = [
      { path: "/proj/.internal/editor.port", reason: "no-answer" },
      { path: "/opt/Defold/config", reason: "no-version-key" },
    ];

    const result = await runSetTarget({ cwd, detected: true, probe: probeOf(null, probed) });

    expect(result.ok).toBe(false);
    const error = result.error ?? "";
    expect(error).toContain("/proj/.internal/editor.port");
    expect(error).toContain("no-answer");
  });

  // The report the abandoned-editor path actually hands over is production's
  // own, so this is the one case proving `undetectedError` can render it. The
  // hand-built shapes above pin the wording; this pins that they still describe
  // something the assembly emits.
  test("the assembly the abandoned-editor path returns renders as a miss report", async () => {
    writePkg({ "defold-typescript": { "defold-target": "1.12.4" } });
    const before = readPkgFile();
    const report = editorLaneFallback("no-answer", {
      cwd,
      platform: "darwin",
      home: () => "/home/u",
      readConfig: () => null,
    });

    const result = await runSetTarget({ cwd, detected: true, probe: async () => report });

    expect(result.ok).toBe(false);
    expect(readPkgFile()).toBe(before);
    const error = result.error ?? "";
    for (const entry of report.probed) {
      expect(error).toContain(entry.path);
      expect(error).toContain(entry.reason);
    }
    expect(error).toContain(path.join(cwd, EDITOR_PORT_FILE));
  });

  test("the two probe reasons stay distinguishable in the message", async () => {
    writePkg({ "defold-typescript": { "defold-target": "1.12.4" } });

    const missing = await runSetTarget({
      cwd,
      detected: true,
      probe: probeOf(null, [{ path: "/a/config", reason: "missing" }]),
    });
    const noKey = await runSetTarget({
      cwd,
      detected: true,
      probe: probeOf(null, [{ path: "/a/config", reason: "no-version-key" }]),
    });

    expect(missing.error).not.toBe(noKey.error);
  });

  test("a probe with no candidates at all says so instead of printing an empty list", async () => {
    writePkg({ "defold-typescript": { "defold-target": "1.12.4" } });
    const before = readPkgFile();

    const result = await runSetTarget({ cwd, detected: true, probe: probeOf(null, []) });

    expect(result.ok).toBe(false);
    expect(result.written).toEqual([]);
    expect(readPkgFile()).toBe(before);
    const error = result.error ?? "";
    expect(error).toContain("no candidate location");
    // No header stranded over an empty list: not one `<path> (<reason>)` entry.
    expect(error).not.toMatch(/\((?:missing|no-version-key|found)\)/);
  });

  test("a missing package.json is a clean error, not a throw", async () => {
    const result = await runSetTarget({ cwd, token: "1.13.1" });

    expect(result.ok).toBe(false);
    expect(result.written).toEqual([]);
    expect(result.error).toBeDefined();
  });
});

describe("runSetTarget registry membership", () => {
  const registered = loadApiTargetsRegistry().map((entry) => entry.id.replace(/^defold-/, ""));

  test("a well-formed version the registry cannot provide is rejected; file untouched", async () => {
    writePkg({ "defold-typescript": { "defold-target": "1.12.4" } });
    const before = readPkgFile();

    const result = await runSetTarget({ cwd, token: "1.42.99" });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("set-target");
    expect(result.error).toContain("1.42.99");
    expect(result.written).toEqual([]);
    expect(readPkgFile()).toBe(before);
  });

  test("the rejection lists the resolvable targets so the user can pick one", async () => {
    writePkg({ "defold-typescript": { "defold-target": "1.12.4" } });

    const result = await runSetTarget({
      cwd,
      token: "1.42.99",
      resolvableTargets: ["1.13.1", "1.12.4"],
    });

    expect(result.error).toContain("1.13.1, 1.12.4");
  });

  test("every registered version is accepted and written", async () => {
    expect(registered.length).toBeGreaterThan(0);

    for (const version of registered) {
      writePkg({ "defold-typescript": { "defold-target": "0.0.0-none" } });

      const result = await runSetTarget({ cwd, token: version });

      expect(result.ok).toBe(true);
      expect(result.written).toEqual(["package.json"]);
      expect(pinOf()).toBe(version);
    }
  });

  test("channel tokens bypass the membership check", async () => {
    for (const channel of ["stable", "beta", "alpha"]) {
      writePkg({ "defold-typescript": { "defold-target": "1.12.4" } });

      const result = await runSetTarget({ cwd, token: channel, resolvableTargets: ["1.13.1"] });

      expect(result.ok).toBe(true);
      expect(pinOf()).toBe(channel);
    }
  });

  test("--detected naming an unregistered installed version is rejected without writing", async () => {
    writePkg({ "defold-typescript": { "defold-target": "1.12.4" } });
    const before = readPkgFile();

    const result = await runSetTarget({
      cwd,
      detected: true,
      probe: probeOf("1.42.99"),
      resolvableTargets: ["1.13.1", "1.12.4"],
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("1.42.99");
    expect(result.error).toContain("1.13.1, 1.12.4");
    expect(result.written).toEqual([]);
    expect(readPkgFile()).toBe(before);
  });

  test("an unavailable registry rejects a concrete version; file untouched", async () => {
    writePkg({ "defold-typescript": { "defold-target": "1.12.4" } });
    const before = readPkgFile();

    const result = await runSetTarget({ cwd, token: "1.42.99", resolvableTargets: [] });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("API registry is unavailable");
    expect(result.written).toEqual([]);
    expect(readPkgFile()).toBe(before);
  });

  test("an unavailable registry rejects --detected too; file untouched", async () => {
    writePkg({ "defold-typescript": { "defold-target": "1.12.4" } });
    const before = readPkgFile();

    const result = await runSetTarget({
      cwd,
      detected: true,
      probe: probeOf("1.42.99"),
      resolvableTargets: [],
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("API registry is unavailable");
    expect(result.written).toEqual([]);
    expect(readPkgFile()).toBe(before);
  });

  test("channel tokens stay writable when the registry is unavailable", async () => {
    for (const channel of ["stable", "beta", "alpha"]) {
      writePkg({ "defold-typescript": { "defold-target": "1.12.4" } });

      const result = await runSetTarget({ cwd, token: channel, resolvableTargets: [] });

      expect(result.ok).toBe(true);
      expect(result.written).toEqual(["package.json"]);
      expect(pinOf()).toBe(channel);
    }
  });

  test("a token already equal to an unprovidable pin is still rejected", async () => {
    writePkg({ "defold-typescript": { "defold-target": "1.42.99" } });

    const result = await runSetTarget({ cwd, token: "1.42.99", resolvableTargets: ["1.13.1"] });

    expect(result.ok).toBe(false);
    expect(result.written).toEqual([]);
  });
});
