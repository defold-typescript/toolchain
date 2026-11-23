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
    "  }",
    "}",
  ].join("\n");
  const widening = wideningFindings(
    overlayProgram(surfaceProgram(probeTarget()), new Map([[FIXTURE, fixture]])),
  );
  const findings = (fn: string) => findingsOf(widening, fn);

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
