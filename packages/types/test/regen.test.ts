import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  generateBuiltinMessagesDeclaration,
  generateKindIndex,
  generateModuleDeclaration,
  generateVersionIndex,
  KIND_MODULE_MANIFEST,
  MESSAGES_MANIFEST,
  MODULE_MANIFEST,
  VERSIONED_MODULE_MANIFEST,
} from "../scripts/regen";

const GENERATED = resolve(import.meta.dir, "..", "generated");

describe("regen drift guard", () => {
  test.each(
    MODULE_MANIFEST.map((entry) => [entry.namespace, entry] as const),
  )("%s: committed generated file matches a fresh pipeline run byte-for-byte", async (_namespace, entry) => {
    const { contents: fresh } = generateModuleDeclaration(entry);
    const committed = await Bun.file(resolve(GENERATED, entry.outFile)).text();
    if (committed !== fresh) {
      throw new Error(`${entry.outFile} is stale — run \`bun run regen\` in \`packages/types/\``);
    }
    expect(committed).toBe(fresh);
  });

  test.each(
    MODULE_MANIFEST.map((entry) => [entry.outFile, entry] as const),
  )("%s: committed generated file is syntactically-valid TypeScript", async (_outFile, entry) => {
    const content = await Bun.file(resolve(GENERATED, entry.outFile)).text();
    const transpiler = new Bun.Transpiler({ loader: "ts" });
    expect(() => transpiler.scan(content)).not.toThrow();
  });

  test.each(
    MODULE_MANIFEST.map((entry) => [entry.outFile, entry] as const),
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
    for (const entry of MODULE_MANIFEST) {
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
      const moduleMatches = MODULE_MANIFEST.filter((e) => e.outFile === file).length;
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
  const KIND_FACTORY: Readonly<Record<string, string>> = {
    script: "defineScript",
    "gui-script": "defineGuiScript",
    "render-script": "defineRenderScript",
  };
  const ALL_FACTORIES = ["defineScript", "defineGuiScript", "defineRenderScript"] as const;

  test.each(
    KIND_MODULE_MANIFEST.map((entry) => [entry.kind] as const),
  )("%s: generateKindIndex re-exports the matching factory and property helper types", (kind) => {
    const factory = KIND_FACTORY[kind];
    if (!factory) throw new Error(`no expected factory for kind ${kind}`);
    const fresh = generateKindIndex(kind);
    const reexport = `export { ${factory} } from "../../src/lifecycle";`;
    expect(fresh).toContain(
      `${reexport}\nexport type { ScriptProperties, ScriptProperty } from "../../src/lifecycle";`,
    );
    const occurrences = fresh.split(reexport).length - 1;
    expect(occurrences).toBe(1);
    expect(fresh).not.toContain("export {};");
  });

  test.each(
    KIND_MODULE_MANIFEST.map((entry) => [entry.kind] as const),
  )("%s: generateKindIndex re-exports neither non-matching factory", (kind) => {
    const factory = KIND_FACTORY[kind];
    if (!factory) throw new Error(`no expected factory for kind ${kind}`);
    const fresh = generateKindIndex(kind);
    for (const other of ALL_FACTORIES) {
      if (other === factory) continue;
      expect(fresh).not.toContain(other);
    }
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
