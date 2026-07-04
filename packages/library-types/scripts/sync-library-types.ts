import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

/**
 * ts-defold/library core-type references -> the @defold-typescript/types surface.
 * Dotted `vmath.*` names collapse to a single core-type name; bare handle tokens
 * become `Opaque<…>` brands, resolving against the globals in
 * `@defold-typescript/types` `engine-globals.d.ts`. `table` is intentionally
 * absent: ts-defold modules declare their own local `type table = {}` alias, so
 * renaming it would rewrite an unrelated local type.
 */
export const CORE_TYPE_RENAMES: Readonly<Record<string, string>> = {
  "vmath.vector": "Vector",
  "vmath.vector3": "Vector3",
  "vmath.vector4": "Vector4",
  "vmath.matrix4": "Matrix4",
  "vmath.quat": "Quaternion",
  hash: "Hash",
  url: "Url",
  node: 'Opaque<"node">',
  texture: 'Opaque<"texture">',
  render_target: 'Opaque<"render_target">',
  constant: 'Opaque<"constant">',
  constant_buffer: 'Opaque<"constant_buffer">',
  buffer: 'Opaque<"buffer">',
  bufferstream: 'Opaque<"bufferstream">',
  resource: 'Opaque<"resource">',
  userdata: 'Opaque<"userdata">',
  b2World: 'Opaque<"b2World">',
  b2Body: 'Opaque<"b2Body">',
};

export interface CodemodResult {
  output: string;
  unmapped: string[];
}

function entityNameText(name: ts.EntityName): string {
  return ts.isIdentifier(name) ? name.text : `${entityNameText(name.left)}.${name.right.text}`;
}

/**
 * Rename every Defold core-type reference in an ambient `.d.ts` to the
 * @defold-typescript/types surface. Matches type references only — property
 * names, JSDoc, `declare module`, and passthrough extensions (`LuaMultiReturn`,
 * `LuaMap`) stay byte-identical because `forEachChild` never descends into
 * identifiers-as-names or comments. Any `vmath.*` reference with no mapping is
 * collected into `unmapped` and left verbatim so a missing rename surfaces as a
 * red typecheck rather than a silent `any`.
 */
export function codemodDeclaration(source: string): CodemodResult {
  const sf = ts.createSourceFile(
    "module.d.ts",
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  );
  const edits: { start: number; end: number; text: string }[] = [];
  const unmapped = new Set<string>();

  const visit = (node: ts.Node): void => {
    if (ts.isTypeReferenceNode(node)) {
      const name = entityNameText(node.typeName);
      const rename = CORE_TYPE_RENAMES[name];
      if (rename !== undefined) {
        edits.push({
          start: node.typeName.getStart(sf),
          end: node.typeName.getEnd(),
          text: rename,
        });
      } else if (name.startsWith("vmath.")) {
        unmapped.add(name);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  edits.sort((a, b) => b.start - a.start);
  let output = source;
  for (const edit of edits) {
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  }
  return { output, unmapped: [...unmapped] };
}

interface LibraryTarget {
  module: string;
  path: string;
  fixture: string;
  generated: string;
}

interface LibraryTargets {
  source: { repo: string; commit: string; license: string };
  targets: LibraryTarget[];
}

/**
 * Read every pinned fixture, codemod it, and write the renamed `declare module`
 * to its `generated/` path. Throws on the first unmapped reference so a stale
 * rename table never ships a silently-broken type.
 */
export function regenerate(packageRoot: string): void {
  const targets = JSON.parse(
    readFileSync(join(packageRoot, "library-targets.json"), "utf8"),
  ) as LibraryTargets;
  for (const target of targets.targets) {
    const source = readFileSync(join(packageRoot, target.fixture), "utf8");
    const { output, unmapped } = codemodDeclaration(source);
    if (unmapped.length > 0) {
      throw new Error(
        `${target.module}: unmapped core-type references ${unmapped.join(", ")} — extend CORE_TYPE_RENAMES.`,
      );
    }
    writeFileSync(join(packageRoot, target.generated), output);
  }
}

if (import.meta.main) {
  regenerate(join(import.meta.dir, ".."));
}
