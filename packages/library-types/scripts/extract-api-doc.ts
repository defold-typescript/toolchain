import ts from "typescript";

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
  const summary = moduleBlock ? jsDocSummary(moduleBlock.parent) : "";

  const elements: Record<string, unknown>[] = [];
  for (const stmt of moduleBlock?.statements ?? []) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name && isExported(stmt)) {
      elements.push(functionElement(stmt, stmt.name.text, sf));
    } else if (ts.isVariableStatement(stmt) && isExported(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        elements.push({
          type: "VARIABLE",
          name: decl.name.getText(sf),
          types: decl.type ? [decl.type.getText(sf).trim()] : [],
        });
      }
    } else if (ts.isTypeAliasDeclaration(stmt)) {
      elements.push({ type: "TYPEDEF", name: stmt.name.text });
    }
  }

  return {
    info: { namespace: moduleName, brief: briefOf(summary), description: summary },
    elements,
  };
}

function functionElement(
  decl: ts.FunctionDeclaration,
  name: string,
  sf: ts.SourceFile,
): Record<string, unknown> {
  const summary = jsDocSummary(decl);
  const paramDocs = paramDocMap(decl, sf);
  const parameters = decl.parameters.map((p) => {
    const pname = p.name.getText(sf);
    return {
      name: pname,
      doc: paramDocs.get(pname) ?? "",
      types: p.type ? [p.type.getText(sf).trim()] : [],
      is_optional: p.questionToken || p.initializer ? "True" : "False",
    };
  });

  const returnText = decl.type?.getText(sf).trim() ?? "";
  const returnvalues =
    returnText === "" || returnText === "void"
      ? []
      : [{ name: "", doc: returnDoc(decl), types: [returnText] }];

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

function paramDocMap(decl: ts.FunctionDeclaration, sf: ts.SourceFile): Map<string, string> {
  const out = new Map<string, string>();
  for (const tag of ts.getAllJSDocTagsOfKind(decl, ts.SyntaxKind.JSDocParameterTag)) {
    const paramTag = tag as ts.JSDocParameterTag;
    const name = ts.isIdentifier(paramTag.name) ? paramTag.name.text : paramTag.name.getText(sf);
    out.set(name, cleanDoc(ts.getTextOfJSDocComment(paramTag.comment)));
  }
  return out;
}

function returnDoc(decl: ts.FunctionDeclaration): string {
  const [tag] = ts.getAllJSDocTagsOfKind(decl, ts.SyntaxKind.JSDocReturnTag);
  return tag ? cleanDoc(ts.getTextOfJSDocComment(tag.comment)) : "";
}

function exampleText(decl: ts.FunctionDeclaration): string {
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
