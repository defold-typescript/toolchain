import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import * as path from "node:path";

// Both emit-config sites must pin LuaTarget.Lua51 to match Defold's LuaJIT/5.1
// runtime. They are independent inline literals, so guard them against drifting
// apart (mirrors the noImplicitSelf two-site pattern).
const sites = ["transpile.ts", "session.ts"];

describe("Lua target", () => {
  for (const site of sites) {
    const source = readFileSync(path.join(import.meta.dir, site), "utf8");

    test(`${site} pins LuaTarget.Lua51`, () => {
      expect(source).toContain("LuaTarget.Lua51");
    });

    test(`${site} carries no Lua54 target`, () => {
      expect(source).not.toContain("LuaTarget.Lua54");
    });
  }
});
