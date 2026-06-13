import { describe, expect, test } from "bun:test";
import { findMainEntryFactoryImports } from "./main-entry-factory-imports";

describe("findMainEntryFactoryImports", () => {
  test("flags a factory imported from the bare main entry", () => {
    expect(
      findMainEntryFactoryImports(
        "a.ts",
        'import { defineGuiScript } from "@defold-typescript/types";',
      ),
    ).toEqual(["defineGuiScript"]);
  });

  test("never flags the sanctioned kind-subpath import", () => {
    expect(
      findMainEntryFactoryImports(
        "a.ts",
        'import { defineGuiScript } from "@defold-typescript/types/gui-script";',
      ),
    ).toEqual([]);
  });

  test("ignores a non-factory named import from the main entry", () => {
    expect(
      findMainEntryFactoryImports("a.ts", 'import { vmath } from "@defold-typescript/types";'),
    ).toEqual([]);
  });

  test("reports an aliased factory by its imported name", () => {
    expect(
      findMainEntryFactoryImports(
        "a.ts",
        'import { defineScript as ds } from "@defold-typescript/types";',
      ),
    ).toEqual(["defineScript"]);
  });

  test("reports every matched factory in a multi-name import", () => {
    expect(
      findMainEntryFactoryImports(
        "a.ts",
        'import { defineScript, defineGuiScript } from "@defold-typescript/types";',
      ),
    ).toEqual(["defineScript", "defineGuiScript"]);
  });
});
