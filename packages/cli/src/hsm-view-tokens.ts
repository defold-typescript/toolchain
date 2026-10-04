import * as ts from "typescript";

export type TokenKind =
  | "keyword"
  | "identifier"
  | "string"
  | "number"
  | "regex"
  | "comment"
  | "punctuation"
  | "text";

export interface Run {
  readonly text: string;
  readonly kind: TokenKind;
}

export type Line = readonly Run[];

interface Token {
  readonly text: string;
  readonly syntax: ts.SyntaxKind;
}

const LINE_BREAK = /\r\n|\r|\n/;

const TRIVIA = new Set([
  ts.SyntaxKind.WhitespaceTrivia,
  ts.SyntaxKind.NewLineTrivia,
  ts.SyntaxKind.SingleLineCommentTrivia,
  ts.SyntaxKind.MultiLineCommentTrivia,
  ts.SyntaxKind.ShebangTrivia,
  ts.SyntaxKind.ConflictMarkerTrivia,
]);

// A `/` after one of these divides; anywhere else it starts a regex.
const ENDS_OPERAND = new Set([
  ts.SyntaxKind.Identifier,
  ts.SyntaxKind.PrivateIdentifier,
  ts.SyntaxKind.ThisKeyword,
  ts.SyntaxKind.SuperKeyword,
  ts.SyntaxKind.TrueKeyword,
  ts.SyntaxKind.FalseKeyword,
  ts.SyntaxKind.NullKeyword,
  ts.SyntaxKind.NumericLiteral,
  ts.SyntaxKind.BigIntLiteral,
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateTail,
  ts.SyntaxKind.RegularExpressionLiteral,
  ts.SyntaxKind.CloseParenToken,
  ts.SyntaxKind.CloseBracketToken,
  ts.SyntaxKind.CloseBraceToken,
  ts.SyntaxKind.PlusPlusToken,
  ts.SyntaxKind.MinusMinusToken,
]);

function isKeyword(syntax: ts.SyntaxKind): boolean {
  return syntax >= ts.SyntaxKind.FirstKeyword && syntax <= ts.SyntaxKind.LastKeyword;
}

function isContextualKeyword(syntax: ts.SyntaxKind): boolean {
  return syntax > ts.SyntaxKind.LastFutureReservedWord && syntax <= ts.SyntaxKind.LastKeyword;
}

function scanTokens(text: string): Token[] {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    ts.LanguageVariant.Standard,
    text,
  );
  const tokens: Token[] = [];
  const braces: ("brace" | "template")[] = [];
  let previous: ts.SyntaxKind | undefined;
  for (let syntax = scanner.scan(); syntax !== ts.SyntaxKind.EndOfFileToken; ) {
    if (
      (syntax === ts.SyntaxKind.SlashToken || syntax === ts.SyntaxKind.SlashEqualsToken) &&
      (previous === undefined || !ENDS_OPERAND.has(previous))
    ) {
      syntax = scanner.reScanSlashToken();
    } else if (syntax === ts.SyntaxKind.CloseBraceToken && braces.at(-1) === "template") {
      syntax = scanner.reScanTemplateToken(false);
    }
    if (syntax === ts.SyntaxKind.TemplateHead || syntax === ts.SyntaxKind.OpenBraceToken) {
      braces.push(syntax === ts.SyntaxKind.TemplateHead ? "template" : "brace");
    } else if (syntax === ts.SyntaxKind.TemplateTail || syntax === ts.SyntaxKind.CloseBraceToken) {
      braces.pop();
    }
    tokens.push({ text: text.slice(scanner.getTokenFullStart(), scanner.getTokenEnd()), syntax });
    if (!TRIVIA.has(syntax)) {
      previous = syntax;
    }
    syntax = scanner.scan();
  }
  return tokens;
}

function significantNeighbor(tokens: readonly Token[], from: number, step: 1 | -1) {
  for (let index = from + step; index >= 0 && index < tokens.length; index += step) {
    const token = tokens[index] as Token;
    if (!TRIVIA.has(token.syntax)) {
      return token.syntax;
    }
  }
  return undefined;
}

function kindOf(tokens: readonly Token[], index: number): TokenKind {
  const { syntax } = tokens[index] as Token;
  switch (syntax) {
    case ts.SyntaxKind.SingleLineCommentTrivia:
    case ts.SyntaxKind.MultiLineCommentTrivia:
    case ts.SyntaxKind.ShebangTrivia:
      return "comment";
    case ts.SyntaxKind.WhitespaceTrivia:
    case ts.SyntaxKind.NewLineTrivia:
    case ts.SyntaxKind.ConflictMarkerTrivia:
      return "text";
    case ts.SyntaxKind.StringLiteral:
    case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
    case ts.SyntaxKind.TemplateHead:
    case ts.SyntaxKind.TemplateMiddle:
    case ts.SyntaxKind.TemplateTail:
      return "string";
    case ts.SyntaxKind.NumericLiteral:
    case ts.SyntaxKind.BigIntLiteral:
      return "number";
    case ts.SyntaxKind.RegularExpressionLiteral:
      return "regex";
    case ts.SyntaxKind.Identifier:
    case ts.SyntaxKind.PrivateIdentifier:
      return "identifier";
  }
  if (!isKeyword(syntax)) {
    return "punctuation";
  }
  const before = significantNeighbor(tokens, index, -1);
  if (before === ts.SyntaxKind.DotToken || before === ts.SyntaxKind.QuestionDotToken) {
    return "identifier";
  }
  const after = significantNeighbor(tokens, index, 1);
  if (
    isContextualKeyword(syntax) &&
    (after === ts.SyntaxKind.ColonToken || after === ts.SyntaxKind.QuestionToken)
  ) {
    return "identifier";
  }
  return "keyword";
}

/** The offset in `text` where each line from `tokenizeLines(text)` starts. */
export function lineStarts(text: string): number[] {
  const starts = [0];
  for (const match of text.matchAll(new RegExp(LINE_BREAK, "g"))) {
    starts.push(match.index + match[0].length);
  }
  return starts;
}

/** Splits `text` into lines of colored runs; joining a line's runs gives that line exactly. */
export function tokenizeLines(text: string): Line[] {
  const tokens = scanTokens(text);
  const lines: Run[][] = [[]];
  tokens.forEach((token, index) => {
    const kind = kindOf(tokens, index);
    token.text.split(LINE_BREAK).forEach((part, partIndex) => {
      if (partIndex > 0) {
        lines.push([]);
      }
      if (part !== "") {
        lines[lines.length - 1]?.push({ text: part, kind });
      }
    });
  });
  return lines;
}
