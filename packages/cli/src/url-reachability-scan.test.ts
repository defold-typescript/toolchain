import { describe, expect, test } from "bun:test";
import {
  createTranspileSession,
  type SceneComponentIndex,
  type SceneObjectPathIndex,
} from "@defold-typescript/transpiler";
import type { UrlParameterTable } from "@defold-typescript/types";
import type * as ts from "typescript";
import { loadUrlParameterTable } from "./url-parameter-table";
import { scanCrossWorldAddresses, scanUrlFragmentReachability } from "./url-reachability-scan";

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

function objects(
  entries: Record<string, readonly string[]>,
): Pick<SceneObjectPathIndex, "paths" | "componentsOf"> {
  return {
    paths: new Set(Object.keys(entries)),
    componentsOf: new Map(Object.entries(entries)),
  };
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

  test("the object index reaches the check, so a colliding fragment becomes a warning", () => {
    // `hud` declares "sprit", so the project-wide universe accepts it; only the
    // object index can tell that `/player` does not.
    const { warnings, entries } = scanUrlFragmentReachability({
      program: programFor("src/main.ts", 'go.get("/player#sprit", "position");\n'),
      index: universe("sprite", "sprit"),
      table: TABLE,
      sceneObjects: objects({ "/player": ["sprite"], "/hud": ["sprit"] }),
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("src/main.ts");
    expect(warnings[0]).toContain('"/player"');
    expect(entries).toEqual([
      {
        file: "src/main.ts",
        fragment: "sprit",
        message: expect.stringContaining('the game object "/player"'),
      },
    ]);
  });

  test("without the object index the project-wide warnings are unchanged", () => {
    const source = 'go.get("/player#sprit", "position");\n';
    expect(
      scanUrlFragmentReachability({
        program: programFor("src/main.ts", source),
        index: universe("sprite", "sprit"),
        table: TABLE,
      }),
    ).toEqual({ warnings: [], entries: [] });

    const { warnings } = scanUrlFragmentReachability({
      program: programFor("src/main.ts", source),
      index: universe("sprite"),
      table: TABLE,
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("no `.go` or `.collection` in this project declares");
  });

  test("the suppressed branch is unchanged while the object index is present", () => {
    const { warnings, entries } = scanUrlFragmentReachability({
      program: programFor("src/main.ts", 'go.get("/player#sprit", "position");\n'),
      index: { ids: new Set(["sprite"]), incomplete: ["game/a.go: could not be read"] },
      table: TABLE,
      sceneObjects: objects({ "/player": ["sprite"] }),
    });

    expect(entries).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("unreachable-address check did not run");
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

describe("scanCrossWorldAddresses", () => {
  test("the scan renders each finding once as prose and once structured", () => {
    const { warnings, entries } = scanCrossWorldAddresses({
      program: programFor("src/main.ts", 'go.get_position("mylevel:/enemy");\n'),
      table: TABLE,
      worldsOf: () => [undefined],
    });

    expect(entries).toEqual([
      {
        file: "src/main.ts",
        address: "mylevel:/enemy",
        socket: "mylevel",
        message: expect.stringContaining("mylevel") as unknown as string,
      },
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("src/main.ts");
    // The two renderings come from one scan, so they can never disagree.
    expect(warnings[0]).toContain(entries[0]?.message as string);
  });

  test("a file whose world resolves to the literal's warns nothing", () => {
    expect(
      scanCrossWorldAddresses({
        program: programFor("src/main.ts", 'go.get_position("mylevel:/enemy");\n'),
        table: TABLE,
        worldsOf: () => ["mylevel"],
      }),
    ).toEqual({ warnings: [], entries: [] });
  });

  test("a suppressed fragment check does not silence the cross-world scan", () => {
    const program = programFor("src/main.ts", 'go.get_position("mylevel:/enemy");\n');
    const fragment = scanUrlFragmentReachability({
      program,
      index: { ids: new Set<string>(), incomplete: ["game/a.go: could not be read"] },
      table: TABLE,
    });
    const cross = scanCrossWorldAddresses({ program, table: TABLE, worldsOf: () => [undefined] });

    expect(fragment.entries).toEqual([]);
    expect(fragment.warnings[0]).toContain("did not run");
    expect(cross.entries).toHaveLength(1);
  });
});
