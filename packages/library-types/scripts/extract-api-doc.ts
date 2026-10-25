import ts from "typescript";

const printer = ts.createPrinter({ removeComments: true });

/**
 * Any node's text as a single comment-free line. The printer re-emits the AST
 * (so a `//`/`/*` inside a string-literal type is never mistaken for a
 * comment), then interior whitespace is collapsed so multi-line object literals
 * and wrapped unions no longer leak newlines or member JSDoc into `/api`.
 */
function oneLineText(node: ts.Node, sf: ts.SourceFile): string {
  return printer.printNode(ts.EmitHint.Unspecified, node, sf).replace(/\s+/g, " ").trim();
}

function typeText(node: ts.TypeNode, sf: ts.SourceFile): string {
  return oneLineText(node, sf);
}

interface Field {
  name: string;
  doc: string;
  types: string[];
  is_optional: string;
  fields?: Field[];
}

/**
 * Recursively walk an object-literal type's property members into a `fields`
 * tree, preserving each member's JSDoc alongside the flat `typeText` token (see
 * bug-39). Returns `undefined` for a non-object-literal node or a literal with
 * no property members (e.g. an index-signature-only map), so plain-typed
 * parameters emit no `fields` key.
 */
function objectFields(node: ts.TypeNode | undefined, sf: ts.SourceFile): Field[] | undefined {
  if (!node || !ts.isTypeLiteralNode(node)) return undefined;
  const fields: Field[] = [];
  for (const member of node.members) {
    if (!ts.isPropertySignature(member) || !member.type) continue;
    const nested = objectFields(member.type, sf);
    fields.push({
      name: member.name.getText(sf),
      doc: jsDocSummary(member),
      types: [typeText(member.type, sf)],
      is_optional: member.questionToken ? "True" : "False",
      ...(nested ? { fields: nested } : {}),
    });
  }
  return fields.length > 0 ? fields : undefined;
}

/**
 * Turn a vendored `declare module '<name>'` ambient `.d.ts` into the
 * `{ info, elements }` JSON shape that `@defold-typescript/types`'
 * `parseDefoldApiDoc` accepts, so the docs-site consumes ref-doc JSON and never
 * parses `.d.ts`. Pure and node-free (string in, object out) so it is unit
 * testable and reusable by `regen`; walks the TS AST rather than regexing the
 * source.
 *
 * The output carries module content only. Per-library provenance
 * (repo/commit/import string) is joined at load time from
 * `library-classification.json` + `NOTICE`, not written here.
 */
export function extractApiDoc(source: string, moduleName: string): unknown {
  const sf = ts.createSourceFile(
    "module.d.ts",
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  );

  const moduleBlock = findModuleBlock(sf);
  const rawSummary = moduleBlock ? jsDocSummary(moduleBlock.parent) : "";
  // ts-defold marks a hand-written stub module with a fixed "definition stub"
  // JSDoc that carries no real docs. Emitting it as `info.description` would
  // shadow the docs-site fallback to the GitHub-sourced `library-descriptions`
  // text, so treat the sentinel as no summary and let that fallback fill in.
  const summary = isStubSummary(rawSummary) ? "" : rawSummary;

  const statements = moduleBlock?.statements ?? [];
  // A string-named ambient module's public surface is the module block itself.
  // When it has no `export =` re-export, every top-level (and nested-namespace)
  // declaration is API regardless of a missing `export` keyword — ts-defold
  // vendors both `export function` and bare `function` for the same intent
  // (`rendy.rendy`, `in.onscreen`). With an `export =`, the bare declarations
  // are internal plumbing behind the re-exported value, so they stay unemitted
  // and the value's interface drives the surface instead (`squid`).
  const emitBare = !statements.some(ts.isExportAssignment);

  const elements: Record<string, unknown>[] = [];
  const emittedNames = new Set<string>();
  // Each type node carries the blocks enclosing the member that named it,
  // innermost first, so the reference resolves where it was written.
  const moduleScopes: Scope[] = moduleBlock ? [blockScope("", moduleBlock.statements)] : [];
  const moduleTypeNodes: ScopedTypeNode[] = [];
  const moduleSink: TypeNodeSink = {
    push: (node) => void moduleTypeNodes.push({ node, scopes: moduleScopes }),
  };
  // Type nodes reached from file-scope declarations, kept apart from the module
  // block's so an ambient global can never pull a module-block shape onto `/api`
  // that the module surface alone did not reach.
  const globalTypeNodes: ScopedTypeNode[] = [];
  // Each alias's declaration paired with the bare element it already pushed, so
  // a reachable alias is filled in by merging into that element rather than by
  // appending a second one — element order stays as emitted.
  const aliasElements = new Map<ts.TypeAliasDeclaration, Record<string, unknown>>();

  // Members nested in an `export namespace` (`bridge.bridge`) keep their
  // namespace path so same-named members across namespaces (e.g. `is_supported`)
  // stay distinct instead of colliding in `emittedNames`.
  //
  // The `global` lane walks the file's own statements rather than the module
  // block's. There the gate is the `declare` modifier (there is no `export =` to
  // suppress bare declarations, so `emitBare` does not apply), each element
  // carries the `global` marker, and a type alias is not pushed eagerly — file
  // scope carries far more incidental type machinery than a module block, so a
  // shape publishes only once reachability proves a published signature names it.
  //
  // The `table` lane is a `@globalTable` module: the block is an extension's
  // global namespace behind an import, so it publishes the way that namespace
  // does in the `global` lane, unmarked. A curated native's api-doc therefore
  // does not depend on which of the two forms wraps it.
  const collect = (
    nodes: readonly ts.Statement[],
    prefix: string,
    lane: Lane,
    scopes: readonly Scope[],
  ): void => {
    const qualify = (name: string): string => (prefix ? `${prefix}.${name}` : name);
    const global = lane === "global";
    const mark = global ? { global: true } : {};
    const sink = global ? globalTypeNodes : moduleTypeNodes;
    const typeNodes: TypeNodeSink = { push: (node) => void sink.push({ node, scopes }) };
    // Inside an ambient namespace every member is ambient by containment, so the
    // nested lane emits regardless of an `export` keyword.
    const gate = (stmt: ts.HasModifiers): boolean =>
      global ? prefix !== "" || isAmbient(stmt) || isExported(stmt) : isExported(stmt) || emitBare;
    for (const stmt of nodes) {
      if (ts.isFunctionDeclaration(stmt) && stmt.name && gate(stmt)) {
        collectFunctionReferenceTypes(stmt, typeNodes);
        const name = qualify(stmt.name.text);
        elements.push({ ...functionElement(stmt, name, sf), ...mark });
        emittedNames.add(name);
      } else if (ts.isVariableStatement(stmt) && gate(stmt)) {
        // The `VariableStatement` carries the JSDoc, not the declaration, so both the
        // summary and the deprecation tag are read once from the statement and shared
        // by every declarator under it.
        const summary = jsDocSummary(stmt);
        for (const decl of stmt.declarationList.declarations) {
          if (decl.type) typeNodes.push(decl.type);
          const fields = objectFields(decl.type, sf);
          const name = qualify(decl.name.getText(sf));
          elements.push({
            type: "VARIABLE",
            name,
            // Unconditional, matching `functionElement`: an absent key and an empty one
            // would be two shapes the docs-site had to tell apart for no gain.
            brief: briefOf(summary),
            description: summary,
            types: decl.type ? [typeText(decl.type, sf)] : [],
            ...(fields ? { fields } : {}),
            ...deprecatedKey(stmt),
            ...mark,
          });
          emittedNames.add(name);
        }
      } else if (ts.isTypeAliasDeclaration(stmt)) {
        if (lane !== "module") continue;
        const name = qualify(stmt.name.text);
        const element: Record<string, unknown> = { type: "TYPEDEF", name };
        elements.push(element);
        emittedNames.add(name);
        aliasElements.set(stmt, element);
      } else if (
        ts.isModuleDeclaration(stmt) &&
        !ts.isStringLiteral(stmt.name) &&
        stmt.body &&
        ts.isModuleBlock(stmt.body) &&
        gate(stmt)
      ) {
        const nested = qualify(stmt.name.getText(sf));
        const inner = [blockScope(nested, stmt.body.statements), ...scopes];
        collect(stmt.body.statements, nested, lane, inner);
      }
    }
  };
  const lane: Lane = moduleBlock && isGlobalTable(moduleBlock.parent) ? "table" : "module";
  collect(statements, "", lane, moduleScopes);

  const moduleValueInterfaces = exportedValueInterfaces(moduleBlock);
  for (const iface of moduleValueInterfaces) {
    for (const member of iface.members) {
      if (!member.name) continue;
      const name = memberName(member.name, sf);
      if (emittedNames.has(name)) continue;
      if (ts.isMethodSignature(member)) {
        collectFunctionReferenceTypes(member, moduleSink);
        elements.push(functionElement(member, name, sf));
        emittedNames.add(name);
      } else if (ts.isPropertySignature(member)) {
        if (member.type) moduleSink.push(member.type);
        const fields = objectFields(member.type, sf);
        elements.push({
          type: "VARIABLE",
          name,
          types: member.type ? [typeText(member.type, sf)] : [],
          ...(fields ? { fields } : {}),
          ...deprecatedKey(member),
        });
        emittedNames.add(name);
      }
    }
  }

  // Shapes the `table` and `global` lanes reach are appended in first-reached
  // order, each publishing only if it has something to show.
  const publishShapes = (shapes: readonly ReachedShape[], mark: { global?: true }): void => {
    for (const { name, alias, iface, scoped } of shapes) {
      if (emittedNames.has(name)) continue;
      if (alias) {
        if (ts.isTypeLiteralNode(alias.type)) {
          const { functions, properties } = shapeMembers(alias.type.members, sf);
          if (functions.length === 0 && properties.length === 0) continue;
          elements.push({
            type: "TYPEDEF",
            name,
            ...(functions.length > 0 ? { functions } : {}),
            ...(properties.length > 0 ? { properties } : {}),
            ...deprecatedKey(alias),
            ...mark,
          });
          emittedNames.add(name);
          continue;
        }
        // A union has no member list to publish, so its top-level arms are the
        // only representation of it. Only a block lane does this: file scope
        // carries incidental aliases a published signature merely mentions.
        if (!scoped) continue;
        elements.push({
          type: "TYPEDEF",
          name,
          types: unionMemberTexts(alias.type, sf),
          ...deprecatedKey(alias),
          ...mark,
        });
        emittedNames.add(name);
        continue;
      }
      if (!iface || moduleValueInterfaces.includes(iface)) continue;
      const typedef = interfaceTypedef(iface, sf, name, scoped);
      if (!typedef) continue;
      elements.push({ ...typedef, ...mark });
      emittedNames.add(name);
    }
  };

  if (lane === "table") {
    publishShapes(reachedShapes(moduleTypeNodes, [], true), {});
  } else {
    // A module block's aliases were pushed where they are declared, so a reached
    // one is filled in place and only its interfaces append, in reached order.
    // Its interfaces' members are not walked, so a shape named only by another
    // shape's member stays off `/api`.
    for (const { name, alias, iface, scoped } of reachedShapes(moduleTypeNodes, [], false)) {
      if (alias) {
        const element = aliasElements.get(alias);
        if (element) fillAliasElement(element, alias, sf);
        continue;
      }
      if (!iface || moduleValueInterfaces.includes(iface) || emittedNames.has(name)) continue;
      const typedef = interfaceTypedef(iface, sf, name, scoped);
      if (!typedef) continue;
      elements.push(typedef);
      emittedNames.add(name);
    }
  }

  // The ambient lane runs last so every module-block element keeps the index it
  // has today. Its shapes resolve against file-scope declarations only, by node
  // identity, so a file-scope shape never borrows a same-named module-block one.
  collect(sf.statements, "", "global", []);
  const fileScope: Scope = { ...blockScope("", sf.statements), scoped: false };
  publishShapes(reachedShapes(globalTypeNodes, [fileScope], true), { global: true });

  return {
    info: { namespace: moduleName, brief: briefOf(summary), description: summary },
    elements,
  };
}

/**
 * A declaration's type parameter list as the pre-rendered string the sibling
 * `lower-api-doc` lane emits (`<T>`, `<T = unknown>`, `<A, B extends A>`), or
 * `""` when there is none — absence of the key, not an empty string, is how the
 * model encodes "takes no type arguments".
 */
function genericClause(
  decl: ts.FunctionDeclaration | ts.MethodSignature,
  sf: ts.SourceFile,
): string {
  const params = decl.typeParameters;
  if (!params || params.length === 0) return "";
  return `<${params.map((p) => oneLineText(p, sf)).join(", ")}>`;
}

function functionElement(
  decl: ts.FunctionDeclaration | ts.MethodSignature,
  name: string,
  sf: ts.SourceFile,
): Record<string, unknown> {
  const summary = jsDocSummary(decl);
  const paramDocs = paramDocMap(decl, sf);
  const parameters = decl.parameters.map((p) => {
    const pname = p.name.getText(sf);
    const fields = objectFields(p.type, sf);
    return {
      name: pname,
      doc: paramDocs.get(pname) ?? "",
      types: p.type ? [typeText(p.type, sf)] : [],
      is_optional: p.questionToken || p.initializer ? "True" : "False",
      ...(fields ? { fields } : {}),
    };
  });

  const returnText = decl.type ? typeText(decl.type, sf) : "";
  const returnFields = objectFields(decl.type, sf);
  const returnvalues =
    returnText === "" || returnText === "void"
      ? []
      : [
          {
            name: "",
            doc: returnDoc(decl),
            types: [returnText],
            ...(returnFields ? { fields: returnFields } : {}),
          },
        ];

  const example = exampleText(decl);
  const generics = genericClause(decl, sf);
  return {
    type: "FUNCTION",
    name,
    brief: briefOf(summary),
    description: summary,
    ...(generics === "" ? {} : { generics }),
    parameters,
    returnvalues,
    ...(example === "" ? {} : { examples: example }),
    ...deprecatedKey(decl),
  };
}

function collectFunctionReferenceTypes(
  decl: ts.FunctionDeclaration | ts.MethodSignature,
  out: TypeNodeSink,
): void {
  for (const param of decl.parameters) {
    if (param.type) out.push(param.type);
  }
  if (decl.type) out.push(decl.type);
}

interface ShapeMembers {
  functions: Record<string, unknown>[];
  properties: Record<string, unknown>[];
}

/**
 * The one member reader shared by both shape carriers — an `interface`
 * declaration and a `type X = { … }` alias — so the two lanes cannot drift.
 * `is_optional` is written only on an optional member, matching how
 * `deprecatedKey` encodes absence and keeping a regen diff proportional to what
 * actually changed.
 */
function shapeMembers(members: readonly ts.TypeElement[], sf: ts.SourceFile): ShapeMembers {
  const functions: Record<string, unknown>[] = [];
  const properties: Record<string, unknown>[] = [];
  for (const member of members) {
    if (!member.name) continue;
    const name = memberName(member.name, sf);
    if (ts.isMethodSignature(member)) {
      functions.push(functionElement(member, name, sf));
    } else if (ts.isPropertySignature(member)) {
      const summary = jsDocSummary(member);
      const fields = objectFields(member.type, sf);
      properties.push({
        name,
        brief: briefOf(summary),
        description: summary,
        types: member.type ? [typeText(member.type, sf)] : [],
        ...(member.questionToken ? { is_optional: "True" } : {}),
        ...(fields ? { fields } : {}),
        ...deprecatedKey(member),
      });
    }
  }
  return { functions, properties };
}

function typedefElement(
  iface: ts.InterfaceDeclaration,
  sf: ts.SourceFile,
  name: string = iface.name.text,
): Record<string, unknown> | undefined {
  const { functions, properties } = shapeMembers(iface.members, sf);
  if (functions.length === 0 && properties.length === 0) return undefined;
  return {
    type: "TYPEDEF",
    name,
    ...(functions.length > 0 ? { functions } : {}),
    ...(properties.length > 0 ? { properties } : {}),
    ...deprecatedKey(iface),
  };
}

/**
 * A reached interface as its TYPEDEF, carrying its `extends` parents when a block
 * declared it; an interface with neither members nor parents has nothing to show.
 */
function interfaceTypedef(
  iface: ts.InterfaceDeclaration,
  sf: ts.SourceFile,
  name: string,
  scoped: boolean,
): Record<string, unknown> | undefined {
  const typedef = typedefElement(iface, sf, name);
  const parents = scoped ? heritageTypeTexts(iface, sf) : [];
  if (!typedef && parents.length === 0) return undefined;
  return {
    ...(typedef ?? { type: "TYPEDEF", name }),
    ...(parents.length > 0 ? { extends: parents } : {}),
  };
}

/** A reached module-block alias's members, or its top-level arms when it has none. */
function fillAliasElement(
  element: Record<string, unknown>,
  alias: ts.TypeAliasDeclaration,
  sf: ts.SourceFile,
): void {
  if (!ts.isTypeLiteralNode(alias.type)) {
    element.types = unionMemberTexts(alias.type, sf);
    return;
  }
  const { functions, properties } = shapeMembers(alias.type.members, sf);
  if (functions.length > 0) element.functions = functions;
  if (properties.length > 0) element.properties = properties;
}

type Lane = "module" | "table" | "global";

/** Whether a string-named module is an extension's global table behind an import. */
function isGlobalTable(decl: ts.ModuleDeclaration): boolean {
  return ts.getJSDocTags(decl).some((tag) => tag.tagName.text === "globalTable");
}

interface TypeDeclarations {
  aliases: Map<string, ts.TypeAliasDeclaration>;
  interfaces: Map<string, ts.InterfaceDeclaration>;
}

function typeDeclarationsIn(statements: readonly ts.Statement[]): TypeDeclarations {
  const aliases = new Map<string, ts.TypeAliasDeclaration>();
  const interfaces = new Map<string, ts.InterfaceDeclaration>();
  for (const stmt of statements) {
    if (ts.isTypeAliasDeclaration(stmt)) aliases.set(stmt.name.text, stmt);
    if (ts.isInterfaceDeclaration(stmt)) interfaces.set(stmt.name.text, stmt);
  }
  return { aliases, interfaces };
}

function blockScope(prefix: string, statements: readonly ts.Statement[]): Scope {
  return { prefix, declared: typeDeclarationsIn(statements), scoped: true };
}

interface TypeNodeSink {
  push(node: ts.TypeNode): void;
}

/** A block's own type declarations under the name it qualifies them with. */
interface Scope {
  prefix: string;
  declared: TypeDeclarations;
  /** Whether a module or namespace block declares them, rather than file scope. */
  scoped: boolean;
}

interface ScopedTypeNode {
  node: ts.TypeNode;
  scopes: readonly Scope[];
}

interface ReachedShape {
  name: string;
  alias?: ts.TypeAliasDeclaration;
  iface?: ts.InterfaceDeclaration;
  /** Whether a module or namespace block declared it, rather than file scope. */
  scoped: boolean;
}

/** An interface's `extends` parents as their printed type text. */
function heritageTypeTexts(iface: ts.InterfaceDeclaration, sf: ts.SourceFile): string[] {
  const clause = iface.heritageClauses?.find((c) => c.token === ts.SyntaxKind.ExtendsKeyword);
  return clause ? clause.types.map((type) => oneLineText(type, sf)) : [];
}

function heritageNames(iface: ts.InterfaceDeclaration): string[] {
  const clause = iface.heritageClauses?.find((c) => c.token === ts.SyntaxKind.ExtendsKeyword);
  if (!clause) return [];
  return clause.types
    .filter((type) => ts.isIdentifier(type.expression))
    .map((type) => (type.expression as ts.Identifier).text);
}

/** A union's top-level arms as type text, or the single type for a non-union. */
function unionMemberTexts(node: ts.TypeNode, sf: ts.SourceFile): string[] {
  return ts.isUnionTypeNode(node)
    ? node.types.map((type) => typeText(type, sf))
    : [typeText(node, sf)];
}

/**
 * Every shape a lane's emitted members reach, in first-reached order, so a shape
 * no published member names stays off `/api`. The module-block and file-scope
 * lanes each walk their own type nodes, so a name declared in both resolves to
 * the lane that named it. A reference resolves outwards from the block it was
 * written in, ending at `outer`, so a block-local shape shadows a same-named
 * outer one and publishes under the block's prefix; a declaration's own body
 * resolves from where it was declared, never back into a sibling block the
 * reference came from. An `extends` parent is not a type reference, so it is
 * followed by name. With `walkMembers`, a block-local interface's member types
 * are walked too, so a shape named only by another shape's field publishes; a
 * file-scope interface's are not, for the reason file-scope unions are skipped.
 */
function reachedShapes(
  nodes: readonly ScopedTypeNode[],
  outer: readonly Scope[],
  walkMembers: boolean,
): ReachedShape[] {
  const reached: ReachedShape[] = [];
  const seen = new Set<string>();

  const resolve = (name: string, scopes: readonly Scope[]): void => {
    for (let i = 0; i < scopes.length; i++) {
      const scope = scopes[i];
      if (!scope) continue;
      const alias = scope.declared.aliases.get(name);
      const iface = scope.declared.interfaces.get(name);
      if (!alias && !iface) continue;
      const qualified = scope.prefix ? `${scope.prefix}.${name}` : name;
      if (seen.has(qualified)) return;
      seen.add(qualified);
      reached.push({
        name: qualified,
        ...(alias ? { alias } : {}),
        ...(iface ? { iface } : {}),
        scoped: scope.scoped,
      });
      const outward = scopes.slice(i);
      if (alias) walk(alias.type, outward);
      if (iface) {
        for (const parent of heritageNames(iface)) resolve(parent, outward);
        if (walkMembers && scope.scoped) for (const member of iface.members) walk(member, outward);
      }
      return;
    }
  };

  const walk = (node: ts.Node, scopes: readonly Scope[]): void => {
    if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
      resolve(node.typeName.text, scopes);
    }
    ts.forEachChild(node, (child) => walk(child, scopes));
  };

  for (const { node, scopes } of nodes) walk(node, [...scopes, ...outer]);
  return reached;
}

function exportedValueInterfaces(
  moduleBlock: ts.ModuleBlock | undefined,
): ts.InterfaceDeclaration[] {
  if (!moduleBlock) return [];
  const localVars = new Map<string, ts.TypeNode>();
  const aliases = new Map<string, ts.TypeAliasDeclaration>();
  const interfaces = new Map<string, ts.InterfaceDeclaration>();
  let exportedName = "";

  for (const stmt of moduleBlock.statements) {
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.type) localVars.set(decl.name.text, decl.type);
      }
    } else if (ts.isTypeAliasDeclaration(stmt)) {
      aliases.set(stmt.name.text, stmt);
    } else if (ts.isInterfaceDeclaration(stmt)) {
      interfaces.set(stmt.name.text, stmt);
    } else if (ts.isExportAssignment(stmt) && ts.isIdentifier(stmt.expression)) {
      exportedName = stmt.expression.text;
    }
  }

  const rootType = localVars.get(exportedName);
  if (!rootType) return [];
  const seen = new Set<string>();
  const resolved = resolveInterfaces(rootType, aliases, interfaces, seen);
  return [...new Set(resolved)];
}

function resolveInterfaces(
  node: ts.TypeNode,
  aliases: Map<string, ts.TypeAliasDeclaration>,
  interfaces: Map<string, ts.InterfaceDeclaration>,
  seen: Set<string>,
): ts.InterfaceDeclaration[] {
  if (ts.isIntersectionTypeNode(node)) {
    return node.types.flatMap((type) => resolveInterfaces(type, aliases, interfaces, seen));
  }
  if (!ts.isTypeReferenceNode(node) || !ts.isIdentifier(node.typeName)) return [];
  const name = node.typeName.text;
  if (name === "Readonly" && node.typeArguments?.[0]) {
    return resolveInterfaces(node.typeArguments[0], aliases, interfaces, seen);
  }
  const iface = interfaces.get(name);
  if (iface) return [iface];
  const alias = aliases.get(name);
  if (!alias || seen.has(name)) return [];
  seen.add(name);
  return resolveInterfaces(alias.type, aliases, interfaces, seen);
}

function memberName(name: ts.PropertyName, sf: ts.SourceFile): string {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name))
    return name.text;
  if (ts.isComputedPropertyName(name) && ts.isStringLiteral(name.expression))
    return name.expression.text;
  return name.getText(sf);
}

// string-named only: a file-scope `declare namespace` is a `ModuleDeclaration`
// too, so an identifier-named block appearing before the real `declare
// module '<name>'` would otherwise be mistaken for the module surface.
function findModuleBlock(sf: ts.SourceFile): ts.ModuleBlock | undefined {
  for (const stmt of sf.statements) {
    if (
      ts.isModuleDeclaration(stmt) &&
      ts.isStringLiteral(stmt.name) &&
      stmt.body &&
      ts.isModuleBlock(stmt.body)
    ) {
      return stmt.body;
    }
  }
  return undefined;
}

function isExported(node: ts.HasModifiers): boolean {
  return (ts.getCombinedModifierFlags(node as ts.Declaration) & ts.ModifierFlags.Export) !== 0;
}

function isAmbient(node: ts.HasModifiers): boolean {
  return (ts.getCombinedModifierFlags(node as ts.Declaration) & ts.ModifierFlags.Ambient) !== 0;
}

/** The closest non-empty JSDoc summary text attached to a node, tags stripped. */
function jsDocSummary(node: ts.Node): string {
  const comments = ts
    .getJSDocCommentsAndTags(node)
    .filter(ts.isJSDoc)
    .map((d) => (ts.getTextOfJSDocComment(d.comment) ?? "").trim())
    .filter((s) => s.length > 0);
  return comments.at(-1) ?? "";
}

function briefOf(summary: string): string {
  return summary.split("\n")[0]?.trim() ?? "";
}

// The verbatim first line of ts-defold's "definition stub" JSDoc marker.
const STUB_SUMMARY_MARKER = "This is a definition stub with incomplete or untested signatures.";

/** Whether a module summary is ts-defold's placeholder stub marker (no real docs). */
function isStubSummary(summary: string): boolean {
  return summary.startsWith(STUB_SUMMARY_MARKER);
}

function paramDocMap(
  decl: ts.FunctionDeclaration | ts.MethodSignature,
  sf: ts.SourceFile,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const tag of ts.getAllJSDocTagsOfKind(decl, ts.SyntaxKind.JSDocParameterTag)) {
    const paramTag = tag as ts.JSDocParameterTag;
    const name = ts.isIdentifier(paramTag.name) ? paramTag.name.text : paramTag.name.getText(sf);
    out.set(name, cleanDoc(ts.getTextOfJSDocComment(paramTag.comment)));
  }
  return out;
}

function returnDoc(decl: ts.FunctionDeclaration | ts.MethodSignature): string {
  const [tag] = ts.getAllJSDocTagsOfKind(decl, ts.SyntaxKind.JSDocReturnTag);
  return tag ? cleanDoc(ts.getTextOfJSDocComment(tag.comment)) : "";
}

function exampleText(decl: ts.FunctionDeclaration | ts.MethodSignature): string {
  for (const tag of ts.getJSDocTags(decl)) {
    if (tag.tagName.text === "example") {
      return (ts.getTextOfJSDocComment(tag.comment) ?? "").trim();
    }
  }
  return "";
}

// `undefined` when the node carries no `@deprecated`, the trimmed tag text when
// it does — `""` for a bare tag. The caller spreads the key only on a defined
// result, so absence of the key is the sole encoding of "not deprecated" and a
// bare tag stays distinguishable from an untagged symbol.
function deprecatedText(node: ts.Node): string | undefined {
  for (const tag of ts.getJSDocTags(node)) {
    if (tag.tagName.text === "deprecated") {
      return (ts.getTextOfJSDocComment(tag.comment) ?? "").trim();
    }
  }
  return undefined;
}

/** The `{ deprecated }` key to spread onto an element, empty when untagged. */
function deprecatedKey(node: ts.Node): Record<string, string> {
  const text = deprecatedText(node);
  return text === undefined ? {} : { deprecated: text };
}

/** Trim a JSDoc `@param`/`@returns` comment and drop a leading `-` delimiter. */
function cleanDoc(comment: string | undefined): string {
  return (comment ?? "").trim().replace(/^-\s*/, "");
}
