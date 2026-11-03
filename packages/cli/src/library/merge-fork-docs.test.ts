import { describe, expect, test } from "bun:test";
import ts from "typescript";
import { mergeForkDocs } from "./merge-fork-docs";
import { type LuaMember, parseLuaSurface } from "./parse-lua-surface";

function upstreamOf(lua: string): Map<string, LuaMember> {
  return new Map(parseLuaSurface(lua).members.map((member) => [member.name, member]));
}

function commentFree(source: string): string {
  const sf = ts.createSourceFile("fork.d.ts", source, ts.ScriptTarget.Latest, false);
  return ts.createPrinter({ removeComments: true }).printFile(sf);
}

// Every case goes through here, so each one also proves the merge adds comments
// and nothing else: TypeScript's comment-free print of both sources must agree.
function merge(fork: string, lua: string): { source: string; upstreamDocs: string[] } {
  const merged = mergeForkDocs(fork, upstreamOf(lua));
  expect(commentFree(merged.source)).toBe(commentFree(fork));
  return merged;
}

function lua(...lines: string[]): string {
  return ["local M = {}", "", ...lines, "", "return M", ""].join("\n");
}

const PUSH_LUA = lua(
  "--- Add one or more event handlers",
  "-- Each handler must be a function",
  "function M.push(...)",
  "end",
);

describe("mergeForkDocs", () => {
  test("an undocumented function gains upstream's summary directly above it, tab-indented", () => {
    const fork = [
      "declare module 'tally.tally' {",
      "\texport function push(...args: unknown[]): void;",
      "}",
      "",
    ].join("\n");
    const merged = merge(fork, PUSH_LUA);
    expect(merged.source).toBe(
      [
        "declare module 'tally.tally' {",
        "\t/**",
        "\t * Add one or more event handlers",
        "\t * Each handler must be a function",
        "\t */",
        "\texport function push(...args: unknown[]): void;",
        "}",
        "",
      ].join("\n"),
    );
    expect(merged.upstreamDocs).toEqual(["push"]);
  });

  test("the block takes a space-indented declaration's indentation", () => {
    const fork = [
      "declare module 'tally.tally' {",
      "  export function push(...args: unknown[]): void;",
      "}",
      "",
    ].join("\n");
    expect(merge(fork, PUSH_LUA).source).toBe(
      [
        "declare module 'tally.tally' {",
        "  /**",
        "   * Add one or more event handlers",
        "   * Each handler must be a function",
        "   */",
        "  export function push(...args: unknown[]): void;",
        "}",
        "",
      ].join("\n"),
    );
  });

  test("an undocumented constant gains upstream's summary", () => {
    const fork = ["declare module 'fmt' {", "\texport const FORMAT: string;", "}", ""].join("\n");
    const merged = merge(fork, lua("--- The format every line is written in", 'M.FORMAT = "%s"'));
    expect(merged.source).toBe(
      [
        "declare module 'fmt' {",
        "\t/**",
        "\t * The format every line is written in",
        "\t */",
        "\texport const FORMAT: string;",
        "}",
        "",
      ].join("\n"),
    );
    expect(merged.upstreamDocs).toEqual(["FORMAT"]);
  });

  test("a member the fork documents is returned byte-for-byte", () => {
    const fork = [
      "declare module 'tally.tally' {",
      "\t/** Queue handlers for the next flush. */",
      "\texport function push(...args: unknown[]): void;",
      "}",
      "",
    ].join("\n");
    const merged = merge(fork, PUSH_LUA);
    expect(merged.source).toBe(fork);
    expect(merged.upstreamDocs).toEqual([]);
  });

  test("a tag-only comment gains the summary as its opening lines, still one block", () => {
    const fork = [
      "declare module 'tally.tally' {",
      "\t/** @noSelf */",
      "\texport function push(...args: unknown[]): void;",
      "}",
      "",
    ].join("\n");
    const merged = merge(fork, PUSH_LUA);
    expect(merged.source).toBe(
      [
        "declare module 'tally.tally' {",
        "\t/**",
        "\t * Add one or more event handlers",
        "\t * Each handler must be a function",
        "\t *",
        "\t * @noSelf",
        "\t */",
        "\texport function push(...args: unknown[]): void;",
        "}",
        "",
      ].join("\n"),
    );
    expect(merged.upstreamDocs).toEqual(["push"]);
  });

  test("a multi-line tag-only comment keeps every tag line", () => {
    const fork = [
      "declare module 'tally.tally' {",
      "\t/**",
      "\t * @deprecated Use flush.",
      "\t * @noSelf",
      "\t */",
      "\texport function push(...args: unknown[]): void;",
      "}",
      "",
    ].join("\n");
    expect(merge(fork, PUSH_LUA).source).toBe(
      [
        "declare module 'tally.tally' {",
        "\t/**",
        "\t * Add one or more event handlers",
        "\t * Each handler must be a function",
        "\t *",
        "\t * @deprecated Use flush.",
        "\t * @noSelf",
        "\t */",
        "\texport function push(...args: unknown[]): void;",
        "}",
        "",
      ].join("\n"),
    );
  });

  test("each overload of an undocumented function gains the block", () => {
    const fork = [
      "declare module 'tally.tally' {",
      "\texport function push(handler: () => void): void;",
      "\texport function push(...handlers: (() => void)[]): void;",
      "}",
      "",
    ].join("\n");
    const merged = merge(fork, PUSH_LUA);
    const block = [
      "\t/**",
      "\t * Add one or more event handlers",
      "\t * Each handler must be a function",
      "\t */",
    ];
    expect(merged.source).toBe(
      [
        "declare module 'tally.tally' {",
        ...block,
        "\texport function push(handler: () => void): void;",
        ...block,
        "\texport function push(...handlers: (() => void)[]): void;",
        "}",
        "",
      ].join("\n"),
    );
    expect(merged.upstreamDocs).toEqual(["push"]);
  });

  test("an overload set any of whose declarations has prose is left alone", () => {
    const fork = [
      "declare module 'tally.tally' {",
      "\t/** Queue one handler. */",
      "\texport function push(handler: () => void): void;",
      "\texport function push(...handlers: (() => void)[]): void;",
      "}",
      "",
    ].join("\n");
    const merged = merge(fork, PUSH_LUA);
    expect(merged.source).toBe(fork);
    expect(merged.upstreamDocs).toEqual([]);
  });

  test("a summary holding the comment terminator is escaped and the source still parses", () => {
    const fork = [
      "declare module 'glob' {",
      "\texport function match(pattern: string): boolean;",
      "}",
      "",
    ].join("\n");
    const merged = merge(
      fork,
      lua("--- Match paths such as src/**/*.lua", "function M.match(p)", "end"),
    );
    expect(merged.source).toContain("\t * Match paths such as src/**\\/*.lua\n");
    expect(merged.upstreamDocs).toEqual(["match"]);
  });

  test("an `@` TypeScript would read as a tag is escaped, so the summary survives whole", () => {
    const fork = ["declare module 'tally' {", "\texport function flush(): void;", "}", ""].join(
      "\n",
    );
    const merged = merge(
      fork,
      lua("--- Run every handler added via @{push}", "function M.flush()", "end"),
    );
    const sf = ts.createSourceFile("fork.d.ts", merged.source, ts.ScriptTarget.Latest, true);
    const [declaration] = ((sf.statements[0] as ts.ModuleDeclaration).body as ts.ModuleBlock)
      .statements;
    const [doc] = ts.getJSDocCommentsAndTags(declaration as ts.Node).filter(ts.isJSDoc);
    expect(ts.getTextOfJSDocComment(doc?.comment)).toBe("Run every handler added via \\@{push}");
    expect(doc?.tags).toBeUndefined();
  });

  test("a multi-paragraph summary keeps its blank line as a bare margin", () => {
    const fork = ["declare module 'relay' {", "\texport function start(): void;", "}", ""].join(
      "\n",
    );
    const merged = merge(
      fork,
      lua("--- Start the relay", "--", "-- Binds a socket.", "function M.start()", "end"),
    );
    expect(merged.source).toContain(
      ["\t/**", "\t * Start the relay", "\t *", "\t * Binds a socket.", "\t */"].join("\n"),
    );
  });

  test("a leading line that is only the member's own name is dropped", () => {
    const fork = [
      "declare module 'nakama' {",
      "\texport function update_account(): void;",
      "}",
      "",
    ].join("\n");
    const merged = merge(
      fork,
      lua(
        "--- update_account",
        "-- Update fields in the current user's account.",
        "-- @param client",
        "function M.update_account(client)",
        "end",
      ),
    );
    expect(merged.source).toContain(
      ["\t/**", "\t * Update fields in the current user's account.", "\t */"].join("\n"),
    );
  });

  test("a first line that merely contains the name is prose", () => {
    const fork = ["declare module 'relay' {", "\texport function start(): void;", "}", ""].join(
      "\n",
    );
    const merged = merge(fork, lua("--- start the relay", "function M.start()", "end"));
    expect(merged.source).toContain("\t * start the relay\n");
  });

  test("only the members upstream documents are filled, in source order", () => {
    const fork = [
      "declare module 'relay' {",
      "\texport function update(): void;",
      "\texport function stop(): void;",
      "\texport function start(): void;",
      "}",
      "",
    ].join("\n");
    const merged = merge(
      fork,
      lua(
        "--- Start it",
        "function M.start()",
        "end",
        "",
        "function M.stop()",
        "end",
        "",
        "--- Update it",
        "function M.update()",
        "end",
      ),
    );
    expect(merged.upstreamDocs).toEqual(["update", "start"]);
  });

  describe("never fills", () => {
    function unchanged(fork: string, upstream: string): void {
      const merged = merge(fork, upstream);
      expect(merged.source).toBe(fork);
      expect(merged.upstreamDocs).toEqual([]);
    }

    test("a global declaration outside the declare module block", () => {
      unchanged(
        [
          "declare function pprint(value: unknown): void;",
          "declare module 'debugger' {",
          "\texport function start(): void;",
          "}",
          "",
        ].join("\n"),
        lua("--- Pretty-print a value", "function M.pprint(v)", "end"),
      );
    });

    test("a member inside a nested namespace", () => {
      unchanged(
        [
          "declare module 'foo' {",
          "\texport namespace foo {",
          "\t\texport function bar(): void;",
          "\t}",
          "}",
          "",
        ].join("\n"),
        lua("--- The bar of the module", "function M.bar()", "end"),
      );
    });

    test("a type the fork declares under an upstream member's name", () => {
      unchanged(
        ["declare module 'console' {", "\texport interface Console {}", "}", ""].join("\n"),
        lua("--- The console handle", "M.Console = {}"),
      );
    });

    test("a member upstream documents only with tags", () => {
      unchanged(
        ["declare module 'fsm' {", "\texport function transition(): void;", "}", ""].join("\n"),
        lua("--- @deprecated", "function M.transition()", "end"),
      );
    });

    test("a member whose upstream summary is only its own name", () => {
      unchanged(
        [
          "declare module 'nakama' {",
          "\texport function create_api_account(): void;",
          "}",
          "",
        ].join("\n"),
        lua(
          "--- create_api_account",
          "-- @param avatar_url",
          "function M.create_api_account(avatar_url)",
          "end",
        ),
      );
    });

    test("a member upstream does not define", () => {
      unchanged(
        ["declare module 'tally.tally' {", "\texport function extra(): void;", "}", ""].join("\n"),
        PUSH_LUA,
      );
    });
  });
});
