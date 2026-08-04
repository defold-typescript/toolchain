import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const PKG_DIR = resolve(import.meta.dir);
const PAGE = resolve(PKG_DIR, "guide", "agent-runbooks.md");

describe("agent-runbooks guide page", () => {
  test("the conversion runbook warns that the lifecycle factory needs a value import", () => {
    expect(existsSync(PAGE)).toBe(true);
    const body = readFileSync(PAGE, "utf8");
    expect(body).toContain("____exports.default = defineScript(");
    expect(body).toContain("import type");
  });

  test("`Fix the Lua output` names the failure `ok` cannot report", () => {
    const body = readFileSync(PAGE, "utf8");
    expect(body).toContain("FORMAT_ERROR");
  });
});
