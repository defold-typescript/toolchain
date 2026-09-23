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
  readPins,
  runGate,
  sortDiagnostics,
} from "./example-typecheck";

const surfaces = await exampleSurfaces();
const store = loadTranslations();
const pins = readPins();
const { computed, timings, entries } = runGate(store, surfaces);

const found = surfaces.find((surface) => surface.id === "defold-1.13.1/kinds/script");
if (!found) throw new Error("the default script-kind surface is missing");
const scriptSurface = found;

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

function diagnosticsFor(body: string): ExampleDiagnostic[] {
  const unit = exampleUnit(scriptSurface, "fixture.probe", "0000000000000000", body);
  return compileSurface(scriptSurface, [unit]).units.get(unit.identity) ?? [];
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
  const GUARDED_FQN = "resource.set_texture";

  function identitiesFor(fqn: string): string[] {
    return [...computed.keys()].filter((identity) => identity.split(":")[1] === fqn);
  }

  test("no variant of the array-texture example dereferences an unnarrowed load", () => {
    const identities = identitiesFor(GUARDED_FQN);
    if (identities.length === 0) {
      throw new Error(
        `no identity in the gate's computed map has the FQN ${GUARDED_FQN}; the closure below ` +
          "would pass over nothing. Re-point it at the element the array-texture example ships under.",
      );
    }
    const offenders: string[] = [];
    for (const identity of identities.sort()) {
      for (const diagnostic of optionalLoadOffenders(computed.get(identity) ?? [])) {
        offenders.push(`  ${identity} — TS${diagnostic.code} ${diagnostic.text}`);
      }
    }
    if (offenders.length > 0) {
      throw new Error(
        `a ${GUARDED_FQN} translation reads a loaded resource it has not narrowed:\n` +
          `${offenders.slice(0, 20).join("\n")}${
            offenders.length > 20 ? `\n  +${offenders.length - 20} more` : ""
          }\n` +
          "Guard the load in the example body; never re-pin to absorb it.",
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
