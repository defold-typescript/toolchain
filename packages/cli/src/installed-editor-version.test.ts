import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  detectEditorBundledJava,
  detectInstalledEditorVersion,
  EDITOR_VERSION_KEY,
  editorConfigCandidates,
  probeInstalledEditor,
} from "./installed-editor-version";

describe("editorConfigCandidates", () => {
  test("darwin returns the system and per-user .app config paths in order", () => {
    expect(editorConfigCandidates("darwin", {}, () => "/home/u")).toEqual([
      "/Applications/Defold.app/Contents/Resources/config",
      join("/home/u", "Applications", "Defold.app", "Contents", "Resources", "config"),
    ]);
  });

  test("linux returns the home and /opt config paths in order", () => {
    expect(editorConfigCandidates("linux", {}, () => "/home/u")).toEqual([
      join("/home/u", "Defold", "config"),
      "/opt/Defold/config",
    ]);
  });

  test("win32 returns a Defold/config path under each set env root and under home()", () => {
    expect(
      editorConfigCandidates(
        "win32",
        { LOCALAPPDATA: "C:\\la", PROGRAMFILES: "C:\\pf" },
        () => "C:\\u",
      ),
    ).toEqual([
      join("C:\\la", "Defold", "config"),
      join("C:\\pf", "Defold", "config"),
      join("C:\\u", "Defold", "config"),
    ]);
    expect(editorConfigCandidates("win32", { PROGRAMFILES: "C:\\pf" }, () => "C:\\u")).toEqual([
      join("C:\\pf", "Defold", "config"),
      join("C:\\u", "Defold", "config"),
    ]);
    // The home root is derived from the injected `home()`, never `env.USERPROFILE`,
    // so it survives an env with no roots set at all.
    expect(editorConfigCandidates("win32", {}, () => "C:\\u")).toEqual([
      join("C:\\u", "Defold", "config"),
    ]);
    expect(editorConfigCandidates("win32", { USERPROFILE: "C:\\other" }, () => "C:\\u")).toEqual([
      join("C:\\u", "Defold", "config"),
    ]);
  });

  test("freebsd (unknown platform) returns no candidates", () => {
    expect(editorConfigCandidates("freebsd", {}, () => "/home/u")).toEqual([]);
  });
});

describe("editorConfigCandidates with DEFOLD_TYPESCRIPT_EDITOR", () => {
  const ROOT = join("/somewhere", "else", "Defold");
  const OVERRIDE = [join(ROOT, "config"), join(ROOT, "Contents", "Resources", "config")];
  const home = (): string => "/home/u";
  // The conventional tail is read back off production for the same inputs, so a
  // change to the per-OS conventions cannot leave this test agreeing with itself.
  const conventions = (platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string[] =>
    editorConfigCandidates(platform, env, home);

  const platforms: ReadonlyArray<[NodeJS.Platform, NodeJS.ProcessEnv]> = [
    ["darwin", {}],
    ["linux", {}],
    ["win32", { LOCALAPPDATA: "C:\\la", PROGRAMFILES: "C:\\pf" }],
    ["freebsd", {}],
  ];

  for (const [platform, env] of platforms) {
    test(`${platform} puts the override's two spellings ahead of every convention`, () => {
      expect(
        editorConfigCandidates(platform, { ...env, DEFOLD_TYPESCRIPT_EDITOR: ROOT }, home),
      ).toEqual([...OVERRIDE, ...conventions(platform, env)]);
    });
  }

  test("an unrecognised platform yields the override alone rather than nothing", () => {
    expect(editorConfigCandidates("freebsd", { DEFOLD_TYPESCRIPT_EDITOR: ROOT }, home)).toEqual(
      OVERRIDE,
    );
    expect(conventions("freebsd", {})).toEqual([]);
  });

  test("unset or empty leaves the conventions alone", () => {
    for (const env of [{}, { DEFOLD_TYPESCRIPT_EDITOR: "" }]) {
      expect(editorConfigCandidates("darwin", env, home)).toEqual(conventions("darwin", {}));
      expect(editorConfigCandidates("linux", env, home)).toEqual(conventions("linux", {}));
    }
  });
});

describe("probeInstalledEditor", () => {
  const home = (): string => "/home/u";

  test("reports every path it read, in order, with why each yielded no version", () => {
    const candidates = editorConfigCandidates("darwin", {}, home);
    const bodies: Record<string, string | null> = {
      // First candidate is unreadable, second reads but carries no version key.
      [candidates[0] as string]: null,
      [candidates[1] as string]: "display_name = Defold\ntimestamp = 0\n",
    };
    const result = probeInstalledEditor({
      platform: "darwin",
      home,
      readConfig: (p) => bodies[p] ?? null,
    });

    expect(result.version).toBeNull();
    expect(result.probed).toEqual([
      { path: candidates[0] as string, reason: "missing" },
      { path: candidates[1] as string, reason: "no-version-key" },
    ]);
  });

  test("a hit short-circuits, so the report ends at the successful candidate", () => {
    const candidates = editorConfigCandidates("darwin", {}, home);
    const result = probeInstalledEditor({
      platform: "darwin",
      home,
      readConfig: (p) => (p === candidates[0] ? "version = 1.12.4\n" : "version = 1.9.8\n"),
    });

    expect(result.version).toBe("1.12.4");
    expect(result.probed).toEqual([{ path: candidates[0] as string, reason: "found" }]);
  });

  test("the report names the paths the reader was actually called with", () => {
    const calls: string[] = [];
    const result = probeInstalledEditor({
      platform: "linux",
      home,
      readConfig: (p) => {
        calls.push(p);
        return null;
      },
    });

    expect(result.probed.map((entry) => entry.path)).toEqual(calls);
    expect(calls).toEqual(editorConfigCandidates("linux", {}, home));
  });

  test("an override root is the first thing reported", () => {
    const root = "/opt/custom/Defold";
    const result = probeInstalledEditor({
      platform: "win32",
      env: { DEFOLD_TYPESCRIPT_EDITOR: root, PROGRAMFILES: "C:\\pf" },
      home: () => "C:\\u",
      readConfig: () => null,
    });

    expect(result.version).toBeNull();
    expect(result.probed[0]?.path).toBe(join(root, "config"));
    expect(result.probed.map((entry) => entry.path)).toEqual(
      editorConfigCandidates(
        "win32",
        { DEFOLD_TYPESCRIPT_EDITOR: root, PROGRAMFILES: "C:\\pf" },
        () => "C:\\u",
      ),
    );
  });

  test("no candidates at all is an empty report, not a fabricated one", () => {
    const result = probeInstalledEditor({
      platform: "freebsd",
      home,
      readConfig: () => "version = 1.12.4",
    });

    expect(result.version).toBeNull();
    expect(result.probed).toEqual([]);
  });
});

describe("detectInstalledEditorVersion", () => {
  test("returns the version from the first candidate whose config has a version key", () => {
    const readConfig = (p: string): string | null => {
      if (p === "/Applications/Defold.app/Contents/Resources/config") {
        return "version = 1.12.4\n";
      }
      return null;
    };
    expect(
      detectInstalledEditorVersion({ platform: "darwin", home: () => "/home/u", readConfig }),
    ).toBe("1.12.4");
  });

  test("tolerates surrounding keys and whitespace around the version key", () => {
    const body = "\n  other = 9 \nversion   =   1.10.0  \n[rest]\n";
    expect(
      detectInstalledEditorVersion({
        platform: "darwin",
        home: () => "/home/u",
        readConfig: () => body,
      }),
    ).toBe("1.10.0");
  });

  test("returns the first candidate's version and stops probing (first hit wins)", () => {
    const calls: string[] = [];
    const readConfig = (p: string): string | null => {
      calls.push(p);
      if (p === "/Applications/Defold.app/Contents/Resources/config") {
        return "version = 1.12.4";
      }
      if (p.startsWith("/home/u/")) {
        return "version = 1.9.8";
      }
      return null;
    };
    const result = detectInstalledEditorVersion({
      platform: "darwin",
      home: () => "/home/u",
      readConfig,
    });
    expect(result).toBe("1.12.4");
    // First candidate already has a version, so subsequent candidates must
    // not be probed — first-hit precedence is the contract.
    expect(calls).toEqual(["/Applications/Defold.app/Contents/Resources/config"]);
  });

  test("returns null when no candidate has a readable config", () => {
    expect(
      detectInstalledEditorVersion({
        platform: "darwin",
        home: () => "/home/u",
        readConfig: () => null,
      }),
    ).toBeNull();
  });

  test("returns null when a candidate body has no version key", () => {
    expect(
      detectInstalledEditorVersion({
        platform: "darwin",
        home: () => "/home/u",
        readConfig: () => "display_name = Defold\ntimestamp = 0\n",
      }),
    ).toBeNull();
  });

  test("returns null on an unknown platform (no candidates to probe)", () => {
    expect(
      detectInstalledEditorVersion({
        platform: "freebsd",
        home: () => "/home/u",
        readConfig: () => "version = 1.12.4",
      }),
    ).toBeNull();
  });

  test("is the probe's version for the same inputs (hit, miss, and no-version-key)", () => {
    const home = (): string => "/home/u";
    const cases: ReadonlyArray<(p: string) => string | null> = [
      // hit
      (p) =>
        p === "/Applications/Defold.app/Contents/Resources/config" ? "version = 1.12.4" : null,
      // miss — nothing readable anywhere
      () => null,
      // readable, but no version key
      () => "display_name = Defold\n",
    ];
    for (const readConfig of cases) {
      const opts = { platform: "darwin" as NodeJS.Platform, home, readConfig };
      expect(detectInstalledEditorVersion(opts)).toBe(probeInstalledEditor(opts).version);
    }
  });

  test("uses process.platform / process.env / homedir when no opts are passed", () => {
    // Default homedir() is real, but no candidate file exists in CI, so we
    // just verify the integration wires through without throwing.
    const result = detectInstalledEditorVersion();
    expect(result === null || typeof result === "string").toBe(true);
    // Suppress unused-import lint for homedir in case the build tool runs strict.
    expect(typeof homedir()).toBe("string");
  });
});

describe("detectEditorBundledJava", () => {
  const RESOURCES = "/Applications/Defold.app/Contents/Resources";
  const PACKAGES = join(RESOURCES, "packages");
  const JDK = "jdk-17.0.5+8";
  const JAVA = join(PACKAGES, JDK, "bin", "java");

  test("returns the bundled java under packages/jdk-*/bin for the first editor root", () => {
    const result = detectEditorBundledJava({
      platform: "darwin",
      home: () => "/home/u",
      listDir: (dir) => (dir === PACKAGES ? [JDK] : []),
      exists: (p) => p === JAVA,
    });
    expect(result).toBe(JAVA);
  });

  test("probes java.exe on win32", () => {
    const packages = join("C:\\pf", "Defold", "packages");
    const javaExe = join(packages, JDK, "bin", "java.exe");
    const result = detectEditorBundledJava({
      platform: "win32",
      env: { PROGRAMFILES: "C:\\pf" },
      home: () => "C:\\u",
      listDir: (dir) => (dir === packages ? [JDK] : []),
      exists: (p) => p === javaExe,
    });
    expect(result).toBe(javaExe);
  });

  test("returns null when no editor config candidate resolves", () => {
    expect(
      detectEditorBundledJava({
        platform: "freebsd",
        home: () => "/home/u",
        listDir: () => [JDK],
        exists: () => true,
      }),
    ).toBeNull();
  });

  test("returns null when packages/ has no jdk-* entry", () => {
    expect(
      detectEditorBundledJava({
        platform: "darwin",
        home: () => "/home/u",
        listDir: () => ["shared", "bob"],
        exists: () => true,
      }),
    ).toBeNull();
  });

  test("returns null when the jdk-*/bin/java binary is absent", () => {
    expect(
      detectEditorBundledJava({
        platform: "darwin",
        home: () => "/home/u",
        listDir: (dir) => (dir === PACKAGES ? [JDK] : []),
        exists: () => false,
      }),
    ).toBeNull();
  });

  test("follows DEFOLD_TYPESCRIPT_EDITOR to <override>/packages/jdk-*/bin/java", () => {
    const root = "/opt/custom/Defold";
    const packages = join(root, "packages");
    const java = join(packages, JDK, "bin", "java");
    const result = detectEditorBundledJava({
      platform: "linux",
      env: { DEFOLD_TYPESCRIPT_EDITOR: root },
      home: () => "/home/u",
      listDir: (dir) => (dir === packages ? [JDK] : []),
      exists: (p) => p === java,
    });
    expect(result).toBe(java);
  });

  test("follows the override's Contents/Resources bundle spelling too", () => {
    const root = "/opt/custom/Defold.app";
    const packages = join(root, "Contents", "Resources", "packages");
    const java = join(packages, JDK, "bin", "java");
    const result = detectEditorBundledJava({
      platform: "darwin",
      env: { DEFOLD_TYPESCRIPT_EDITOR: root },
      home: () => "/home/u",
      listDir: (dir) => (dir === packages ? [JDK] : []),
      exists: (p) => p === java,
    });
    expect(result).toBe(java);
  });

  test("the override wins over a conventional install that also has a jdk", () => {
    const root = "/opt/custom/Defold";
    const overridePackages = join(root, "packages");
    const overrideJava = join(overridePackages, JDK, "bin", "java");
    const conventionalJava = join(PACKAGES, JDK, "bin", "java");
    const result = detectEditorBundledJava({
      platform: "darwin",
      env: { DEFOLD_TYPESCRIPT_EDITOR: root },
      home: () => "/home/u",
      listDir: (dir) => (dir === overridePackages || dir === PACKAGES ? [JDK] : []),
      exists: (p) => p === overrideJava || p === conventionalJava,
    });
    expect(result).toBe(overrideJava);
  });
});

describe("EDITOR_VERSION_KEY", () => {
  test("is the literal string 'version'", () => {
    expect(EDITOR_VERSION_KEY).toBe("version");
  });
});
