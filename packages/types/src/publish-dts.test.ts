import { describe, expect, test } from "bun:test";
import { wrapAsAmbientGlobal, wrapAsModule } from "./publish-dts";

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

describe("wrapAsModule", () => {
  test("wraps the emitted namespace as an importable declare module", () => {
    const out = wrapAsModule({
      namespace: "bridge",
      emitted:
        "/**\n" +
        " * Functions and constants for interacting with bridge\n" +
        " */\n" +
        "declare namespace bridge {\n" +
        "  namespace achievements {\n" +
        "    function get_achievements(): void;\n" +
        "  }\n" +
        "}\n",
      importsFrom: "../src/core-types",
      moduleId: "bridge.bridge",
    });
    expect(out).toBe(
      "/** @noSelfInFile */\n" +
        "/** @noResolution */\n" +
        "declare module 'bridge.bridge' {\n" +
        "  /**\n" +
        "   * Functions and constants for interacting with bridge\n" +
        "   */\n" +
        "  export namespace bridge {\n" +
        "    namespace achievements {\n" +
        "      function get_achievements(): void;\n" +
        "    }\n" +
        "  }\n" +
        "}\n",
    );
  });

  test("carries both banners, rewrites only the top namespace, and emits no export tail", () => {
    const out = wrapAsModule({
      namespace: "bridge",
      emitted: "declare namespace bridge {\n  namespace achievements {\n  }\n}\n",
      importsFrom: "../src/core-types",
      moduleId: "bridge.bridge",
    });
    expect(out.split("\n")[0]).toBe("/** @noSelfInFile */");
    expect(out.split("\n")[1]).toBe("/** @noResolution */");
    expect(out).toContain("declare module 'bridge.bridge' {");
    expect(out).toContain("export namespace bridge {");
    expect(out).toContain("namespace achievements {");
    expect(out).not.toContain("declare global");
    expect(out).not.toContain("declare namespace");
    expect(out).not.toContain("export {};");
  });

  test("emits no engine-type import line when no branded handle is referenced", () => {
    const out = wrapAsModule({
      namespace: "bridge",
      emitted: "declare namespace bridge {\n  function f(): string;\n}\n",
      importsFrom: "../src/core-types",
      moduleId: "bridge.bridge",
    });
    expect(out).not.toContain("import type");
  });

  test("references engine handles as ambient globals: no import, module stays a script", () => {
    const out = wrapAsModule({
      namespace: "x",
      emitted: "declare namespace x {\n  function f(): Vector3 | Url;\n}\n",
      importsFrom: "../src/core-types",
      moduleId: "x.x",
    });
    // A top-level `import type` would make the `.d.ts` a module, demoting
    // `declare module '<id>'` to an augmentation of an unresolvable specifier;
    // the handles resolve as ambient globals instead, so no import is emitted.
    expect(out).not.toContain("import type");
    const lines = out.split("\n");
    expect(lines[0]).toBe("/** @noSelfInFile */");
    expect(lines[1]).toBe("/** @noResolution */");
    expect(lines[2]).toBe("declare module 'x.x' {");
  });
});
