import { describe, expect, test } from "bun:test";
import { transpileProject } from "./transpile";

describe("direct go.property call warning", () => {
  test("warns, naming the file and pointing at the properties field", () => {
    const files = {
      "main.ts": [
        'import { defineScript } from "@defold-typescript/types";',
        "",
        'go.property("speed", 450);',
        "",
        "export default defineScript({",
        "  init: () => ({ velocity: vmath.vector3(0, 0, 0) }),",
        "});",
        "",
      ].join("\n"),
    };
    const result = transpileProject({ files });
    const warning = result.diagnostics.find((d) => d.message.includes("go.property"));
    expect(warning).toBeDefined();
    expect(warning?.file).toBe("main.ts");
    expect(warning?.message).toContain("properties");
  });

  test("does not warn for the blessed properties-field form", () => {
    const files = {
      "main.ts": [
        'import { defineScript } from "@defold-typescript/types";',
        "",
        "export default defineScript({",
        "  properties: { adj: vmath.vector3(0, 0, 0), name: hash('initial value') },",
        "  init: () => ({ velocity: vmath.vector3(0, 0, 0) }),",
        "  fixed_update(self, dt) {",
        "    go.set_position(go.get_position().add(self.adj));",
        "  },",
        "});",
        "",
      ].join("\n"),
    };
    const result = transpileProject({ files });
    // The synthesized registrations live only in emitted Lua, never user source,
    // so the scan over the user AST must stay silent.
    const warning = result.diagnostics.find((d) => d.message.includes("go.property"));
    expect(warning).toBeUndefined();
  });
});
