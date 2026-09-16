import { describe, expect, test } from "bun:test";
import { globalNamespacesIn, srcAugmentationScopingViolations } from "./augmentation-namespaces";

describe("globalNamespacesIn", () => {
  test("a script-style source contributes its top-level namespace", () => {
    expect(
      globalNamespacesIn(
        "script-style.d.ts",
        ["declare namespace gui {", "  function probe_marker(): number;", "}"].join("\n"),
      ),
    ).toEqual(["gui"]);
  });

  test("the same declaration in a module source contributes nothing", () => {
    expect(
      globalNamespacesIn(
        "module-local.d.ts",
        ["export {};", "declare namespace gui {", "  function probe_marker(): number;", "}"].join(
          "\n",
        ),
      ),
    ).toEqual([]);
  });

  test("a type-only import is enough to make the source a module", () => {
    expect(
      globalNamespacesIn(
        "module-local-import.d.ts",
        [
          'import type { Opaque } from "./core-types";',
          "declare namespace gui {",
          "  function probe_marker(): Opaque<'x'>;",
          "}",
        ].join("\n"),
      ),
    ).toEqual([]);
  });

  test("indentation does not participate: one tab", () => {
    expect(
      globalNamespacesIn(
        "tab-indented.d.ts",
        [
          "export {};",
          "declare global {",
          "\tnamespace gui {",
          "\t\tfunction probe_marker(): number;",
          "\t}",
          "}",
        ].join("\n"),
      ),
    ).toEqual(["gui"]);
  });

  test("indentation does not participate: four spaces", () => {
    expect(
      globalNamespacesIn(
        "four-space-indented.d.ts",
        [
          "export {};",
          "declare global {",
          "    namespace gui {",
          "        function probe_marker(): number;",
          "    }",
          "}",
        ].join("\n"),
      ),
    ).toEqual(["gui"]);
  });

  test("two namespaces in one declare global come back in source order", () => {
    expect(
      globalNamespacesIn(
        "two.d.ts",
        [
          "export {};",
          "declare global {",
          "  namespace render {",
          "    function a(): number;",
          "  }",
          "  namespace gui {",
          "    function b(): number;",
          "  }",
          "}",
        ].join("\n"),
      ),
    ).toEqual(["render", "gui"]);
  });

  test("an external module declaration's members are not global", () => {
    expect(
      globalNamespacesIn(
        "external.d.ts",
        [
          'declare module "some-package" {',
          "  namespace gui {",
          "    function probe_marker(): number;",
          "  }",
          "}",
        ].join("\n"),
      ),
    ).toEqual([]);
  });

  test("only the outermost name at a global position counts", () => {
    expect(
      globalNamespacesIn(
        "nested.d.ts",
        [
          "export {};",
          "declare global {",
          "  namespace a {",
          "    namespace gui {",
          "      function probe_marker(): number;",
          "    }",
          "  }",
          "}",
        ].join("\n"),
      ),
    ).toEqual(["a"]);
  });

  test("a namespace re-opened twice is reported once", () => {
    expect(
      globalNamespacesIn(
        "repeat.d.ts",
        [
          "export {};",
          "declare global {",
          "  namespace gui {",
          "    function a(): number;",
          "  }",
          "  namespace gui {",
          "    function b(): number;",
          "  }",
          "}",
        ].join("\n"),
      ),
    ).toEqual(["gui"]);
  });
});

describe("srcAugmentationScopingViolations", () => {
  const guiFile = (body: string) => ({ path: "gui-overloads.d.ts", contents: body });

  test("the real tree carries no scoping violation", () => {
    expect(srcAugmentationScopingViolations()).toEqual([]);
  });

  test("an unmarked augmentation re-opening a restricted namespace is a violation", () => {
    const violations = srcAugmentationScopingViolations(
      [guiFile(["export {};", "declare global {", "  namespace gui {}", "}"].join("\n"))],
      {},
    );
    expect(violations.length).toBe(1);
    expect(violations[0]).toContain("gui-overloads");
    expect(violations[0]).toContain("gui");
  });

  test("the top-level script spelling is caught the same way", () => {
    const violations = srcAugmentationScopingViolations([guiFile("declare namespace gui {}")], {});
    expect(violations.length).toBe(1);
    expect(violations[0]).toContain("gui");
  });

  test("a marker naming a namespace the file does not re-open is a violation", () => {
    const violations = srcAugmentationScopingViolations(
      [guiFile(["export {};", "declare global {", "  namespace go {}", "}"].join("\n"))],
      { "gui-overloads": "gui" },
    );
    expect(violations.length).toBe(1);
    expect(violations[0]).toContain("gui");
  });

  test("a marked augmentation that does re-open its namespace is clean", () => {
    expect(
      srcAugmentationScopingViolations(
        [guiFile(["export {};", "declare global {", "  namespace gui {}", "}"].join("\n"))],
        { "gui-overloads": "gui" },
      ),
    ).toEqual([]);
  });

  test("an unmarked augmentation of no restricted namespace is clean", () => {
    expect(
      srcAugmentationScopingViolations(
        [
          {
            path: "go-overloads.d.ts",
            contents: ["export {};", "declare global {", "  namespace go {}", "}"].join("\n"),
          },
        ],
        {},
      ),
    ).toEqual([]);
  });
});
