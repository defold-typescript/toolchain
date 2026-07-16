import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadApiTargets } from "../scripts/regen";
import { DEFOLD_VERSION } from "../scripts/sync-api-docs";
import { enumerateDeclaredSymbols } from "./fixture-surface-enumerate";

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

    // The committed surfaces are the two null-source targets (current default +
    // previous); the ref-doc regression target carries a non-null source.
    const targets = loadApiTargets().filter((target) => target.source == null);
    expect(targets).toHaveLength(2);
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
