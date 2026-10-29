import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { transpileProject } from "@defold-typescript/transpiler";
import { LIBRARY_TYPES_ROOT } from "./package-root";
import { type AuthoredTarget, readAuthoredTargets } from "./sync-authored-types";
import { readLibraryExpectations } from "./target-expectations";

const PACKAGE_ROOT = LIBRARY_TYPES_ROOT;

const IMPORT_SPECIFIER = /^\s*import\s[^;]*?\bfrom\s+['"]([^'"]+)['"]/gm;

// A fork importing a type from a sibling fork (`wrap.node_list` from `wrap.node`) resolves
// it only when the sibling is in the program. Left out, the type is `any`, and the
// snapshot records whatever call form `any` produces instead of the declared one.
function declarationWithSiblings(
  target: AuthoredTarget,
  byModule: Map<string, AuthoredTarget>,
): Record<string, string> {
  const files: Record<string, string> = {};
  const seen = new Set([target.moduleId]);
  const pending = [target];
  for (let current = pending.pop(); current !== undefined; current = pending.pop()) {
    const declaration = readFileSync(join(PACKAGE_ROOT, current.generated), "utf8");
    files[`${current.namespace}.d.ts`] = declaration;
    for (const [, specifier] of declaration.matchAll(IMPORT_SPECIFIER)) {
      const sibling = specifier === undefined ? undefined : byModule.get(specifier);
      if (sibling === undefined || seen.has(sibling.moduleId)) continue;
      seen.add(sibling.moduleId);
      pending.push(sibling);
    }
  }
  return files;
}

describe("each shipped authored declaration emits the receiver form its expectation records", () => {
  const authored = readAuthoredTargets(PACKAGE_ROOT);
  const targets = new Map(authored.map((target) => [target.namespace, target]));
  const byModule = new Map(authored.map((target) => [target.moduleId, target]));

  for (const [namespace, { receiverEmit }] of readLibraryExpectations(PACKAGE_ROOT, "authored")) {
    if (receiverEmit === undefined) continue;

    test(`${namespace}: a consumer transpiles with the call forms the declaration produces`, () => {
      const target = targets.get(namespace);
      expect(target).toBeDefined();
      if (target === undefined) return;

      const project = transpileProject({
        files: {
          ...declarationWithSiblings(target, byModule),
          "main.ts": receiverEmit.consumer.join("\n"),
        },
      });
      const errors = project.diagnostics.filter((d) => d.category !== "warning");
      expect(errors).toEqual([]);
      expect(project.lua["main.ts"]).toMatchSnapshot(namespace);
    });
  }
});
