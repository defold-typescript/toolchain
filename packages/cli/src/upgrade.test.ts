import { describe, expect, test } from "bun:test";
import { compareSemver, handOffArgv, installArgv, planUpgrade } from "./upgrade";

describe("compareSemver", () => {
  test("orders segments numerically, not lexicographically", () => {
    expect(compareSemver("1.9.0", "1.10.0")).toBeLessThan(0);
    expect(compareSemver("1.10.0", "1.9.0")).toBeGreaterThan(0);
    expect(compareSemver("0.0.0", "0.0.1")).toBeLessThan(0);
    expect(compareSemver("2.0.0", "1.999.999")).toBeGreaterThan(0);
  });

  test("treats equal versions as equal", () => {
    expect(compareSemver("1.3.0", "1.3.0")).toBe(0);
  });

  test("orders a prerelease below its release without throwing", () => {
    expect(compareSemver("1.3.0-beta.1", "1.3.0")).toBeLessThan(0);
    expect(compareSemver("1.3.0", "1.3.0-beta.1")).toBeGreaterThan(0);
    expect(compareSemver("1.3.0-beta.1", "1.3.0-beta.2")).toBeLessThan(0);
    expect(compareSemver("1.3.0-beta.1", "1.3.0-beta.1")).toBe(0);
  });

  test("a prerelease still sorts below a higher release", () => {
    expect(compareSemver("1.3.0-beta.1", "1.4.0")).toBeLessThan(0);
  });
});

describe("planUpgrade", () => {
  test("hands off when the running CLI is behind the registry", () => {
    expect(planUpgrade({ running: "1.2.0", latest: "1.3.0" })).toEqual({
      action: "hand-off",
      target: "1.3.0",
    });
  });

  test("re-scaffolds in process when already latest", () => {
    expect(planUpgrade({ running: "1.3.0", latest: "1.3.0" })).toEqual({ action: "in-process" });
  });

  test("never hands off to an older binary when the running CLI is ahead", () => {
    expect(planUpgrade({ running: "1.4.0", latest: "1.3.0" })).toEqual({ action: "in-process" });
  });

  test("a dev checkout reporting 0.0.0 is behind everything", () => {
    expect(planUpgrade({ running: "0.0.0", latest: "1.3.0" })).toEqual({
      action: "hand-off",
      target: "1.3.0",
    });
  });

  test("compares numerically: 1.9.0 hands off to 1.10.0", () => {
    expect(planUpgrade({ running: "1.9.0", latest: "1.10.0" })).toEqual({
      action: "hand-off",
      target: "1.10.0",
    });
  });

  test("a prerelease running against its release hands off", () => {
    expect(planUpgrade({ running: "1.3.0-beta.1", latest: "1.3.0" })).toEqual({
      action: "hand-off",
      target: "1.3.0",
    });
  });
});

describe("handOffArgv", () => {
  test("reproduces the canonical mise recipe with the resolved version pinned", () => {
    expect(handOffArgv("1.3.0", { npm_config_user_agent: "bun/1.2.0 npm/? node/?" })).toEqual([
      "bunx",
      "@defold-typescript/cli@1.3.0",
      "init",
      ".",
      "--force",
      "--suppress-install-reminder",
    ]);
  });

  test("uses the runner of the detected package manager", () => {
    expect(handOffArgv("1.3.0", { npm_config_user_agent: "pnpm/9.0.0" })[0]).toBe("pnpm");
    expect(handOffArgv("1.3.0", { npm_config_user_agent: "pnpm/9.0.0" })[1]).toBe("dlx");
    expect(handOffArgv("1.3.0", { npm_config_user_agent: "npm/10.0.0" })[0]).toBe("npx");
    expect(handOffArgv("1.3.0", { npm_config_user_agent: "yarn/4.0.0" })[0]).toBe("yarn");
  });

  test("falls back to bunx when the runner is unknown", () => {
    expect(handOffArgv("1.3.0", {})[0]).toBe("bunx");
  });

  test("pins the resolved version, never a bare @latest tag", () => {
    expect(handOffArgv("1.3.0", {})).not.toContain("@defold-typescript/cli@latest");
  });
});

describe("installArgv", () => {
  test("mirrors the install hint for the detected package manager", () => {
    expect(installArgv({ npm_config_user_agent: "pnpm/9.0.0" })).toEqual(["pnpm", "install"]);
    expect(installArgv({ npm_config_user_agent: "npm/10.0.0" })).toEqual(["npm", "install"]);
    expect(installArgv({})).toEqual(["bun", "install"]);
  });
});
