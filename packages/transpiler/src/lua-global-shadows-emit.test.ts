import { expect, test } from "bun:test";
import { PROBE } from "./lua-global-shadows.test-support";
import { transpileProject } from "./transpile";

// Which names TypeScript-to-Lua renames at which position, and the inline
// `select(2, ...)` it writes for a multi-return index: the evidence the
// TypeScript gotchas guide cites for hidden globals.
test("the shadow probe's emit", () => {
  const result = transpileProject({ files: { "probe.ts": PROBE } });
  expect(result.lua["probe.ts"]).toMatchSnapshot();
});
