import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const ENGINE_TYPES = [
  "Hash",
  "Matrix4",
  "Opaque",
  "Quaternion",
  "Url",
  "Vector",
  "Vector3",
  "Vector4",
] as const;

const source = readFileSync(path.join(import.meta.dir, "engine-globals.d.ts"), "utf8");
const globalsDoc = JSON.parse(
  readFileSync(path.join(import.meta.dir, "../fixtures/globals_doc.json"), "utf8"),
) as { elements: Array<{ type: string; name: string }> };

describe("engine-globals.d.ts", () => {
  test("keeps the no-self ambient banner", () => {
    expect(source.startsWith("/** @noSelfInFile */\n")).toBe(true);
  });

  test("imports the engine types from ./core-types", () => {
    expect(source).toContain('from "./core-types"');
  });

  test("declares every engine global inside a single declare global block", () => {
    const open = source.indexOf("declare global");
    expect(open).toBeGreaterThanOrEqual(0);
    expect(source.indexOf("declare global", open + 1)).toBe(-1);
    const block = source.slice(open);
    for (const name of ENGINE_TYPES) {
      const decl =
        name === "Opaque"
          ? "type Opaque<Name extends string> = Core.Opaque<Name>"
          : `type ${name} =`;
      expect(block).toContain(decl);
    }
    expect(block).toContain("function hash(s: string): Core.Hash");
    expect(block).toContain("function hash_to_hex(");
    expect(block).toContain("function pprint(");
  });

  test("globals_doc.json and engine-globals.d.ts agree on the set of global functions", () => {
    const declared = new Set([...source.matchAll(/function (\w+)\(/g)].map((m) => m[1] as string));
    const documented = new Set(
      globalsDoc.elements.filter((e) => e.type === "FUNCTION").map((e) => e.name),
    );
    expect([...documented].sort()).toEqual([...declared].sort());
  });

  const lines = source.split("\n");

  // The non-blank source line immediately above the declaration that starts at
  // `lineIndex`, or undefined if only blank lines (or the file start) precede it.
  function precedingNonBlank(lineIndex: number): string | undefined {
    for (let i = lineIndex - 1; i >= 0; i--) {
      const trimmed = (lines[i] as string).trim();
      if (trimmed) return trimmed;
    }
    return undefined;
  }

  function declarationLine(predicate: (trimmed: string) => boolean): number {
    const index = lines.findIndex((line) => predicate(line.trim()));
    if (index < 0) throw new Error("declaration not found");
    return index;
  }

  const declarations: Array<{ label: string; match: (trimmed: string) => boolean }> = [
    ...ENGINE_TYPES.map((name) => ({
      label: name as string,
      match: (trimmed: string) =>
        name === "Opaque"
          ? trimmed.startsWith("type Opaque<")
          : trimmed.startsWith(`type ${name} =`),
    })),
    { label: "hash", match: (t: string) => t.startsWith("function hash(") },
    { label: "hash_to_hex", match: (t: string) => t.startsWith("function hash_to_hex(") },
    { label: "pprint", match: (t: string) => t.startsWith("function pprint(") },
  ];

  for (const { label, match } of declarations) {
    test(`${label} is immediately preceded by a JSDoc block`, () => {
      const preceding = precedingNonBlank(declarationLine(match));
      expect(preceding).toBeDefined();
      expect((preceding as string).endsWith("*/")).toBe(true);
    });
  }

  test("Opaque carries an excessive brand-explaining JSDoc block", () => {
    const start = declarationLine((t) => t.startsWith("type Opaque<"));
    let open = -1;
    for (let i = start - 1; i >= 0; i--) {
      if ((lines[i] as string).trim().startsWith("/**")) {
        open = i;
        break;
      }
    }
    expect(open).toBeGreaterThanOrEqual(0);
    const block = lines.slice(open, start).join("\n");
    const lower = block.toLowerCase();
    expect(lower).toContain("brand");
    expect(/never inspect|never construct/.test(lower)).toBe(true);
    expect(block).toContain("unique symbol");
    expect(block).toContain('Opaque<"node">');
    expect(block.length).toBeGreaterThan(300);
  });
});
