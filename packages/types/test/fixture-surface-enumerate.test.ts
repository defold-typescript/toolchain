import { describe, expect, test } from "bun:test";
import { enumerateDeclaredSymbols } from "./fixture-surface-enumerate";

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
