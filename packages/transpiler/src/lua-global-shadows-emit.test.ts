import { expect, test } from "bun:test";
import {
  HERITAGE,
  PROBE,
  REST_ERASED,
  REST_ERASED_BY_ORDER,
  REST_KEPT,
  REST_KEPT_BY_ORDER,
} from "./lua-global-shadows.test-support";
import { transpileProject } from "./transpile";

// Which names TypeScript-to-Lua renames at which position, and the inline
// `select(2, ...)` it writes for a multi-return index: the evidence the
// TypeScript gotchas guide cites for hidden globals.
test("the shadow probe's emit", () => {
  const result = transpileProject({ files: { "probe.ts": PROBE } });
  expect(result.lua["probe.ts"]).toMatchSnapshot();
});

// Which rest parameters get a named local and which pass on as Lua's `...`,
// and that a type wrapper's runtime expression emits: the evidence the
// every-scope shadow scan mirrors.
test.each([
  ["heritage", HERITAGE],
  ["rest kept", REST_KEPT],
  ["rest erased", REST_ERASED],
  ["rest kept by order", REST_KEPT_BY_ORDER],
  ["rest erased by order", REST_ERASED_BY_ORDER],
])("the %s fixture's emit", (_name, source) => {
  const result = transpileProject({ files: { "probe.ts": source } });
  expect(result.lua["probe.ts"]).toMatchSnapshot();
});
