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

// Runtime expressions inside a type wrapper: a class `extends` clause and an
// instantiation expression. The `extends` method's `select` is called by the
// `select(2, ...)` TypeScript-to-Lua writes for `string.find(...)[1]`; `sound`
// refers to itself only from an `extends` clause, `msg` only from a type.
export const HERITAGE = [
  'export class C extends (class { f(select: number) { return string.find("hi", "i")[1]; } }) {}',
  "export const instantiated = (<T>(next: T): T => next)<number>;",
  "export const selfExtending = function sound(): unknown { return class extends (sound as unknown as new () => object) {}; };",
  "export const typeOnlySelf = function msg(n: number): number { const again: typeof msg | undefined = undefined; print(again); return n; };",
  "",
].join("\n");

// Rest parameters TypeScript-to-Lua declares as `local <name> = {...}`, or
// destructures into locals.
export const REST_KEPT = [
  "export function keptRead(...select: number[]): number { return select.length; }",
  "export function keptClosure(...msg: unknown[]): () => void { return () => print(...msg); }",
  'export function keptTry(...next: unknown[]): void { try { print(...next); } catch { print("failed"); } }',
  "export async function keptAsync(...sound: unknown[]): Promise<void> { print(...sound); }",
  "export function keptSpreadThenRead(...go: number[]): number { print(...go); return go.length; }",
  "export function keptHoisted(...timer: unknown[]): void { later(); print(...timer); function later(): void {} }",
  "export class Made { constructor(...label: unknown[]) {} }",
  "export function picked(...[vmath]: number[]): number { return 1; }",
  "",
].join("\n");

// Rest parameters TypeScript-to-Lua passes on as Lua's `...` without naming.
export const REST_ERASED = [
  "export function unused(...select: number[]): number { return 1; }",
  "export function forwarded(...msg: unknown[]): void { print(...msg); }",
  "export function cast(...next: number[]): void { print(...(next as unknown[])); }",
  "export function copied(...sound: number[]): number[] { return [...sound]; }",
  "export const arrow = (...go: unknown[]): void => print(...go);",
  'export function looped(...timer: unknown[]): void { for (let i = 0; i < 2; i++) { print(...timer); } try { print("x"); } finally { print(...timer); } }',
  "export function declaredAbove(...label: unknown[]): void { function before(): void {} before(); print(...label); }",
  "export function declaredBelow(...vmath: unknown[]): void { print(...vmath); after(); function after(): void {} }",
  "export function* generated(...tonumber: unknown[]): Generator<number> { print(...tonumber); yield 1; }",
  "export async function unusedAsync(...setmetatable: number[]): Promise<number> { return 1; }",
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
