import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { buildNativeParity, nativeParityPath, renderNativeParity } from "./native-parity";
import { type NativeTarget, readNativeTargets } from "./sync-native-types";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");
const TARGETS = readNativeTargets(PACKAGE_ROOT);

function target(namespace: string): NativeTarget {
  const found = TARGETS.find((entry) => entry.namespace === namespace);
  if (found === undefined) throw new Error(`no native target ${namespace}`);
  return found;
}

describe("buildNativeParity over the shipped declarations", () => {
  const UPSTREAM_COUNTS: Record<string, [functions: number, constants: number]> = {
    daabbcc: [18, 3],
    tile_raycast: [5, 4],
    share: [3, 0],
    uuid4: [1, 0],
  };

  test("every native target is measured", () => {
    expect(TARGETS.map((entry) => entry.namespace).sort()).toEqual(
      Object.keys(UPSTREAM_COUNTS).sort(),
    );
  });

  for (const [namespace, [functions, constants]] of Object.entries(UPSTREAM_COUNTS)) {
    test(`${namespace}: names exactly what its C++ registers, on both axes`, () => {
      const report = buildNativeParity(PACKAGE_ROOT, target(namespace));
      expect(report.namespace).toBe(namespace);
      expect(report.moduleName).toBe(namespace);
      expect(report.moduleNameMatches).toBe(true);
      expect(report.upstreamFunctions).toBe(functions);
      expect(report.declaredFunctions).toBe(functions);
      expect(report.missingFunctions).toEqual([]);
      expect(report.phantomFunctions).toEqual([]);
      expect(report.callableCoverage).toBe(1);
      expect(report.upstreamConstants).toBe(constants);
      expect(report.declaredConstants).toBe(constants);
      expect(report.missingConstants).toEqual([]);
      expect(report.phantomConstants).toEqual([]);
      expect(report.fieldCoverage).toBe(1);
    });
  }
});

describe("buildNativeParity over a declaration that drifted from its C++", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  function tempRoot(entry: NativeTarget, declaration: string): string {
    const root = mkdtempSync(join(tmpdir(), "native-parity-"));
    roots.push(root);
    mkdirSync(dirname(join(root, entry.declaration)), { recursive: true });
    writeFileSync(join(root, entry.declaration), declaration);
    mkdirSync(dirname(join(root, entry.upstreamSource)), { recursive: true });
    cpSync(join(PACKAGE_ROOT, entry.upstreamSource), join(root, entry.upstreamSource));
    return root;
  }

  test("a dropped function is missing and an invented one is phantom", () => {
    const entry = target("daabbcc");
    const shipped = readFileSync(join(PACKAGE_ROOT, entry.declaration), "utf8");
    const drifted = shipped.replace("function reset(): void;", "function init(): void;");
    expect(drifted).not.toBe(shipped);
    const report = buildNativeParity(tempRoot(entry, drifted), entry);
    expect(report.missingFunctions).toEqual(["reset"]);
    expect(report.phantomFunctions).toEqual(["init"]);
    expect(report.callableCoverage).toBe(Math.round((17 / 18) * 10_000) / 10_000);
    expect(report.fieldCoverage).toBe(1);
  });

  test("a dropped and an invented constant land on the field axis alone", () => {
    const entry = target("tile_raycast");
    const shipped = readFileSync(join(PACKAGE_ROOT, entry.declaration), "utf8");
    const drifted = shipped.replace(/\bLEFT\b/g, "WEST");
    expect(drifted).not.toBe(shipped);
    const report = buildNativeParity(tempRoot(entry, drifted), entry);
    expect(report.missingConstants).toEqual(["LEFT"]);
    expect(report.phantomConstants).toEqual(["WEST"]);
    expect(report.fieldCoverage).toBe(0.75);
    expect(report.callableCoverage).toBe(1);
  });

  test("a declaration under a namespace other than the registered module name", () => {
    const shipped = target("uuid4");
    const entry: NativeTarget = {
      ...shipped,
      namespace: "uuid",
      declaration: "generated/native/uuid.d.ts",
    };
    const source = readFileSync(join(PACKAGE_ROOT, shipped.declaration), "utf8");
    const renamed = source.replace(/namespace uuid4\b/, "namespace uuid");
    expect(renamed).not.toBe(source);
    const report = buildNativeParity(tempRoot(entry, renamed), entry);
    expect(report.moduleName).toBe("uuid4");
    expect(report.moduleNameMatches).toBe(false);
    expect(report.callableCoverage).toBe(1);
  });
});

describe("the committed native parity reports", () => {
  test("every committed report equals a fresh build", () => {
    const drifted = TARGETS.filter((entry) => {
      const committed = readFileSync(join(PACKAGE_ROOT, nativeParityPath(entry)), "utf8");
      return committed !== renderNativeParity(buildNativeParity(PACKAGE_ROOT, entry));
    }).map(
      (entry) =>
        `${nativeParityPath(entry)} is stale — run \`bun run --cwd packages/library-types parity\``,
    );
    expect(drifted).toEqual([]);
  });
});
