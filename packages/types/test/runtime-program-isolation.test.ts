import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import * as ts from "typescript";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");
const CONFIG_PATH = resolve(PACKAGE_ROOT, "tsconfig.json");

const EDITOR_VM_SIDECAR = resolve(PACKAGE_ROOT, "src", "editor-vm-globals.d.ts");
const EDITOR_OVERLOADS_SIDECAR = resolve(PACKAGE_ROOT, "src", "editor-overloads.d.ts");

// The shipped config as TypeScript itself resolves it, so the assertions below
// answer what `bun run typecheck` actually compiles rather than restating the
// globs a reader can already see in the file.
function resolvedFileNames(): string[] {
  const { config, error } = ts.readConfigFile(CONFIG_PATH, ts.sys.readFile);
  if (error) throw new Error(ts.flattenDiagnosticMessageText(error.messageText, "\n"));
  const parsed = ts.parseJsonConfigFileContent(
    config,
    ts.sys,
    PACKAGE_ROOT,
    undefined,
    CONFIG_PATH,
  );
  if (parsed.errors.length > 0) {
    throw new Error(
      parsed.errors.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n")).join("\n"),
    );
  }
  return parsed.fileNames.map((name) => resolve(name));
}

describe("runtime program isolation", () => {
  // Both sidecars must exist for the assertions to mean anything: an absence
  // check over a file that was renamed away passes for the wrong reason.
  test("both hand-authored sidecars are on disk", () => {
    expect(existsSync(EDITOR_VM_SIDECAR)).toBe(true);
    expect(existsSync(EDITOR_OVERLOADS_SIDECAR)).toBe(true);
  });

  // `src/editor-vm-globals.d.ts` declares `namespace json` and `namespace http`
  // under `declare global`. The package's own program also pulls in the runtime
  // `generated/*.d.ts`, which declare the same two namespaces, so leaving the
  // editor sidecar in would merge the two surfaces and let file order decide
  // which `json.decode` a runtime consumer resolves. The editor-script kind
  // index typechecks the sidecar instead.
  test("the editor VM ambient sidecar stays out of the package's own program", () => {
    expect(resolvedFileNames()).not.toContain(EDITOR_VM_SIDECAR);
  });

  // The `editor.*` sidecar declares no namespace the runtime surface owns, so it
  // is meant to merge here and its presence proves the exclusion above is
  // targeted rather than a blanket `src/*.d.ts` drop.
  test("the editor overloads sidecar still merges into the package's own program", () => {
    expect(resolvedFileNames()).toContain(EDITOR_OVERLOADS_SIDECAR);
  });
});
