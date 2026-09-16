import { describe, expect, test } from "bun:test";
import { globalNamespacesIn, srcAugmentationScopingViolations } from "./augmentation-namespaces";
import { loadSrcAugmentations, RESTRICTED_NAMESPACES, RESTRICTED_SRC_AUGMENTATIONS } from "./regen";

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
    expect(
      srcAugmentationScopingViolations(
        loadSrcAugmentations(),
        RESTRICTED_SRC_AUGMENTATIONS,
        RESTRICTED_NAMESPACES,
      ),
    ).toEqual([]);
  });

  test("an unmarked augmentation re-opening a restricted namespace is a violation", () => {
    const violations = srcAugmentationScopingViolations(
      [guiFile(["export {};", "declare global {", "  namespace gui {}", "}"].join("\n"))],
      {},
      RESTRICTED_NAMESPACES,
    );
    expect(violations.length).toBe(1);
    expect(violations[0]).toContain("gui-overloads");
    expect(violations[0]).toContain("gui");
  });

  test("the top-level script spelling is caught the same way", () => {
    const violations = srcAugmentationScopingViolations(
      [guiFile("declare namespace gui {}")],
      {},
      RESTRICTED_NAMESPACES,
    );
    expect(violations.length).toBe(1);
    expect(violations[0]).toContain("gui");
  });

  test("a marker naming a namespace the file does not re-open is a violation", () => {
    const violations = srcAugmentationScopingViolations(
      [guiFile(["export {};", "declare global {", "  namespace go {}", "}"].join("\n"))],
      { "gui-overloads": "gui" },
      RESTRICTED_NAMESPACES,
    );
    expect(violations.length).toBe(1);
    expect(violations[0]).toContain("gui");
  });

  test("a marked augmentation that does re-open its namespace is clean", () => {
    expect(
      srcAugmentationScopingViolations(
        [guiFile(["export {};", "declare global {", "  namespace gui {}", "}"].join("\n"))],
        { "gui-overloads": "gui" },
        RESTRICTED_NAMESPACES,
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
        RESTRICTED_NAMESPACES,
      ),
    ).toEqual([]);
  });

  // The map is an input, not a built-in list: a checker that matched `gui` and
  // `render` as literals would pass every case above and fail both of these.
  test("a namespace the handed map restricts is a violation, though production does not restrict it", () => {
    const violations = srcAugmentationScopingViolations(
      [
        {
          path: "sound-overloads.d.ts",
          contents: ["export {};", "declare global {", "  namespace sound {}", "}"].join("\n"),
        },
      ],
      {},
      { sound: "sound_script" },
    );
    expect(violations.length).toBe(1);
    expect(violations[0]).toContain("sound-overloads");
    expect(violations[0]).toContain("sound");
  });

  test("a namespace the handed map omits is clean, though production restricts it", () => {
    expect(
      srcAugmentationScopingViolations(
        [guiFile(["export {};", "declare global {", "  namespace gui {}", "}"].join("\n"))],
        {},
        { sound: "sound_script" },
      ),
    ).toEqual([]);
  });
});
