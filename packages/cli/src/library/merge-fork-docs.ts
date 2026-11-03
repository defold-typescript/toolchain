/**
 * Printing a fork with upstream's own LuaDoc summary on the members it documents
 * nowhere.
 *
 * `parse-lua-surface.ts` already reads each upstream member's `---` block, so the
 * text exists on one side of the pipeline. This module is the merge, and it runs when
 * the fork is printed rather than in the vendored `.d.ts`: imported prose written into
 * a library's `fork/*.d.ts` would be indistinguishable from fork prose forever after,
 * and the next upstream doc change would need a hand edit. The api-doc is lowered from
 * the printed declaration, so a project's hover text and the docs site agree by
 * construction.
 *
 * Four rules carry the whole merge:
 *
 * - **Fork prose always wins, per member.** A member any of whose declarations
 *   carries a JSDoc summary keeps every comment it has, untouched, so authoring the
 *   fork's own doc comment is how a member opts out. There is no exclusion list: the
 *   only thing one would add is "show no prose at all for a member upstream
 *   documented", which is worse than writing the correct summary.
 * - **One block per declaration.** A declaration whose only comment is tags
 *   (`/** @noSelf *\/`) takes the summary as that block's opening lines; any other
 *   undocumented declaration gains a new block directly above it, indented like it.
 * - **Only the module's own members.** The walk is the exported functions and
 *   constants directly inside the `declare module` block, the members
 *   `extractApiDoc` publishes unqualified and upstream defines on its module table.
 *   A file-scope global and a member of a nested namespace are never filled.
 * - **Comments only.** Text is spliced in and nothing is removed, so TypeScript's
 *   comment-free print of the result equals the fork's.
 *
 * Reading a block's summary (tags dropped, a name-only heading line dropped) is
 * `upstreamSummary`'s job in `import-upstream-docs.ts`.
 */

import { renderDocComment } from "@defold-typescript/types/library-runtime";
import ts from "typescript";
import { upstreamSummary } from "./import-upstream-docs";
import type { LuaMember } from "./parse-lua-surface";

export interface MergedFork {
  source: string;
  /** The published names of the members whose printed comment is upstream's, in
   * source order. */
  upstreamDocs: string[];
}

interface Edit {
  start: number;
  end: number;
  text: string;
}

/**
 * The fork with upstream's summary merged onto every module-level member it leaves
 * undocumented. `upstream` is keyed by member name and holds module-level members
 * only; the caller leaves out `function M:name` methods, whose prose belongs to the
 * instance type.
 */
export function mergeForkDocs(
  source: string,
  upstream: ReadonlyMap<string, LuaMember>,
): MergedFork {
  const sf = ts.createSourceFile("fork.d.ts", source, ts.ScriptTarget.Latest, true);
  const edits: Edit[] = [];
  const upstreamDocs: string[] = [];
  for (const [name, declarations] of moduleMembers(sf)) {
    if (declarations.some(hasProse)) continue;
    const member = upstream.get(name);
    if (member === undefined) continue;
    // TypeScript opens a tag at any `@` after whitespace, which would cut an LDoc
    // `@{ref}` out of the summary; `\@` is plain text to TypeScript and an escaped `@`
    // to the Markdown both the hover and the docs site render.
    const summary = upstreamSummary(member, name).replace(/(^|\s)@/g, "$1\\@");
    if (summary === "") continue;
    for (const declaration of declarations) edits.push(docEdit(source, declaration, summary));
    upstreamDocs.push(name);
  }
  let merged = source;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    merged = merged.slice(0, edit.start) + edit.text + merged.slice(edit.end);
  }
  return { source: merged, upstreamDocs };
}

/** The doc-comment hosts of the module block's members, grouped by the name each is
 * published under. A variable statement is a host only when it declares one name: its
 * comment would otherwise document every declarator with one member's prose. */
function moduleMembers(sf: ts.SourceFile): Map<string, ts.Node[]> {
  const members = new Map<string, ts.Node[]>();
  const statements = moduleBlock(sf)?.statements ?? [];
  // Matches `extractApiDoc`: without an `export =`, a bare declaration in an ambient
  // module is as public as an exported one.
  const emitBare = !statements.some(ts.isExportAssignment);
  const exportedAs = renamedExports(statements);
  const add = (local: string, host: ts.Node): void => {
    const name = exportedAs.get(local) ?? local;
    members.set(name, [...(members.get(name) ?? []), host]);
  };
  for (const statement of statements) {
    if (ts.isFunctionDeclaration(statement)) {
      if (statement.name && (emitBare || isExported(statement)))
        add(statement.name.text, statement);
    } else if (ts.isVariableStatement(statement)) {
      const [declaration, ...rest] = statement.declarationList.declarations;
      if (declaration === undefined || rest.length > 0) continue;
      if (!ts.isIdentifier(declaration.name)) continue;
      if (emitBare || isExported(statement)) add(declaration.name.text, statement);
    }
  }
  return members;
}

// The first string-named ambient module, as `extractApiDoc` finds it: a file-scope
// `declare namespace` is a `ModuleDeclaration` too and is not the module surface.
function moduleBlock(sf: ts.SourceFile): ts.ModuleBlock | undefined {
  for (const statement of sf.statements) {
    if (
      ts.isModuleDeclaration(statement) &&
      ts.isStringLiteral(statement.name) &&
      statement.body &&
      ts.isModuleBlock(statement.body)
    ) {
      return statement.body;
    }
  }
  return undefined;
}

// A member whose Lua name is a TypeScript reserved word is declared under a local name
// and re-exported as `export { delete_ as delete }`; upstream knows it as `delete`.
function renamedExports(statements: readonly ts.Statement[]): Map<string, string> {
  const renamed = new Map<string, string>();
  for (const statement of statements) {
    if (!ts.isExportDeclaration(statement) || statement.moduleSpecifier) continue;
    if (!statement.exportClause || !ts.isNamedExports(statement.exportClause)) continue;
    for (const specifier of statement.exportClause.elements) {
      if (specifier.propertyName) renamed.set(specifier.propertyName.text, specifier.name.text);
    }
  }
  return renamed;
}

function isExported(node: ts.HasModifiers): boolean {
  return (ts.getCombinedModifierFlags(node as ts.Declaration) & ts.ModifierFlags.Export) !== 0;
}

function jsDocs(host: ts.Node): ts.JSDoc[] {
  return ts.getJSDocCommentsAndTags(host).filter(ts.isJSDoc);
}

function hasProse(host: ts.Node): boolean {
  return jsDocs(host).some((doc) => (ts.getTextOfJSDocComment(doc.comment) ?? "").trim() !== "");
}

/** The edit that puts `summary` on one declaration: the opening lines of its nearest
 * (tag-only) doc block when it has one, else a new block above it. */
function docEdit(source: string, host: ts.Node, summary: string): Edit {
  const block = renderDocComment({ summary });
  const existing = jsDocs(host).at(-1);
  if (existing !== undefined) {
    const tags = blockBody(source.slice(existing.pos, existing.end));
    const lines = [
      ...block.slice(0, -1),
      ...(tags.length > 0 ? [" *"] : []),
      ...tags.map((line) => (line === "" ? " *" : ` * ${line}`)),
      " */",
    ];
    const indent = lineIndent(source, existing.pos);
    return { start: existing.pos, end: existing.end, text: lines.join(`\n${indent}`) };
  }
  const start = host.getStart();
  const indent = lineIndent(source, start);
  return { start, end: start, text: `${block.join(`\n${indent}`)}\n${indent}` };
}

/** A doc block's lines without the delimiters and each line's ` * ` margin, outer blank
 * lines dropped. */
function blockBody(comment: string): string[] {
  const lines = comment
    .replace(/^\/\*\*/, "")
    .replace(/\*+\/$/, "")
    .split("\n")
    .map((line) => line.replace(/^\s*\*?\s?/, "").trimEnd());
  while (lines[0] === "") lines.shift();
  while (lines.at(-1) === "") lines.pop();
  return lines;
}

/** The whitespace opening the line `offset` sits on. */
function lineIndent(source: string, offset: number): string {
  const lineStart = source.lastIndexOf("\n", offset - 1) + 1;
  return /^[ \t]*/.exec(source.slice(lineStart, offset))?.[0] ?? "";
}
