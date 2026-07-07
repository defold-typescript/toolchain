import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  detectEditorBundledJava,
  detectInstalledEditorVersion,
  EDITOR_VERSION_KEY,
  editorConfigCandidates,
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

  test("win32 returns a Defold/config path under each set env root, skipping unset ones", () => {
    expect(
      editorConfigCandidates(
        "win32",
        { LOCALAPPDATA: "C:\\la", PROGRAMFILES: "C:\\pf" },
        () => "C:\\u",
      ),
    ).toEqual([join("C:\\la", "Defold", "config"), join("C:\\pf", "Defold", "config")]);
    expect(editorConfigCandidates("win32", { PROGRAMFILES: "C:\\pf" }, () => "C:\\u")).toEqual([
      join("C:\\pf", "Defold", "config"),
    ]);
    expect(editorConfigCandidates("win32", {}, () => "C:\\u")).toEqual([]);
  });

  test("freebsd (unknown platform) returns no candidates", () => {
    expect(editorConfigCandidates("freebsd", {}, () => "/home/u")).toEqual([]);
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
});

describe("EDITOR_VERSION_KEY", () => {
  test("is the literal string 'version'", () => {
    expect(EDITOR_VERSION_KEY).toBe("version");
  });
});
