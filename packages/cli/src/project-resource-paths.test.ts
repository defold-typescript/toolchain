import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { findNativeExtensionManifest } from "./project-resource-paths";

let root = "";

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "dt-native-ext-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function writeManifest(folder: string): void {
  const dir = path.join(root, ...folder.split("/"));
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "ext.manifest"), "name: drawpixels\n");
}

describe("findNativeExtensionManifest", () => {
  test("returns the project-relative POSIX folder of an ext.manifest", () => {
    writeManifest("extensions/drawpixels");
    expect(findNativeExtensionManifest(root)).toBe("extensions/drawpixels");
  });

  test('returns "." for an ext.manifest at the project root', () => {
    writeManifest(".");
    expect(findNativeExtensionManifest(root)).toBe(".");
  });

  test.each([
    "build/arm64-osx",
    ".internal/lib",
    ".git/x",
    "node_modules/x",
    "assets/node_modules/x",
    ".defold-types",
  ])("skips an ext.manifest under %s", (folder) => {
    writeManifest(folder);
    expect(findNativeExtensionManifest(root)).toBeNull();
  });

  test("skips a folder the project's .defignore lists", () => {
    writeManifest("extensions/drawpixels");
    writeFileSync(path.join(root, ".defignore"), "/extensions\n");
    expect(findNativeExtensionManifest(root)).toBeNull();
  });

  test("returns null for a project root that does not exist", () => {
    expect(findNativeExtensionManifest(path.join(root, "missing"))).toBeNull();
  });
});
