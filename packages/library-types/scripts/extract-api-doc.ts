import ts from "typescript";

const printer = ts.createPrinter({ removeComments: true });

/**
 * A type node's text as a single comment-free line. The printer re-emits the
 * AST (so a `//`/`/*` inside a string-literal type is never mistaken for a
 * comment), then interior whitespace is collapsed so multi-line object literals
 * and wrapped unions no longer leak newlines or member JSDoc into `/api`.
 */
function typeText(node: ts.TypeNode, sf: ts.SourceFile): string {
  return printer.printNode(ts.EmitHint.Unspecified, node, sf).replace(/\s+/g, " ").trim();
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

  const elements: Record<string, unknown>[] = [];
  const emittedNames = new Set<string>();
  const referencedTypeNodes: ts.TypeNode[] = [];
  for (const stmt of moduleBlock?.statements ?? []) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name && isExported(stmt)) {
      collectFunctionReferenceTypes(stmt, referencedTypeNodes);
      elements.push(functionElement(stmt, stmt.name.text, sf));
      emittedNames.add(stmt.name.text);
    } else if (ts.isVariableStatement(stmt) && isExported(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (decl.type) referencedTypeNodes.push(decl.type);
        const fields = objectFields(decl.type, sf);
        const name = decl.name.getText(sf);
        elements.push({
          type: "VARIABLE",
          name,
          types: decl.type ? [typeText(decl.type, sf)] : [],
          ...(fields ? { fields } : {}),
        });
        emittedNames.add(name);
      }
    } else if (ts.isTypeAliasDeclaration(stmt)) {
      elements.push({ type: "TYPEDEF", name: stmt.name.text });
      emittedNames.add(stmt.name.text);
    }
  }

  const moduleValueInterfaces = exportedValueInterfaces(moduleBlock);
  for (const iface of moduleValueInterfaces) {
    for (const member of iface.members) {
      if (!member.name) continue;
      const name = memberName(member.name, sf);
      if (emittedNames.has(name)) continue;
      if (ts.isMethodSignature(member)) {
        collectFunctionReferenceTypes(member, referencedTypeNodes);
        elements.push(functionElement(member, name, sf));
        emittedNames.add(name);
      } else if (ts.isPropertySignature(member)) {
        if (member.type) referencedTypeNodes.push(member.type);
        const fields = objectFields(member.type, sf);
        elements.push({
          type: "VARIABLE",
          name,
          types: member.type ? [typeText(member.type, sf)] : [],
          ...(fields ? { fields } : {}),
        });
        emittedNames.add(name);
      }
    }
  }

  const moduleValueInterfaceNames = new Set(moduleValueInterfaces.map((iface) => iface.name.text));
  for (const iface of referencedInterfaces(
    moduleBlock,
    referencedTypeNodes,
    moduleValueInterfaceNames,
  )) {
    if (emittedNames.has(iface.name.text)) continue;
    const typedef = typedefElement(iface, sf);
    if (!typedef) continue;
    elements.push(typedef);
    emittedNames.add(iface.name.text);
  }

  return {
    info: { namespace: moduleName, brief: briefOf(summary), description: summary },
    elements,
  };
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
  return {
    type: "FUNCTION",
    name,
    brief: briefOf(summary),
    description: summary,
    parameters,
    returnvalues,
    ...(example === "" ? {} : { examples: example }),
  };
}

function collectFunctionReferenceTypes(
  decl: ts.FunctionDeclaration | ts.MethodSignature,
  out: ts.TypeNode[],
): void {
  for (const param of decl.parameters) {
    if (param.type) out.push(param.type);
  }
  if (decl.type) out.push(decl.type);
}

function typedefElement(
  iface: ts.InterfaceDeclaration,
  sf: ts.SourceFile,
): Record<string, unknown> | undefined {
  const functions: Record<string, unknown>[] = [];
  const properties: Record<string, unknown>[] = [];
  for (const member of iface.members) {
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
        ...(fields ? { fields } : {}),
      });
    }
  }
  if (functions.length === 0 && properties.length === 0) return undefined;
  return {
    type: "TYPEDEF",
    name: iface.name.text,
    ...(functions.length > 0 ? { functions } : {}),
    ...(properties.length > 0 ? { properties } : {}),
  };
}

function referencedInterfaces(
  moduleBlock: ts.ModuleBlock | undefined,
  typeNodes: ts.TypeNode[],
  excludedNames: ReadonlySet<string>,
): ts.InterfaceDeclaration[] {
  if (!moduleBlock) return [];
  const aliases = new Map<string, ts.TypeAliasDeclaration>();
  const interfaces = new Map<string, ts.InterfaceDeclaration>();
  for (const stmt of moduleBlock.statements) {
    if (ts.isTypeAliasDeclaration(stmt)) aliases.set(stmt.name.text, stmt);
    if (ts.isInterfaceDeclaration(stmt)) interfaces.set(stmt.name.text, stmt);
  }

  const found = new Map<string, ts.InterfaceDeclaration>();
  const seenAliases = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
      const name = node.typeName.text;
      const iface = interfaces.get(name);
      if (iface && !excludedNames.has(name)) found.set(name, iface);
      const alias = aliases.get(name);
      if (alias && !seenAliases.has(name)) {
        seenAliases.add(name);
        visit(alias.type);
      }
    }
    ts.forEachChild(node, visit);
  };

  for (const node of typeNodes) visit(node);
  return [...found.values()];
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

function findModuleBlock(sf: ts.SourceFile): ts.ModuleBlock | undefined {
  for (const stmt of sf.statements) {
    if (ts.isModuleDeclaration(stmt) && stmt.body && ts.isModuleBlock(stmt.body)) {
      return stmt.body;
    }
  }
  return undefined;
}

function isExported(node: ts.HasModifiers): boolean {
  return (ts.getCombinedModifierFlags(node as ts.Declaration) & ts.ModifierFlags.Export) !== 0;
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

/** Trim a JSDoc `@param`/`@returns` comment and drop a leading `-` delimiter. */
function cleanDoc(comment: string | undefined): string {
  return (comment ?? "").trim().replace(/^-\s*/, "");
}
