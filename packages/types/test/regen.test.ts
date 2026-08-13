import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  EDITOR_MODULE_MANIFEST,
  generateBuiltinMessagesDeclaration,
  generateKindIndex,
  generateModuleDeclaration,
  generateVersionIndex,
  KIND_MODULE_MANIFEST,
  type KindManifestEntry,
  MESSAGES_MANIFEST,
  MODULE_MANIFEST,
  VERSIONED_MODULE_MANIFEST,
} from "../scripts/regen";
import { parseDefoldApiDoc } from "../src/api-doc";

const GENERATED = resolve(import.meta.dir, "..", "generated");

// Every entry `regen` writes into `generated/` as a namespace declaration. The
// editor set rides the same emit pipeline as the runtime modules while staying
// out of MODULE_MANIFEST, so the drift/syntax/JSDoc guards must span both.
const COMMITTED_MODULES = [...MODULE_MANIFEST, ...EDITOR_MODULE_MANIFEST];

describe("regen drift guard", () => {
  test.each(
    COMMITTED_MODULES.map((entry) => [entry.namespace, entry] as const),
  )("%s: committed generated file matches a fresh pipeline run byte-for-byte", async (_namespace, entry) => {
    const { contents: fresh } = generateModuleDeclaration(entry);
    const committed = await Bun.file(resolve(GENERATED, entry.outFile)).text();
    if (committed !== fresh) {
      throw new Error(`${entry.outFile} is stale — run \`bun run regen\` in \`packages/types/\``);
    }
    expect(committed).toBe(fresh);
  });

  test.each(
    COMMITTED_MODULES.map((entry) => [entry.outFile, entry] as const),
  )("%s: committed generated file is syntactically-valid TypeScript", async (_outFile, entry) => {
    const content = await Bun.file(resolve(GENERATED, entry.outFile)).text();
    const transpiler = new Bun.Transpiler({ loader: "ts" });
    expect(() => transpiler.scan(content)).not.toThrow();
  });

  test.each(
    COMMITTED_MODULES.map((entry) => [entry.outFile, entry] as const),
  )("%s: committed generated namespace has a JSDoc block", async (_outFile, entry) => {
    const content = await Bun.file(resolve(GENERATED, entry.outFile)).text();
    expect(content).toContain(`  namespace ${entry.namespace} {`);
    expect(content).toMatch(
      new RegExp(
        `declare global \\{\\n(?:[\\s\\S]*?\\n)?  /\\*\\*[\\s\\S]*?\\n  namespace ${entry.namespace} \\{`,
      ),
    );
  });

  test("every MODULE_MANIFEST entry has a committed generated file", () => {
    for (const entry of COMMITTED_MODULES) {
      const path = resolve(GENERATED, entry.outFile);
      const exists = Bun.file(path).size > 0;
      if (!exists) {
        throw new Error(
          `MODULE_MANIFEST entry "${entry.namespace}" references missing file ${entry.outFile}`,
        );
      }
      expect(exists).toBe(true);
    }
  });

  test("every committed generated/*.d.ts is referenced by exactly one manifest entry", () => {
    const onDisk = readdirSync(GENERATED).filter((f) => f.endsWith(".d.ts"));
    for (const file of onDisk) {
      const moduleMatches = COMMITTED_MODULES.filter((e) => e.outFile === file).length;
      const messagesMatches = MESSAGES_MANIFEST.outFile === file ? 1 : 0;
      const total = moduleMatches + messagesMatches;
      if (total !== 1) {
        throw new Error(
          `generated/${file} is referenced by ${total} manifest entries (expected exactly 1)`,
        );
      }
      expect(total).toBe(1);
    }
  });
});

describe("go facade skip", () => {
  test("generated go.d.ts declares neither facade-owned get/set/property nor drops animate/properties", () => {
    const go = MODULE_MANIFEST.find((e) => e.namespace === "go");
    if (!go) throw new Error("go manifest entry missing");
    const { contents, dropped } = generateModuleDeclaration(go);
    expect(contents).not.toContain("function get(");
    expect(contents).not.toContain("function set(");
    expect(contents).not.toContain("function property(");
    expect(contents).toContain("function animate(");
    expect(contents).toContain("interface properties {");
    expect(dropped).toContain("go.get");
    expect(dropped).toContain("go.set");
    expect(dropped).toContain("go.property");
  });
});

describe("reserved-name member recovery", () => {
  test("go no longer drops go.delete (recovered via alias) but still drops the skip-functions", () => {
    const go = MODULE_MANIFEST.find((e) => e.namespace === "go");
    if (!go) throw new Error("go manifest entry missing");
    const { contents, dropped } = generateModuleDeclaration(go);
    expect(dropped).not.toContain("go.delete");
    expect(dropped).toContain("go.get");
    expect(dropped).toContain("go.set");
    expect(dropped).toContain("go.property");
    expect(contents).toContain("function _delete(");
    expect(contents).toContain("export { _delete as delete };");
  });

  test("json drops nothing — its only reserved member json.null is recovered", () => {
    const json = MODULE_MANIFEST.find((e) => e.namespace === "json");
    if (!json) throw new Error("json manifest entry missing");
    const { contents, dropped } = generateModuleDeclaration(json);
    expect(dropped).toEqual([]);
    expect(contents).toContain("export { _null as null };");
  });
});

describe("editor namespace emit", () => {
  const editorEntry = () => {
    const entry = EDITOR_MODULE_MANIFEST.find((e) => e.namespace === "editor");
    if (!entry) throw new Error("editor manifest entry missing");
    return entry;
  };

  test("emits the in-scope command/transaction surface including a nested tx namespace", () => {
    const { contents } = generateModuleDeclaration(editorEntry());
    expect(contents).toContain("function get(");
    expect(contents).toContain("function transact(");
    expect(contents).toContain("namespace tx {");
    expect(contents).toContain("function set(");
  });

  test("hands editor.command to the hand-authored overload file instead of emitting it", () => {
    const { contents, dropped } = generateModuleDeclaration(editorEntry());
    expect(dropped).toContain("editor.command");
    expect(contents).not.toContain("function command(");
    const overloads = readFileSync(
      resolve(import.meta.dir, "..", "src", "editor-overloads.d.ts"),
      "utf8",
    );
    expect(overloads).toMatch(/function command<const Q extends EditorCommandQuery/);
  });

  test("emits no ui/prefs surface and reports the skipped members through dropped", () => {
    const { contents, dropped } = generateModuleDeclaration(editorEntry());
    expect(contents).not.toContain("namespace ui");
    expect(contents).not.toContain("namespace prefs");
    expect(dropped).toContain("editor.ui.label");
    expect(dropped).toContain("editor.prefs.get");
  });

  test("emits none of the deferred editor-VM libraries that share the fixture", () => {
    const { contents, dropped } = generateModuleDeclaration(editorEntry());
    for (const name of ["function pprint(", "namespace http", "namespace json", "namespace zip"]) {
      expect(contents).not.toContain(name);
    }
    expect(dropped).toContain("pprint");
    expect(dropped).toContain("http.request");
    expect(dropped).toContain("json.decode");
  });

  test("maps the editor handle tokens to opaque types and repairs the mangled array token", () => {
    const { contents } = generateModuleDeclaration(editorEntry());
    expect(contents).toMatch(/function set\([^)]*\): Opaque<"transaction_step">;/);
    expect(contents).toContain('function transact(txs: Opaque<"transaction_step">[]): void;');
    expect(contents).not.toContain('"transaction_step["');
    expect(contents).not.toContain("transaction_step[;");
  });

  test("emits a documented vararg as a rest parameter under its own name", () => {
    const { contents } = generateModuleDeclaration(editorEntry());
    expect(contents).toContain(
      "function bob(options?: Record<string | number, unknown>, ...commands: string[]): void;",
    );
    expect(contents).not.toContain("arg1");
  });

  // TS1266 forbids a positional parameter after a rest, so `editor.execute`'s
  // trailing options table has to fold into the rest's element union.
  test("folds a parameter trailing a vararg into the rest element union", () => {
    const { contents } = generateModuleDeclaration(editorEntry());
    expect(contents).toContain(
      "function execute(command: string, " +
        "...args: (string | { reload_resources?: boolean; out?: string; err?: string })[]" +
        "): undefined | string;",
    );
  });

  test("every editor.tx.* builder returns a transaction step", () => {
    const { contents } = generateModuleDeclaration(editorEntry());
    const opened = contents.slice(contents.indexOf("namespace tx {"));
    const body = opened.slice(0, opened.indexOf("\n    }"));
    const returns = [...body.matchAll(/^ *function (\w+)\([^\n]*\): ([^;\n]+);$/gm)].map(
      ([, name, type]) => [name, type] as const,
    );
    expect(returns.length).toBeGreaterThan(1);
    expect(returns.map(([, type]) => type)).toEqual(
      returns.map(() => 'Opaque<"transaction_step">'),
    );
    expect(returns.map(([name]) => name)).toContain("add");
  });

  // The rest-parameter rule only fires on a `...`-prefixed ref-doc parameter
  // name, and no committed runtime doc declares one — so it provably cannot move
  // any runtime namespace's emitted surface. Read from the shipped manifests, so
  // a future runtime doc introducing a vararg reds this instead of silently
  // reshaping a signature.
  test("no committed runtime module doc declares a vararg parameter", () => {
    const offenders: string[] = [];
    for (const entry of [...MODULE_MANIFEST, ...VERSIONED_MODULE_MANIFEST]) {
      for (const fn of parseDefoldApiDoc(entry.doc).functions) {
        for (const param of fn.parameters) {
          if (param.name.startsWith("...")) offenders.push(`${fn.name}(${param.name})`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test.each(
    KIND_MODULE_MANIFEST.filter((e) => e.kind !== "editor-script").map((e) => [e.kind]),
  )("%s: the runtime kind index never imports the editor namespace", (kind) => {
    expect(generateKindIndex(kind)).not.toContain('import "../editor";');
  });
});

describe("versioned regen drift guard", () => {
  test.each(
    VERSIONED_MODULE_MANIFEST.map(
      (entry) => [`${entry.versionId}/${entry.namespace}`, entry] as const,
    ),
  )("%s: committed versioned file matches a fresh pipeline run byte-for-byte", async (_label, entry) => {
    const { contents: fresh } = generateModuleDeclaration(entry);
    const path = resolve(GENERATED, "versions", entry.versionId, entry.outFile);
    const committed = await Bun.file(path).text();
    if (committed !== fresh) {
      throw new Error(
        `versions/${entry.versionId}/${entry.outFile} is stale — run \`bun run regen\` in \`packages/types/\``,
      );
    }
    expect(committed).toBe(fresh);
  });

  test.each(
    VERSIONED_MODULE_MANIFEST.map(
      (entry) => [`${entry.versionId}/${entry.outFile}`, entry] as const,
    ),
  )("%s: committed versioned file is syntactically-valid TypeScript", async (_label, entry) => {
    const path = resolve(GENERATED, "versions", entry.versionId, entry.outFile);
    const content = await Bun.file(path).text();
    const transpiler = new Bun.Transpiler({ loader: "ts" });
    expect(() => transpiler.scan(content)).not.toThrow();
  });

  test.each([
    ...new Set(VERSIONED_MODULE_MANIFEST.map((entry) => entry.versionId)),
  ])("%s: committed per-version index.d.ts matches a fresh generateVersionIndex", async (versionId) => {
    const fresh = generateVersionIndex(versionId);
    const path = resolve(GENERATED, "versions", versionId, "index.d.ts");
    const committed = await Bun.file(path).text();
    if (committed !== fresh) {
      throw new Error(
        `versions/${versionId}/index.d.ts is stale — run \`bun run regen\` in \`packages/types/\``,
      );
    }
    expect(committed).toBe(fresh);
  });
});

describe("per-kind regen drift guard", () => {
  test.each(
    KIND_MODULE_MANIFEST.map((entry) => [entry.kind, entry] as const),
  )("%s: committed generated/kinds file matches a fresh generateKindIndex", async (kind, _entry) => {
    const fresh = generateKindIndex(kind);
    const path = resolve(GENERATED, "kinds", `${kind}.d.ts`);
    const committed = await Bun.file(path).text();
    if (committed !== fresh) {
      throw new Error(`kinds/${kind}.d.ts is stale — run \`bun run regen\` in \`packages/types/\``);
    }
    expect(committed).toBe(fresh);
  });
});

describe("per-kind factory re-export", () => {
  // The manifest entry is the single source of truth for which factory a kind
  // ships and where it comes from; a test-local table would let the two drift.
  const factoryModule = (entry: KindManifestEntry): string =>
    entry.factoryFrom ?? "../../src/lifecycle";
  const ALL_FACTORIES = KIND_MODULE_MANIFEST.map((entry) => entry.factory);

  test.each(
    KIND_MODULE_MANIFEST.map((entry) => [entry.kind, entry] as const),
  )("%s: generateKindIndex re-exports its factory exactly once, from its own module", (_kind, entry) => {
    const fresh = generateKindIndex(entry.kind);
    const names = [entry.factory, ...(entry.extraExports ?? [])].join(", ");
    const reexport = `export { ${names} } from "${factoryModule(entry)}";`;
    expect(fresh).toContain(reexport);
    expect(fresh.split(reexport).length - 1).toBe(1);
    expect(fresh).not.toContain("export {};");
  });

  test.each(
    KIND_MODULE_MANIFEST.map((entry) => [entry.kind, entry] as const),
  )("%s: script-property helper types ride only the kinds that have script properties", (_kind, entry) => {
    const fresh = generateKindIndex(entry.kind);
    if (entry.propertyTypes === false) {
      expect(fresh).not.toContain("ScriptProperty");
      return;
    }
    expect(fresh).toContain(
      `export { ${entry.factory} } from "${factoryModule(entry)}";\n` +
        `export type { ScriptProperties, ScriptProperty } from "${factoryModule(entry)}";`,
    );
  });

  test.each(
    KIND_MODULE_MANIFEST.map((entry) => [entry.kind, entry] as const),
  )("%s: generateKindIndex re-exports no other kind's factory", (_kind, entry) => {
    const fresh = generateKindIndex(entry.kind);
    for (const other of ALL_FACTORIES) {
      if (other === entry.factory) continue;
      expect(fresh).not.toContain(other);
    }
  });
});

describe("editor-script kind index", () => {
  const importPaths = (index: string): string[] =>
    [...index.matchAll(/^import "([^"]+)";$/gm)].map((match) => match[1] as string);

  test("imports the editor namespace and nothing any runtime kind index imports", () => {
    const runtime = new Set(
      KIND_MODULE_MANIFEST.filter((entry) => entry.only === undefined).flatMap((entry) =>
        importPaths(generateKindIndex(entry.kind)),
      ),
    );
    expect(runtime.size).toBeGreaterThan(0);
    expect(runtime.has("../editor")).toBe(false);

    // The overload file rides alongside the namespace: it is what makes
    // `editor.command` resolve at all, since an `only` kind takes none of
    // UNIVERSAL_EXTRA_IMPORTS.
    const editor = importPaths(generateKindIndex("editor-script"));
    expect(editor).toEqual(["../editor", "../../src/editor-overloads"]);
    for (const path of editor) expect(runtime.has(path)).toBe(false);
  });

  test("re-exports both editor factories and none of the runtime lifecycle surface", () => {
    const fresh = generateKindIndex("editor-script");
    expect(fresh).toContain(
      'export { defineEditorScript, defineEditorCommand } from "../../src/editor";',
    );
    expect(fresh).toContain(
      'export type { EditorCommandQuery, EditorNode } from "../../src/editor";',
    );
    for (const name of [
      "ScriptProperty",
      "defineScript",
      "defineGuiScript",
      "defineRenderScript",
    ]) {
      expect(fresh).not.toContain(name);
    }
  });

  test("references the Lua 5.1 stdlib without the LuaJIT-only surface", () => {
    const fresh = generateKindIndex("editor-script");
    expect(fresh).toContain('/// <reference types="lua-types/5.1" />');
    expect(fresh).not.toContain("jit-only");
  });
});

describe("regen drift guard — builtin messages", () => {
  test("committed builtin-messages.d.ts matches a fresh pipeline run byte-for-byte", async () => {
    const fresh = generateBuiltinMessagesDeclaration(MESSAGES_MANIFEST);
    const committed = await Bun.file(resolve(GENERATED, MESSAGES_MANIFEST.outFile)).text();
    if (committed !== fresh) {
      throw new Error(
        `${MESSAGES_MANIFEST.outFile} is stale — run \`bun run regen\` in \`packages/types/\``,
      );
    }
    expect(committed).toBe(fresh);
  });

  test("committed builtin-messages.d.ts is syntactically-valid TypeScript", async () => {
    const content = await Bun.file(resolve(GENERATED, MESSAGES_MANIFEST.outFile)).text();
    const transpiler = new Bun.Transpiler({ loader: "ts" });
    expect(() => transpiler.scan(content)).not.toThrow();
  });

  test("MESSAGES_MANIFEST entry has a committed generated file", () => {
    const path = resolve(GENERATED, MESSAGES_MANIFEST.outFile);
    expect(Bun.file(path).size > 0).toBe(true);
  });
});

describe("nil-return union absorption guard", () => {
  // A ref-doc `nil` return alternative that once fell through to the generic
  // `unknown` fallback produced the absorbing `T | unknown` union, erasing `T`.
  // Any callable signature line (it carries the `): ` return separator) must be
  // free of that fragment. Standalone `unknown` and the `Record<string | number,
  // unknown>` opaque-table shape carry no ` | unknown` substring, so they stay
  // allowed without an allowlist.
  const absorbingUnionLines = (contents: string): string[] =>
    contents.split("\n").filter((line) => line.includes("): ") && line.includes(" | unknown"));

  test.each(
    MODULE_MANIFEST.map((entry) => [entry.namespace, entry] as const),
  )("%s: current generated signatures carry no nil-absorbing ` | unknown` fragment", (_namespace, entry) => {
    const { contents } = generateModuleDeclaration(entry);
    expect(absorbingUnionLines(contents)).toEqual([]);
  });

  test.each(
    VERSIONED_MODULE_MANIFEST.map(
      (entry) => [`${entry.versionId}/${entry.namespace}`, entry] as const,
    ),
  )("%s: committed-version generated signatures carry no nil-absorbing ` | unknown` fragment", (_label, entry) => {
    const { contents } = generateModuleDeclaration(entry);
    expect(absorbingUnionLines(contents)).toEqual([]);
  });

  test("the guard predicate leaves standalone unknown and Record<..., unknown> untouched", () => {
    expect(absorbingUnionLines("  function f(): unknown;")).toEqual([]);
    expect(absorbingUnionLines("  function g(): Record<string | number, unknown>;")).toEqual([]);
    expect(absorbingUnionLines("  function h(): number | unknown;")).toEqual([
      "  function h(): number | unknown;",
    ]);
  });
});
