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

  describe("upstream parameter and return docs", () => {
    const METRICS_LUA = lua(
      "--- Create a metrics instance",
      "-- @param format (string) The output format",
      "-- @param color The color to draw in",
      "-- @tparam[opt] number samples How many samples to average",
      "-- @return The metrics instance",
      "function M.create(samples, format)",
      "end",
    );

    test("a function prints the tags of the parameters it declares, in its order, and its return", () => {
      const fork = [
        "declare module 'metrics' {",
        "\texport function create(samples?: number, format?: string): Metrics;",
        "}",
        "",
      ].join("\n");
      expect(merge(fork, METRICS_LUA).source).toBe(
        [
          "declare module 'metrics' {",
          "\t/**",
          "\t * Create a metrics instance",
          "\t *",
          "\t * @param samples - How many samples to average",
          "\t * @param format - The output format",
          "\t * @returns The metrics instance",
          "\t */",
          "\texport function create(samples?: number, format?: string): Metrics;",
          "}",
          "",
        ].join("\n"),
      );
    });

    test("a void function prints no @returns, and a constant no tags at all", () => {
      const tagged = ["-- @param samples How many samples", "-- @return The value"];
      const upstream = lua(
        "--- Update the metrics",
        ...tagged,
        "function M.update(samples)",
        "end",
        "",
        "--- The format",
        ...tagged,
        'M.FORMAT = "%s"',
      );
      const fork = [
        "declare module 'metrics' {",
        "\texport function update(samples: number): void;",
        "\texport const FORMAT: string;",
        "}",
        "",
      ].join("\n");
      expect(merge(fork, upstream).source).toBe(
        [
          "declare module 'metrics' {",
          "\t/**",
          "\t * Update the metrics",
          "\t *",
          "\t * @param samples - How many samples",
          "\t */",
          "\texport function update(samples: number): void;",
          "\t/**",
          "\t * The format",
          "\t */",
          "\texport const FORMAT: string;",
          "}",
          "",
        ].join("\n"),
      );
    });

    test("each overload gets only the parameters it declares", () => {
      const upstream = lua(
        "--- Add a handler",
        "-- @param handler The handler to add",
        "-- @param priority Where it runs",
        "function M.push(handler, priority)",
        "end",
      );
      const fork = [
        "declare module 'tally.tally' {",
        "\texport function push(handler: () => void): void;",
        "\texport function push(handler: () => void, priority: number): void;",
        "}",
        "",
      ].join("\n");
      expect(merge(fork, upstream).source).toBe(
        [
          "declare module 'tally.tally' {",
          "\t/**",
          "\t * Add a handler",
          "\t *",
          "\t * @param handler - The handler to add",
          "\t */",
          "\texport function push(handler: () => void): void;",
          "\t/**",
          "\t * Add a handler",
          "\t *",
          "\t * @param handler - The handler to add",
          "\t * @param priority - Where it runs",
          "\t */",
          "\texport function push(handler: () => void, priority: number): void;",
          "}",
          "",
        ].join("\n"),
      );
    });

    test("an upstream block of tags alone fills an undocumented member", () => {
      const upstream = lua(
        "---@param value string The value to store",
        "function M.set(value)",
        "end",
      );
      const fork = (comment: string[]) =>
        [
          "declare module 'store' {",
          ...comment,
          "\texport function set(value: string): void;",
          "}",
          "",
        ].join("\n");
      const bare = merge(fork([]), upstream);
      expect(bare.source).toBe(fork(["\t/**", "\t * @param value - The value to store", "\t */"]));
      expect(bare.upstreamDocs).toEqual(["set"]);
      expect(merge(fork(["\t/** @noSelf */"]), upstream).source).toBe(
        fork(["\t/**", "\t * @param value - The value to store", "\t * @noSelf", "\t */"]),
      );
    });

    test("a fork's own @param and @returns keep their slots, upstream fills the rest", () => {
      const upstream = lua(
        "--- Check if a screen is in the stack",
        "-- @param screen_id (string) Upstream's id",
        "-- @param verbose Log the lookup",
        "-- @return Upstream's answer",
        "function M.in_stack(screen_id, verbose)",
        "end",
      );
      const fork = [
        "declare module 'monarch' {",
        "\t/**",
        "\t * @param screen_id - The fork's id",
        "\t * @returns The fork's answer",
        "\t */",
        "\texport function in_stack(screen_id: string, verbose: boolean): boolean;",
        "}",
        "",
      ].join("\n");
      expect(merge(fork, upstream).source).toBe(
        [
          "declare module 'monarch' {",
          "\t/**",
          "\t * Check if a screen is in the stack",
          "\t *",
          "\t * @param verbose - Log the lookup",
          "\t * @param screen_id - The fork's id",
          "\t * @returns The fork's answer",
          "\t */",
          "\texport function in_stack(screen_id: string, verbose: boolean): boolean;",
          "}",
          "",
        ].join("\n"),
      );
    });

    test("a pinned fork comment prints whole, and editing one upstream @param line makes it stale", () => {
      const upstream = (doc: string) =>
        lua(
          "--- Add one event handler",
          `-- @param handler ${doc}`,
          "function M.push(handler)",
          "end",
        );
      const fork = (comment: string[]) =>
        [
          "declare module 'tally.tally' {",
          ...comment,
          "\texport function push(handler: () => void): void;",
          "}",
          "",
        ].join("\n");
      const own = ["\t/**", "\t * Queue a handler for the next flush.", "\t */"];
      const pin = pinOf(upstream("The handler"));
      const pinned = fork([
        "\t/**",
        "\t * Queue a handler for the next flush.",
        `\t * @upstreamDoc ${pin}`,
        "\t */",
      ]);
      const kept = merge(pinned, upstream("The handler"));
      expect(kept.source).toBe(fork(own));
      expect(kept.notices).toEqual([]);

      const stale = merge(pinned, upstream("The listener"));
      expect(stale.source).toBe(
        fork([
          "\t/**",
          "\t * Add one event handler",
          "\t *",
          "\t * @param handler - The listener",
          "\t */",
        ]),
      );
      expect(stale.notices).toEqual([
        { member: "push", kind: "stale", pin: pinOf(upstream("The listener")) },
      ]);
    });
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

    test("a member upstream documents only with tags for what the fork does not declare", () => {
      unchanged(
        [
          "declare module 'store' {",
          "\t/**",
          "\t * The fork's own words.",
          "\t */",
          "\texport function set(value: string): void;",
          "}",
          "",
        ].join("\n"),
        lua(
          "---@param color string The color",
          "---@return boolean ok Whether it worked",
          "function M.set(color)",
          "end",
        ),
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
