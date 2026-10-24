import * as ts from "typescript";
import type { Plugin } from "typescript-to-lua";
import { scanEmittedRequires } from "./lua-require-scan";

const GLOBAL_TABLE_TAG = "globalTable";

// Survives into the emitted require path, so it must collide with no real
// module path a build can own: `@` and `:` are impossible in one.
export const GLOBAL_TABLE_REQUIRE_MARKER = "@defold-typescript:global-table:";

// `@NoResolution:` tells TSTL's resolver to leave the path alone (the module
// has no source file in the program); the resolver strips the prefix, leaving
// the marker path for the post-pass swap.
const NO_RESOLUTION_PREFIX = "@NoResolution:";

const LUA_GLOBAL_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;

type TagResolution =
  | { readonly kind: "untagged" }
  | { readonly kind: "tagged"; readonly globalName: string }
  | { readonly kind: "invalid"; readonly globalName: string; readonly moduleId: string };

// The tag is consulted only when the specifier resolves to an ambient
// `declare module "<id>"`; a real source file sharing the id resolves to the
// file and stays on the ordinary require lane.
function resolveGlobalTableTag(specifier: ts.Expression, checker: ts.TypeChecker): TagResolution {
  if (!ts.isStringLiteral(specifier)) {
    return { kind: "untagged" };
  }
  const symbol = checker.getSymbolAtLocation(specifier);
  for (const declaration of symbol?.declarations ?? []) {
    if (!ts.isModuleDeclaration(declaration) || !ts.isStringLiteral(declaration.name)) {
      continue;
    }
    const tag = ts.getJSDocTags(declaration).find((t) => t.tagName.text === GLOBAL_TABLE_TAG);
    if (tag === undefined) {
      continue;
    }
    const comment = ts.getTextOfJSDocComment(tag.comment)?.trim();
    const globalName =
      comment === undefined || comment === ""
        ? specifier.text
        : (comment.split(/\s+/)[0] ?? specifier.text);
    if (!LUA_GLOBAL_NAME_RE.test(globalName)) {
      return { kind: "invalid", globalName, moduleId: specifier.text };
    }
    return { kind: "tagged", globalName };
  }
  return { kind: "untagged" };
}

function markerRequirePath(globalName: string): string {
  return `${NO_RESOLUTION_PREFIX}${GLOBAL_TABLE_REQUIRE_MARKER}${globalName}`;
}

function invalidGlobalName(
  node: ts.Node,
  resolution: {
    readonly globalName: string;
    readonly moduleId: string;
  },
): ts.Diagnostic {
  const file = node.getSourceFile();
  const start = node.getStart(file);
  return {
    file,
    start,
    length: node.getEnd() - start,
    category: ts.DiagnosticCategory.Error,
    code: 0,
    messageText: `@${GLOBAL_TABLE_TAG} on module "${resolution.moduleId}" names \`${resolution.globalName}\`, which is not a valid Lua global name; use dotted identifiers (\`pixels\`, \`b2d.body\`).`,
  };
}

export const nativeGlobalModulesPlugin: Plugin = {
  visitors: {
    [ts.SyntaxKind.ImportDeclaration]: (node, context) => {
      const resolution = resolveGlobalTableTag(node.moduleSpecifier, context.checker);
      if (resolution.kind === "invalid") {
        context.diagnostics.push(invalidGlobalName(node.moduleSpecifier, resolution));
        return context.superTransformStatements(node);
      }
      if (resolution.kind === "untagged") {
        return context.superTransformStatements(node);
      }
      if (node.importClause === undefined) {
        // A side-effect import of a runtime global loads nothing.
        return [];
      }
      const rewritten = ts.factory.updateImportDeclaration(
        node,
        node.modifiers,
        node.importClause,
        ts.factory.createStringLiteral(markerRequirePath(resolution.globalName)),
        node.attributes,
      );
      return context.superTransformStatements(rewritten);
    },
    [ts.SyntaxKind.ExportDeclaration]: (node, context) => {
      const specifier = node.moduleSpecifier;
      if (specifier === undefined) {
        return context.superTransformStatements(node);
      }
      const resolution = resolveGlobalTableTag(specifier, context.checker);
      if (resolution.kind === "invalid") {
        context.diagnostics.push(invalidGlobalName(specifier, resolution));
        return context.superTransformStatements(node);
      }
      if (resolution.kind === "untagged") {
        return context.superTransformStatements(node);
      }
      const rewritten = ts.factory.updateExportDeclaration(
        node,
        node.modifiers,
        node.isTypeOnly,
        node.exportClause,
        ts.factory.createStringLiteral(markerRequirePath(resolution.globalName)),
        node.attributes,
      );
      return context.superTransformStatements(rewritten);
    },
    [ts.SyntaxKind.CallExpression]: (node, context) => {
      const specifier = node.arguments[0];
      if (node.expression.kind !== ts.SyntaxKind.ImportKeyword || specifier === undefined) {
        return context.superTransformExpression(node);
      }
      const resolution = resolveGlobalTableTag(specifier, context.checker);
      if (resolution.kind === "invalid") {
        context.diagnostics.push(invalidGlobalName(specifier, resolution));
        return context.superTransformExpression(node);
      }
      if (resolution.kind === "untagged") {
        return context.superTransformExpression(node);
      }
      const rewritten = ts.factory.updateCallExpression(node, node.expression, node.typeArguments, [
        ts.factory.createStringLiteral(markerRequirePath(resolution.globalName)),
        ...node.arguments.slice(1),
      ]);
      return context.superTransformExpression(rewritten);
    },
  },
};

/**
 * Replace every marker require the scanner can span with the global name it
 * encodes: `local p = require("<marker>pixels")` becomes `local p = pixels`,
 * which reads the global because the right side is evaluated before the local
 * binds. A marker site without a recoverable call span is left in place for
 * `findGlobalAliasMarkerLeak` to fail the build on.
 */
export function rewriteGlobalAliasRequires(lua: string): string {
  let out = "";
  let cursor = 0;
  for (const site of scanEmittedRequires(lua)) {
    if (!site.path.startsWith(GLOBAL_TABLE_REQUIRE_MARKER)) {
      continue;
    }
    if (site.callStart === undefined || site.callEnd === undefined) {
      continue;
    }
    out += lua.slice(cursor, site.callStart);
    out += site.path.slice(GLOBAL_TABLE_REQUIRE_MARKER.length);
    cursor = site.callEnd;
  }
  return out + lua.slice(cursor);
}

/**
 * The global name of the first marker surviving in a chunk after the swap, or
 * undefined when the chunk is clean. A survivor means an emit shape the swap
 * cannot reach; the output would fail to load in Defold, so the caller turns
 * it into a build error rather than shipping it.
 */
export function findGlobalAliasMarkerLeak(lua: string): string | undefined {
  const index = lua.indexOf(GLOBAL_TABLE_REQUIRE_MARKER);
  if (index === -1) {
    return undefined;
  }
  const rest = lua.slice(index + GLOBAL_TABLE_REQUIRE_MARKER.length);
  return rest.match(/^[A-Za-z0-9_.]*/)?.[0] ?? "";
}
