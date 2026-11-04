import { describe, expect, test } from "bun:test";
import ts from "typescript";
import { type MergedFork, mergeForkDocs, upstreamDocPin } from "./merge-fork-docs";
import { type LuaMember, parseLuaSurface } from "./parse-lua-surface";

function upstreamOf(lua: string): Map<string, LuaMember> {
  return new Map(parseLuaSurface(lua).members.map((member) => [member.name, member]));
}

function pinOf(lua: string, name = "push"): string {
  const member = upstreamOf(lua).get(name);
  if (member === undefined) throw new Error(`the case's upstream defines no ${name}`);
  return upstreamDocPin(member);
}

function commentFree(source: string): string {
  const sf = ts.createSourceFile("fork.d.ts", source, ts.ScriptTarget.Latest, false);
  return ts.createPrinter({ removeComments: true }).printFile(sf);
}

// Every case goes through here, so each one also proves the merge adds comments
// and nothing else: TypeScript's comment-free print of both sources must agree.
function merge(fork: string, lua: string): MergedFork {
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

// `PUSH_LUA` with one word of its summary changed.
const EDITED_PUSH_LUA = lua(
  "--- Add one or more event listeners",
  "-- Each handler must be a function",
  "function M.push(...)",
  "end",
);

// A fork whose own comment documents `push`, pinned to `pin` when one is given.
function pushFork(pin?: string): string {
  return [
    "declare module 'tally.tally' {",
    "\t/**",
    "\t * Queue handlers for the next flush.",
    ...(pin === undefined ? [] : [`\t * @upstreamDoc ${pin}`]),
    "\t */",
    "\texport function push(...args: unknown[]): void;",
    "}",
    "",
  ].join("\n");
}

// `push` printed with `summary` as its only comment.
function upstreamPush(summary: string[]): string {
  return [
    "declare module 'tally.tally' {",
    "\t/**",
    ...summary.map((line) => `\t * ${line}`),
    "\t */",
    "\texport function push(...args: unknown[]): void;",
    "}",
    "",
  ].join("\n");
}

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

  test("a member the fork documents and pins to upstream's block prints the fork's text without the pin", () => {
    const merged = merge(pushFork(pinOf(PUSH_LUA)), PUSH_LUA);
    expect(merged.source).toBe(pushFork());
    expect(merged.upstreamDocs).toEqual([]);
    expect(merged.notices).toEqual([]);
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

  test("a pinned overload set any of whose declarations has prose is left alone", () => {
    const fork = (pin: string[]) =>
      [
        "declare module 'tally.tally' {",
        "\t/**",
        "\t * Queue one handler.",
        ...pin,
        "\t */",
        "\texport function push(handler: () => void): void;",
        "\texport function push(...handlers: (() => void)[]): void;",
        "}",
        "",
      ].join("\n");
    const merged = merge(fork([`\t * @upstreamDoc ${pinOf(PUSH_LUA)}`]), PUSH_LUA);
    expect(merged.source).toBe(fork([]));
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
      expect(merged.notices).toEqual([]);
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

  describe("pinned overrides", () => {
    test("a fork comment pinned to an older upstream block prints upstream's summary in its place", () => {
      const merged = merge(pushFork(pinOf(PUSH_LUA)), EDITED_PUSH_LUA);
      expect(merged.source).toBe(
        upstreamPush(["Add one or more event listeners", "Each handler must be a function"]),
      );
      expect(merged.upstreamDocs).toEqual(["push"]);
      expect(merged.notices).toEqual([
        { member: "push", kind: "stale", pin: pinOf(EDITED_PUSH_LUA) },
      ]);
    });

    test("an unpinned fork comment on a member upstream documents prints upstream's summary", () => {
      const merged = merge(pushFork(), PUSH_LUA);
      expect(merged.source).toBe(
        upstreamPush(["Add one or more event handlers", "Each handler must be a function"]),
      );
      expect(merged.upstreamDocs).toEqual(["push"]);
      expect(merged.notices).toEqual([{ member: "push", kind: "unpinned", pin: pinOf(PUSH_LUA) }]);
    });

    test("a fork comment that gives way keeps every tag except its @param and @returns", () => {
      const fork = [
        "declare module 'tally.tally' {",
        "\t/**",
        "\t * Queue handlers for the next flush.",
        "\t * @param args the handlers,",
        "\t *   one per event",
        "\t * @returns nothing",
        "\t * @deprecated Use flush.",
        "\t * @noSelf",
        "\t */",
        "\texport function push(...args: unknown[]): void;",
        "\t/** Run the queue. @noSelf */",
        "\texport function flush(): void;",
        "}",
        "",
      ].join("\n");
      const upstream = lua(
        "--- Add one or more event handlers",
        "function M.push(...)",
        "end",
        "",
        "--- Run every handler",
        "function M.flush()",
        "end",
      );
      const merged = merge(fork, upstream);
      expect(merged.source).toBe(
        [
          "declare module 'tally.tally' {",
          "\t/**",
          "\t * Add one or more event handlers",
          "\t *",
          "\t * @deprecated Use flush.",
          "\t * @noSelf",
          "\t */",
          "\texport function push(...args: unknown[]): void;",
          "\t/**",
          "\t * Run every handler",
          "\t *",
          "\t * @noSelf",
          "\t */",
          "\texport function flush(): void;",
          "}",
          "",
        ].join("\n"),
      );
      expect(merged.notices.map(({ member, kind }) => [member, kind])).toEqual([
        ["push", "unpinned"],
        ["flush", "unpinned"],
      ]);
    });

    test("a fork comment on a member upstream does not document prints with no notice", () => {
      const fork = (pin: string[]) =>
        [
          "declare module 'tally.tally' {",
          "\t/**",
          "\t * Count the queue.",
          ...pin,
          "\t */",
          "\texport function size(): number;",
          "}",
          "",
        ].join("\n");
      const unpinned = merge(fork([]), PUSH_LUA);
      expect(unpinned.source).toBe(fork([]));
      expect(unpinned.notices).toEqual([]);

      const pinned = merge(fork([`\t * @upstreamDoc ${pinOf(PUSH_LUA)}`]), PUSH_LUA);
      expect(pinned.source).toBe(fork([]));
      expect(pinned.upstreamDocs).toEqual([]);
      expect(pinned.notices).toEqual([{ member: "size", kind: "orphan" }]);
    });

    test("re-indenting or re-wrapping the upstream block keeps its pin", () => {
      const pin = pinOf(PUSH_LUA);
      expect(
        pinOf(
          lua(
            "---   Add one or more event handlers",
            "--\tEach handler must be a function",
            "function M.push(...)",
            "end",
          ),
        ),
      ).toBe(pin);
      expect(
        pinOf(
          lua(
            "--- Add one or more",
            "-- event handlers Each handler",
            "-- must be a function",
            "function M.push(...)",
            "end",
          ),
        ),
      ).toBe(pin);
    });

    test("changing a word or a @param line moves the pin", () => {
      expect(pinOf(EDITED_PUSH_LUA)).not.toBe(pinOf(PUSH_LUA));
      const withParam = (doc: string) =>
        lua(
          "--- Add one or more event handlers",
          `-- @param ... ${doc}`,
          "function M.push(...)",
          "end",
        );
      expect(pinOf(withParam("the handlers"))).not.toBe(pinOf(withParam("the listeners")));
    });

    test("a pin is 12 lowercase hex characters", () => {
      expect(pinOf(PUSH_LUA)).toMatch(/^[0-9a-f]{12}$/);
    });

    test.each([
      ["uppercase", "\t * @upstreamDoc 0123456789AB"],
      ["too short", "\t * @upstreamDoc 0123456789a"],
      ["empty", "\t * @upstreamDoc"],
      ["followed by text", "\t * @upstreamDoc 0123456789ab and more"],
      ["sharing a line with prose", "\t * Queue them. @upstreamDoc 0123456789ab"],
    ])("an @upstreamDoc line %s throws, naming the module and member", (_, line) => {
      const fork = [
        "declare module 'tally.tally' {",
        "\t/**",
        "\t * Queue handlers for the next flush.",
        line,
        "\t */",
        "\texport function push(...args: unknown[]): void;",
        "}",
        "",
      ].join("\n");
      expect(() => mergeForkDocs(fork, upstreamOf(PUSH_LUA))).toThrow(
        /^tally\.tally: push: @upstreamDoc /,
      );
    });

    test("an @upstreamDoc line on anything but a module function or constant throws", () => {
      const fork = [
        "declare module 'tally.tally' {",
        "\t/**",
        "\t * A queued handler.",
        `\t * @upstreamDoc ${pinOf(PUSH_LUA)}`,
        "\t */",
        "\texport interface Handler {}",
        "}",
        "",
      ].join("\n");
      expect(() => mergeForkDocs(fork, upstreamOf(PUSH_LUA))).toThrow(
        /^tally\.tally: line 4: @upstreamDoc /,
      );
    });
  });
});
