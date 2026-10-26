import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { transpileProject } from "@defold-typescript/transpiler";
import { readAuthoredTargets } from "./sync-authored-types";
import { readLibraryExpectations } from "./target-expectations";

const PACKAGE_ROOT = join(import.meta.dir, "..");

describe("each shipped authored declaration emits the receiver form its expectation records", () => {
  const targets = new Map(
    readAuthoredTargets(PACKAGE_ROOT).map((target) => [target.namespace, target]),
  );

  for (const [namespace, { receiverEmit }] of readLibraryExpectations(PACKAGE_ROOT, "authored")) {
    if (receiverEmit === undefined) continue;

    test(`${namespace}: a consumer transpiles with the call forms the declaration produces`, () => {
      const target = targets.get(namespace);
      expect(target).toBeDefined();
      const declaration = readFileSync(join(PACKAGE_ROOT, target?.generated ?? ""), "utf8");

      const project = transpileProject({
        files: { [`${namespace}.d.ts`]: declaration, "main.ts": receiverEmit.consumer.join("\n") },
      });
      const errors = project.diagnostics.filter((d) => d.category !== "warning");
      expect(errors).toEqual([]);
      expect(project.lua["main.ts"]).toMatchSnapshot(namespace);
    });
  }
});
