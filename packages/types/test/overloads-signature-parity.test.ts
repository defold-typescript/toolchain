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

// Collapse the JSDoc comment's line structure to the single-line canonical form
// `signatures/vmath.json` stores in `docs[]`, so the extracted prose and the
// authored JSON compare 1:1.
function normalizeDoc(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

// The per-overload JSDoc description (the comment before the `@param`/`@returns`
// tags) for every `vmath` function declaration, grouped by FQN in declared
// order — the same walk `renderVmathOverloadSignatures` does, so `docs[i]` lines
// up with `signatures[i]`. A JSDoc description edited in the `.d.ts` without a
// matching JSON update drifts.
function renderVmathOverloadDescriptions(source?: string): Record<string, string[]> {
  const text = source ?? readFileSync(VMATH_OVERLOADS_PATH, "utf8");
  const sourceFile = ts.createSourceFile(VMATH_OVERLOADS_PATH, text, ts.ScriptTarget.Latest, true);
  const rendered: Record<string, string[]> = {};

  function describeFn(fn: ts.FunctionDeclaration): void {
    if (!fn.name) return;
    const fqn = `vmath.${fn.name.text}`;
    let description = "";
    for (const part of ts.getJSDocCommentsAndTags(fn)) {
      if (ts.isJSDoc(part)) {
        const comment = part.comment;
        description = normalizeDoc(
          typeof comment === "string" ? comment : (comment ?? []).map((c) => c.text).join(""),
        );
        break;
      }
    }
    const forms = rendered[fqn] ?? [];
    forms.push(description);
    rendered[fqn] = forms;
  }

  function visit(node: ts.Node): void {
    if (ts.isModuleDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "vmath") {
      if (node.body && ts.isModuleBlock(node.body)) {
        for (const statement of node.body.statements) {
          if (ts.isFunctionDeclaration(statement)) describeFn(statement);
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

  const descriptions = renderVmathOverloadDescriptions();

  for (const fqn of VMATH_FQNS) {
    test(`${fqn} JSON docs equal the rendered vmath-overloads.d.ts JSDoc descriptions`, () => {
      expect(store[fqn]?.docs).toEqual(descriptions[fqn]);
    });
  }

  test("drift simulation: an edited .d.ts JSDoc description no longer matches the committed JSON", () => {
    const edited = readFileSync(VMATH_OVERLOADS_PATH, "utf8").replace(
      "Linearly interpolate between two values.",
      "Linearly interpolate between two scalars.",
    );
    const driftedDescriptions = renderVmathOverloadDescriptions(edited);
    expect(driftedDescriptions["vmath.lerp"]).not.toEqual(store["vmath.lerp"]?.docs);
  });
});
