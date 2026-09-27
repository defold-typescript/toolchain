import { describe, expect, test } from "bun:test";
import ts from "typescript";
import {
  type DeclaredFunction,
  declaredKinds,
  readDeclaredSurface,
  surfaceProgram,
  UnmappedLuaKindError,
} from "./lua-kind";
import { loadApiTargets } from "./regen";

const DEFAULT_TARGET = loadApiTargets().find((target) => target.default === true);
if (!DEFAULT_TARGET) throw new Error("api-targets.json: no default target");

const program = surfaceProgram(DEFAULT_TARGET);
const surface = readDeclaredSurface(program, ["go", "gui", "sprite", "types"]);

function declared(name: string): DeclaredFunction {
  const fn = surface.functions.get(name);
  if (!fn) throw new Error(`${name} is not declared on the default surface`);
  return fn;
}

function slot(name: string, index: number) {
  const found = declared(name).slots.find((candidate) => candidate.index === index);
  if (!found) throw new Error(`${name} declares no slot ${index}`);
  return { kinds: found.kinds, optional: found.optional };
}

describe("declared kinds on the default surface", () => {
  test("sprite.play_flipbook reads url, id, callback and options slots", () => {
    expect(slot("sprite.play_flipbook", 1)).toEqual({
      kinds: ["hash", "string", "url"],
      optional: false,
    });
    expect(slot("sprite.play_flipbook", 2)).toEqual({ kinds: ["hash", "string"], optional: false });
    expect(slot("sprite.play_flipbook", 3)).toEqual({ kinds: ["function"], optional: true });
    expect(slot("sprite.play_flipbook", 4)).toEqual({ kinds: ["table"], optional: true });
  });

  test("an alias of branded numeric constants resolves to number, beside its other members", () => {
    expect(slot("gui.animate", 4)).toEqual({ kinds: ["number", "vector"], optional: false });
  });

  test("overloads union per slot, and an overlay-declared options table is optional", () => {
    expect(slot("go.get", 3)).toEqual({ kinds: ["table"], optional: true });
    expect(declared("go.get").minArgs).toBe(0);
    expect(declared("go.get").maxArgs).toBe(3);
  });

  test("a declared unknown maps to any", () => {
    expect(slot("types.is_hash", 1).kinds).toBe("any");
  });

  test("the declared surface has no unmapped type", () => {
    expect(surface.unmapped).toEqual([]);
  });
});

describe("declaredKinds", () => {
  const checker = program.getTypeChecker();

  test("an unmapped type is a named error, never a guess", () => {
    const bigint = checker.getBigIntType();
    expect(() => declaredKinds(bigint, checker)).toThrow(UnmappedLuaKindError);
  });

  test("undefined maps to nil, which is what marks a slot optional", () => {
    expect(declaredKinds(checker.getUndefinedType(), checker)).toEqual(["nil"]);
    expect(declaredKinds(checker.getNumberType(), checker)).toEqual(["number"]);
  });

  test("the program is built on the target's entry", () => {
    const entry = program.getRootFileNames()[0] ?? "";
    expect(entry.endsWith("packages/types/index.d.ts")).toBe(true);
    const source = program.getSourceFile(entry);
    if (!source) throw new Error(`entry not in program: ${entry}`);
    const diagnostics = [
      ...program.getSyntacticDiagnostics(source),
      ...program.getSemanticDiagnostics(source),
    ].map((d) => ts.flattenDiagnosticMessageText(d.messageText, " "));
    expect(diagnostics).toEqual([]);
  });
});
