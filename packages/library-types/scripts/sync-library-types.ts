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

export interface LibrarySource {
  repo: string;
  commit: string;
  license: string;
}

export interface LibraryTarget {
  module: string;
  path: string;
  fixture: string;
  generated: string;
}

export interface LibraryTargets {
  source: LibrarySource;
  targets: LibraryTarget[];
}

function readTargets(packageRoot: string): LibraryTargets {
  return JSON.parse(
    readFileSync(join(packageRoot, "library-targets.json"), "utf8"),
  ) as LibraryTargets;
}

/**
 * Read every pinned fixture, codemod it, and write the renamed `declare module`
 * to its `generated/` path. Throws on the first unmapped reference so a stale
 * rename table never ships a silently-broken type.
 */
export function regenerate(packageRoot: string): void {
  const targets = readTargets(packageRoot);
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

/**
 * The raw.githubusercontent.com URL for a target's upstream `.d.ts` at the
 * pinned commit. `source.repo` is the human `https://github.com/<owner>/<repo>`
 * form; raw content is addressed by the bare `<owner>/<repo>` slug, so the
 * prefix (and any `.git` suffix) is stripped.
 */
export function rawUrl(source: LibrarySource, target: LibraryTarget): string {
  const slug = source.repo.replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "");
  return `https://raw.githubusercontent.com/${slug}/${source.commit}/${target.path}`;
}

export type DriftStatus = "ok" | "upstream-drift" | "transform-drift";

export interface DriftResult {
  module: string;
  status: DriftStatus;
}

export type FetchText = (url: string) => Promise<string>;

const defaultFetch: FetchText = async (url) => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetch failed: ${url} -> ${res.status} ${res.statusText}`);
  }
  return res.text();
};

/**
 * Live-fetch each pinned upstream `.d.ts` and classify it against the committed
 * files: `upstream-drift` when the fetched bytes no longer match the committed
 * fixture (upstream moved off the pin), `transform-drift` when the fixture is
 * unchanged but the committed generated file differs from a fresh codemod (the
 * codemod or fixture changed without a `bun regen`). The `fetchText` seam keeps
 * the classifier offline-testable; only the CLI wires the real network.
 */
export async function checkDrift(
  packageRoot: string,
  fetchText: FetchText = defaultFetch,
): Promise<DriftResult[]> {
  const { source, targets } = readTargets(packageRoot);
  const results: DriftResult[] = [];
  for (const target of targets) {
    const fetched = await fetchText(rawUrl(source, target));
    const fixture = readFileSync(join(packageRoot, target.fixture), "utf8");
    let status: DriftStatus;
    if (fetched !== fixture) {
      status = "upstream-drift";
    } else {
      const generated = readFileSync(join(packageRoot, target.generated), "utf8");
      status = codemodDeclaration(fetched).output === generated ? "ok" : "transform-drift";
    }
    results.push({ module: target.module, status });
  }
  return results;
}

if (import.meta.main) {
  const root = join(import.meta.dir, "..");
  if (process.argv.slice(2).includes("--check")) {
    const results = await checkDrift(root);
    console.log(`checked ${results.length} vendored target(s) against ts-defold/library`);
    for (const { module, status } of results) {
      console.log(`  ${status}: ${module}`);
    }
    if (results.some((r) => r.status !== "ok")) {
      process.exitCode = 1;
    }
  } else {
    regenerate(root);
  }
}
