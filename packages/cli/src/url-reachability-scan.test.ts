import { describe, expect, test } from "bun:test";
import { createTranspileSession, type SceneComponentIndex } from "@defold-typescript/transpiler";
import type { UrlParameterTable } from "@defold-typescript/types";
import type * as ts from "typescript";
import { loadUrlParameterTable } from "./url-parameter-table";
import { scanUrlFragmentReachability } from "./url-reachability-scan";

const TABLE: UrlParameterTable = loadUrlParameterTable();

function programFor(rel: string, source: string): ts.Program {
  const session = createTranspileSession();
  session.update({ [rel]: source });
  const program = session.getProgram();
  if (!program) {
    throw new Error("session produced no program");
  }
  return program;
}

function universe(...ids: string[]): SceneComponentIndex {
  return { ids: new Set(ids), incomplete: [] };
}

describe("scanUrlFragmentReachability", () => {
  test("a checked report with findings becomes one warning per finding", () => {
    const { warnings } = scanUrlFragmentReachability({
      program: programFor("src/main.ts", 'msg.post("#nobody", "hello");\n'),
      index: universe("controller"),
      table: TABLE,
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("src/main.ts");
    expect(warnings[0]).toContain("nobody");
  });

  test("a checked report with no findings warns nothing", () => {
    expect(
      scanUrlFragmentReachability({
        program: programFor("src/main.ts", 'msg.post("#nobody", "hello");\n'),
        index: universe("nobody"),
        table: TABLE,
      }),
    ).toEqual({ warnings: [], entries: [] });
  });

  test("one warning per finding, each naming its own file", () => {
    const session = createTranspileSession();
    session.update({
      "src/a.ts": 'msg.post("#nobody", "hello");\n',
      "src/b.ts": 'msg.post("#nowhere", "hello");\n',
    });
    const program = session.getProgram();
    if (!program) {
      throw new Error("session produced no program");
    }

    const { warnings } = scanUrlFragmentReachability({ program, index: universe(), table: TABLE });

    expect(warnings).toHaveLength(2);
    expect(warnings.find((w) => w.includes("src/a.ts"))).toContain("nobody");
    expect(warnings.find((w) => w.includes("src/b.ts"))).toContain("nowhere");
  });

  test("a suppressed report becomes one line carrying every reason", () => {
    const { warnings, entries } = scanUrlFragmentReachability({
      program: programFor("src/main.ts", 'msg.post("#nobody", "hello");\n'),
      index: {
        ids: new Set<string>(),
        incomplete: ["game/a.go: could not be read", "game/b.collection: could not be read"],
      },
      table: TABLE,
    });

    // A suppressed check has nothing structured to say; the absent entries must
    // never read as "no unreachable addresses".
    expect(entries).toEqual([]);
    expect(warnings).toHaveLength(1);
    const [warning] = warnings;
    expect(warning).toContain("game/a.go: could not be read");
    expect(warning).toContain("game/b.collection: could not be read");
    // A suppressed check must never read as one that found nothing.
    expect(warning).toContain("did not run");
    expect(warning).not.toContain("nobody");
  });

  test("each finding renders as an entry carrying its file, fragment and message", () => {
    const { warnings, entries } = scanUrlFragmentReachability({
      program: programFor("src/main.ts", 'msg.post("#nobody", "hello");\n'),
      index: universe("controller"),
      table: TABLE,
    });

    expect(entries).toEqual([
      {
        file: "src/main.ts",
        fragment: "nobody",
        message: expect.stringContaining("nobody") as unknown as string,
      },
    ]);
    // The two renderings come from one scan, so they can never disagree.
    expect(warnings[0]).toContain(entries[0]?.message as string);
  });
});
