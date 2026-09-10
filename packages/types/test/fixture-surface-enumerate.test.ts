import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadApiTargets } from "../scripts/regen";
import { DEFOLD_VERSION } from "../scripts/sync-api-docs";
import {
  enumerateDeclaredParameterSlots,
  enumerateDeclaredSymbols,
  mergeDeclaredParameterSlots,
} from "./fixture-surface-enumerate";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");

describe("committed release surfaces", () => {
  test("the committed release surfaces include every function-bearing mapped namespace", () => {
    const required = [
      "b2d.fixture",
      "b2d.shape",
      "b2d.joint",
      "b2d.chain",
      "b2d.world",
      "compute",
      "material",
    ];

    // The committed surfaces are the null-source targets (the current default plus
    // every demoted release kept beside it); a ref-doc regression target carries a
    // non-null source and is resolved on demand rather than committed.
    const targets = loadApiTargets().filter((target) => target.source == null);
    expect(targets.length).toBeGreaterThanOrEqual(2);
    const current = targets.find((target) => target.id === `defold-${DEFOLD_VERSION}`);
    if (!current) throw new Error(`missing defold-${DEFOLD_VERSION} target`);
    const currentNamespaces = new Set(current.modules.map((module) => module.namespace));
    for (const namespace of required) expect(currentNamespaces.has(namespace)).toBe(true);

    for (const target of targets) {
      for (const module of target.modules) {
        const generated = resolve(PACKAGE_ROOT, target.generatedDir, module.outFile);
        const symbols = enumerateDeclaredSymbols(readFileSync(generated, "utf8"));
        const ownsSymbol = [...symbols.keys()].some((name) =>
          name.startsWith(`${module.namespace}.`),
        );
        expect(ownsSymbol || (module.skipFunctions?.length ?? 0) > 0).toBe(true);
      }
    }
  });
});

describe("enumerateDeclaredSymbols — AST presence enumeration", () => {
  test("captures a type alias and a function inside a namespace with the right kinds", () => {
    const out = enumerateDeclaredSymbols(
      `declare namespace socket { export type TCPOptions = "a" | "b"; function tcp(): unknown; }`,
    );
    expect(out.get("socket.TCPOptions")).toEqual({ kind: "type" });
    expect(out.get("socket.tcp")).toEqual({ kind: "function" });
  });

  test("an interface body's braces do not corrupt the namespace frame", () => {
    const out = enumerateDeclaredSymbols(
      `declare namespace socket { interface client { send(d: string): void } const VERSION: string; }`,
    );
    expect(out.get("socket.client")).toEqual({ kind: "interface" });
    expect(out.get("socket.VERSION")).toEqual({ kind: "value" });
  });

  test("declare global contributes no name segment; an enum keys under its namespace", () => {
    const out = enumerateDeclaredSymbols(`declare global { namespace go { enum Playback {} } }`);
    expect(out.get("go.Playback")).toEqual({ kind: "enum" });
    expect(out.has("global.go.Playback")).toBe(false);
  });

  test("nested namespaces produce a fully dotted key", () => {
    const out = enumerateDeclaredSymbols(
      `declare namespace socket { namespace dns { function toip(): unknown } }`,
    );
    expect(out.get("socket.dns.toip")).toEqual({ kind: "function" });
  });

  test("overloaded function declarations collapse to a single entry", () => {
    const out = enumerateDeclaredSymbols(
      `declare namespace go { function get(id: string): unknown; function get(id: string, prop: string): unknown; }`,
    );
    expect(out.get("go.get")).toEqual({ kind: "function" });
  });
});

describe("mergeDeclaredParameterSlots — cross-surface merge", () => {
  const surface = (fileName: string, source: string) =>
    enumerateDeclaredParameterSlots(source, fileName);

  test("a required copy wins whichever order the copies arrive in", () => {
    const a = surface("a.d.ts", "declare namespace m { function f(a: number, b?: number): void; }");
    const b = surface("b.d.ts", "declare namespace m { function f(a: number, b: number): void; }");
    for (const order of [
      [a, b],
      [b, a],
    ]) {
      const slot = mergeDeclaredParameterSlots(order).get("m.f")?.get("b");
      expect(slot?.optional).toBe(false);
      expect(slot?.requiredIn).toEqual(["b.d.ts"]);
    }
    expect(a.get("m.f")?.get("b")?.optional).toBe(true);
    expect(a.get("m.f")?.get("b")?.requiredIn).toEqual([]);
  });

  test("a slot omissible in every copy stays omissible", () => {
    const merged = mergeDeclaredParameterSlots([
      surface("a.d.ts", "declare namespace m { function f(b?: number): void; }"),
      surface(
        "b.d.ts",
        "declare namespace m { function f(b: number | undefined, c: number): void; }",
      ),
    ]);
    expect(merged.get("m.f")?.get("b")).toMatchObject({ optional: true, requiredIn: [] });
  });

  test("a required overload inside one copy still makes the slot required", () => {
    const merged = mergeDeclaredParameterSlots([
      surface(
        "a.d.ts",
        "declare namespace m { function f(b?: number): void; function f(b: number, c: number): void; }",
      ),
      surface("b.d.ts", "declare namespace m { function f(b?: number): void; }"),
    ]);
    expect(merged.get("m.f")?.get("b")).toMatchObject({ optional: false, requiredIn: ["a.d.ts"] });
  });

  test("a reserved-name alias merges through the same rule", () => {
    const merged = mergeDeclaredParameterSlots([
      surface(
        "a.d.ts",
        "declare namespace m { function _new(b?: number): void; export { _new as new }; }",
      ),
      surface(
        "b.d.ts",
        "declare namespace m { function _new(b: number): void; export { _new as new }; }",
      ),
    ]);
    expect(merged.get("m.new")?.get("b")).toMatchObject({
      optional: false,
      requiredIn: ["b.d.ts"],
    });
  });

  test("a namespace split across copies keeps every name", () => {
    const merged = mergeDeclaredParameterSlots([
      surface("a.d.ts", "declare namespace m { function f(a: number): void; }"),
      surface(
        "b.d.ts",
        "declare namespace m { function f(z?: number): void; function g(x: number): void; }",
      ),
    ]);
    expect([...(merged.get("m.f")?.keys() ?? [])].sort()).toEqual(["a", "z"]);
    expect(merged.get("m.g")?.get("x")).toMatchObject({ optional: false, requiredIn: ["b.d.ts"] });
  });
});
