/**
 * Printing a fork with upstream's own LuaDoc summary on the members it documents,
 * unless the fork's comment is pinned to that exact upstream text.
 *
 * `parse-lua-surface.ts` already reads each upstream member's `---` block, so the
 * text exists on one side of the pipeline. This module is the merge, and it runs when
 * the fork is printed rather than in the vendored `.d.ts`: imported prose written into
 * a library's `fork/*.d.ts` would be indistinguishable from fork prose forever after,
 * and the next upstream doc change would need a hand edit. The api-doc is lowered from
 * the printed declaration, so a project's hover text and the docs site agree by
 * construction.
 *
 * Five rules carry the whole merge:
 *
 * - **Fork prose wins only while pinned.** A member upstream documents keeps the
 *   fork's comments when one of them carries `@upstreamDoc <pin>` and every pin it
 *   carries is `upstreamDocPin` of upstream's current block. Otherwise each of its
 *   declarations prints upstream's summary, keeping the fork's tags except `@param`
 *   and `@returns`, which upstream's doc stands in for, and the member is a notice.
 *   A member upstream does not document keeps the fork's comments, pinned or not.
 * - **A pin never prints.** Every `@upstreamDoc` line is removed from the print; one
 *   on a member upstream does not document is an `orphan` notice, and one anywhere
 *   but a module member's doc comment, or not shaped `@upstreamDoc <12 hex>` on its
 *   own line, throws.
 * - **One block per declaration.** A declaration whose only comment is tags
 *   (`/** @noSelf *\/`) takes the summary as that block's opening lines; any other
 *   undocumented declaration gains a new block directly above it, indented like it.
 * - **Only the module's own members.** The walk is the exported functions and
 *   constants directly inside the `declare module` block, the members
 *   `extractApiDoc` publishes unqualified and upstream defines on its module table.
 *   A file-scope global and a member of a nested namespace are never filled.
 * - **Comments only.** Only comment text changes, so TypeScript's comment-free print
 *   of the result equals the fork's.
 *
 * Reading a block's summary (tags dropped, a name-only heading line dropped) is
 * `upstreamSummary`'s job in `import-upstream-docs.ts`.
 */

import { createHash } from "node:crypto";
import { renderDocComment } from "@defold-typescript/types/library-runtime";
import ts from "typescript";
import { upstreamSummary } from "./import-upstream-docs";
import type { LuaMember } from "./parse-lua-surface";

export interface ForkDocNotice {
  /** The published name of the member. */
  member: string;
  /** `unpinned` and `stale` fork comments printed upstream's doc instead; an `orphan`
   * pin sits on a member upstream does not document, so it guards nothing. */
  kind: "unpinned" | "stale" | "orphan";
  /** The pin that keeps the fork's comment: `upstreamDocPin` of upstream's current
   * block. Absent on an orphan. */
  pin?: string;
}

export interface MergedFork {
  source: string;
  /** The published names of the members whose printed comment is upstream's, in
   * source order. */
  upstreamDocs: string[];
  /** In source order. */
  notices: ForkDocNotice[];
}

interface Edit {
  start: number;
  end: number;
  text: string;
}

interface PinLine {
  pin: string;
  /** The line's first character and the one after its newline. */
  start: number;
  end: number;
}

const PIN_TAG = "upstreamDoc";
const PIN_LINE = /^[ \t]*\*[ \t]*@upstreamDoc[ \t]+([0-9a-f]{12})[ \t]*$/;
const UPSTREAM_TAGS = new Set(["param", "returns", "return"]);

/**
 * The pin a fork comment carries to replace `member`'s upstream doc: the first 12 hex
 * characters of the SHA-256 of its whole block, tags included, with every whitespace
 * run collapsed to one space. Re-indenting or re-wrapping the block keeps it.
 */
export function upstreamDocPin(member: LuaMember): string {
  const text = member.doc.replace(/\s+/g, " ").trim();
  return createHash("sha256").update(text).digest("hex").slice(0, 12);
}

/**
 * The fork with upstream's summary merged onto every module-level member upstream
 * documents and the fork does not override with a pinned comment. `upstream` is keyed
 * by member name and holds module-level members only; the caller leaves out
 * `function M:name` methods, whose prose belongs to the instance type.
 */
export function mergeForkDocs(
  source: string,
  upstream: ReadonlyMap<string, LuaMember>,
): MergedFork {
  const sf = ts.createSourceFile("fork.d.ts", source, ts.ScriptTarget.Latest, true);
  const module = ambientModule(sf);
  const moduleId = module?.name.text ?? "fork";
  const edits: Edit[] = [];
  const upstreamDocs: string[] = [];
  const notices: ForkDocNotice[] = [];
  const pinned = new Set<number>();
  for (const [name, declarations] of moduleMembers(module)) {
    const pins = pinLines(source, declarations, `${moduleId}: ${name}`);
    for (const { start } of pins) pinned.add(start);
    const removePins = () => {
      for (const { start, end } of pins) edits.push({ start, end, text: "" });
    };
    const member = upstream.get(name);
    // TypeScript opens a tag at any `@` after whitespace, which would cut an LDoc
    // `@{ref}` out of the summary; `\@` is plain text to TypeScript and an escaped `@`
    // to the Markdown both the hover and the docs site render.
    const summary =
      member === undefined ? "" : upstreamSummary(member, name).replace(/(^|\s)@/g, "$1\\@");
    if (member === undefined || summary === "") {
      if (pins.length > 0) notices.push({ member: name, kind: "orphan" });
      removePins();
      continue;
    }
    const pin = upstreamDocPin(member);
    const overridden = declarations.some(hasProse);
    if (overridden && pins.length > 0 && pins.every((line) => line.pin === pin)) {
      removePins();
      continue;
    }
    if (overridden)
      notices.push({ member: name, kind: pins.length > 0 ? "stale" : "unpinned", pin });
    for (const declaration of declarations) {
      edits.push(...docEdits(source, declaration, summary, overridden));
    }
    upstreamDocs.push(name);
  }
  for (const match of source.matchAll(/@upstreamDoc/g)) {
    const start = lineStart(source, match.index);
    if (pinned.has(start)) continue;
    const line = source.slice(0, start).split("\n").length;
    throw new Error(
      `${moduleId}: line ${line}: @upstreamDoc pins only a module function or constant's doc comment`,
    );
  }
  let merged = source;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    merged = merged.slice(0, edit.start) + edit.text + merged.slice(edit.end);
  }
  return { source: merged, upstreamDocs, notices };
}

/** Every `@upstreamDoc` line in the doc comments of one member's declarations. Throws,
 * naming `owner`, on one that is not the tag and a 12-hex pin alone on its line. */
function pinLines(source: string, declarations: ts.Node[], owner: string): PinLine[] {
  const lines: PinLine[] = [];
  for (const doc of declarations.flatMap(jsDocs)) {
    for (const match of source.slice(doc.pos, doc.end).matchAll(/@upstreamDoc/g)) {
      const start = lineStart(source, doc.pos + match.index);
      const newline = source.indexOf("\n", start);
      const end = newline === -1 ? source.length : newline;
      const pin = PIN_LINE.exec(source.slice(start, end))?.[1];
      if (pin === undefined) {
        throw new Error(
          `${owner}: @upstreamDoc takes 12 lowercase hex characters on a line of its own`,
        );
      }
      lines.push({ pin, start, end: newline === -1 ? end : end + 1 });
    }
  }
  return lines;
}

/** The doc-comment hosts of the module block's members, grouped by the name each is
 * published under. A variable statement is a host only when it declares one name: its
 * comment would otherwise document every declarator with one member's prose. */
function moduleMembers(module: AmbientModule | undefined): Map<string, ts.Node[]> {
  const members = new Map<string, ts.Node[]>();
  const statements = module?.body.statements ?? [];
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

type AmbientModule = ts.ModuleDeclaration & { name: ts.StringLiteral; body: ts.ModuleBlock };

// The first string-named ambient module, as `extractApiDoc` finds it: a file-scope
// `declare namespace` is a `ModuleDeclaration` too and is not the module surface.
function ambientModule(sf: ts.SourceFile): AmbientModule | undefined {
  for (const statement of sf.statements) {
    if (
      ts.isModuleDeclaration(statement) &&
      ts.isStringLiteral(statement.name) &&
      statement.body &&
      ts.isModuleBlock(statement.body)
    ) {
      return statement as AmbientModule;
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

function docHasProse(doc: ts.JSDoc): boolean {
  return (ts.getTextOfJSDocComment(doc.comment) ?? "").trim() !== "";
}

function hasProse(host: ts.Node): boolean {
  return jsDocs(host).some(docHasProse);
}

/**
 * The edits that put `summary` on one declaration: the opening lines of its nearest doc
 * block when it has one, else a new block above it. With `override`, the fork's prose
 * and its `@param` and `@returns` tags give way; every block loses its pins. An earlier
 * block is rewritten only when it loses something, and removed when nothing is left.
 */
function docEdits(source: string, host: ts.Node, summary: string, override: boolean): Edit[] {
  const block = renderDocComment({ summary });
  const docs = jsDocs(host);
  if (docs.length === 0) {
    const start = host.getStart();
    const indent = lineIndent(source, start);
    return [{ start, end: start, text: `${block.join(`\n${indent}`)}\n${indent}` }];
  }
  const dropped = (tag: string): boolean => tag === PIN_TAG || (override && UPSTREAM_TAGS.has(tag));
  const edits: Edit[] = [];
  docs.forEach((doc, index) => {
    const indent = lineIndent(source, doc.pos);
    const tags = keptTagLines(source, doc, dropped).map((line) =>
      line === "" ? " *" : ` * ${line}`,
    );
    const next = docs[index + 1];
    if (next === undefined) {
      const lines = [...block.slice(0, -1), ...(tags.length > 0 ? [" *"] : []), ...tags, " */"];
      edits.push({ start: doc.pos, end: doc.end, text: lines.join(`\n${indent}`) });
      return;
    }
    const loses =
      (override && docHasProse(doc)) || (doc.tags ?? []).some((tag) => dropped(tag.tagName.text));
    if (!loses) return;
    if (tags.length > 0) {
      edits.push({
        start: doc.pos,
        end: doc.end,
        text: ["/**", ...tags, " */"].join(`\n${indent}`),
      });
    } else {
      const end = source.slice(doc.end, next.pos).trim() === "" ? next.pos : doc.end;
      edits.push({ start: doc.pos, end, text: "" });
    }
  });
  return edits;
}

/** The lines of a doc block's tags, without the ` * ` margin and with the tags
 * `dropped` names left out; interior blank lines kept, trailing ones dropped. */
function keptTagLines(source: string, doc: ts.JSDoc, dropped: (tag: string) => boolean): string[] {
  const bodyEnd = doc.end - (/\*+\/$/.exec(source.slice(doc.pos, doc.end))?.[0].length ?? 0);
  const lines: string[] = [];
  for (const tag of doc.tags ?? []) {
    if (dropped(tag.tagName.text)) continue;
    const tagLines = source
      .slice(tag.pos, Math.min(tag.end, bodyEnd))
      .split("\n")
      .map((line, index) => (index === 0 ? line : line.replace(/^\s*\*?\s?/, "")).trimEnd());
    // A tag runs to the next one's `@`, so its last line is the margin before it.
    if (tagLines.length > 1 && tagLines.at(-1) === "") tagLines.pop();
    lines.push(...tagLines);
  }
  while (lines.at(-1) === "") lines.pop();
  return lines;
}

function lineStart(source: string, offset: number): number {
  return source.lastIndexOf("\n", offset - 1) + 1;
}

/** The whitespace opening the line `offset` sits on. */
function lineIndent(source: string, offset: number): string {
  return /^[ \t]*/.exec(source.slice(lineStart(source, offset), offset))?.[0] ?? "";
}
