import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import * as ts from "typescript";
import { selectCompleteVersionSurfaces } from "../scripts/generate-api-availability";
import { loadApiTargets, loadTargetModules } from "../scripts/regen";
import { parseDefoldApiDoc } from "../src/api-doc";
import { BOX2D_BACKEND_ARMS, box2dBackendArmKey } from "../src/emit-dts";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");
const GENERATED_DIR = resolve(PACKAGE_ROOT, "generated");

function generatedDeclarationFiles(dir: string = GENERATED_DIR): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) return generatedDeclarationFiles(path);
    return entry.name.endsWith(".d.ts") ? [path] : [];
  });
}

function namespacePath(node: ts.Node): string {
  const names: string[] = [];
  for (let parent = node.parent; parent !== undefined; parent = parent.parent) {
    if (ts.isModuleDeclaration(parent)) names.unshift(parent.name.text);
  }
  return names.join(".");
}

// Parameter names are left out: two arms that differ only by a parameter's name
// are still one call shape, so the first always wins.
function callShapeKey(fn: ts.FunctionDeclaration, source: ts.SourceFile): string {
  const typeParameters = fn.typeParameters?.map((p) => p.getText(source)).join(", ") ?? "";
  const parameters = fn.parameters
    .map((p) => {
      const rest = p.dotDotDotToken ? "..." : "";
      const optional = p.questionToken ? "?" : "";
      return `${rest}${optional}${p.type?.getText(source) ?? ""}`;
    })
    .join(", ");
  return `${namespacePath(fn)}.${fn.name?.text ?? ""}<${typeParameters}>(${parameters})`;
}

describe("generated overload reachability", () => {
  test("no generated surface declares two overloads one call cannot tell apart", () => {
    const files = generatedDeclarationFiles();
    const seen = new Map<string, number>();
    for (const file of files) {
      const source = ts.createSourceFile(
        file,
        readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        true,
      );
      const surface = relative(PACKAGE_ROOT, dirname(file));
      const visit = (node: ts.Node): void => {
        if (ts.isFunctionDeclaration(node) && node.name !== undefined) {
          const key = `${surface}: ${callShapeKey(node, source)}`;
          seen.set(key, (seen.get(key) ?? 0) + 1);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    const colliding = [...seen].filter(([, count]) => count > 1).map(([key]) => key);
    expect(files.length).toBeGreaterThan(0);
    expect(colliding).toEqual([]);
  });

  test("every BOX2D_BACKEND_ARMS key names an arm of a retained target", () => {
    const arms = new Set<string>();
    for (const target of selectCompleteVersionSurfaces(loadApiTargets())) {
      for (const entry of loadTargetModules(target)) {
        if (entry.namespace !== "b2d.world") continue;
        for (const fn of parseDefoldApiDoc(entry.doc).functions) arms.add(box2dBackendArmKey(fn));
      }
    }
    expect([...BOX2D_BACKEND_ARMS.keys()].filter((key) => !arms.has(key))).toEqual([]);
  });
});
