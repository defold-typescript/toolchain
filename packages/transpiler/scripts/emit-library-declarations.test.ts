import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { BUNDLED_LIBRARIES, bundledModules } from "../src/bundled-libraries";
import {
  emitLibraryDeclarations,
  libraryDeclarationsDir,
  libraryRuntimeCopies,
  libraryRuntimeDir,
  REGENERATE_DECLARATIONS,
} from "./emit-library-declarations";

const TYPES_PACKAGE = "@defold-typescript/types";

describe.each(BUNDLED_LIBRARIES.map((library) => ({ library, id: library.id })))(
  "$id declarations in @defold-typescript/types",
  ({ library, id }) => {
    const emitted = emitLibraryDeclarations(library);
    const dir = libraryDeclarationsDir(library);
    const runtimeDir = libraryRuntimeDir(library);
    const typesRoot = path.dirname(dir);

    test("every module's committed declaration equals a fresh emit", () => {
      for (const { name } of bundledModules(library)) {
        const file = path.join(dir, `${name}.d.ts`);
        const committed = existsSync(file) ? readFileSync(file, "utf8") : undefined;
        expect(
          committed,
          `packages/types/${id}/${name}.d.ts is stale; run ${REGENERATE_DECLARATIONS}`,
        ).toBe(emitted[name]);
      }
    });

    test(`the folder holds no declaration for a module ${id} does not ship`, () => {
      const expected = bundledModules(library).map(({ name }) => `${name}.d.ts`);
      const present = existsSync(dir)
        ? readdirSync(dir).filter((entry) => entry.endsWith(".d.ts"))
        : [];
      expect(
        present.sort(),
        `packages/types/${id}/ drifted; run ${REGENERATE_DECLARATIONS}`,
      ).toEqual([...expected].sort());
    });

    test("every module's committed runtime copy equals its source", () => {
      const copies = libraryRuntimeCopies(library);
      for (const { name } of bundledModules(library)) {
        const file = path.join(runtimeDir, `${name}.ts`);
        const committed = existsSync(file) ? readFileSync(file, "utf8") : undefined;
        expect(
          committed,
          `packages/types/${id}/runtime/${name}.ts is stale; run ${REGENERATE_DECLARATIONS}`,
        ).toBe(copies[name]);
      }
    });

    test(`the runtime folder holds no copy of a module ${id} does not ship`, () => {
      const expected = bundledModules(library).map(({ name }) => `${name}.ts`);
      const present = existsSync(runtimeDir) ? readdirSync(runtimeDir) : [];
      expect(
        present.sort(),
        `packages/types/${id}/runtime/ drifted; run ${REGENERATE_DECLARATIONS}`,
      ).toEqual([...expected].sort());
    });

    test("the types package exports every module with a types and a bun condition", () => {
      const pkg = JSON.parse(readFileSync(path.join(typesRoot, "package.json"), "utf8")) as {
        exports: Record<string, Record<string, string> | string>;
      };
      for (const { name, specifier } of bundledModules(library)) {
        const key = `.${specifier.slice(TYPES_PACKAGE.length)}`;
        const entry = pkg.exports[key];
        expect(entry, `packages/types/package.json exports ${key}`).toEqual({
          types: `./${id}/${name}.d.ts`,
          bun: `./${id}/runtime/${name}.ts`,
        });
        expect(Object.keys(entry as object), `${key} lists types before bun`).toEqual([
          "types",
          "bun",
        ]);
        for (const target of Object.values(entry as Record<string, string>)) {
          expect(existsSync(path.join(typesRoot, target)), `${key} -> ${target} exists`).toBe(true);
        }
      }
    });
  },
);
