import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";
import { FIXTURE_DATA_DIR, writeLibraryTargets } from "../library-data-fixture";
import { LIBRARY_DATA_DIR } from "./package-root";
import { lowerNativeApiDoc, type NativeTarget, readNativeTargets } from "./sync-native-types";

const DATA_DIR = LIBRARY_DATA_DIR;

interface Element {
  type: string;
  name: string;
  global?: boolean;
  returnvalues?: { types: string[] }[];
  types?: string[];
  extends?: string[];
  properties?: { name: string; is_optional?: string; types?: string[] }[];
  functions?: { name: string }[];
}

// A flat module: constants, functions, an overload pair, and the shapes its
// signatures reach.
const GAUGE_DECLARATION = `/** @noSelfInFile */
/** @globalTable */
declare module "gauge" {
  interface Hit {
    id: number;
    bits: number;
  }

  interface RangedHit extends Hit {
    distance: number;
  }

  interface DeepHit extends RangedHit {
    depth: number;
  }

  type ProbeResult = number[] | Hit[] | DeepHit[];

  type RangedProbeResult = RangedHit[] | Hit[] | DeepHit[];

  interface SaveOptions {
    type?: string;
    text?: string;
    title?: string;
    url?: string;
  }

  type Cell = [x: number, y: number];

  type Metric = "near" | "far" | "exact";

  interface Board {
    route(start: Cell, goal: Cell, metric?: Metric): Cell[] | undefined;
    is_open(cell: Cell): boolean;
  }

  interface Session {
    step(dt: number): void;
    close(): void;
  }

  interface Reading {
    position: Vector3;
    level: number;
    peak?: true;
  }

  interface LoopRing {
    shape: "ring";
    points: Vector3[];
    loop: true;
  }

  interface OpenRing {
    shape: "ring";
    points: Vector3[];
    loop?: false;
    prev: Vector3;
    next: Vector3;
  }

  type Ring = LoopRing | OpenRing;

  interface JointDefBase {
    collide?: boolean;
  }

  interface HingeDef extends JointDefBase {
    anchor: Vector3;
  }

  const MODE_FAST: number;
  const MODE_SLOW: number;

  function probe(group: number, mask?: number): ProbeResult;
  function probe_sorted(group: number): RangedProbeResult;
  function save(path: string, text?: string, options?: SaveOptions): void;
  function cast(x: number, y: number): LuaMultiReturn<[false] | [true, number, number]>;
  function create_board(width: number, height: number): Board;
  function open(path: string): Session;
  function read(session: Session): LuaTable<number, Reading>;
  function add_ring(ring: Ring): void;
  function add_hinge(def: HingeDef): void;
  function send(body: string, on_done: (reply: string) => void): void;
  function send(id: string, body: string, on_done: (reply: string) => void): void;
}
`;

// Userdata methods, callbacks the extension calls with only their own
// arguments, and constants grouped in tables.
const RIG_DECLARATION = `/** @noSelfInFile */
/** @globalTable */
declare module "rig" {
  namespace Shape {
    const CIRCLE: 0;
    const BOX: 1;
  }

  namespace BodyType {
    const STATIC: 0;
    const DYNAMIC: 1;
  }

  interface Contact {
    SetEnabled(flag: boolean): void;
    IsTouching(): boolean;
  }

  interface ContactListener {
    BeginContact?: (this: void, contact: Contact) => void;
    EndContact?: (this: void, contact: Contact) => void;
  }

  interface DrawCallbacks {
    DrawCircle: (this: void, center: Vector3, radius: number) => void;
    DrawSegment: (this: void, from: Vector3, to: Vector3) => void;
  }

  interface Body {
    ApplyForce(force: Vector3): void;
    GetType(): number;
  }

  interface World {
    CreateBody(type?: number): Body;
    SetContactListener(listener: ContactListener | undefined): void;
    SetDebugDraw(draw: DrawCallbacks): void;
    RayCast(
      callback: (this: void, body: Body, fraction: number) => number,
      from: Vector3,
      to: Vector3,
    ): void;
    Step(dt: number): void;
  }

  function NewWorld(gravity?: Vector3): World;
  function NewCircle(): number;
}
`;

function writeSourceDir(): string {
  const dataDir = mkdtempSync(join(tmpdir(), "sync-native-types-"));
  const libraries = [
    { name: "gauge", declaration: GAUGE_DECLARATION, methodTables: undefined },
    {
      name: "rig",
      declaration: RIG_DECLARATION,
      methodTables: { "Rig::World": ["World"], "Rig::Body": ["Body"], "Rig::Contact": ["Contact"] },
    },
  ];
  writeLibraryTargets(dataDir, {
    native: libraries.map(({ name, methodTables }) => ({
      repo: `https://github.com/example/fixture-${name}`,
      ref: "v1.0",
      namespace: name,
      manifestDir: name,
      declaration: `fork/${name}.d.ts`,
      upstreamSource: `source/upstream/${name}/src/${name}.cpp`,
      ...(methodTables === undefined ? {} : { methodTables }),
    })),
  });
  for (const { name, declaration } of libraries) {
    mkdirSync(join(dataDir, `example/fixture-${name}`, "fork"), { recursive: true });
    writeFileSync(join(dataDir, `example/fixture-${name}`, "fork", `${name}.d.ts`), declaration);
  }
  return dataDir;
}

const SOURCE_DIR = writeSourceDir();

afterAll(() => {
  rmSync(SOURCE_DIR, { recursive: true, force: true });
});

function target(namespace: string, dataDir = DATA_DIR): NativeTarget {
  const found = readNativeTargets(dataDir).find((t) => t.namespace === namespace);
  if (!found) throw new Error(`native-targets.json has no ${namespace} entry`);
  return found;
}

function lowered(
  namespace: string,
  dataDir = DATA_DIR,
): { info: { namespace: string }; elements: Element[] } {
  return JSON.parse(lowerNativeApiDoc(dataDir, target(namespace, dataDir)));
}

describe("lowerNativeApiDoc", () => {
  test("lowers a native module to bare member names under its namespace", () => {
    const doc = lowered("gauge", SOURCE_DIR);
    expect(doc.info.namespace).toBe("gauge");
    expect(
      doc.elements
        .filter((e) => e.type === "FUNCTION")
        .map((e) => e.name)
        .sort(),
    ).toEqual([
      "add_hinge",
      "add_ring",
      "cast",
      "create_board",
      "open",
      "probe",
      "probe_sorted",
      "read",
      "save",
      "send",
      "send",
    ]);
    expect(
      doc.elements
        .filter((e) => e.type === "VARIABLE")
        .map((e) => e.name)
        .sort(),
    ).toEqual(["MODE_FAST", "MODE_SLOW"]);
    const names = doc.elements.map((e) => e.name);
    expect(names.filter((n) => n.startsWith("global.") || n.includes("."))).toEqual([]);
  });

  // The page already says the namespace is a global called with no import, so a
  // per-member ambient-global badge would repeat it on every row.
  test("carries no per-member global marker", () => {
    const dataDirs = [FIXTURE_DATA_DIR, SOURCE_DIR];
    const namespaces = dataDirs.flatMap((dataDir) =>
      readNativeTargets(dataDir).map(({ namespace }) => [namespace, dataDir] as const),
    );
    expect(namespaces.map(([namespace]) => namespace).sort()).toEqual(["gauge", "rig", "stamp"]);
    for (const [namespace, dataDir] of namespaces) {
      expect(lowered(namespace, dataDir).elements.filter((e) => e.global)).toEqual([]);
    }
  });

  test("defines the options shape a function names", () => {
    const options = lowered("gauge", SOURCE_DIR).elements.find((e) => e.name === "SaveOptions");
    expect(options?.type).toBe("TYPEDEF");
    expect(options?.properties?.map((p) => [p.name, p.is_optional])).toEqual([
      ["type", "True"],
      ["text", "True"],
      ["title", "True"],
      ["url", "True"],
    ]);
  });

  test("defines the query results and the hit shapes they name", () => {
    const byName = new Map(lowered("gauge", SOURCE_DIR).elements.map((e) => [e.name, e]));
    expect(byName.get("ProbeResult")?.types).toEqual(["number[]", "Hit[]", "DeepHit[]"]);
    expect(byName.get("RangedProbeResult")?.types).toContain("RangedHit[]");
    expect(byName.get("DeepHit")?.extends).toEqual(["RangedHit"]);
    expect(byName.get("RangedHit")?.extends).toEqual(["Hit"]);
    expect(byName.get("Hit")?.properties?.map((p) => p.name)).toContain("id");
  });

  test("lowers wave's registered functions and none of the stubs its C++ never registers", () => {
    const functions = lowered("wave")
      .elements.filter((e) => e.type === "FUNCTION")
      .map((e) => e.name);
    expect(functions).toHaveLength(12);
    expect(functions).not.toContain("get_wave1_time_height");
    expect(functions).not.toContain("get_wave2_time_height");
  });

  test("keeps a hit-or-miss multi-return union", () => {
    const cast = lowered("gauge", SOURCE_DIR).elements.find((e) => e.name === "cast");
    expect(cast?.returnvalues?.[0]?.types).toEqual([
      "LuaMultiReturn<[ false ] | [ true, number, number ]>",
    ]);
  });

  test("lowers shape-table unions and joint-def inheritance", () => {
    const byName = new Map(lowered("gauge", SOURCE_DIR).elements.map((e) => [e.name, e]));
    const ring = byName.get("Ring");
    expect(ring?.type).toBe("TYPEDEF");
    expect(ring?.types).toEqual(["LoopRing", "OpenRing"]);
    expect(byName.get("OpenRing")?.properties?.map((p) => [p.name, p.is_optional])).toEqual([
      ["shape", undefined],
      ["points", undefined],
      ["loop", "True"],
      ["prev", undefined],
      ["next", undefined],
    ]);
    expect(byName.get("HingeDef")?.extends).toEqual(["JointDefBase"]);
  });

  test("lowers an object's methods and the tuple and literal-union shapes they name", () => {
    const byName = new Map(lowered("gauge", SOURCE_DIR).elements.map((e) => [e.name, e]));
    const board = byName.get("Board");
    expect(board?.type).toBe("TYPEDEF");
    expect(board?.functions?.map((f) => f.name)).toEqual(["route", "is_open"]);
    expect(board?.properties).toBeUndefined();
    expect(byName.get("Cell")?.type).toBe("TYPEDEF");
    expect(byName.get("Metric")?.type).toBe("TYPEDEF");
    expect(byName.get("Metric")?.types).toEqual(['"near"', '"far"', '"exact"']);
  });

  test("lowers the functions of an overload pair as one element per call shape, named bare", () => {
    const functions = lowered("gauge", SOURCE_DIR)
      .elements.filter((e) => e.type === "FUNCTION")
      .map((e) => e.name);
    expect(functions.filter((name) => name === "send")).toEqual(["send", "send"]);
    expect(functions.filter((name) => name.startsWith("global."))).toEqual([]);
  });

  test("lowers method-only objects with functions and data shapes with properties", () => {
    const byName = new Map(lowered("gauge", SOURCE_DIR).elements.map((e) => [e.name, e]));
    for (const name of ["Board", "Session"]) {
      expect(byName.get(name)?.type).toBe("TYPEDEF");
      expect(byName.get(name)?.functions).toHaveLength(2);
      expect(byName.get(name)?.properties).toBeUndefined();
    }
    for (const name of ["Reading", "OpenRing"]) {
      expect(byName.get(name)?.properties?.length).toBeGreaterThan(0);
      expect(byName.get(name)?.functions).toBeUndefined();
    }
  });

  // A userdata method lowered as a property, or a callback lowered as a method, reads on
  // the page as a member the runtime does not have.
  test("lowers userdata methods as functions, callbacks as properties and constants by table", () => {
    const doc = lowered("rig", SOURCE_DIR);
    expect(
      doc.elements
        .filter((e) => e.type === "FUNCTION")
        .map((e) => e.name)
        .sort(),
    ).toEqual(["NewCircle", "NewWorld"]);
    expect(
      doc.elements
        .filter((e) => e.type === "VARIABLE")
        .map((e) => e.name)
        .sort(),
    ).toEqual(["BodyType.DYNAMIC", "BodyType.STATIC", "Shape.BOX", "Shape.CIRCLE"]);

    const typedefs = new Map(
      doc.elements.filter((e) => e.type === "TYPEDEF").map((e) => [e.name, e]),
    );
    const isCallback = (p: { types?: string[] }) => (p.types ?? []).some((t) => t.includes("=>"));
    const methodBearing = [
      ...new Set(Object.values(target("rig", SOURCE_DIR).methodTables ?? {}).flat()),
    ];
    expect(methodBearing).toHaveLength(3);
    for (const name of methodBearing) {
      const typedef = typedefs.get(name);
      expect(typedef?.functions?.length ?? 0).toBeGreaterThan(0);
      expect((typedef?.properties ?? []).filter(isCallback)).toEqual([]);
    }
    expect(
      [...typedefs.values()]
        .filter((e) => (e.functions?.length ?? 0) > 0)
        .map((e) => e.name)
        .sort(),
    ).toEqual([...methodBearing].sort());

    const callbacks = (name: string) =>
      (typedefs.get(name)?.properties ?? []).filter(isCallback).map((p) => p.name);
    expect(callbacks("ContactListener")).toEqual(["BeginContact", "EndContact"]);
    expect(callbacks("DrawCallbacks")).toEqual(["DrawCircle", "DrawSegment"]);
  });
});

interface DeclarationForm {
  readonly scriptFile: boolean;
  readonly noSelfInFile: boolean;
  readonly modules: { readonly name: string; readonly globalTable: string | undefined }[];
  readonly aliases: {
    readonly name: string;
    readonly type: string;
    readonly deprecated: boolean;
  }[];
  readonly otherStatements: number;
}

// `scriptFile` matters because an `import` or `export {}` turns `declare module`
// into an augmentation nothing can import. TSTL reads `@noSelfInFile` from every
// comment before the first statement, not only the last one.
function declarationForm(source: string): DeclarationForm {
  const sf = ts.createSourceFile("native.d.ts", source, ts.ScriptTarget.Latest, true);
  const modules: DeclarationForm["modules"] = [];
  const aliases: DeclarationForm["aliases"] = [];
  let otherStatements = 0;
  for (const stmt of sf.statements) {
    if (ts.isModuleDeclaration(stmt) && ts.isStringLiteral(stmt.name)) {
      const tag = ts.getJSDocTags(stmt).find((t) => t.tagName.text === "globalTable");
      modules.push({
        name: stmt.name.text,
        globalTable: tag && (ts.getTextOfJSDocComment(tag.comment) ?? "").trim(),
      });
    } else if (
      ts.isVariableStatement(stmt) &&
      (stmt.declarationList.flags & ts.NodeFlags.Const) !== 0 &&
      stmt.declarationList.declarations.length === 1
    ) {
      const [decl] = stmt.declarationList.declarations;
      aliases.push({
        name: decl?.name.getText(sf) ?? "",
        type: decl?.type?.getText(sf) ?? "",
        deprecated: ts.getJSDocTags(stmt).some((t) => t.tagName.text === "deprecated"),
      });
    } else {
      otherStatements++;
    }
  }
  const leading = ts.getLeadingCommentRanges(source, 0) ?? [];
  return {
    scriptFile: !ts.isExternalModule(sf),
    noSelfInFile: leading.some(({ pos, end }) => source.slice(pos, end).includes("@noSelfInFile")),
    modules,
    aliases,
    otherStatements,
  };
}

describe("curated native declaration form", () => {
  test("each is a bare @globalTable module with no global alias", () => {
    const targets = readNativeTargets(DATA_DIR);

    const actual = Object.fromEntries(
      targets.map((t) => [
        t.namespace,
        declarationForm(readFileSync(join(DATA_DIR, t.declaration), "utf8")),
      ]),
    );
    const expected = Object.fromEntries(
      targets.map(({ namespace }): [string, DeclarationForm] => [
        namespace,
        {
          scriptFile: true,
          noSelfInFile: true,
          modules: [{ name: namespace, globalTable: "" }],
          aliases: [],
          otherStatements: 0,
        },
      ]),
    );
    expect(actual).toEqual(expected);
  });
});
