import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import * as ts from "typescript";
import { loadApiTargets } from "../scripts/regen";
import { parseDefoldApiDoc } from "../src/api-doc";

// Every emitted engine surface gives each type one name per namespace. Two names
// for one type render as two full entries on `/api/<namespace>`, and nothing
// tells a reader they are the same type. A pair is a duplicate when the two
// declare the same constant member set, the same body, or one is a bare alias of
// the other. Two names the surface's own reference documents are its own
// distinct elements, not a duplicate.

const PACKAGE_ROOT = resolve(import.meta.dir, "..");
const GENERATED = join(PACKAGE_ROOT, "generated");
const SRC = join(PACKAGE_ROOT, "src");
const FIXTURES = join(PACKAGE_ROOT, "fixtures");
const VERSIONED = /^versions\/(defold-[^/]+)(?:\/|$)/;

const defaultTarget = loadApiTargets().find((target) => target.default === true);
if (!defaultTarget) throw new Error("api-targets.json: no default target");
const DEFAULT_TARGET_ID = defaultTarget.id;

interface Surface {
  readonly name: string;
  readonly target: string;
  readonly files: readonly string[];
}

function declarationFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".d.ts"))
    .map((entry) => join(dir, entry.name))
    .sort();
}

function surfaceDirs(dir: string): string[] {
  const nested = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => surfaceDirs(join(dir, entry.name)));
  return declarationFiles(dir).length > 0 ? [dir, ...nested] : nested;
}

// The default and each `versions/defold-<v>` surface merge with the
// hand-authored overload files, which add to the same namespaces.
function surfaces(): Surface[] {
  const src = declarationFiles(SRC);
  return surfaceDirs(GENERATED).map((dir) => {
    const name = relative(GENERATED, dir).split("\\").join("/");
    const versioned = VERSIONED.exec(name);
    const merged = name === "" || (versioned !== null && name === `versions/${versioned[1]}`);
    return {
      name: name === "" ? "default" : name,
      target: versioned?.[1] ?? DEFAULT_TARGET_ID,
      files: [...declarationFiles(dir), ...(merged ? src : [])],
    };
  });
}

interface Located<T extends ts.Node> {
  readonly node: T;
  readonly file: ts.SourceFile;
}

interface Declaration {
  readonly nodes: Located<ts.TypeAliasDeclaration | ts.InterfaceDeclaration>[];
}

// Declarations keyed by namespace path, then name. `declare global` adds no
// segment; a module file's own top-level declarations are scoped to that file.
function collectDeclarations(files: readonly string[]): Map<string, Map<string, Declaration>> {
  const byNamespace = new Map<string, Map<string, Declaration>>();
  const add = (
    namespace: string,
    node: ts.TypeAliasDeclaration | ts.InterfaceDeclaration,
    file: ts.SourceFile,
  ) => {
    const names = byNamespace.get(namespace) ?? new Map<string, Declaration>();
    byNamespace.set(namespace, names);
    const seen = names.get(node.name.text);
    if (seen === undefined) names.set(node.name.text, { nodes: [{ node, file }] });
    else seen.nodes.push({ node, file });
  };
  const walk = (statements: readonly ts.Statement[], namespace: string, file: ts.SourceFile) => {
    for (const statement of statements) {
      if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) {
        add(namespace, statement, file);
        continue;
      }
      if (!ts.isModuleDeclaration(statement)) continue;
      let path = namespace;
      let body: ts.ModuleBody | ts.ModuleDeclaration | undefined = statement;
      while (body !== undefined && ts.isModuleDeclaration(body)) {
        const global = (body.flags & ts.NodeFlags.GlobalAugmentation) !== 0;
        if (global) path = "";
        else if (ts.isStringLiteral(body.name)) path = `"${body.name.text}"`;
        else path = path === "" ? body.name.text : `${path}.${body.name.text}`;
        body = body.body;
      }
      if (body !== undefined && ts.isModuleBlock(body)) walk(body.statements, path, file);
    }
  };
  for (const path of files) {
    const file = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest);
    const isModule = file.statements.some(
      (statement) =>
        ts.isImportDeclaration(statement) ||
        ts.isExportDeclaration(statement) ||
        ts.isExportAssignment(statement),
    );
    walk(file.statements, isModule ? `file:${relative(PACKAGE_ROOT, path)}` : "", file);
  }
  return byNamespace;
}

const printer = ts.createPrinter({ removeComments: true });
const printed = (node: ts.Node, file: ts.SourceFile): string =>
  printer
    .printNode(ts.EmitHint.Unspecified, node, file)
    .replace(/\s+/g, " ")
    .replace(/[;,]\s*$/, "")
    .trim();

function membersBody(
  members: readonly Located<ts.TypeElement>[],
  heritage: readonly Located<ts.HeritageClause>[] = [],
): string {
  const sorted = members.map(({ node, file }) => printed(node, file)).sort();
  const extended = heritage.map(({ node, file }) => printed(node, file)).sort();
  return `${extended.join(" ")}{ ${sorted.join("; ")} }`;
}

// The body a declaration gives its name, comments and whitespace stripped and
// object members sorted, so an interface and an object-literal alias of the same
// shape compare equal. An interface with no members is a merge target, never a
// body; it returns undefined.
function normalizedBody(declaration: Declaration): string | undefined {
  const [first] = declaration.nodes;
  if (first === undefined) return undefined;
  const { node, file } = first;
  const params = (node.typeParameters ?? []).map((param) => printed(param, file)).join(", ");
  const prefix = params === "" ? "" : `<${params}>`;
  if (ts.isInterfaceDeclaration(node)) {
    const members: Located<ts.TypeElement>[] = [];
    const heritage: Located<ts.HeritageClause>[] = [];
    for (const located of declaration.nodes) {
      if (!ts.isInterfaceDeclaration(located.node)) continue;
      for (const member of located.node.members) members.push({ node: member, file: located.file });
      for (const clause of located.node.heritageClauses ?? []) {
        heritage.push({ node: clause, file: located.file });
      }
    }
    if (members.length === 0 && heritage.length === 0) return undefined;
    return prefix + membersBody(members, heritage);
  }
  const { type } = node;
  if (!ts.isTypeLiteralNode(type)) return prefix + printed(type, file);
  return prefix + membersBody(type.members.map((member) => ({ node: member, file })));
}

// The constants a union of `typeof X` arms names, each arm read as `X` whether
// or not it is wrapped in `NonNullable<...>`, qualified by the namespace when
// written bare. Any other arm makes it no constant union.
function constantMembers(declaration: Declaration, namespace: string): string | undefined {
  const [first] = declaration.nodes;
  if (first === undefined || !ts.isTypeAliasDeclaration(first.node)) return undefined;
  const { node, file } = first;
  const arms = ts.isUnionTypeNode(node.type) ? node.type.types : [node.type];
  const members: string[] = [];
  for (const arm of arms) {
    let query: ts.TypeNode = arm;
    if (
      ts.isTypeReferenceNode(arm) &&
      ts.isIdentifier(arm.typeName) &&
      arm.typeName.text === "NonNullable" &&
      arm.typeArguments?.length === 1
    ) {
      query = arm.typeArguments[0] as ts.TypeNode;
    }
    if (!ts.isTypeQueryNode(query)) return undefined;
    const name = query.exprName.getText(file);
    members.push(ts.isIdentifier(query.exprName) ? `${namespace}.${name}` : name);
  }
  return members.sort().join(" | ");
}

// The same-namespace name a bare `type A = B` (no type arguments) points at,
// written `B` or `<namespace>.B`.
function bareAliasTarget(declaration: Declaration, namespace: string): string | undefined {
  const [first] = declaration.nodes;
  if (first === undefined || !ts.isTypeAliasDeclaration(first.node)) return undefined;
  const { type } = first.node;
  if (!ts.isTypeReferenceNode(type) || type.typeArguments !== undefined) return undefined;
  const name = type.typeName.getText(first.file);
  if (ts.isIdentifier(type.typeName)) return name;
  return name.startsWith(`${namespace}.`) ? name.slice(namespace.length + 1) : undefined;
}

// The `<namespace>.<name>` of every TYPEDEF, STRUCT and ENUM a target's own
// reference documents, read with the production ref-doc parser.
const referenceNamesCache = new Map<string, Set<string>>();
function referenceNames(target: string): Set<string> {
  const cached = referenceNamesCache.get(target);
  if (cached !== undefined) return cached;
  const names = new Set<string>();
  const dir = join(FIXTURES, target);
  if (!existsSync(dir)) throw new Error(`no ref-doc fixtures for ${target} at ${dir}`);
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith("_doc.json")) continue;
    const module = parseDefoldApiDoc(JSON.parse(readFileSync(join(dir, entry), "utf8")));
    const qualify = (name: string) =>
      name.startsWith(`${module.namespace}.`) ? name : `${module.namespace}.${name}`;
    for (const element of [
      ...module.typedefs,
      ...(module.structs ?? []),
      ...(module.enums ?? []),
    ]) {
      names.add(qualify(element.name));
    }
  }
  referenceNamesCache.set(target, names);
  return names;
}

function duplicateDefects(surface: Surface): string[] {
  const reference = referenceNames(surface.target);
  const defects: string[] = [];
  for (const [namespace, names] of collectDeclarations(surface.files)) {
    const entries = [...names].sort(([a], [b]) => a.localeCompare(b));
    const documented = (name: string) => reference.has(`${namespace}.${name}`);
    const report = (a: string, b: string, reason: string) => {
      if (documented(a) && documented(b)) return;
      defects.push(`${surface.name}: ${namespace}: ${a} and ${b} ${reason}`);
    };
    const reported = new Set<string>();
    const pairKey = (a: string, b: string) => [a, b].sort().join("\0");
    for (const [name, declaration] of entries) {
      const target = bareAliasTarget(declaration, namespace);
      if (target === undefined || target === name || !names.has(target)) continue;
      reported.add(pairKey(name, target));
      report(name, target, `name one type: \`type ${name} = ${target}\` is a bare alias`);
    }
    for (const [index, [a, first]] of entries.entries()) {
      const firstMembers = constantMembers(first, namespace);
      const firstBody = normalizedBody(first);
      for (const [b, second] of entries.slice(index + 1)) {
        if (reported.has(pairKey(a, b))) continue;
        const secondMembers = constantMembers(second, namespace);
        if (firstMembers !== undefined && firstMembers === secondMembers) {
          reported.add(pairKey(a, b));
          report(a, b, `declare the same constant member set: ${firstMembers}`);
          continue;
        }
        if (firstBody !== undefined && firstBody === normalizedBody(second)) {
          reported.add(pairKey(a, b));
          report(a, b, `declare the same body: ${firstBody.slice(0, 160)}`);
        }
      }
    }
  }
  return defects;
}

describe("single name per type", () => {
  const all = surfaces();

  test("every generated surface directory is scanned", () => {
    const names = all.map((surface) => surface.name);
    expect(names).toContain("default");
    expect(names).toContain("render-script-modules");
    expect(names).toContain("editor-vm");
    expect(names).toContain("kinds");
    expect(names.some((name) => VERSIONED.test(name))).toBe(true);
  });

  for (const surface of all) {
    test(`${surface.name} declares each type under one name per namespace`, () => {
      expect(duplicateDefects(surface)).toEqual([]);
    });
  }
});
