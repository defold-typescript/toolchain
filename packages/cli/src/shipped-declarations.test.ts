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

  test("skips a file name holding a backslash", () => {
    expect(
      locateShippedDeclarations(["repo-main/types/ok.d.ts", "repo-main/types/..\\..\\evil.d.ts"]),
    ).toEqual(["repo-main/types/ok.d.ts"]);
  });
});

describe("checkShippedDeclarations", () => {
  const OK = "repo-main/types/ok.d.ts";
  const OK_GLOBAL_ENTRY = "repo-main/types/okglobal.d.ts";
  const BAD = "repo-main/types/bad.d.ts";

  test("accepts a module that uses the engine surface", () => {
    const result = checkShippedDeclarations([{ entry: OK, contents: OK_MODULE }], typesRoot());
    expect(result.get(OK)).toEqual([]);
  });

  test("accepts a global script file that reads the module it ships beside", () => {
    const result = checkShippedDeclarations(
      [
        { entry: OK, contents: OK_MODULE },
        { entry: OK_GLOBAL_ENTRY, contents: OK_GLOBAL },
      ],
      typesRoot(),
    );
    expect(result.get(OK)).toEqual([]);
    expect(result.get(OK_GLOBAL_ENTRY)).toEqual([]);
  });

  test("rejects a type name the engine surface does not declare", () => {
    const result = checkShippedDeclarations([{ entry: BAD, contents: BAD_MODULE }], typesRoot());
    const messages = result.get(BAD) ?? [];
    expect(messages).toHaveLength(1);
    expect(messages[0]?.startsWith(`${BAD}(`)).toBe(true);
    expect(messages[0]).toMatch(/\(2,\d+\): .*'hash'/);
  });

  test("rejects a file with a syntax error", () => {
    const broken = "repo-main/types/broken.d.ts";
    const result = checkShippedDeclarations(
      [{ entry: broken, contents: 'declare module "broken" {\n' }],
      typesRoot(),
    );
    const messages = result.get(broken) ?? [];
    expect(messages.length).toBeGreaterThan(0);
    expect(messages.every((message) => message.startsWith(`${broken}(`))).toBe(true);
  });

  test("attributes a diagnostic to the file that caused it", () => {
    const result = checkShippedDeclarations(
      [
        { entry: OK, contents: OK_MODULE },
        { entry: BAD, contents: BAD_MODULE },
      ],
      typesRoot(),
    );
    expect(result.get(OK)).toEqual([]);
    expect(result.get(BAD)).toHaveLength(1);
    expect(result.get(BAD)?.[0]?.startsWith(`${BAD}(`)).toBe(true);
  });

  test("files reach each other by their shipped names", () => {
    const index = "repo-main/types/index.d.ts";
    const foo = "repo-main/types/foo.d.ts";
    const global = "repo-main/types/relib.global.d.ts";
    const result = checkShippedDeclarations(
      [
        { entry: index, contents: 'export * from "./foo";\n' },
        { entry: foo, contents: "export declare function bar(): number;\n" },
        { entry: global, contents: 'declare const relib: typeof import("./index");\n' },
      ],
      typesRoot(),
    );
    expect(result.get(index)).toEqual([]);
    expect(result.get(foo)).toEqual([]);
    expect(result.get(global)).toEqual([]);
  });

  test("a relative reference to a file the dependency does not ship is reported", () => {
    const index = "repo-main/types/index.d.ts";
    const result = checkShippedDeclarations(
      [{ entry: index, contents: 'export * from "./missing";\n' }],
      typesRoot(),
    );
    const messages = result.get(index) ?? [];
    expect(messages).toHaveLength(1);
    expect(messages[0]?.startsWith(`${index}(`)).toBe(true);
    expect(messages[0]).toContain("./missing");
  });
});
