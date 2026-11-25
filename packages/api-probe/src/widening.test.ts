import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { scaffoldStrictness } from "../../cli/src/scaffold-strictness";
import { gateCompilerOptions } from "../../types/scripts/example-typecheck";
import { surfaceEntry, surfaceProgram } from "../../types/scripts/lua-kind";
import { checkCalls, overlayProgram } from "./call-check";
import {
  ecsSurface,
  engineSurface,
  findingKey,
  memberCalls,
  type Widening,
  wideningFindings,
} from "./widening";
import { probeTarget } from "./witness";

const FIXTURE = resolve(import.meta.dir, "widening-fixture.d.ts");
const ECS_FIXTURE = resolve(import.meta.dir, "widening-ecs-fixture.ts");
const VERDICTS = resolve(import.meta.dir, "..", "widening-verdicts.json");
// Verdicts on the ECS API, which the ECS block owns.
const ECS_PREFIX = "ecs.";

// The repo's gate options with the strictness flags a scaffolded project sets.
function userOptions(): ts.CompilerOptions {
  return { ...gateCompilerOptions(), ...scaffoldStrictness() };
}

// The ECS fixture's program, without the gate options' `rootDir`, the types package.
function ecsProgram(options: ts.CompilerOptions): ts.Program {
  const { rootDir: _typesPackage, ...outsideTypes } = options;
  return ts.createProgram({ rootNames: [ECS_FIXTURE], options: outsideTypes });
}

function findingsOf(widening: Widening, fn: string): [string, boolean][] {
  return widening.findings
    .filter((finding) => finding.fn === fn)
    .map((finding) => [findingKey(finding), finding.verdictable]);
}

describe("widening findings on a fixture surface", () => {
  const fixture = [
    "export {};",
    "declare global {",
    '  interface WidenA { readonly kind: "a" }',
    '  interface WidenB { readonly kind: "b" }',
    "  namespace sys {",
    '    function widen_payload<K extends "a" | "b" | (string & {})>(',
    "      id: K,",
    '      ...p: K extends "a" ? [p: { x: number }] : [p?: { x: number }]',
    "    ): void;",
    '    function widen_payload_fixed<K extends "a" | "b" | (string & {})>(',
    "      id: K,",
    '      ...p: [K] extends ["a" | "b"]',
    '        ? "a" extends K',
    "          ? [p: { x: number }]",
    "          : [p?: { x: number }]",
    "        : [p?: { x: number }]",
    "    ): void;",
    "    function widen_flag(on: false): void;",
    "    function widen_flag(on: boolean, cooldown: number): void;",
    "    function widen_pick(on: true): number;",
    "    function widen_pick(on: false): string;",
    "    function widen_progress(o: { progress: true }, cb: (r: { status?: number }) => void): void;",
    "    function widen_progress(o: { progress?: boolean }, cb: (r: { status: number }) => void): void;",
    "    function widen_opt<N extends 1 | 2>(n?: N): number;",
    "    function widen_agree<T extends WidenA | WidenB>(a: T, b: number | T): T;",
    '    function widen_one<K extends "a" | (string & {})>(id: K): K extends "a" ? string : number;',
    "    function widen_omit(a: number): number;",
    "    function widen_omit(a: number, o: { all?: boolean }): string;",
    "    function widen_omit_fixed(a: number): number;",
    "    function widen_omit_fixed(a: number, o: { all?: boolean }): string;",
    "    function widen_omit_fixed(a: number, o: { all?: boolean } | undefined): number | string;",
    "    function widen_omit_narrow(a: number): number;",
    "    function widen_omit_narrow(a: number, o: { all?: boolean }): string;",
    "    function widen_omit_narrow(a: number, o: { all?: boolean } | undefined): number;",
    "    function widen_raise(a: number): number;",
    "    function widen_raise(a: number, d: number): number;",
    "    function widen_raise_open(a: number, d?: number): number;",
    "    function widen_raise_open(a: string): string;",
    "    function widen_unknown(a: number): number;",
    "    function widen_unknown(a: number, o: { all?: boolean }): string;",
    "    function widen_middle(a: number): number;",
    "    function widen_middle(a: number, b: number, c: number): number;",
    "    function widen_arity(): number;",
    "    function widen_arity(a?: string): number;",
    "    function widen_arity(a: number, b: number): number;",
    "  }",
    "}",
  ].join("\n");
  const program = overlayProgram(surfaceProgram(probeTarget()), new Map([[FIXTURE, fixture]]));
  // Without nil handling, as the ECS surface is built.
  const { nilHandling: _engine, ...surface } = engineSurface(program);
  const widening = wideningFindings(program, surface);
  const findings = (fn: string) => findingsOf(widening, fn);
  // The engine's nil handling at each fixture slot keyed `<fn> <slot>`;
  // `sys.widen_unknown` has none.
  const fixtureNil = new Map<string, "accepts" | "raises">([
    ["sys.widen_omit 2", "accepts"],
    ["sys.widen_omit_fixed 2", "accepts"],
    ["sys.widen_omit_narrow 2", "accepts"],
    ["sys.widen_raise 2", "raises"],
    ["sys.widen_raise_open 2", "raises"],
    // As `vmath.matrix4_scale`: `f(1, nil)` runs as `f(1)`, `f(1, nil, 1)` raises.
    ["sys.widen_middle 2", "accepts"],
    ["sys.widen_middle 3", "raises"],
    ["sys.widen_arity 1", "accepts"],
    ["sys.widen_arity 2", "raises"],
  ]);
  const omittedNames = new Set([
    ...[...fixtureNil.keys()].map((key) => key.split(" ")[0] as string),
    "sys.widen_unknown",
  ]);
  const omitted = wideningFindings(program, {
    ...surface,
    functions: new Map([...surface.functions].filter(([fn]) => omittedNames.has(fn))),
    calls: surface.calls.filter((call) => omittedNames.has(call.name)),
    nilHandling: (fn, slot) => fixtureNil.get(`${fn} ${slot}`),
  });
  const omittedFindings = (fn: string) => findingsOf(omitted, fn);
  const omittedForms = (fn: string, slot = "2") =>
    omitted.checked
      .filter((entry) => entry.fn === fn && entry.slot === slot)
      .flatMap((entry) => entry.forms);

  test("a conditional rest that distributes over a union accepts the union and the mixed pair", () => {
    expect(findings("sys.widen_payload")).toEqual([
      ["sys.widen_payload required id union sound", false],
      ["sys.widen_payload required id mixed sound", false],
      ["sys.widen_payload required id base sound", true],
    ]);
  });

  test("a non-distributive rest keeps only the open-domain finding", () => {
    expect(findings("sys.widen_payload_fixed")).toEqual([
      ["sys.widen_payload_fixed required id base sound", true],
    ]);
  });

  test("a widened argument every signature rejects is no finding", () => {
    expect(findings("sys.widen_flag")).toEqual([]);
  });

  test("members that each compile while their union does not are incomplete", () => {
    expect(findings("sys.widen_pick")).toEqual([
      ["sys.widen_pick overload1-required on boolean complete", false],
    ]);
  });

  test("a widened property whose callback receives a narrower parameter is unsound", () => {
    expect(findings("sys.widen_progress")).toEqual([
      ["sys.widen_progress overload1-required o.progress boolean sound", false],
    ]);
    const [finding] = widening.findings.filter((entry) => entry.fn === "sys.widen_progress");
    expect(finding?.detail).toContain("callback cb parameter r");
  });

  test("an optional slot is checked with undefined", () => {
    expect(findings("sys.widen_opt")).toEqual([]);
    const forms = (fn: string, slot: string) =>
      widening.checked
        .filter((entry) => entry.fn === fn && entry.slot === slot)
        .flatMap((entry) => entry.forms);
    expect(forms("sys.widen_opt", "n")).toContain("undefined");
    // Under `exactOptionalPropertyTypes` the property's type leaves `undefined` out.
    expect(forms("sys.widen_progress", "o.progress")).toContain("undefined");
  });

  test("a union of arguments that must agree is verdictable", () => {
    expect(findings("sys.widen_agree")).toEqual([["sys.widen_agree required b union sound", true]]);
  });

  test("an open domain with one literal member is judged against it", () => {
    expect(findings("sys.widen_one")).toEqual([["sys.widen_one required id base sound", true]]);
    const [finding] = widening.findings.filter((entry) => entry.fn === "sys.widen_one");
    expect(finding?.detail).toContain('member "a" returns string');
  });

  test("every fixture function gets a base call", () => {
    expect(widening.unchecked.filter((entry) => entry.fn.startsWith("sys.widen_"))).toEqual([]);
  });

  test("an omitted argument the engine accepts as nil and no overload takes as undefined is incomplete", () => {
    expect(omittedFindings("sys.widen_omit")).toEqual([
      ["sys.widen_omit overload2-required 2 omitted complete", false],
    ]);
  });

  test("an omitted argument taken as undefined with a result covering both calls is no finding", () => {
    expect(omittedFindings("sys.widen_omit_fixed")).toEqual([]);
    expect(omittedForms("sys.widen_omit_fixed")).toContain("omitted");
  });

  test("an omitted argument taken as undefined with a result the longer call does not fit is unsound", () => {
    expect(omittedFindings("sys.widen_omit_narrow")).toEqual([
      ["sys.widen_omit_narrow overload2-required 2 omitted sound", false],
    ]);
    const [finding] = omitted.findings.filter((entry) => entry.fn === "sys.widen_omit_narrow");
    expect(finding?.detail).toContain("returns number");
    expect(finding?.detail).toContain("returns string");
  });

  test("an omitted argument the engine raises on and every overload refuses as undefined is no finding", () => {
    expect(omittedFindings("sys.widen_raise")).toEqual([]);
    expect(omittedForms("sys.widen_raise")).toContain("omitted");
  });

  test("an optional argument the engine raises on as nil is unsound", () => {
    expect(omittedFindings("sys.widen_raise_open")).toEqual([
      ["sys.widen_raise_open overload1-optional 2 omitted sound", false],
    ]);
  });

  test("an omitted argument with no recorded nil handling is unchecked", () => {
    expect(omittedFindings("sys.widen_unknown")).toEqual([]);
    const entries = omitted.unchecked.filter((entry) => entry.fn === "sys.widen_unknown");
    expect(entries.map((entry) => entry.key)).toEqual([
      "sys.widen_unknown overload2-required 2 omitted unchecked",
    ]);
    expect(entries[0]?.reason).toContain("no binding records");
  });

  test("only the last argument a call passes is judged as omitted", () => {
    expect(omittedFindings("sys.widen_middle")).toEqual([]);
    expect(omittedForms("sys.widen_middle", "3")).toContain("omitted");
    expect(omittedForms("sys.widen_middle", "2")).toEqual([]);
  });

  test("an omitted argument's form holds only what signatures taking that many arguments declare", () => {
    expect(omittedFindings("sys.widen_arity")).toEqual([]);
    expect(omittedForms("sys.widen_arity", "1")).toContain("omitted");
    expect(omittedForms("sys.widen_arity", "2")).toContain("omitted");
  });

  test("a surface without nil handling judges no omitted argument", () => {
    expect(widening.checked.filter((entry) => entry.forms.includes("omitted"))).toEqual([]);
    expect(widening.unchecked.filter((entry) => entry.key.endsWith(" omitted unchecked"))).toEqual(
      [],
    );
  });
});

// Every finding and unchecked entry keyed, with ` (repo)` or ` (user)` when
// only one config reports it.
function keyed(repo: Widening, user: Widening): Map<string, boolean> {
  const sides = [repo, user].map((widening) => {
    const keys = new Map<string, boolean>();
    for (const finding of widening.findings) keys.set(findingKey(finding), finding.verdictable);
    for (const entry of widening.unchecked) keys.set(entry.key, true);
    return keys;
  }) as [Map<string, boolean>, Map<string, boolean>];
  const out = new Map<string, boolean>();
  for (const [label, own, other] of [
    ["repo", sides[0], sides[1]],
    ["user", sides[1], sides[0]],
  ] as const) {
    for (const [key, verdictable] of own) {
      out.set(other.has(key) ? key : `${key} (${label})`, verdictable);
    }
  }
  return out;
}

// What keeps the keyed findings from matching the verdicts whose key `owns`.
function verdictProblems(
  found: ReadonlyMap<string, boolean>,
  owns: (key: string) => boolean,
): string[] {
  const verdicts = JSON.parse(readFileSync(VERDICTS, "utf8")) as Record<string, string>;
  const problems: string[] = [];
  for (const [key, verdictable] of found) {
    if (!verdictable) problems.push(`fix the declaration: ${key}`);
    else if (verdicts[key] === undefined) problems.push(`no verdict: ${key}`);
  }
  for (const key of Object.keys(verdicts).filter(owns)) {
    if (!found.has(key)) problems.push(`verdict with no finding: ${key}`);
  }
  return problems;
}

describe("widening findings on the shipped surface", () => {
  test("the engine surface reads each slot's nil handling from the target's bindings", () => {
    const target = probeTarget();
    const { nilHandling } = engineSurface(surfaceProgram(target), target);
    // `lua_istable(L, 4)` reads a nil options argument as no table.
    expect(nilHandling?.("physics.raycast", 4)).toBe("accepts");
    expect(nilHandling?.("physics.raycast", 1)).toBe("raises");
    expect(nilHandling?.("sys.get_config_int", 2)).toBe("raises");
    expect(nilHandling?.("physics.raycast", 9)).toBeUndefined();
    expect(nilHandling?.("sys.no_such_function", 1)).toBeUndefined();
  });

  test(
    "every finding and unchecked function has a verdict, and every verdict a finding",
    () => {
      const target = probeTarget();
      const repoProgram = surfaceProgram(target);
      const userProgram = ts.createProgram({
        rootNames: [surfaceEntry(target)],
        options: userOptions(),
      });
      const repo = wideningFindings(repoProgram, engineSurface(repoProgram, target));
      const user = wideningFindings(userProgram, engineSurface(userProgram, target));
      const owns = (key: string) => !key.startsWith(ECS_PREFIX);
      expect(verdictProblems(keyed(repo, user), owns)).toEqual([]);
    },
    { timeout: 120_000 },
  );
});

describe("member calls on the shipped surface", () => {
  const program = surfaceProgram(probeTarget());
  const members = memberCalls(program);
  const returnsOf = (name: string, member: string) =>
    members
      .filter((call) => call.name === name && call.member === member)
      .map((call) => call.returns.kinds);

  test("each gui.get property member carries the returns of the overload it resolves to", () => {
    const leading = returnsOf("gui.get", '"leading"');
    expect(leading.length).toBeGreaterThan(0);
    for (const kinds of leading) expect(kinds).toEqual([["number"]]);
    const color = returnsOf("gui.get", '"color"');
    expect(color.length).toBeGreaterThan(0);
    for (const kinds of color) {
      expect(kinds).toHaveLength(1);
      expect(kinds[0]).toHaveLength(1);
      expect(kinds[0]).not.toEqual(["number"]);
    }
  });

  test("no member is a widened form", () => {
    const widened = new Set(["string", "number", "boolean", "union", "mixed", "base"]);
    expect(members.filter((call) => widened.has(call.member))).toEqual([]);
  });

  test(
    "every member call compiles",
    () => {
      const checked = checkCalls(
        program,
        members.map((call) => call.call),
      );
      expect(
        checked.calls.flatMap((call, i) =>
          call.errors.map((error) => `${members[i]?.call}: ${error}`),
        ),
      ).toEqual([]);
    },
    { timeout: 60_000 },
  );
});

describe("widening findings on ECS predicate filters", () => {
  const program = ecsProgram(gateCompilerOptions());
  const checker = program.getTypeChecker();
  const fixture = checker.getSymbolAtLocation(
    program.getSourceFile(ECS_FIXTURE) as ts.SourceFile,
  ) as ts.Symbol;
  const functions = new Map(
    checker
      .getExportsOfModule(fixture)
      .filter((symbol) => symbol.name.startsWith("narrow"))
      .map((symbol) => [symbol.name, symbol] as const),
  );
  const widening = wideningFindings(program, {
    functions,
    calls: [...functions.keys()].map((name) => ({
      name,
      variant: "required",
      call: `ecs.processingSystem<Ent>()(${name}("velocity"), { process(e) { __capture(e); } })`,
    })),
    unwitnessed: [],
    prelude: ['import { type Ent, ecs, narrowBoth, narrowEach } from "./widening-ecs-fixture";'],
  });

  test("a filter asserting every member of a union at once is unsound inside process", () => {
    expect(findingsOf(widening, "narrowBoth")).toEqual([
      ["narrowBoth required k union sound", false],
    ]);
    const [finding] = widening.findings.filter((entry) => entry.fn === "narrowBoth");
    expect(finding?.detail).toContain('but member "velocity" captures');
  });

  test("a filter asserting one alternative per member is sound", () => {
    expect(findingsOf(widening, "narrowEach")).toEqual([]);
    expect(widening.checked.filter((entry) => entry.fn === "narrowEach")).toEqual([
      {
        fn: "narrowEach",
        variant: "required",
        slot: "k",
        forms: ['"velocity"', '"frozen"', "union"],
      },
    ]);
  });
});

// The ECS exports that build a filter and those that build a system factory,
// named as the gate names them.
function ecsBuilders(program: ts.Program): { constructors: string[]; factories: string[] } {
  const checker = program.getTypeChecker();
  const fixture = checker.getSymbolAtLocation(
    program.getSourceFile(ECS_FIXTURE) as ts.SourceFile,
  ) as ts.Symbol;
  const ecs = checker.getExportsOfModule(fixture).find((symbol) => symbol.name === "ecs");
  if (ecs === undefined) throw new Error("the ECS fixture exports no ecs namespace");
  const constructors: string[] = [];
  const factories: string[] = [];
  for (const symbol of checker.getExportsOfModule(checker.getAliasedSymbol(ecs))) {
    const [signature] = checker.getTypeOfSymbol(symbol).getCallSignatures();
    if (signature === undefined) continue;
    const returned = signature.getReturnType();
    const name = returned.aliasSymbol?.name ?? returned.getSymbol()?.name ?? "";
    if (name === "Filter") constructors.push(`${ECS_PREFIX}${symbol.name}`);
    else if (name.endsWith("SystemFactory")) factories.push(`${ECS_PREFIX}${symbol.name}`);
  }
  return { constructors, factories };
}

// The ECS declarations file the program reads.
function ecsDeclarations(program: ts.Program): ts.SourceFile {
  const file = program
    .getSourceFiles()
    .find((candidate) =>
      candidate.fileName.replaceAll("\\", "/").endsWith("/types/ecs/index.d.ts"),
    );
  if (file === undefined) throw new Error("the ECS program reads no ECS declarations");
  return file;
}

describe("widening findings on the shipped ECS API", () => {
  test(
    "every finding has a verdict, every verdict a finding, and every filter constructor checked slots through every system factory",
    () => {
      const programs = [ecsProgram(gateCompilerOptions()), ecsProgram(userOptions())];
      for (const program of programs) {
        const source = program.getSourceFile(ECS_FIXTURE) as ts.SourceFile;
        expect(program.getSemanticDiagnostics(source).map((d) => d.messageText)).toEqual([]);
        // A base call that does not compile rejects every form and so hides every finding.
        const surface = ecsSurface(program);
        const base = checkCalls(
          program,
          surface.calls.map((call) => call.call),
          [],
          surface.prelude,
        );
        expect(
          base.calls.flatMap((call, i) =>
            call.errors.map((error) => `${surface.calls[i]?.name}: ${error}`),
          ),
        ).toEqual([]);
      }
      const [repo, user] = programs.map((program) =>
        wideningFindings(program, ecsSurface(program)),
      ) as [Widening, Widening];
      expect(verdictProblems(keyed(repo, user), (key) => key.startsWith(ECS_PREFIX))).toEqual([]);
      const { constructors, factories } = ecsBuilders(programs[0] as ts.Program);
      expect(constructors).toContain("ecs.requireAll");
      expect(factories).toContain("ecs.sortedProcessingSystem");
      const missing = (
        [
          ["repo", repo],
          ["user", user],
        ] as const
      ).flatMap(([label, widening]) =>
        constructors
          .filter((fn) => !widening.unchecked.some((entry) => entry.fn === fn))
          .flatMap((fn) =>
            factories.flatMap((factory) => {
              const forms = widening.checked
                .filter((entry) => entry.fn === fn && entry.variant === factory)
                .flatMap((entry) => entry.forms);
              const needed = [
                ...(forms.some((form) => form.startsWith('"')) ? [] : ["a member"]),
                ...["union", "base"].filter((form) => !forms.includes(form)),
              ];
              return needed.map((form) => `${label}: ${fn} through ${factory} lacks ${form}`);
            }),
          ),
      );
      expect(missing).toEqual([]);
    },
    { timeout: 60_000 },
  );

  test(
    "a factory whose callbacks require every component a union names is unsound through it",
    () => {
      const program = ecsProgram(gateCompilerOptions());
      const declarations = ecsDeclarations(program);
      const shipped = "SortedProcessingSystemCallbacks<E, Narrowed<E, F>>";
      const requiresAll = 'SortedProcessingSystemCallbacks<E, With<E, KeysIn<F>["required"]>>';
      expect(declarations.text.split(shipped).length - 1).toBe(1);
      const mutated = overlayProgram(
        program,
        new Map([[declarations.fileName, declarations.text.replace(shipped, requiresAll)]]),
      );
      const widening = wideningFindings(mutated, ecsSurface(mutated));
      expect(
        widening.findings
          .filter(
            (finding) => finding.variant !== "ecs.sortedProcessingSystem" || finding.verdictable,
          )
          .map(findingKey),
      ).toEqual([]);
      const expected = [
        "ecs.requireAll ecs.sortedProcessingSystem tokens union sound",
        "ecs.filter ecs.sortedProcessingSystem pattern union sound",
      ];
      expect(widening.findings.map(findingKey)).toEqual(expect.arrayContaining(expected));
      for (const key of expected) {
        const finding = widening.findings.find((entry) => findingKey(entry) === key);
        expect(finding?.detail).toContain("captures");
      }
      // The shipped `Narrowed` keeps one alternative per branch, so it stays accepted.
      expect(
        wideningFindings(program, ecsSurface(program))
          .findings.filter((finding) => finding.variant === "ecs.sortedProcessingSystem")
          .map(findingKey),
      ).toEqual([]);
    },
    { timeout: 60_000 },
  );
});
