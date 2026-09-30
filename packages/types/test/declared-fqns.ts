import * as ts from "typescript";

// Every declaration a `.d.ts` body introduces, keyed by the fully-qualified name
// a consumer would write. Parsing beats a regex here because the two shapes the
// editor VM surface leans on — `namespace tilemap.tiles` (nested
// ModuleDeclarations under one statement) and the reserved-name recovery
// `function _new(); export { _new as new }` — both need the enclosing namespace
// path to answer whether an upstream member actually reached the surface.
export function collectDeclaredFqns(contents: string, namespaces = true): Set<string> {
  const source = ts.createSourceFile("declared.d.ts", contents, ts.ScriptTarget.Latest, true);
  const out = new Set<string>();
  // `export { _enum as enum }` also re-exports the members of a `namespace _enum`.
  const aliases: [string, string][] = [];
  const qualify = (prefix: string, name: string): string => (prefix ? `${prefix}.${name}` : name);

  const walk = (statements: readonly ts.Statement[], prefix: string): void => {
    for (const node of statements) {
      if (ts.isModuleDeclaration(node)) {
        // `declare global` is the ambient wrapper, not a namespace segment.
        const name = node.name.getText();
        const next = name === "global" ? prefix : qualify(prefix, name);
        if (next !== prefix && namespaces) out.add(next);
        const body = node.body;
        if (body && ts.isModuleBlock(body)) walk(body.statements, next);
        else if (body && ts.isModuleDeclaration(body)) walk([body], next);
        continue;
      }
      if (ts.isFunctionDeclaration(node)) {
        if (node.name) out.add(qualify(prefix, node.name.text));
      } else if (ts.isVariableStatement(node)) {
        for (const declaration of node.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name)) out.add(qualify(prefix, declaration.name.text));
        }
      } else if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
        out.add(qualify(prefix, node.name.text));
      } else if (
        ts.isExportDeclaration(node) &&
        node.exportClause &&
        ts.isNamedExports(node.exportClause)
      ) {
        for (const element of node.exportClause.elements) {
          out.add(qualify(prefix, element.name.text));
          if (element.propertyName) {
            aliases.push([
              qualify(prefix, element.propertyName.getText()),
              qualify(prefix, element.name.text),
            ]);
          }
        }
      }
    }
  };

  walk(source.statements, "");
  for (const [local, exported] of aliases) {
    for (const name of [...out]) {
      if (name.startsWith(`${local}.`)) out.add(exported + name.slice(local.length));
    }
  }
  return out;
}

export interface FixtureDoc {
  readonly elements: readonly {
    readonly name: string;
    readonly type: string;
    readonly description?: string;
    readonly members?: readonly { readonly name: string }[];
  }[];
}

// The vendored fixture element names that never reach the emitted declaration —
// the emitter's own expressiveness gap, measured against upstream rather than
// against a second model of the emitter.
//
// A FUNCTION reaches it only as a callable, not as the namespace its option
// struct nests under (`json.decode.options` opens `namespace decode`), and an
// ENUM reaches it member by member, as the constants it names.
export function unexpressedFixtureNames(doc: unknown, contents: string): string[] {
  const declared = collectDeclaredFqns(contents);
  const callables = collectDeclaredFqns(contents, false);
  return (doc as FixtureDoc).elements
    .flatMap((element) =>
      element.type === "ENUM" && element.members !== undefined && element.members.length > 0
        ? element.members.map((member) => ({ name: member.name, type: "CONSTANT" }))
        : [{ name: element.name, type: element.type }],
    )
    .filter(({ name, type }) => !(type === "FUNCTION" ? callables : declared).has(name))
    .map(({ name }) => name)
    .sort();
}
