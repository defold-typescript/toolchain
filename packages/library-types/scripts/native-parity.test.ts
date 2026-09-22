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

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A package root holding `entry`'s vendored upstream verbatim and `declaration` in
 * place of the shipped one, so a test can drift one side and measure the other. Every
 * upstream path the target names is copied — a target whose annotation were left behind
 * would fail on the read rather than on what the test asserts. */
function tempRoot(entry: NativeTarget, declaration: string): string {
  const root = mkdtempSync(join(tmpdir(), "native-parity-"));
  roots.push(root);
  for (const relative of [entry.upstreamSource, entry.upstreamAnnotation]) {
    if (relative === undefined) continue;
    mkdirSync(dirname(join(root, relative)), { recursive: true });
    cpSync(join(PACKAGE_ROOT, relative), join(root, relative));
  }
  mkdirSync(dirname(join(root, entry.declaration)), { recursive: true });
  writeFileSync(join(root, entry.declaration), declaration);
  return root;
}

/** The shipped declaration of `namespace`, the starting point for a drift. */
function shippedDeclaration(entry: NativeTarget): string {
  return readFileSync(join(PACKAGE_ROOT, entry.declaration), "utf8");
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
  test("a dropped function is missing and an invented one is phantom", () => {
    const entry = target("daabbcc");
    const shipped = shippedDeclaration(entry);
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
    const shipped = shippedDeclaration(entry);
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

describe("the arity axis, read from the shipped LuaLS annotation", () => {
  test("a target naming no annotation reports the axis unmeasured, with no lists", () => {
    for (const namespace of ["uuid4", "tile_raycast"]) {
      const report = buildNativeParity(PACKAGE_ROOT, target(namespace));
      expect(report.arityMeasured).toBe(false);
      expect(report.arityMismatches).toBeUndefined();
      expect(report.arityExceptions).toBeUndefined();
      expect(report.annotationDrift).toBeUndefined();
    }
  });

  test("share agrees with its annotation on every shared name", () => {
    const report = buildNativeParity(PACKAGE_ROOT, target("share"));
    expect(report.arityMeasured).toBe(true);
    expect(report.arityMismatches).toEqual([]);
    expect(report.arityExceptions).toEqual([]);
    expect(report.annotationDrift).toEqual({ unregistered: [], undeclared: [] });
  });

  test("daabbcc charges nothing beyond its one recorded exception", () => {
    const report = buildNativeParity(PACKAGE_ROOT, target("daabbcc"));
    expect(report.arityMeasured).toBe(true);
    expect(report.arityMismatches).toEqual([]);
    expect(report.annotationDrift).toEqual({ unregistered: [], undeclared: [] });
    expect(report.arityExceptions).toEqual([
      {
        name: "rebuild_all",
        upstream: 1,
        declared: 2,
        reason: (target("daabbcc").annotationArityExceptions ?? [])[0]?.reason as string,
      },
    ]);
  });

  test("a declaration that drops a parameter is charged at the widest shape it offers", () => {
    const entry = target("share");
    const shipped = shippedDeclaration(entry);
    const narrowed = shipped.replace(
      /function image\([^)]*\)/,
      "function image(bytes: string): void",
    );
    expect(narrowed).not.toBe(shipped);
    const report = buildNativeParity(tempRoot(entry, narrowed), entry);
    expect(report.arityMismatches).toEqual([{ name: "image", upstream: 3, declared: 1 }]);
    expect(report.callableCoverage).toBe(1);
  });

  test("an exception the declaration no longer needs is refused as stale", () => {
    const entry = target("daabbcc");
    const shipped = shippedDeclaration(entry);
    const conformed = shipped.replace(
      "function rebuild_all(_unused: undefined, full_build: boolean): void;",
      "function rebuild_all(full_build: boolean): void;",
    );
    expect(conformed).not.toBe(shipped);
    expect(() => buildNativeParity(tempRoot(entry, conformed), entry)).toThrow(
      /rebuild_all.*agrees/s,
    );
  });

  test("names on only one side are drift, not a coverage or arity charge", () => {
    const entry = target("share");
    const root = tempRoot(entry, shippedDeclaration(entry));
    const annotation = join(root, entry.upstreamAnnotation as string);
    writeFileSync(
      annotation,
      `${readFileSync(annotation, "utf8")}\nfunction share.preview(path) end\n`,
    );
    const report = buildNativeParity(root, entry);
    expect(report.annotationDrift).toEqual({ unregistered: ["preview"], undeclared: [] });
    expect(report.arityMismatches).toEqual([]);
    expect(report.callableCoverage).toBe(1);
    expect(report.phantomFunctions).toEqual([]);
  });

  test("a name the C++ registers that the annotation omits is drift on the other side", () => {
    const entry = target("share");
    const root = tempRoot(entry, shippedDeclaration(entry));
    const annotation = join(root, entry.upstreamAnnotation as string);
    writeFileSync(
      annotation,
      readFileSync(annotation, "utf8").replace(/^function share\.file\(.*$/m, ""),
    );
    const report = buildNativeParity(root, entry);
    expect(report.annotationDrift).toEqual({ unregistered: [], undeclared: ["file"] });
    expect(report.arityMismatches).toEqual([]);
    expect(report.callableCoverage).toBe(1);
  });
});
