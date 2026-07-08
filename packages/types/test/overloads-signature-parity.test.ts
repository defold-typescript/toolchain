import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as ts from "typescript";
import { loadSignatureFile, VMATH_SIGNATURES_PATH } from "../scripts/signature-store-fs";

// Source of truth for the docs `signatures/vmath.json` override: the shipped
// generics live here, dropped from auto-emit and re-supplied at build time.
const VMATH_OVERLOADS_PATH = resolve(import.meta.dir, "..", "src", "vmath-overloads.d.ts");

// Render every `vmath` function declaration as the `vmath.<name><typeParams>(<params>): <return>`
// string the docs store holds, grouped by FQN in declared (source) order. `getText()`
// reuses the source spelling verbatim so the rendered form and the authored JSON compare
// 1:1 — a signature added, removed, or edited in the `.d.ts` without updating the JSON drifts.
function renderVmathOverloadSignatures(source?: string): Record<string, string[]> {
  const text = source ?? readFileSync(VMATH_OVERLOADS_PATH, "utf8");
  const sourceFile = ts.createSourceFile(VMATH_OVERLOADS_PATH, text, ts.ScriptTarget.Latest, true);
  const rendered: Record<string, string[]> = {};

  function renderFn(fn: ts.FunctionDeclaration): void {
    if (!fn.name) return;
    const fqn = `vmath.${fn.name.text}`;
    const typeParams = fn.typeParameters
      ? `<${fn.typeParameters.map((tp) => tp.getText(sourceFile)).join(", ")}>`
      : "";
    const params = fn.parameters.map((p) => p.getText(sourceFile)).join(", ");
    const returnType = fn.type ? fn.type.getText(sourceFile) : "void";
    const forms = rendered[fqn] ?? [];
    forms.push(`${fqn}${typeParams}(${params}): ${returnType}`);
    rendered[fqn] = forms;
  }

  function visit(node: ts.Node): void {
    if (ts.isModuleDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "vmath") {
      if (node.body && ts.isModuleBlock(node.body)) {
        for (const statement of node.body.statements) {
          if (ts.isFunctionDeclaration(statement)) renderFn(statement);
        }
      }
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return rendered;
}

const VMATH_FQNS = [
  "vmath.clamp",
  "vmath.lerp",
  "vmath.slerp",
  "vmath.mul_per_elem",
  "vmath.normalize",
] as const;

describe("vmath overloads signature parity", () => {
  const rendered = renderVmathOverloadSignatures();
  const store = loadSignatureFile(VMATH_SIGNATURES_PATH);

  test("signatures/vmath.json carries exactly the five overload-covered vmath FQNs", () => {
    expect(Object.keys(store).sort()).toEqual([...VMATH_FQNS].sort());
  });

  for (const fqn of VMATH_FQNS) {
    test(`${fqn} JSON signatures equal the rendered vmath-overloads.d.ts declarations`, () => {
      expect(store[fqn]?.signatures).toEqual(rendered[fqn]);
    });
  }

  test("drift simulation: an edited .d.ts signature no longer matches the committed JSON", () => {
    const edited = readFileSync(VMATH_OVERLOADS_PATH, "utf8").replace(
      "function normalize<T extends Vector3 | Vector4 | Quaternion>(v1: T): T;",
      "function normalize<T extends Vector3 | Vector4>(v1: T): T;",
    );
    const driftedRendered = renderVmathOverloadSignatures(edited);
    expect(driftedRendered["vmath.normalize"]).not.toEqual(store["vmath.normalize"]?.signatures);
  });
});
