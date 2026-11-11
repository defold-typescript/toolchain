import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { BUNDLED_LIBRARIES, bundledModules } from "../src/bundled-libraries";
import {
  emitLibraryDeclarations,
  libraryDeclarationsDir,
  REGENERATE_DECLARATIONS,
} from "./emit-library-declarations";

describe.each(BUNDLED_LIBRARIES.map((library) => ({ library, id: library.id })))(
  "$id declarations in @defold-typescript/types",
  ({ library, id }) => {
    const emitted = emitLibraryDeclarations(library);
    const dir = libraryDeclarationsDir(library);

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
  },
);
