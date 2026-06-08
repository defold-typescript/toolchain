import { describe, expect, test } from "bun:test";
import { wrapAsAmbientGlobal } from "./publish-dts";

describe("wrapAsAmbientGlobal", () => {
  test("preserves leading namespace JSDoc while rewriting declare namespace", () => {
    const out = wrapAsAmbientGlobal({
      namespace: "buffer",
      emitted:
        "/**\n" +
        " * Functions for manipulating buffers and streams\n" +
        " */\n" +
        "declare namespace buffer {\n" +
        "}\n",
      importsFrom: "../src/core-types",
    });
    expect(out).toContain(
      "declare global {\n" +
        "  /**\n" +
        "   * Functions for manipulating buffers and streams\n" +
        "   */\n" +
        "  namespace buffer {",
    );
    expect(out).not.toContain("declare namespace");
  });

  test("empty namespace produces no engine-type import line", () => {
    const out = wrapAsAmbientGlobal({
      namespace: "vmath",
      emitted: "declare namespace vmath {\n}\n",
      importsFrom: "../src/core-types",
    });
    expect(out).not.toContain("import type");
    expect(out).toContain("declare global {");
    expect(out).toContain("namespace vmath {");
    expect(out.endsWith("export {};\n")).toBe(true);
    expect(out).not.toContain("declare namespace");
  });

  test("imports only the engine types actually referenced, with word-boundary matching", () => {
    const emitted =
      "declare namespace vmath {\n  function f(): Vector3 | Vector4;\n  const x: MyVector3Thing;\n}\n";
    const out = wrapAsAmbientGlobal({
      namespace: "vmath",
      emitted,
      importsFrom: "../src/core-types",
    });
    expect(out).toContain('import type { Vector3, Vector4 } from "../src/core-types";');
    expect(out).not.toContain("MyVector3Thing }");
    expect(out).not.toMatch(/import type \{[^}]*\bMyVector3Thing\b/);
  });

  test("imports all seven engine types in deterministic alphabetical order when referenced", () => {
    const emitted =
      "declare namespace vmath {\n" +
      "  function a(v: Vector): Vector3;\n" +
      "  function b(): Vector4;\n" +
      "  function c(): Quaternion;\n" +
      "  function d(): Matrix4;\n" +
      "  function e(): Hash;\n" +
      "  function f(): Url;\n" +
      "}\n";
    const out = wrapAsAmbientGlobal({
      namespace: "vmath",
      emitted,
      importsFrom: "../src/core-types",
    });
    expect(out).toContain(
      'import type { Hash, Matrix4, Quaternion, Url, Vector, Vector3, Vector4 } from "../src/core-types";',
    );
  });

  test("importsFrom is interpolated verbatim into the import specifier", () => {
    const out = wrapAsAmbientGlobal({
      namespace: "vmath",
      emitted: "declare namespace vmath {\n  function f(): Vector3;\n}\n",
      importsFrom: "@defold-typescript/types/core-types",
    });
    expect(out).toContain('import type { Vector3 } from "@defold-typescript/types/core-types";');
  });

  test("first line is the @noSelfInFile banner when no engine types are imported", () => {
    const out = wrapAsAmbientGlobal({
      namespace: "vmath",
      emitted: "declare namespace vmath {\n}\n",
      importsFrom: "../src/core-types",
    });
    expect(out.split("\n")[0]).toBe("/** @noSelfInFile */");
    expect(out).not.toContain("import type");
  });

  test("banner precedes the import line when engine types are imported", () => {
    const out = wrapAsAmbientGlobal({
      namespace: "vmath",
      emitted: "declare namespace vmath {\n  function f(): Vector3;\n}\n",
      importsFrom: "../src/core-types",
    });
    const lines = out.split("\n");
    expect(lines[0]).toBe("/** @noSelfInFile */");
    const bannerIdx = lines.indexOf("/** @noSelfInFile */");
    const importIdx = lines.findIndex((l) => l.startsWith("import type"));
    expect(importIdx).toBeGreaterThan(bannerIdx);
  });

  test("imports Opaque when the emitted text references a branded handle, omits it otherwise", () => {
    const withOpaque = wrapAsAmbientGlobal({
      namespace: "gui",
      emitted:
        'declare namespace gui {\n  function get_parent(n: Opaque<"node">): Opaque<"node">;\n}\n',
      importsFrom: "../src/core-types",
    });
    expect(withOpaque).toContain('import type { Opaque } from "../src/core-types";');

    const withoutOpaque = wrapAsAmbientGlobal({
      namespace: "gui",
      emitted: "declare namespace gui {\n  function f(): Vector3;\n}\n",
      importsFrom: "../src/core-types",
    });
    expect(withoutOpaque).not.toContain("Opaque");
  });

  test("trailing-newline-or-not inputs produce identical output", () => {
    const withNewline = wrapAsAmbientGlobal({
      namespace: "vmath",
      emitted: "declare namespace vmath {\n  function f(): Vector3;\n}\n",
      importsFrom: "../src/core-types",
    });
    const withoutNewline = wrapAsAmbientGlobal({
      namespace: "vmath",
      emitted: "declare namespace vmath {\n  function f(): Vector3;\n}",
      importsFrom: "../src/core-types",
    });
    expect(withNewline).toBe(withoutNewline);
  });
});
