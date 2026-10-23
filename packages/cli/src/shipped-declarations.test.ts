import { describe, expect, test } from "bun:test";
import { resolveTypesPackageRoot } from "./api-registry";
import { checkShippedDeclarations, locateShippedDeclarations } from "./shipped-declarations";

function typesRoot(): string {
  const root = resolveTypesPackageRoot();
  if (root === null) {
    throw new Error("@defold-typescript/types is not resolvable from the CLI package");
  }
  return root;
}

const OK_MODULE = `declare module "ok" {
  export function measure(buf: ReturnType<typeof buffer.create>): LuaMultiReturn<[number, number]>;
}
`;

const OK_GLOBAL = `declare const okglobal: typeof import("ok");
`;

const BAD_MODULE = `declare module "bad" {
  export function take(h: hash): void;
}
`;

describe("locateShippedDeclarations", () => {
  test("keeps only the root types/*.d.ts entries under the archive wrapper", () => {
    expect(
      locateShippedDeclarations([
        "repo-main/types/pixels.global.d.ts",
        "repo-main/types/sub/x.d.ts",
        "repo-main/src/y.d.ts",
        "repo-main/types/notes.md",
        "repo-main/game.project",
        "repo-main/types/pixels.d.ts",
      ]),
    ).toEqual(["repo-main/types/pixels.d.ts", "repo-main/types/pixels.global.d.ts"]);
  });

  test("reads an archive with no wrapper directory from its root", () => {
    expect(locateShippedDeclarations(["types/a.d.ts", "README.md"])).toEqual(["types/a.d.ts"]);
  });

  test("returns nothing for an archive with no types folder", () => {
    expect(locateShippedDeclarations(["repo-main/game.project", "repo-main/main/x.lua"])).toEqual(
      [],
    );
  });
});

describe("checkShippedDeclarations", () => {
  test("accepts a module that uses the engine surface", () => {
    const result = checkShippedDeclarations([{ id: "ok", contents: OK_MODULE }], typesRoot());
    expect(result.get("ok")).toEqual([]);
  });

  test("accepts a global script file that reads the module it ships beside", () => {
    const result = checkShippedDeclarations(
      [
        { id: "ok", contents: OK_MODULE },
        { id: "okglobal", contents: OK_GLOBAL },
      ],
      typesRoot(),
    );
    expect(result.get("ok")).toEqual([]);
    expect(result.get("okglobal")).toEqual([]);
  });

  test("rejects a type name the engine surface does not declare", () => {
    const result = checkShippedDeclarations([{ id: "bad", contents: BAD_MODULE }], typesRoot());
    const messages = result.get("bad") ?? [];
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatch(/^bad\(2,\d+\): .*'hash'/);
  });

  test("rejects a file with a syntax error", () => {
    const result = checkShippedDeclarations(
      [{ id: "broken", contents: 'declare module "broken" {\n' }],
      typesRoot(),
    );
    expect((result.get("broken") ?? []).length).toBeGreaterThan(0);
  });

  test("attributes a diagnostic to the file that caused it", () => {
    const result = checkShippedDeclarations(
      [
        { id: "ok", contents: OK_MODULE },
        { id: "bad", contents: BAD_MODULE },
      ],
      typesRoot(),
    );
    expect(result.get("ok")).toEqual([]);
    expect(result.get("bad")).toHaveLength(1);
  });
});
