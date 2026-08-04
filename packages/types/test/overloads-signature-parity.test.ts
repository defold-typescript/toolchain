import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as ts from "typescript";
import {
  GO_SIGNATURES_PATH,
  loadSignatureFile,
  MSG_SIGNATURES_PATH,
  VMATH_SIGNATURES_PATH,
} from "../scripts/signature-store-fs";

// Source of truth for every `signatures/<namespace>.json` override: the shipped
// generics live in these declaration files, dropped from auto-emit and
// re-supplied at build time.
function overloadsPath(file: string): string {
  return resolve(import.meta.dir, "..", "src", file);
}

interface OverloadNamespace {
  namespace: string;
  declarationsPath: string;
  storePath: string;
  fqns: readonly string[];
  // A one-line declaration reflowed across lines: the rendered signature must
  // not move, so a Biome reformat of the `.d.ts` cannot force a JSON re-author.
  reflow: { from: string; to: string };
  driftSignature: { fqn: string; from: string; to: string };
  driftDoc: { fqn: string; from: string; to: string };
}

const NAMESPACES: readonly OverloadNamespace[] = [
  {
    namespace: "vmath",
    declarationsPath: overloadsPath("vmath-overloads.d.ts"),
    storePath: VMATH_SIGNATURES_PATH,
    fqns: ["vmath.clamp", "vmath.lerp", "vmath.slerp", "vmath.mul_per_elem", "vmath.normalize"],
    reflow: {
      from: "function lerp(t: number, q1: Quaternion, q2: Quaternion): Quaternion;",
      to: "function lerp(\n      t: number,\n      q1: Quaternion,\n      q2: Quaternion,\n    ): Quaternion;",
    },
    driftSignature: {
      fqn: "vmath.normalize",
      from: "function normalize<T extends Vector3 | Vector4 | Quaternion>(v1: T): T;",
      to: "function normalize<T extends Vector3 | Vector4>(v1: T): T;",
    },
    driftDoc: {
      fqn: "vmath.lerp",
      from: "Linearly interpolate between two values.",
      to: "Linearly interpolate between two scalars.",
    },
  },
  {
    namespace: "go",
    declarationsPath: overloadsPath("go-overloads.d.ts"),
    storePath: GO_SIGNATURES_PATH,
    fqns: ["go.get", "go.set", "go.property"],
    reflow: {
      from: "function property(name: string, value: Hash): ScriptProperty<Hash>;",
      to: "function property(\n      name: string,\n      value: Hash,\n    ): ScriptProperty<Hash>;",
    },
    driftSignature: {
      fqn: "go.property",
      from: "function property(name: string, value: boolean): ScriptProperty<boolean>;",
      to: "function property(name: string, value: 0 | 1): ScriptProperty<boolean>;",
    },
    driftDoc: {
      fqn: "go.get",
      from: "gets a named property of the specified game object or component",
      to: "gets a named property of the specified game object",
    },
  },
  {
    namespace: "msg",
    declarationsPath: overloadsPath("msg-overloads.d.ts"),
    storePath: MSG_SIGNATURES_PATH,
    fqns: ["msg.post", "msg.url"],
    reflow: {
      from: "function url(socket: string | Hash, path: string | Hash, fragment: string | Hash): Url;",
      to: "function url(\n      socket: string | Hash,\n      path: string | Hash,\n      fragment: string | Hash,\n    ): Url;",
    },
    driftSignature: {
      fqn: "msg.url",
      from: "function url(urlstring: string): Url;",
      to: "function url(urlstring: string | Hash): Url;",
    },
    driftDoc: {
      fqn: "msg.url",
      from: "Construct a URL. A URL is",
      to: "Build a URL. A URL is",
    },
  },
];

function parseDeclarations(spec: OverloadNamespace, source?: string): ts.SourceFile {
  const text = source ?? readFileSync(spec.declarationsPath, "utf8");
  return ts.createSourceFile(spec.declarationsPath, text, ts.ScriptTarget.Latest, true);
}

// Walk the one `namespace <ns>` block and hand back every function declaration in
// declared (source) order. All three files nest the namespace inside
// `declare global`, and only `FunctionDeclaration` statements render — the
// file-local `interface`/`type` helpers are skipped.
function forEachOverload(
  spec: OverloadNamespace,
  sourceFile: ts.SourceFile,
  visitFn: (fn: ts.FunctionDeclaration) => void,
): void {
  function visit(node: ts.Node): void {
    if (
      ts.isModuleDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === spec.namespace
    ) {
      if (node.body && ts.isModuleBlock(node.body)) {
        for (const statement of node.body.statements) {
          if (ts.isFunctionDeclaration(statement)) visitFn(statement);
        }
      }
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

function renderTypeParams(
  typeParameters: ts.NodeArray<ts.TypeParameterDeclaration> | undefined,
  sourceFile: ts.SourceFile,
): string {
  if (!typeParameters || typeParameters.length === 0) return "";
  return `<${typeParameters.map((tp) => tp.getText(sourceFile)).join(", ")}>`;
}

function renderParams(
  parameters: ts.NodeArray<ts.ParameterDeclaration>,
  sourceFile: ts.SourceFile,
): string {
  return parameters.map((p) => p.getText(sourceFile)).join(", ");
}

// A curried overload returns a function type whose source span wraps across
// lines and keeps a trailing comma, so rebuild it from its children instead of
// reusing `getText()` verbatim.
function renderType(type: ts.TypeNode | undefined, sourceFile: ts.SourceFile): string {
  if (!type) return "void";
  if (ts.isFunctionTypeNode(type)) {
    return `${renderTypeParams(type.typeParameters, sourceFile)}(${renderParams(
      type.parameters,
      sourceFile,
    )}) => ${renderType(type.type, sourceFile)}`;
  }
  return type.getText(sourceFile);
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

// Render every function declaration as the `<ns>.<name><typeParams>(<params>): <return>`
// string the docs store holds, grouped by FQN in declared order. Parameters reuse
// the source spelling verbatim so the rendered form and the authored JSON compare
// 1:1 — a signature added, removed, or edited in the `.d.ts` without updating the
// JSON drifts.
function renderOverloadSignatures(
  spec: OverloadNamespace,
  source?: string,
): Record<string, string[]> {
  const sourceFile = parseDeclarations(spec, source);
  const rendered: Record<string, string[]> = {};

  forEachOverload(spec, sourceFile, (fn) => {
    if (!fn.name) return;
    const fqn = `${spec.namespace}.${fn.name.text}`;
    const signature = `${fqn}${renderTypeParams(fn.typeParameters, sourceFile)}(${renderParams(
      fn.parameters,
      sourceFile,
    )}): ${renderType(fn.type, sourceFile)}`;
    const forms = rendered[fqn] ?? [];
    forms.push(collapseWhitespace(signature));
    rendered[fqn] = forms;
  });

  return rendered;
}

// Collapse each paragraph of the JSDoc comment to the single line the store
// holds, keeping the blank lines between paragraphs so an authored bullet list
// survives the round trip into `docs[]`. An overload with no description (a
// `@deprecated`-only comment, or no comment at all) maps to `null` — the store's
// "keep the ref-doc fixture prose for this row" marker.
function normalizeDoc(text: string): string | null {
  const paragraphs = text
    .split(/\n[ \t]*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter((paragraph) => paragraph !== "");
  return paragraphs.length === 0 ? null : paragraphs.join("\n\n");
}

// The per-overload JSDoc description (the comment before the `@param`/`@returns`
// tags) for every function declaration, grouped by FQN in declared order — the
// same walk `renderOverloadSignatures` does, so `docs[i]` lines up with
// `signatures[i]`. A JSDoc description edited in the `.d.ts` without a matching
// JSON update drifts.
function renderOverloadDescriptions(
  spec: OverloadNamespace,
  source?: string,
): Record<string, (string | null)[]> {
  const sourceFile = parseDeclarations(spec, source);
  const rendered: Record<string, (string | null)[]> = {};

  forEachOverload(spec, sourceFile, (fn) => {
    if (!fn.name) return;
    const fqn = `${spec.namespace}.${fn.name.text}`;
    let description: string | null = null;
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
  });

  return rendered;
}

const OVERLOAD_COUNTS: Record<string, number> = {
  "go.get": 3,
  "go.set": 3,
  "go.property": 8,
  "msg.post": 2,
  "msg.url": 3,
};

describe.each(
  NAMESPACES.map((spec) => [spec.namespace, spec] as const),
)("%s overloads signature parity", (namespace, spec) => {
  const rendered = renderOverloadSignatures(spec);
  const descriptions = renderOverloadDescriptions(spec);
  const store = loadSignatureFile(spec.storePath);

  test(`signatures/${namespace}.json carries exactly the override-covered ${namespace} FQNs`, () => {
    expect(Object.keys(store).sort()).toEqual([...spec.fqns].sort());
  });

  for (const fqn of spec.fqns) {
    test(`${fqn} JSON signatures equal the rendered ${namespace}-overloads.d.ts declarations`, () => {
      expect(store[fqn]?.signatures).toEqual(rendered[fqn] ?? []);
    });

    test(`${fqn} JSON docs equal the rendered ${namespace}-overloads.d.ts JSDoc descriptions`, () => {
      expect(store[fqn]?.docs).toEqual(descriptions[fqn] ?? []);
    });

    const expectedCount = OVERLOAD_COUNTS[fqn];
    if (expectedCount !== undefined) {
      test(`${fqn} renders ${expectedCount} declared overloads`, () => {
        expect(rendered[fqn]).toHaveLength(expectedCount);
        expect(store[fqn]?.signatures).toHaveLength(expectedCount);
      });
    }
  }

  test("no rendered signature spans more than one line", () => {
    for (const forms of Object.values(rendered)) {
      for (const form of forms) expect(form).not.toContain("\n");
    }
  });

  test("reflowing a declaration across lines renders byte-identical signatures", () => {
    const original = readFileSync(spec.declarationsPath, "utf8");
    expect(original).toContain(spec.reflow.from);
    const reflowed = original.replace(spec.reflow.from, spec.reflow.to);
    expect(reflowed).not.toBe(original);
    expect(renderOverloadSignatures(spec, reflowed)).toEqual(rendered);
  });

  test("drift simulation: an edited .d.ts signature no longer matches the committed JSON", () => {
    const edited = readFileSync(spec.declarationsPath, "utf8").replace(
      spec.driftSignature.from,
      spec.driftSignature.to,
    );
    const drifted = renderOverloadSignatures(spec, edited);
    expect(drifted[spec.driftSignature.fqn]).not.toEqual(
      store[spec.driftSignature.fqn]?.signatures,
    );
  });

  test("drift simulation: an edited .d.ts JSDoc description no longer matches the committed JSON", () => {
    const edited = readFileSync(spec.declarationsPath, "utf8").replace(
      spec.driftDoc.from,
      spec.driftDoc.to,
    );
    const drifted = renderOverloadDescriptions(spec, edited);
    expect(drifted[spec.driftDoc.fqn]).not.toEqual(store[spec.driftDoc.fqn]?.docs);
  });
});

const goSpec = NAMESPACES.find((spec) => spec.namespace === "go") as OverloadNamespace;
const msgSpec = NAMESPACES.find((spec) => spec.namespace === "msg") as OverloadNamespace;
const vmathSpec = NAMESPACES.find((spec) => spec.namespace === "vmath") as OverloadNamespace;

describe("curried and multi-paragraph overload rendering", () => {
  const goSignatures = renderOverloadSignatures(goSpec);
  const goDescriptions = renderOverloadDescriptions(goSpec);
  const msgDescriptions = renderOverloadDescriptions(msgSpec);

  test("go.get's curried overload renders as a one-line function return type", () => {
    expect(goSignatures["go.get"]?.[0]).toBe(
      "go.get<P>(): <K extends keyof P>(url: string | Hash | Url, property: K, options?: GoPropertyOptions) => P[K]",
    );
  });

  test("go.set's curried overload renders as a one-line function return type", () => {
    expect(goSignatures["go.set"]?.[0]).toBe(
      "go.set<P>(): <K extends keyof P>(url: string | Hash | Url, property: K, value: P[K], options?: GoPropertyOptions) => void",
    );
  });

  test("an overload with no JSDoc description maps to null, not an empty string", () => {
    const get = goDescriptions["go.get"] ?? [];
    expect(get).toHaveLength(3);
    expect(typeof get[0]).toBe("string");
    expect(get.slice(1)).toEqual([null, null]);

    const property = goDescriptions["go.property"] ?? [];
    // 8 is the published overload count for `go.property` (one documented plus the
    // seven deprecated typed forms); the slice below enumerates the trailing seven,
    // so the two assertions pin the same set from both ends.
    expect(property).toHaveLength(8);
    expect(typeof property[0]).toBe("string");
    // the seven trailing overloads carry a `@deprecated`-only JSDoc
    expect(property.slice(1)).toEqual([null, null, null, null, null, null, null]);
  });

  test("msg.post's description keeps its paragraph breaks and bullet lines", () => {
    const primary = msgDescriptions["msg.post"]?.[0] ?? "";
    expect(primary).toContain("\n\n");
    expect(primary).toContain('- `"."` the current game object');
    expect(primary).toContain('- `"#"` the current component');
    expect(primary).toContain("There is a 2 kilobyte limit");
  });

  test("the paragraph-preserving normalizer is a no-op for every vmath description", () => {
    const descriptions = renderOverloadDescriptions(vmathSpec);
    for (const forms of Object.values(descriptions)) {
      for (const form of forms) expect(form).not.toContain("\n");
    }
  });
});
