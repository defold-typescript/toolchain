import { describe, expect, test } from "bun:test";
import {
  DEFAULT_TYPES_ENTRYPOINT,
  isComponentPath,
  isSkipped,
  selectScriptKind,
  selectScriptKindEntrypoint,
} from "./script-kind";

describe("isComponentPath", () => {
  test("real Defold component extensions are components", () => {
    expect(isComponentPath("main/main.script")).toBe(true);
    expect(isComponentPath("ui/hud.gui_script")).toBe(true);
    expect(isComponentPath("render/default.render_script")).toBe(true);
  });

  test("generated <name>.ts.script output is not a component", () => {
    expect(isComponentPath("src/main.ts.script")).toBe(false);
    expect(isComponentPath("build/main.ts.script")).toBe(false);
  });

  test("non-component files are not components", () => {
    expect(isComponentPath("src/main.ts")).toBe(false);
    expect(isComponentPath("world.collection")).toBe(false);
  });
});

describe("isSkipped", () => {
  test("backslash skip segments are detected on any OS", () => {
    expect(isSkipped("node_modules\\dep\\x.script")).toBe(true);
    expect(isSkipped("build\\default\\copy.script")).toBe(true);
    expect(isSkipped(".defold-types\\defold-1.12.4\\index.d.ts")).toBe(true);
  });

  test("a backslash real component path is not skipped", () => {
    expect(isSkipped("src\\game\\hero.script")).toBe(false);
  });

  test("mixed separators still detect the skip segment", () => {
    expect(isSkipped("a\\node_modules/b.script")).toBe(true);
  });

  test("existing posix behavior is unchanged", () => {
    expect(isSkipped("node_modules/dep/x.script")).toBe(true);
    expect(isSkipped("src/main.script")).toBe(false);
  });
});

describe("selectScriptKindEntrypoint", () => {
  test("single gui-script -> @defold-typescript/types/gui-script", () => {
    expect(selectScriptKindEntrypoint(new Set(["gui-script"]))).toBe(
      "@defold-typescript/types/gui-script",
    );
  });

  test("single script -> @defold-typescript/types/script", () => {
    expect(selectScriptKindEntrypoint(new Set(["script"]))).toBe("@defold-typescript/types/script");
  });

  test("single render-script -> @defold-typescript/types/render-script", () => {
    expect(selectScriptKindEntrypoint(new Set(["render-script"]))).toBe(
      "@defold-typescript/types/render-script",
    );
  });

  test("zero kinds -> the full-surface default", () => {
    expect(selectScriptKindEntrypoint(new Set())).toBe(DEFAULT_TYPES_ENTRYPOINT);
  });

  test("multiple kinds -> the full-surface default", () => {
    expect(selectScriptKindEntrypoint(new Set(["script", "gui-script"]))).toBe(
      DEFAULT_TYPES_ENTRYPOINT,
    );
  });
});

describe("selectScriptKind", () => {
  test("a single kind -> that kind", () => {
    expect(selectScriptKind(new Set(["render-script"]))).toBe("render-script");
  });

  test("zero kinds -> null", () => {
    expect(selectScriptKind(new Set())).toBeNull();
  });

  test("multiple kinds -> null", () => {
    expect(selectScriptKind(new Set(["script", "gui-script"]))).toBeNull();
  });
});
