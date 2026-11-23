import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { scaffoldDiagnostics, scaffoldTypecheckConfigs } from "./scaffold-typecheck.ts";

const dirs: string[] = [];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

function write(root: string, rel: string, text: string): void {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

// Under the repo's `exactOptionalPropertyTypes: true` the assignment is an error,
// so the directive is used; under the scaffold's options it is not.
function exactOptionalProject(withDirective: boolean): string {
  const root = tempDir("scaffold-typecheck-run-");
  write(
    root,
    "tsconfig.json",
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        lib: ["ES2022"],
        strict: true,
        exactOptionalPropertyTypes: true,
        noUncheckedIndexedAccess: true,
        types: [],
        noEmit: true,
      },
      include: ["a.ts"],
    }),
  );
  const directive = withDirective ? "// @ts-expect-error\n" : "";
  write(root, "a.ts", `${directive}const o: { a?: number } = { a: undefined };\n`);
  return join(root, "tsconfig.json");
}

describe("scaffoldDiagnostics", () => {
  test("checks under the scaffold's flags, overriding the config's own", () => {
    const diagnostics = scaffoldDiagnostics(exactOptionalProject(true));
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatch(/(^|\/)a\.ts:1 TS2578 /);
  }, 30_000);

  test("returns nothing for a program that compiles under the scaffold's flags", () => {
    expect(scaffoldDiagnostics(exactOptionalProject(false))).toEqual([]);
  }, 30_000);
});

describe("scaffoldTypecheckConfigs", () => {
  test("lists the package config, then every positive test-d config sorted", () => {
    const root = tempDir("scaffold-typecheck-configs-");
    for (const rel of [
      "tsconfig.json",
      "test-d/b/c/tsconfig.c.json",
      "test-d/a/tsconfig.a-neg.json",
      "test-d/a/tsconfig.a.json",
      "test-d/a/data.json",
    ]) {
      write(root, rel, "{}");
    }
    expect(scaffoldTypecheckConfigs(root)).toEqual([
      "tsconfig.json",
      "test-d/a/tsconfig.a.json",
      "test-d/b/c/tsconfig.c.json",
    ]);
  });

  test("lists only the package config when there is no test-d folder", () => {
    const root = tempDir("scaffold-typecheck-configs-");
    write(root, "tsconfig.json", "{}");
    expect(scaffoldTypecheckConfigs(root)).toEqual(["tsconfig.json"]);
  });
});
