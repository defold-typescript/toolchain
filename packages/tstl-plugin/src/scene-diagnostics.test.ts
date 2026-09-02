import { describe, expect, test } from "bun:test";
import ts from "typescript";
import { completionSetup, SCENE_DOCUMENTS, TWO_WORLD_DOCUMENTS } from "./completion-harness";

const UNREACHABLE_SOURCE = 'msg.post("#nobody", "hello");\n';
const REACHABLE_SOURCE = 'msg.post("#board", "hello");\n';

// `PATH_DOCUMENTS`' shape: the one collection that gives `/hero` a prototype, so
// the object an absolute address names is provable and the check can scope its
// answer to what that object really declares.
const PATH_DOCUMENTS: Record<string, string> = {
  ...SCENE_DOCUMENTS,
  "game.project": "[bootstrap]\nmain_collection = /main/main.collectionc\n",
  "main/main.collection":
    'instances {\n  id: "hero"\n  prototype: "/main/board.go"\n}\n' +
    'instances {\n  id: "cape"\n  prototype: "/main/hud.go"\n}\n',
};

const OBJECT_SCOPED_SOURCE = 'msg.post("/hero#nobody", "hello");\n';

function baseDiagnostic(messageText: string): ts.Diagnostic {
  return {
    file: undefined,
    start: undefined,
    length: undefined,
    messageText,
    category: ts.DiagnosticCategory.Error,
    code: 1,
  };
}

function diagnosticsOf(options: {
  source: string;
  documents?: Record<string, string>;
  sources?: Record<string, string>;
  unreadable?: readonly string[];
  baseDiagnostics?: ts.Diagnostic[];
  serverHost?: boolean;
  fileName?: string;
}): ts.Diagnostic[] {
  const { service } = completionSetup({ ...options, base: undefined });
  return service.getSemanticDiagnostics(options.fileName ?? "main.ts");
}

describe("editor fragment findings", () => {
  test("an unreachable fragment is appended as a Suggestion", () => {
    const diagnostics = diagnosticsOf({ source: UNREACHABLE_SOURCE });
    expect(diagnostics).toHaveLength(1);
    const [finding] = diagnostics;
    expect(finding?.category).toBe(ts.DiagnosticCategory.Suggestion);
    expect(finding?.file?.fileName).toBe("main.ts");
    expect(finding?.start).toBe(UNREACHABLE_SOURCE.indexOf('"#nobody"'));
    expect(finding?.length).toBe('"#nobody"'.length);
    expect(finding?.messageText).toContain('"nobody"');
    expect(finding?.source).toBe("defold-typescript");
  });

  test("a reachable fragment appends nothing", () => {
    const base = [baseDiagnostic("base")];
    expect(diagnosticsOf({ source: REACHABLE_SOURCE, baseDiagnostics: base })).toEqual(base);
  });

  test("the base diagnostics are preserved, in order, ahead of the appended ones", () => {
    const base = [baseDiagnostic("first"), baseDiagnostic("second")];
    const diagnostics = diagnosticsOf({ source: UNREACHABLE_SOURCE, baseDiagnostics: base });
    expect(diagnostics).toHaveLength(3);
    expect(diagnostics.slice(0, 2)).toEqual(base);
    expect(diagnostics[2]?.category).toBe(ts.DiagnosticCategory.Suggestion);
  });

  test("only the edited file's findings are returned", () => {
    const diagnostics = diagnosticsOf({
      source: REACHABLE_SOURCE,
      sources: { "other.ts": UNREACHABLE_SOURCE },
    });
    expect(diagnostics).toEqual([]);
  });

  test("an object-scoped message is used where the path is provable", () => {
    const diagnostics = diagnosticsOf({
      source: OBJECT_SCOPED_SOURCE,
      documents: PATH_DOCUMENTS,
    });
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.messageText).toContain('the game object "/hero"');
    expect(diagnostics[0]?.messageText).toContain('it declares "board"');
  });
});

describe("suppression and absent-cache honesty", () => {
  test("a project whose scene source cannot be read appends nothing", () => {
    const base = [baseDiagnostic("base")];
    expect(
      diagnosticsOf({
        source: UNREACHABLE_SOURCE,
        unreadable: ["main/board.go"],
        baseDiagnostics: base,
      }),
    ).toEqual(base);
  });

  test("a project with no scene sources at all appends nothing", () => {
    const base = [baseDiagnostic("base")];
    expect(
      diagnosticsOf({ source: UNREACHABLE_SOURCE, documents: {}, baseDiagnostics: base }),
    ).toEqual(base);
  });

  test("a host that cannot enumerate files returns the base diagnostics untouched", () => {
    const base = [baseDiagnostic("base")];
    expect(
      diagnosticsOf({ source: UNREACHABLE_SOURCE, serverHost: false, baseDiagnostics: base }),
    ).toEqual(base);
  });
});

const FOREIGN_SOCKET_SOURCE = 'go.get_position("mylevel:/enemy");\n';
const CROSS_WORLD_SLOT_SOURCE = 'msg.post("mylevel:/enemy", "hello");\n';
const BOTH_HALVES_SOURCE = 'msg.post("#nobody", "hello");\ngo.get_position("mylevel:/enemy");\n';

function twoWorldDiagnostics(options: {
  source: string;
  fileName: string;
  unreadable?: readonly string[];
}): ts.Diagnostic[] {
  return diagnosticsOf({ ...options, documents: TWO_WORLD_DOCUMENTS });
}

describe("two independent producers, one call", () => {
  test("a foreign socket at a same-world slot is appended", () => {
    const diagnostics = twoWorldDiagnostics({
      source: FOREIGN_SOCKET_SOURCE,
      fileName: "home.ts",
    });
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.category).toBe(ts.DiagnosticCategory.Suggestion);
    expect(diagnostics[0]?.messageText).toContain('"mylevel"');
    expect(diagnostics[0]?.messageText).toContain("the bootstrap world");
  });

  test("the same literal at a cross-world slot appends nothing", () => {
    expect(twoWorldDiagnostics({ source: CROSS_WORLD_SLOT_SOURCE, fileName: "home.ts" })).toEqual(
      [],
    );
  });

  test("a script no scene hosts appends nothing", () => {
    expect(twoWorldDiagnostics({ source: FOREIGN_SOCKET_SOURCE, fileName: "none.ts" })).toEqual([]);
  });

  test("both halves reach one call, distinguishable by code", () => {
    const diagnostics = twoWorldDiagnostics({ source: BOTH_HALVES_SOURCE, fileName: "home.ts" });
    expect(diagnostics).toHaveLength(2);
    const codes = new Set(diagnostics.map((diagnostic) => diagnostic.code));
    expect(codes.size).toBe(2);
  });

  test("a suppressed fragment report does not silence the cross-world half", () => {
    const diagnostics = twoWorldDiagnostics({
      source: BOTH_HALVES_SOURCE,
      fileName: "home.ts",
      unreadable: ["enemy.go"],
    });
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.messageText).toContain('"mylevel"');
  });
});
