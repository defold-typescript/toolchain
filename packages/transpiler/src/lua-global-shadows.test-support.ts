// One file-level shadow (`next`, line 1 column 10) beside names that hide a
// global only inside a function or sit on the module table. Line 11 has
// TypeScript-to-Lua lower `string.find(...)[1]` to a call of the parameter
// `select`.
export const PROBE = [
  "function next(n: number): number { return n + 1; }",
  "export function select(n: number): number { return n + 2; }",
  "export function withParam(rawget: number): number { return rawget + next(1); }",
  "export function withLocal(): number { const unpack = 3; return unpack; }",
  "export function paramNext(next: number): number { return next + 1; }",
  "export function innerSelect(): number {",
  "  const select = 4;",
  "  function pairs(n: number): number { return n; }",
  "  return select + pairs(1);",
  "}",
  'export function paramSelectFind(select: number): number { const at = string.find("hello", "l")[1]; return select + (at ?? 0); }',
  "",
].join("\n");

// The 1-based line and column of `name` where it first follows `before` in
// `source`.
export function positionOf(
  source: string,
  before: string,
  name: string,
): { line: number; column: number } {
  const index = source.indexOf(`${before}${name}`);
  if (index < 0) {
    throw new Error(`\`${before}${name}\` is not in the source`);
  }
  const offset = index + before.length;
  const lines = source.slice(0, offset).split("\n");
  return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
}
