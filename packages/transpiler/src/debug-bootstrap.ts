import * as ts from "typescript";

// Managed-block sentinels. A re-run locates the single BEGIN…END pair and
// refreshes the enclosed text if it drifted, so wording changes self-heal.
// They are `//` line comments, stripped by TSTL, so they never reach the
// emitted `.ts.script`.
export const DEBUG_BLOCK_BEGIN =
  "// defold-typescript:setup-debug BEGIN — managed block, do not edit";
export const DEBUG_BLOCK_END = "// defold-typescript:setup-debug END";

// The canonical managed block: import + gated start, marker-free, no
// `declare module` (that lives in the ambient `.d.ts`). Mirrors the snippet in
// `packages/docs/guide/debugging.md` exactly; a guide-comparison test locks the two.
// The blank line before END keeps Biome's organizeImports assist from gluing
// the END comment onto a following import as its leading comment (which would
// then demand a blank line before the whole group). With blank lines on both
// sides of END, an import injected above the user's own imports stays clean.
export const DEBUG_MANAGED_BLOCK = `${DEBUG_BLOCK_BEGIN}
import * as lldebugger from "lldebugger.debug";

if (sys.get_engine_info().is_debug) {
  lldebugger.start();
}

${DEBUG_BLOCK_END}`;

export interface ManagedBootstrap {
  /** The top-level statements wholly between the sentinels, in source order. */
  readonly statements: readonly ts.Statement[];
  /**
   * Whether the text between the sentinels is the canonical body token for
   * token, so line endings, quote style, comments and optional semicolons never
   * decide it.
   */
  readonly canonical: boolean;
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function bodyTokens(text: string): string[] {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, text);
  const tokens: string[] = [];
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    if (kind === ts.SyntaxKind.SemicolonToken) {
      continue;
    }
    const spelling =
      kind === ts.SyntaxKind.StringLiteral ? scanner.getTokenValue() : scanner.getTokenText();
    tokens.push(`${kind}:${spelling}`);
  }
  return tokens;
}

const CANONICAL_BODY_TOKENS = bodyTokens(
  DEBUG_MANAGED_BLOCK.slice(
    DEBUG_BLOCK_BEGIN.length,
    DEBUG_MANAGED_BLOCK.length - DEBUG_BLOCK_END.length,
  ),
);

/**
 * The `setup-debug` managed block in a source, located the way
 * `upsertManagedBlock` locates it: exactly one BEGIN and one END, BEGIN first.
 * Any other sentinel shape is one `setup-debug` itself refuses to edit, so it
 * is not a managed block at all.
 */
export function findManagedBootstrap(sourceFile: ts.SourceFile): ManagedBootstrap | undefined {
  const text = sourceFile.text;
  if (occurrences(text, DEBUG_BLOCK_BEGIN) !== 1 || occurrences(text, DEBUG_BLOCK_END) !== 1) {
    return undefined;
  }
  const beginAt = text.indexOf(DEBUG_BLOCK_BEGIN);
  const endAt = text.indexOf(DEBUG_BLOCK_END);
  if (endAt < beginAt) {
    return undefined;
  }
  const bodyStart = beginAt + DEBUG_BLOCK_BEGIN.length;
  const statements = sourceFile.statements.filter(
    (statement) => statement.getStart(sourceFile) >= bodyStart && statement.end <= endAt,
  );
  const tokens = bodyTokens(text.slice(bodyStart, endAt));
  const canonical =
    tokens.length === CANONICAL_BODY_TOKENS.length &&
    tokens.every((token, index) => token === CANONICAL_BODY_TOKENS[index]);
  return { statements, canonical };
}
