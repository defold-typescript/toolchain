import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import * as ts from "typescript";

const PKG = resolve(import.meta.dir, "..");
const SRC = join(PKG, "src");
const GENERATED = join(PKG, "generated");

interface DeclarationFile {
  path: string;
  text: string;
}

// A brand is *referenced* wherever `Opaque<"name">` appears; it is *produced*
// only where the surface can hand one back. Those two positions are scored
// differently on purpose, and the asymmetry is the whole guard:
//
//   - a machine-derived `generated/**` declaration is evidence, so any
//     return-or-value position in it counts, however deeply the brand nests
//     (a union member, a `LuaMultiReturn` tuple slot, an intersection);
//   - a hand-written declaration counts only when its return type *is* the
//     brand. A hand-written union return is a fallback *claim* about what the
//     engine might yield, and a claim cannot be its own evidence — scoring it
//     as a producer would let an unreachable brand sitting in `go.get`'s
//     fallback union certify itself and keep this guard green.
function brandName(node: ts.Node): string | undefined {
  if (!ts.isTypeReferenceNode(node)) return undefined;
  if (!ts.isIdentifier(node.typeName) || node.typeName.text !== "Opaque") return undefined;
  const [arg] = node.typeArguments ?? [];
  if (!arg || !ts.isLiteralTypeNode(arg) || !ts.isStringLiteral(arg.literal)) return undefined;
  return arg.literal.text;
}

function parse(file: DeclarationFile): ts.SourceFile {
  return ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true);
}

function collectReferenced(file: DeclarationFile): Set<string> {
  const out = new Set<string>();
  const visit = (node: ts.Node): void => {
    const name = brandName(node);
    if (name !== undefined) out.add(name);
    ts.forEachChild(node, visit);
  };
  visit(parse(file));
  return out;
}

/** Return-or-value type positions: what a caller can end up holding. */
function valueTypeNodes(source: ts.SourceFile): ts.TypeNode[] {
  const out: ts.TypeNode[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isMethodSignature(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isCallSignatureDeclaration(node) ||
      ts.isConstructSignatureDeclaration(node) ||
      ts.isFunctionTypeNode(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isVariableDeclaration(node) ||
      ts.isPropertySignature(node) ||
      ts.isPropertyDeclaration(node) ||
      ts.isIndexSignatureDeclaration(node)
    ) {
      if (node.type) out.push(node.type);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

function collectProduced(file: DeclarationFile, trusted: boolean): Set<string> {
  const out = new Set<string>();
  for (const type of valueTypeNodes(parse(file))) {
    if (!trusted) {
      const direct = brandName(type);
      if (direct !== undefined) out.add(direct);
      continue;
    }
    const visit = (node: ts.Node): void => {
      const name = brandName(node);
      if (name !== undefined) out.add(name);
      ts.forEachChild(node, visit);
    };
    visit(type);
  }
  return out;
}

interface ReachabilityScan {
  referenced: Set<string>;
  produced: Set<string>;
  offenders: string[];
}

function scanBrandReachability(
  handWritten: DeclarationFile[],
  generated: DeclarationFile[],
): ReachabilityScan {
  const referenced = new Set<string>();
  const produced = new Set<string>();
  for (const file of handWritten) {
    for (const name of collectReferenced(file)) referenced.add(name);
    for (const name of collectProduced(file, false)) produced.add(name);
  }
  for (const file of generated) {
    for (const name of collectProduced(file, true)) produced.add(name);
  }
  const offenders = [...referenced].filter((name) => !produced.has(name)).sort();
  return { referenced, produced, offenders };
}

function read(path: string): DeclarationFile {
  return { path, text: readFileSync(path, "utf8") };
}

function handWrittenDeclarations(): DeclarationFile[] {
  return readdirSync(SRC)
    .filter((name) => name.endsWith(".d.ts"))
    .sort()
    .map((name) => read(join(SRC, name)));
}

function generatedDeclarations(dir = GENERATED): DeclarationFile[] {
  const out: DeclarationFile[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...generatedDeclarations(path));
    else if (entry.name.endsWith(".d.ts")) out.push(read(path));
  }
  return out;
}

const synthetic = (path: string, text: string): DeclarationFile => ({ path, text });

describe("opaque brand reachability — the shipped surface", () => {
  const handWritten = handWrittenDeclarations();
  const generated = generatedDeclarations();
  const scan = scanBrandReachability(handWritten, generated);

  test("the scan reads a non-empty surface", () => {
    expect(handWritten.length).toBeGreaterThan(0);
    expect(generated.length).toBeGreaterThan(0);
  });

  test("the scan finds brands on both sides, so it cannot pass vacuously", () => {
    expect(scan.referenced.size).toBeGreaterThan(0);
    expect(scan.produced.size).toBeGreaterThan(0);
  });

  test("every brand a hand-written declaration names is one the surface hands out", () => {
    expect(scan.offenders).toEqual([]);
  });
});

describe("opaque brand reachability — the walker", () => {
  const producer = synthetic(
    "generated/ghost.d.ts",
    `declare namespace ghost {
  function make(): Opaque<"ghost">;
}
`,
  );

  test("a brand named only in a hand-written parameter is reported", () => {
    const offending = synthetic(
      "src/ghost-overloads.d.ts",
      `declare namespace ghost {
  function use(handle: Opaque<"ghost">): void;
}
`,
    );
    expect(scanBrandReachability([offending], []).offenders).toEqual(["ghost"]);
  });

  test("a hand-written fallback union does not certify its own members", () => {
    const selfCertifying = synthetic(
      "src/ghost-overloads.d.ts",
      `declare namespace ghost {
  function get(property: string): number | Hash | Opaque<"ghost">;
}
`,
    );
    expect(scanBrandReachability([selfCertifying], []).offenders).toEqual(["ghost"]);
  });

  test("a generated union return does certify its members", () => {
    const generatedUnion = synthetic(
      "generated/ghost.d.ts",
      `declare namespace ghost {
  function get(property: string): number | Opaque<"ghost">;
}
`,
    );
    const referencing = synthetic(
      "src/ghost-overloads.d.ts",
      `declare namespace ghost {
  function use(handle: Opaque<"ghost">): void;
}
`,
    );
    expect(scanBrandReachability([referencing], [generatedUnion]).offenders).toEqual([]);
  });

  test("a hand-written declaration returning the brand outright is a producer", () => {
    const handWrittenProducer = synthetic(
      "src/ghost-overloads.d.ts",
      `declare namespace ghost {
  function make(): Opaque<"ghost">;
  function use(handle: Opaque<"ghost">): void;
}
`,
    );
    expect(scanBrandReachability([handWrittenProducer], []).offenders).toEqual([]);
  });

  test("a generated producer covers a hand-written reference", () => {
    const referencing = synthetic(
      "src/ghost-overloads.d.ts",
      `declare namespace ghost {
  function use(handle: Opaque<"ghost">): void;
}
`,
    );
    expect(scanBrandReachability([referencing], [producer]).offenders).toEqual([]);
  });
});
