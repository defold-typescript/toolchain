/**
 * What this gate proves, and what it does not. Every example compiles at the
 * strictness `defold-typescript init` writes into a user's project, so a helper
 * parameter an example declares is typed or the gate says so. A call on a value
 * the declarations type as `unknown` still goes unchecked once an example casts
 * it, so the gate proves an example parses and misuses no *typed* API on a
 * surface that ships it. It does not prove the example is correct Defold code.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { LooseTypeFinding } from "./example-loose-types";
import { loadTranslations } from "./example-store-io";
import {
  type ExampleSurface,
  exampleSurfaces,
  kindFactoryNames,
  moduleKey,
  moduleNamespaces,
  referencedNamespaces,
} from "./example-surfaces";
import {
  COMPILER_OPTION_OVERRIDES,
  compileSurface,
  type ExampleDiagnostic,
  exampleUnit,
  gateCompilerOptions,
  gateFailures,
  implicitAnyOffenders,
  moduleSpecifier,
  optionalLoadOffenders,
  type PinFile,
  pinIdentity,
  propertyArgumentOffenders,
  readPins,
  runGate,
  sharedLooseFindings,
  sortDiagnostics,
  undeclaredStateOffenders,
  unknownValueOffenders,
} from "./example-typecheck";

const surfaces = await exampleSurfaces();
const store = loadTranslations();
const pins = readPins();
const { computed, timings, entries, loose } = runGate(store, surfaces);

const found = surfaces.find((surface) => surface.id === "defold-1.13.1/kinds/script");
if (!found) throw new Error("the default script-kind surface is missing");
const scriptSurface = found;
const foundGui = surfaces.find((surface) => surface.id === "defold-1.13.1/kinds/gui-script");
if (!foundGui) throw new Error("the default gui-script-kind surface is missing");
const guiSurface = foundGui;

const FIXED = ["render.clear", "zlib.inflate", "factory.create"] as const;

/**
 * The compiler options `defold-typescript init` writes into a user's project.
 * Read from the CLI's own scaffold data rather than restated, so the gate and
 * the scaffold move together; every package sets a `rootDir` that forbids
 * importing a sibling package's source, which is why this crosses as data.
 */
const SCAFFOLD_TSCONFIG_PATH = resolve(import.meta.dir, "../../cli/src/scaffold-tsconfig.json");

function effectiveImplicitAny(options: {
  noImplicitAny?: boolean | undefined;
  strict?: boolean | undefined;
}): boolean {
  return options.noImplicitAny ?? options.strict ?? false;
}

function scaffoldImplicitAny(): boolean {
  return effectiveImplicitAny(
    JSON.parse(readFileSync(SCAFFOLD_TSCONFIG_PATH, "utf8")) as {
      noImplicitAny?: boolean;
      strict?: boolean;
    },
  );
}

function gateImplicitAny(): boolean {
  return effectiveImplicitAny(gateCompilerOptions());
}

function diagnosticsFor(
  body: string,
  surface: ExampleSurface = scriptSurface,
): ExampleDiagnostic[] {
  const unit = exampleUnit(surface, "fixture.probe", "0000000000000000", body);
  return compileSurface(surface, [unit]).units.get(unit.identity) ?? [];
}

const DEFAULT_SCRIPT_ENTRY = resolve(import.meta.dir, "../generated/kinds/script.d.ts");
const foundCurrent = surfaces.find((surface) => resolve(surface.entry) === DEFAULT_SCRIPT_ENTRY);
if (!foundCurrent) throw new Error("the pinned target's script-kind surface is missing");
const currentScriptSurface = foundCurrent;

function looseFor(
  body: string,
  surface: ExampleSurface = currentScriptSurface,
): LooseTypeFinding[] {
  const unit = exampleUnit(surface, "fixture.probe", "0000000000000000", body);
  return compileSurface(surface, [unit]).loose.get(unit.identity) ?? [];
}

describe("the gate against the committed pins", () => {
  test("every translation's diagnostics equal its pin on every surface that ships it", () => {
    const failures = gateFailures(computed, pins);
    if (failures.length > 0) {
      throw new Error(
        `authored @example translations disagree with examples/typecheck-pins.json:\n${failures
          .slice(0, 20)
          .map((failure) => `  [${failure.kind}] ${failure.identity} — ${failure.detail}`)
          .join("\n")}${failures.length > 20 ? `\n  +${failures.length - 20} more` : ""}\n` +
          "Re-run `bun scripts/example-typecheck.ts` only after fixing the example, never to absorb a new diagnostic.",
      );
    }
    expect(failures).toEqual([]);
  });

  test("the pin file is empty", () => {
    const offenders = Object.entries(pins).flatMap(([identity, diagnostics]) =>
      diagnostics.map((diagnostic) => `  ${identity} — TS${diagnostic.code} ${diagnostic.text}`),
    );
    if (offenders.length > 0) {
      throw new Error(
        "examples/typecheck-pins.json records diagnostics, so a shipped translation does not compile:\n" +
          `${offenders.slice(0, 20).join("\n")}${
            offenders.length > 20 ? `\n  +${offenders.length - 20} more` : ""
          }\n` +
          "Fix the translation, or the declaration it contradicts; never pin.",
      );
    }
    expect(Object.keys(pins)).toEqual([]);
  });

  test("every pin identity still exists in the store, so no pin rots into a ghost", () => {
    const live = new Set(
      Object.entries(store).flatMap(([fqn, entries]) =>
        entries.flatMap((entry) =>
          surfaces.map((surface) => pinIdentity(surface.id, fqn, entry.sourceHash)),
        ),
      ),
    );
    expect(Object.keys(pins).filter((identity) => !live.has(identity))).toEqual([]);
  });

  test("the gate actually compiled something on every surface in the inventory", () => {
    expect(timings.length).toBe(surfaces.length);
    for (const timing of timings) expect(timing.units).toBeGreaterThan(0);
  });

  test("no translation declares two default exports, on any surface", () => {
    const offenders: string[] = [];
    for (const [identity, diagnostics] of computed) {
      if (diagnostics.some((diagnostic) => diagnostic.code === 2528)) offenders.push(identity);
    }
    if (offenders.length > 0) {
      throw new Error(
        "these translations stack several `export default` in one body — an element whose ref-doc blob carries several examples is stored as one entry per example, not one concatenation:\n" +
          `${offenders
            .slice(0, 20)
            .map((identity) => `  ${identity}`)
            .join("\n")}${offenders.length > 20 ? `\n  +${offenders.length - 20} more` : ""}`,
      );
    }
    expect(offenders).toEqual([]);
  });

  test("every stored translation reaches the gate on at least one surface", () => {
    const stranded: string[] = [];
    for (const [fqn, entries] of Object.entries(store)) {
      for (const entry of entries) {
        const reached = surfaces.some((surface) =>
          computed.has(pinIdentity(surface.id, fqn, entry.sourceHash)),
        );
        if (!reached) stranded.push(`${fqn}:${entry.sourceHash}`);
      }
    }
    expect(stranded.sort()).toEqual([]);
  });
});

describe("pin exactness — what the ratchet refuses", () => {
  const identity = "s:fqn:hash";
  const one: ExampleDiagnostic = { code: 2345, text: "bad argument" };
  const two: ExampleDiagnostic = { code: 2304, text: "Cannot find name 'x'." };

  test("an unpinned diagnostic fails, naming the identity and the diagnostic", () => {
    const failures = gateFailures(new Map([[identity, [one]]]), {});
    expect(failures).toHaveLength(1);
    expect(failures[0]?.kind).toBe("unpinned");
    expect(failures[0]?.identity).toBe(identity);
    expect(failures[0]?.detail).toContain("TS2345");
  });

  test("a pinned diagnostic that no longer occurs fails, asking for the pin to be deleted", () => {
    const failures = gateFailures(new Map([[identity, []]]), { [identity]: [one] });
    expect(failures).toHaveLength(1);
    expect(failures[0]?.kind).toBe("resolved");
    expect(failures[0]?.detail).toContain("delete the pin");
  });

  test("a pin for a pair that no longer exists fails as a ghost", () => {
    const failures = gateFailures(new Map(), { [identity]: [one] });
    expect(failures).toHaveLength(1);
    expect(failures[0]?.kind).toBe("ghost");
  });

  test("a second identical diagnostic fails — the comparison is a multiset, never a set", () => {
    const failures = gateFailures(new Map([[identity, [one, one]]]), { [identity]: [one] });
    expect(failures).toHaveLength(1);
    expect(failures[0]?.kind).toBe("drifted");
  });

  test("order does not matter, so a pin survives a reflow that reorders diagnostics", () => {
    const pinned: PinFile = { [identity]: [one, two] };
    expect(gateFailures(new Map([[identity, [two, one]]]), pinned)).toEqual([]);
  });

  test("normalized diagnostics carry no file or position, so a pin survives a reflow", () => {
    expect(sortDiagnostics([one, two])).toEqual([two, one]);
    for (const diagnostic of Object.values(pins).flat()) {
      expect(Object.keys(diagnostic).sort()).toEqual(["code", "text"]);
    }
  });
});

describe("the undeclared-name class", () => {
  test("no pin records an undeclared name", () => {
    const offenders: string[] = [];
    for (const [identity, diagnostics] of Object.entries(pins)) {
      for (const diagnostic of diagnostics) {
        if (diagnostic.code !== 2304 && diagnostic.code !== 2552) continue;
        offenders.push(`  ${identity} — TS${diagnostic.code} ${diagnostic.text}`);
      }
    }
    if (offenders.length > 0) {
      throw new Error(
        "an authored translation uses a name its own body never introduces:\n" +
          `${offenders.slice(0, 20).join("\n")}${
            offenders.length > 20 ? `\n  +${offenders.length - 20} more` : ""
          }\n` +
          "Declare the name in the example body; never re-pin to absorb it.",
      );
    }
    expect(offenders).toEqual([]);
  });
});

describe("the implicit-any class", () => {
  const UNTYPED_PARAMETER_SHAPES = [
    ["an ordinary parameter", "function probe(value) { return value; }"],
    ["a destructured parameter", "function probe({ value }) { return value; }"],
    ["a rest parameter", "function probe(...values) { return values; }"],
  ] as const;

  test("every untyped parameter shape the scaffold rejects is one the closure refuses", () => {
    for (const [shape, body] of UNTYPED_PARAMETER_SHAPES) {
      const diagnostics = diagnosticsFor(body);
      const offenders = implicitAnyOffenders(diagnostics);
      if (offenders.length === 0) {
        throw new Error(
          `${shape} compiles to no diagnostic the implicit-any closure refuses; the compiler reported ` +
            `${
              diagnostics.length > 0
                ? diagnostics.map((d) => `TS${d.code} ${d.text}`).join(", ")
                : "nothing at all"
            }. Add the code the shape now carries to IMPLICIT_ANY_CODES, or the closure no longer covers it.`,
        );
      }
    }
  });

  test("no pin records an implicitly-any parameter", () => {
    const offenders: string[] = [];
    for (const [identity, diagnostics] of Object.entries(pins)) {
      for (const diagnostic of implicitAnyOffenders(diagnostics)) {
        offenders.push(`  ${identity} — TS${diagnostic.code} ${diagnostic.text}`);
      }
    }
    if (offenders.length > 0) {
      throw new Error(
        "an authored translation declares a parameter the scaffold's own strictness rejects:\n" +
          `${offenders.slice(0, 20).join("\n")}${
            offenders.length > 20 ? `\n  +${offenders.length - 20} more` : ""
          }\n` +
          "Type the parameter in the example body; never re-pin to absorb it.",
      );
    }
    expect(offenders).toEqual([]);
  });
});

describe("the optional-load class", () => {
  test("no pin dereferences an unnarrowed load", () => {
    const offenders: string[] = [];
    for (const [identity, diagnostics] of Object.entries(pins)) {
      for (const diagnostic of optionalLoadOffenders(diagnostics)) {
        offenders.push(`  ${identity} — TS${diagnostic.code} ${diagnostic.text}`);
      }
    }
    if (offenders.length > 0) {
      throw new Error(
        "an authored translation reads an optional value it has not narrowed:\n" +
          `${offenders.slice(0, 20).join("\n")}${
            offenders.length > 20 ? `\n  +${offenders.length - 20} more` : ""
          }\n` +
          "Narrow the value in the example body; never re-pin to absorb it.",
      );
    }
    expect(offenders).toEqual([]);
  });

  test("an unnarrowed load compiles to a diagnostic the closure refuses", () => {
    const body = `const data = sys.load_resource("/array.png");
const buf = image.load_buffer(data);
const w = buf.width;
`;
    const diagnostics = diagnosticsFor(body);
    const offenders = optionalLoadOffenders(diagnostics);
    if (offenders.length === 0) {
      throw new Error(
        "an unnarrowed load compiles to no diagnostic the optional-load closure refuses; the " +
          `compiler reported ${
            diagnostics.length > 0
              ? diagnostics.map((d) => `TS${d.code} ${d.text}`).join(", ")
              : "nothing at all"
          }. Widen OPTIONAL_LOAD_CODES, or the closure no longer covers the class.`,
      );
    }
  });
});

describe("the script-state class", () => {
  const UNDECLARED_STATE_SHAPES = [
    [
      "a field assigned in init(self)",
      `export default defineScript({
  init(self) {
    self.t = 0;
  },
});
`,
    ],
    [
      "a field no hook sets, read in update",
      `export default defineScript({
  update(self, dt) {
    go.set_position(self.velocity);
  },
});
`,
    ],
  ] as const;

  test("a hook reading a field init never returned compiles to a diagnostic the closure refuses", () => {
    for (const [shape, body] of UNDECLARED_STATE_SHAPES) {
      const diagnostics = diagnosticsFor(body);
      if (undeclaredStateOffenders(diagnostics).length === 0) {
        throw new Error(
          `${shape} compiles to no diagnostic the script-state closure refuses; the compiler reported ` +
            `${
              diagnostics.length > 0
                ? diagnostics.map((d) => `TS${d.code} ${d.text}`).join(", ")
                : "nothing at all"
            }. Re-point UNDECLARED_STATE_TEXT at the text the shape now carries, or the closure no longer covers it.`,
        );
      }
    }
  });

  test("state returned from init compiles to no offender", () => {
    const diagnostics = diagnosticsFor(`export default defineScript({
  init() {
    return { t: 0 };
  },
  update(self, dt) {
    self.t = self.t + dt;
  },
});
`);
    expect(undeclaredStateOffenders(diagnostics)).toEqual([]);
  });

  test("no pin records undeclared script state", () => {
    const offenders: string[] = [];
    for (const [identity, diagnostics] of Object.entries(pins)) {
      for (const diagnostic of undeclaredStateOffenders(diagnostics)) {
        offenders.push(`  ${identity} — TS${diagnostic.code} ${diagnostic.text}`);
      }
    }
    if (offenders.length > 0) {
      throw new Error(
        "an authored translation keeps script state on `self` that its `init` never returns:\n" +
          `${offenders.slice(0, 20).join("\n")}${
            offenders.length > 20 ? `\n  +${offenders.length - 20} more` : ""
          }\n` +
          "Return the field from `init` in the example body; never re-pin to absorb it.",
      );
    }
    expect(offenders).toEqual([]);
  });
});

describe("the property and argument-type class", () => {
  const PROPERTY_ARGUMENT_SHAPES = [
    ["an undeclared property of a declared type", "const w = vmath.vector3(1, 2, 3).w;", 2339],
    ["a string passed where a Hash is declared", 'const hex = hash_to_hex("my_id");', 2345],
    ["a call no overload of a declared function accepts", 'const v = vmath.vector3("x");', 2769],
  ] as const;

  test("a misused property or argument compiles to a diagnostic the closure refuses", () => {
    for (const [shape, body, code] of PROPERTY_ARGUMENT_SHAPES) {
      const diagnostics = diagnosticsFor(body);
      if (!propertyArgumentOffenders(diagnostics).some((d) => d.code === code)) {
        throw new Error(
          `${shape} compiles to no TS${code} the property and argument-type closure refuses; the compiler reported ` +
            `${
              diagnostics.length > 0
                ? diagnostics.map((d) => `TS${d.code} ${d.text}`).join(", ")
                : "nothing at all"
            }. Re-point PROPERTY_ARGUMENT_CODES at the code the shape now carries, or the closure no longer covers it.`,
        );
      }
    }
  });

  test("no pin records a property or argument-type diagnostic", () => {
    const offenders: string[] = [];
    for (const [identity, diagnostics] of Object.entries(pins)) {
      for (const diagnostic of propertyArgumentOffenders(diagnostics)) {
        offenders.push(`  ${identity} — TS${diagnostic.code} ${diagnostic.text}`);
      }
    }
    if (offenders.length > 0) {
      throw new Error(
        "an authored translation misuses a declared property or argument type:\n" +
          `${offenders.slice(0, 20).join("\n")}${
            offenders.length > 20 ? `\n  +${offenders.length - 20} more` : ""
          }\n` +
          "Correct the translation, or the declaration it contradicts; never re-pin to absorb it.",
      );
    }
    expect(offenders).toEqual([]);
  });
});

describe("the unknown-value class", () => {
  const UNKNOWN_VALUE_SHAPES = [
    [
      "a read off a named unknown value",
      'const p = gui.get(gui.get_node("box"), "position");\nconst x = p.x;',
      18046,
    ],
    [
      "a read off an unknown call result",
      'const x = gui.get(gui.get_node("box"), "position").x;',
      2571,
    ],
  ] as const;

  test("a read of an unknown value compiles to a diagnostic the closure refuses", () => {
    for (const [shape, body, code] of UNKNOWN_VALUE_SHAPES) {
      const diagnostics = diagnosticsFor(body, guiSurface);
      if (!unknownValueOffenders(diagnostics).some((d) => d.code === code)) {
        throw new Error(
          `${shape} compiles to no TS${code} the unknown-value closure refuses; the compiler reported ` +
            `${
              diagnostics.length > 0
                ? diagnostics.map((d) => `TS${d.code} ${d.text}`).join(", ")
                : "nothing at all"
            }. Re-point UNKNOWN_VALUE_CODES at the code the shape now carries, or the closure no longer covers it.`,
        );
      }
    }
  });

  test("no pin records a read of an unknown value", () => {
    const offenders: string[] = [];
    for (const [identity, diagnostics] of Object.entries(pins)) {
      for (const diagnostic of unknownValueOffenders(diagnostics)) {
        offenders.push(`  ${identity} — TS${diagnostic.code} ${diagnostic.text}`);
      }
    }
    if (offenders.length > 0) {
      throw new Error(
        "an authored translation reads a value typed `unknown`:\n" +
          `${offenders.slice(0, 20).join("\n")}${
            offenders.length > 20 ? `\n  +${offenders.length - 20} more` : ""
          }\n` +
          "Type the declaration upstream documents, or narrow the value in the example body; never re-pin to absorb it.",
      );
    }
    expect(offenders).toEqual([]);
  });
});

describe("the loose-type class", () => {
  test("a named callback's parameters are held to the declared callback type", () => {
    expect(
      looseFor(
        "function cb(self: unknown, handle: unknown, time_elapsed: unknown) {}\ntimer.delay(1, false, cb);",
      ),
    ).toEqual([
      { kind: "loose-parameter", text: "handle", declared: "number" },
      { kind: "loose-parameter", text: "time_elapsed", declared: "number" },
    ]);
  });

  test("an inline callback's parameters are held to the declared callback type", () => {
    expect(looseFor("timer.delay(1, false, (self: unknown, handle: unknown) => {});")).toEqual([
      { kind: "loose-parameter", text: "handle", declared: "number" },
    ]);
    expect(looseFor("timer.delay(1, false, function (self: any, handle: any) {});")).toEqual([
      { kind: "loose-parameter", text: "handle", declared: "number" },
    ]);
  });

  test("a callback using the declared types reports nothing", () => {
    expect(
      looseFor(
        "function cb(self: unknown, handle: number, time_elapsed: number) {}\ntimer.delay(1, false, cb);",
      ),
    ).toEqual([]);
    expect(looseFor("timer.delay(1, false, (self, handle) => {});")).toEqual([]);
  });

  test("an assertion restating the operand's type is reported", () => {
    expect(looseFor("const n = 1;\nconst m = n as number;")).toEqual([
      { kind: "redundant-assertion", text: "n as number", declared: "1" },
    ]);
    expect(looseFor("const v = vmath.vector3();\nconst x = v!.x;")).toEqual([
      { kind: "redundant-assertion", text: "v!", declared: "Vector3" },
    ]);
  });

  test("an assertion that changes the type reports nothing", () => {
    expect(looseFor('const s = "a" as const;')).toEqual([]);
    expect(looseFor("declare const u: unknown;\nconst s = u as string;")).toEqual([]);
    expect(
      looseFor("declare const maybe: number | undefined;\nconst s = maybe!.toFixed();"),
    ).toEqual([]);
    expect(looseFor("const o = { x: 1 } as { x: number; y?: number };")).toEqual([]);
  });

  const NAMED_LOOSE_CALLBACK =
    "function cb(self: unknown, handle: unknown) {\n  timer.cancel(handle as number);\n}\ntimer.delay(1, false, cb);";

  function sharedFor(body: string): LooseTypeFinding[] {
    const fqn = "fixture.probe";
    const hash = "0000000000000000";
    const probed = [currentScriptSurface, scriptSurface];
    const units = new Map(
      probed.map((surface) => [surface.id, [exampleUnit(surface, fqn, hash, body)]]),
    );
    const result = runGate({}, probed, units);
    expect([...result.loose.keys()]).toEqual(
      probed.map((surface) => pinIdentity(surface.id, fqn, hash)),
    );
    return sharedLooseFindings(result.loose).get(`${fqn}:${hash}`) ?? [];
  }

  test("an annotation an older surface's looser declaration still needs is not the body's to fix", () => {
    expect(looseFor(NAMED_LOOSE_CALLBACK)).toEqual([
      { kind: "loose-parameter", text: "handle", declared: "number" },
    ]);
    expect(looseFor(NAMED_LOOSE_CALLBACK, scriptSurface)).toEqual([]);
    expect(sharedFor(NAMED_LOOSE_CALLBACK)).toEqual([]);
  });

  test("a finding every owning surface reports stays", () => {
    expect(sharedFor("const n = 1;\nconst m = n as number;")).toEqual([
      { kind: "redundant-assertion", text: "n as number", declared: "1" },
    ]);
  });

  test("no stored translation carries a loose type", () => {
    const offenders: string[] = [];
    for (const [identity, findings] of sharedLooseFindings(loose)) {
      for (const finding of findings) {
        offenders.push(
          `  ${identity} — ${finding.kind}: \`${finding.text}\` (declared \`${finding.declared}\`)`,
        );
      }
    }
    if (offenders.length > 0) {
      throw new Error(
        "an authored translation is typed wider than its declaration, or asserts a type the value already has:\n" +
          `${offenders.join("\n")}\n` +
          "Annotate the declared type or pass the callback inline, and drop the assertion.",
      );
    }
    expect(offenders).toEqual([]);
  });
});

describe("what the compile is sensitive to", () => {
  test("a misspelled namespace is not absorbed as fragment context", () => {
    const diagnostics = diagnosticsFor("rendr.clear(new LuaMap());");
    expect(diagnostics.some((d) => d.code === 2304 && d.text.includes("rendr"))).toBe(true);
    // And it fails the gate rather than passing unremarked.
    const failures = gateFailures(new Map([["s:fqn:hash", diagnostics]]), {});
    expect(failures[0]?.kind).toBe("unpinned");
  });

  test("a syntactically invalid example fails on its own and suppresses nothing else", () => {
    // `tsc` skips the whole program's semantic pass once any file has a syntax
    // error, so a single malformed example would mask every type error in every
    // other one. Per-file API diagnostics are what this asserts.
    const broken = exampleUnit(scriptSurface, "fixture.broken", "0", 'const s = "\\120";');
    const typed = exampleUnit(
      scriptSurface,
      "fixture.typed",
      "0",
      "const n: number = vmath.vector3(1, 2, 3);",
    );
    const out = compileSurface(scriptSurface, [broken, typed]).units;
    expect((out.get(broken.identity) ?? []).some((d) => d.code === 1487 || d.code === 1488)).toBe(
      true,
    );
    const typedDiagnostics = out.get(typed.identity) ?? [];
    expect(typedDiagnostics.length).toBeGreaterThan(0);
    expect(typedDiagnostics.some((d) => d.code === 2322 || d.code === 2345)).toBe(true);
  });

  test("a translation that type-checks produces no diagnostics at all", () => {
    expect(diagnosticsFor("const v: Vector3 = vmath.vector3(1, 2, 3);")).toEqual([]);
  });
});

describe("the three released defects", () => {
  for (const fqn of FIXED) {
    test(`${fqn} carries no pin recording a syntax or API defect`, () => {
      const entries = store[fqn] ?? [];
      expect(entries.length).toBeGreaterThan(0);
      const offenders: string[] = [];
      for (const entry of entries) {
        for (const surface of surfaces) {
          const identity = pinIdentity(surface.id, fqn, entry.sourceHash);
          const pinned = pins[identity] ?? [];
          if (pinned.length > 0) offenders.push(`${identity}: ${JSON.stringify(pinned)}`);
        }
      }
      expect(offenders).toEqual([]);
    });

    test(`${fqn} keeps its source hash, so the drift guard needs no re-pin`, () => {
      const entries = store[fqn] ?? [];
      for (const entry of entries) expect(entry.sourceHash).toMatch(/^[0-9a-f]{16}$/);
    });
  }

  test("each fixed body compiles clean on every surface exporting the factory it calls", () => {
    for (const fqn of FIXED) {
      for (const entry of store[fqn] ?? []) {
        for (const surface of surfaces) {
          const diagnostics = computed.get(pinIdentity(surface.id, fqn, entry.sourceHash));
          if (diagnostics === undefined) continue;
          expect(diagnostics).toEqual([]);
        }
      }
    }
  });
});

describe("gate maintenance", () => {
  test("cost is one program per surface, not one per example", () => {
    // The structural guard on runtime: adding an example must not add a program.
    expect(timings.length).toBe(surfaces.length);
    expect(timings.reduce((sum, t) => sum + t.units, 0)).toBeGreaterThan(timings.length * 10);
  });

  test("a surface prelude specifier is `/`-separated whatever the host path shape", () => {
    // A Windows `relative` returns backslashes, and the specifier is emitted
    // into a TypeScript string literal where `\` is an escape — so an
    // unnormalized path reaches the compiler as `....generatedkindsgui-script`
    // and every unit on that surface fails with TS2307 instead of being judged.
    expect(moduleSpecifier("..\\..\\generated\\kinds\\gui-script.d.ts")).toBe(
      "../../generated/kinds/gui-script",
    );
    expect(moduleSpecifier("../../generated/kinds/gui-script.d.ts")).toBe(
      "../../generated/kinds/gui-script",
    );
    expect(moduleSpecifier("kinds\\script.d.ts")).toBe("./kinds/script");
  });

  test("no unit emits a specifier carrying a backslash or a .d.ts suffix", () => {
    for (const surface of surfaces) {
      const unit = exampleUnit(surface, "probe.fqn", "0000000000000000", "const x = 1;");
      for (const line of unit.contents.split("\n")) {
        if (!line.startsWith("import")) continue;
        expect(line).not.toContain("\\");
        expect(line).not.toContain(".d.ts");
      }
    }
  });

  test("every compiler-option override is recorded with its reason", () => {
    expect(COMPILER_OPTION_OVERRIDES.length).toBeGreaterThan(0);
    for (const override of COMPILER_OPTION_OVERRIDES) {
      expect(override.option).not.toBe("");
      expect(override.reason.length).toBeGreaterThan(20);
    }
  });

  test("the gate compiles at the scaffold's own strictness", () => {
    expect(scaffoldImplicitAny()).toBe(true);
    expect(gateImplicitAny()).toBe(scaffoldImplicitAny());
    expect(COMPILER_OPTION_OVERRIDES.map((override) => override.option)).not.toContain(
      "noImplicitAny",
    );
  });

  test("a newly authored translation has no pin, so the gate cannot go green by omission", () => {
    expect(gateFailures(new Map([["new:fqn:hash", [{ code: 2304, text: "x" }]]]), {})).toHaveLength(
      1,
    );
    expect(gateFailures(new Map([["new:fqn:hash", []]]), {})).toEqual([]);
  });
});

describe("factory binding — the pairs the gate never compiles", () => {
  const exportsById = new Map(surfaces.map((s) => [s.id, new Set(s.exports.values)] as const));

  function factoriesCalled(ts: string): string[] {
    return kindFactoryNames().filter((name) => new RegExp(`\\b${name}\\b`).test(ts));
  }

  test("no pin records a kind factory the surface does not export", () => {
    const offenders: string[] = [];
    for (const [identity, diagnostics] of Object.entries(pins)) {
      for (const diagnostic of diagnostics) {
        if (diagnostic.code !== 2304) continue;
        for (const name of kindFactoryNames()) {
          if (diagnostic.text === `Cannot find name '${name}'.`) {
            offenders.push(`${identity}: ${diagnostic.text}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test("every pinned pair names a surface exporting each factory its body calls", () => {
    const offenders: string[] = [];
    for (const identity of Object.keys(pins)) {
      const [surfaceId, fqn, sourceHash] = [
        identity.slice(0, identity.indexOf(":")),
        identity.slice(identity.indexOf(":") + 1, identity.lastIndexOf(":")),
        identity.slice(identity.lastIndexOf(":") + 1),
      ];
      const entry = (store[fqn] ?? []).find((candidate) => candidate.sourceHash === sourceHash);
      if (entry === undefined) continue;
      const values = exportsById.get(surfaceId);
      for (const name of factoriesCalled(entry.ts)) {
        if (values === undefined || !values.has(name)) offenders.push(`${identity}: ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("binding empties no surface — every surface still compiles at least one unit", () => {
    const compiled = new Set(timings.map((timing) => timing.surfaceId));
    expect([...compiled].sort()).toEqual(surfaces.map((surface) => surface.id).sort());
    for (const timing of timings) expect(timing.units).toBeGreaterThan(0);
  });
});

describe("surface entry resolution", () => {
  test("every surface resolves its own entry", () => {
    const offenders: string[] = [];
    for (const surface of surfaces) {
      const entry = entries.get(surface.id);
      if (entry === undefined) {
        offenders.push(`${surface.id} — the gate built no program for this surface`);
        continue;
      }
      for (const diagnostic of entry) {
        offenders.push(`${surface.id} — TS${diagnostic.code} ${diagnostic.text}`);
      }
    }
    if (offenders.length > 0) {
      throw new Error(
        "a surface the gate compiles against cannot resolve its own declarations, so every\n" +
          "unit judged on it is judged against `any`:\n" +
          `${offenders.slice(0, 20).join("\n")}${
            offenders.length > 20 ? `\n  +${offenders.length - 20} more` : ""
          }`,
      );
    }
    expect(offenders).toEqual([]);
  });

  test("a surface that cannot resolve its entry is reported", () => {
    const unresolvableSurface = (id: string, entryContents: string): ExampleSurface => {
      const entry = resolve(import.meta.dir, "..", ".example-gate", id, "index.d.ts");
      return {
        id,
        targetId: id,
        kind: null,
        origin: "materialized",
        entry,
        virtualFiles: [{ path: entry, contents: entryContents }],
        modules: new Set<string>(),
        exports: { values: [], types: [] },
      };
    };

    const missingModule = unresolvableSurface(
      "fixture-missing-module",
      'export * from "@nope/missing";\n',
    );
    const missingMember = unresolvableSurface(
      "fixture-missing-member",
      'export { notAnExport } from "@defold-typescript/types/lifecycle";\n',
    );

    for (const [surface, code] of [
      [missingModule, 2307],
      [missingMember, 2305],
    ] as const) {
      const unit = exampleUnit(surface, "fixture.entry", "0000000000000000", "export {};");
      const { entry } = compileSurface(surface, [unit]);
      expect(entry.map((diagnostic) => diagnostic.code)).toContain(code);
    }
  });

  test("a hook table the factory rejects fails on every kind surface", () => {
    const silent: string[] = [];
    for (const surface of surfaces) {
      const factory = surface.exports.values.find((name) => kindFactoryNames().includes(name));
      if (factory === undefined) continue;
      const unit = exampleUnit(
        surface,
        "fixture.rejected-hook-table",
        "0000000000000000",
        `export default ${factory}({\n  init() {\n    return { a: 1 };\n  },\n  not_a_hook: 5,\n  update(self: number) {},\n});`,
      );
      if ((compileSurface(surface, [unit]).units.get(unit.identity) ?? []).length === 0) {
        silent.push(surface.id);
      }
    }
    expect(silent).toEqual([]);
  });
});

describe("module binding — the pairs the gate never compiles", () => {
  const modulesById = new Map(surfaces.map((s) => [s.id, s.modules] as const));
  const namespaces = moduleNamespaces(surfaces);

  function carries(surfaceId: string, namespace: string): boolean {
    const modules = modulesById.get(surfaceId);
    if (modules === undefined) return false;
    return (
      modules.has(moduleKey(namespace, "runtime")) || modules.has(moduleKey(namespace, "editor"))
    );
  }

  function splitPin(identity: string): { surfaceId: string; fqn: string; sourceHash: string } {
    return {
      surfaceId: identity.slice(0, identity.indexOf(":")),
      fqn: identity.slice(identity.indexOf(":") + 1, identity.lastIndexOf(":")),
      sourceHash: identity.slice(identity.lastIndexOf(":") + 1),
    };
  }

  test("no pin records a module namespace the surface cannot import", () => {
    const offenders: string[] = [];
    for (const [identity, diagnostics] of Object.entries(pins)) {
      for (const diagnostic of diagnostics) {
        if (diagnostic.code !== 2304) continue;
        for (const namespace of namespaces) {
          if (diagnostic.text === `Cannot find name '${namespace}'.`) {
            offenders.push(`${identity}: ${diagnostic.text}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test("every pinned pair names a surface carrying each namespace its body references", () => {
    const offenders: string[] = [];
    for (const identity of Object.keys(pins)) {
      const { surfaceId, fqn, sourceHash } = splitPin(identity);
      const entry = (store[fqn] ?? []).find((candidate) => candidate.sourceHash === sourceHash);
      if (entry === undefined) continue;
      for (const namespace of referencedNamespaces(entry.ts, namespaces)) {
        if (!carries(surfaceId, namespace)) offenders.push(`${identity}: ${namespace}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
