import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ModuleManifestEntry } from "./regen";
import { restoreSharedHandleMethods, SHARED_HANDLE_METHODS } from "./shared-handle-methods";

const method = (name: string, returns: readonly string[] = ["number"]) => ({
  type: "FUNCTION",
  name,
  brief: "",
  description: "",
  parameters: [],
  returnvalues: returns.map((types, index) => ({ name: `r${index}`, doc: "", types: [types] })),
});

const socket = (names: readonly string[]): ModuleManifestEntry => ({
  namespace: "socket",
  outFile: "socket.d.ts",
  doc: { info: { namespace: "socket" }, elements: names.map((name) => method(name)) },
});

const names = (entry: ModuleManifestEntry | undefined): string[] =>
  ((entry?.doc as { elements: { name: string }[] }).elements ?? []).map((e) => e.name).sort();

describe("restoreSharedHandleMethods", () => {
  test("restores a method the doc omits from a handle, cloned from the one that documents it", () => {
    const [restored] = restoreSharedHandleMethods([socket(["client:getstats"])]);
    expect(names(restored)).toContain("master:getstats");
    expect(names(restored)).toContain("server:getstats");
    const clone = (restored?.doc as { elements: ReturnType<typeof method>[] }).elements.find(
      (e) => e.name === "master:getstats",
    );
    expect(clone?.returnvalues).toEqual(method("client:getstats").returnvalues);
  });

  test("leaves a doc that documents every handle's method untouched", () => {
    const entry = socket(["client:getstats", "master:getstats", "server:getstats"]);
    const [restored] = restoreSharedHandleMethods([entry]);
    expect(restored).toBe(entry);
  });

  test("restores nothing when no handle documents the method", () => {
    const [restored] = restoreSharedHandleMethods([socket(["client:close"])]);
    expect(names(restored)).toEqual(["client:close"]);
  });
});

// Every entry must be omitted by some committed release and documented on its
// source handle by that same release, or the entry restores nothing anywhere.
test("each shared method is restored somewhere and documented on its source there", () => {
  const PACKAGE_ROOT = resolve(import.meta.dir, "..");
  const targets = (
    JSON.parse(readFileSync(resolve(PACKAGE_ROOT, "api-targets.json"), "utf8")) as {
      targets: {
        fixturesDir: string;
        source?: unknown;
        modules: { namespace: string; fixture: string }[];
      }[];
    }
  ).targets.filter((target) => target.source == null);
  const unused = SHARED_HANDLE_METHODS.filter(
    ({ namespace, method: local, source, handles }) =>
      !targets.some((target) => {
        const module = target.modules.find((m) => m.namespace === namespace);
        if (module === undefined) return false;
        const doc = JSON.parse(
          readFileSync(resolve(PACKAGE_ROOT, target.fixturesDir, module.fixture), "utf8"),
        ) as { elements: { name: string }[] };
        const declared = new Set(doc.elements.map((e) => e.name));
        return (
          declared.has(`${source}:${local}`) &&
          handles.some((handle) => !declared.has(`${handle}:${local}`))
        );
      }),
  );
  expect(unused).toEqual([]);
});
