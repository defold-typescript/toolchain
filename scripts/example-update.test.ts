import { describe, expect, test } from "bun:test";
import { CURRENT_STABLE_DEFOLD_VERSION } from "../packages/cli/src/defold-version.ts";
import {
  buildUpdateSteps,
  expectedFreshArtifacts,
  verifyNoDevVersionPin,
} from "./example-update.ts";

const EXAMPLE = "docs/examples/platformer";
const BIN = "packages/cli/src/bin.ts";

describe("buildUpdateSteps", () => {
  test("returns init --force then build, both on the working-tree bin", () => {
    const steps = buildUpdateSteps(EXAMPLE, BIN);
    expect(steps).toHaveLength(2);
    expect(steps[0]).toEqual(["bun", BIN, "init", "--force", EXAMPLE]);
    expect(steps[1]).toEqual(["bun", BIN, "build", EXAMPLE]);
  });

  test("never pulls the published CLI", () => {
    for (const step of buildUpdateSteps(EXAMPLE, BIN)) {
      const joined = step.join(" ");
      expect(joined).not.toContain("bunx");
      expect(joined).not.toContain("@latest");
    }
  });
});

describe("expectedFreshArtifacts", () => {
  test("includes the emitted player script and the version-keyed types dir", () => {
    const artifacts = expectedFreshArtifacts(EXAMPLE);
    expect(artifacts.some((p) => p.endsWith("src/player.ts.script"))).toBe(true);
    expect(
      artifacts.some((p) => p.includes(`.defold-types/defold-${CURRENT_STABLE_DEFOLD_VERSION}`)),
    ).toBe(true);
  });

  test("does not retain the previous default surface id", () => {
    const artifacts = expectedFreshArtifacts(EXAMPLE);
    expect(artifacts.some((p) => p.includes(".defold-types/defold-1.12.4"))).toBe(false);
  });
});

describe("verifyNoDevVersionPin", () => {
  test("accepts an absent manifest", () => {
    expect(verifyNoDevVersionPin(null)).toEqual({ ok: true, detail: "no package.json" });
  });

  test("rejects a 0.0.0 dev-version pin and names the spec", () => {
    const result = verifyNoDevVersionPin({
      devDependencies: { "@defold-typescript/types": "0.0.0" },
    });
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("@defold-typescript/types");
    expect(result.detail).toContain("0.0.0");
  });

  test("rejects a caret dev-version range (^0.0.0, the real synthesized spec)", () => {
    const result = verifyNoDevVersionPin({
      devDependencies: { "@defold-typescript/cli": "^0.0.0" },
    });
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("@defold-typescript/cli");
    expect(result.detail).toContain("^0.0.0");
  });

  test("rejects a workspace:* pin and names the spec", () => {
    const result = verifyNoDevVersionPin({
      devDependencies: { "@defold-typescript/types": "workspace:*" },
    });
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("@defold-typescript/types");
    expect(result.detail).toContain("workspace:*");
  });

  test("accepts a concrete published pin", () => {
    expect(
      verifyNoDevVersionPin({ devDependencies: { "@defold-typescript/types": "^0.5.0" } }),
    ).toEqual({ ok: true, detail: "no dev-version pin" });
  });
});
