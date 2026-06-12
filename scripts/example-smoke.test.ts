import { describe, expect, test } from "bun:test";
import { buildSmokeSteps } from "./example-smoke.ts";
import { buildUpdateSteps } from "./example-update.ts";

const EXAMPLE = "docs/examples/platformer";
const BIN = "packages/cli/src/bin.ts";

describe("buildSmokeSteps", () => {
  test("returns the convert steps from example-update followed by a verify step", () => {
    const smoke = buildSmokeSteps(EXAMPLE, BIN);
    const update = buildUpdateSteps(EXAMPLE, BIN);
    expect(smoke.slice(0, update.length)).toEqual(update);
    expect(smoke.length).toBe(update.length + 1);
  });

  test("verify step runs tsc --noEmit against the example tsconfig", () => {
    const verify = buildSmokeSteps(EXAMPLE, BIN).at(-1);
    expect(verify).toBeDefined();
    expect(verify?.join(" ")).toContain("tsc");
    expect(verify?.join(" ")).toContain("--noEmit");
    expect(verify?.join(" ")).toContain(`${EXAMPLE}/tsconfig.json`);
  });

  test("verify step path is derived from the example dir, not hardcoded", () => {
    const otherExample = "docs/examples/other";
    const verify = buildSmokeSteps(otherExample, BIN).at(-1);
    expect(verify).toBeDefined();
    expect(verify?.join(" ")).toContain(`${otherExample}/tsconfig.json`);
    expect(verify?.join(" ")).not.toContain(EXAMPLE);
  });

  test("never pulls a published artifact (no @latest, no @defold-typescript/ install token)", () => {
    for (const step of buildSmokeSteps(EXAMPLE, BIN)) {
      const joined = step.join(" ");
      expect(joined).not.toContain("@latest");
      expect(joined).not.toContain("@defold-typescript/cli@");
    }
  });
});

describe("harness discoverability", () => {
  test("mise.toml declares the example:smoke task", async () => {
    const text = await Bun.file("mise.toml").text();
    const block = text.match(/\[tasks\."example:smoke"\][\s\S]*?run = "([^"]+)"/);
    expect(block, 'expected an [tasks."example:smoke"] block in mise.toml').not.toBeNull();
    expect(block?.[1]).toBe("bun scripts/example-smoke.ts");
  });

  test("package.json declares the example-smoke script", async () => {
    const pkg = (await Bun.file("package.json").json()) as { scripts?: Record<string, string> };
    expect(pkg.scripts?.["example-smoke"]).toBe("bun scripts/example-smoke.ts");
  });
});
