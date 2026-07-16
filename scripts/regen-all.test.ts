import { describe, expect, test } from "bun:test";
import { plan, REGEN_UNITS, type RegenUnit, runRegenSequence } from "./regen-all.ts";

describe("REGEN_UNITS", () => {
  test("exposes exactly the four artifact units by stable id", () => {
    expect(REGEN_UNITS.map((u) => u.id)).toEqual([
      "declarations",
      "availability",
      "signatures",
      "llms",
    ]);
  });

  test("every unit carries a non-empty command", () => {
    for (const unit of REGEN_UNITS) {
      expect(unit.command.length).toBeGreaterThan(0);
      expect(unit.command[0]).toBe("bun");
    }
  });

  test("declarations run before availability and signatures", () => {
    const order = REGEN_UNITS.map((u) => u.id);
    expect(order.indexOf("declarations")).toBeLessThan(order.indexOf("availability"));
    expect(order.indexOf("declarations")).toBeLessThan(order.indexOf("signatures"));
  });

  test("llms is the last unit", () => {
    expect(REGEN_UNITS.at(-1)?.id).toBe("llms");
  });

  test("llms unit targets the docs-site build-llms artifact", () => {
    const llms = REGEN_UNITS.find((u) => u.id === "llms");
    expect(llms).toBeDefined();
    expect(llms?.command.join(" ")).toContain("build-llms");
    expect(llms?.command.join(" ")).toContain("@defold-typescript/docs-site");
  });

  test("availability and signatures generators are invoked with --write", () => {
    for (const id of ["availability", "signatures"] as const) {
      const unit = REGEN_UNITS.find((u) => u.id === id);
      expect(unit?.command).toContain("--write");
    }
  });
});

describe("plan", () => {
  test("lists the four unit commands without executing them", () => {
    const p = plan();
    expect(p.map((u) => u.id)).toEqual(REGEN_UNITS.map((u) => u.id));
    for (let i = 0; i < REGEN_UNITS.length; i++) {
      expect(p[i]?.command).toBe(REGEN_UNITS[i]?.command.join(" "));
    }
  });
});

describe("runRegenSequence", () => {
  test("runs units in order and reports every id on success", () => {
    const ran: string[] = [];
    const summary = runRegenSequence((unit: RegenUnit) => {
      ran.push(unit.id);
      return true;
    });
    expect(ran).toEqual(["declarations", "availability", "signatures", "llms"]);
    expect(summary.ok).toBe(true);
    expect(summary.ran).toEqual(["declarations", "availability", "signatures", "llms"]);
    expect(summary.failed).toBeUndefined();
  });

  test("fails fast: stops at the first non-zero unit and names it", () => {
    const ran: string[] = [];
    const summary = runRegenSequence((unit: RegenUnit) => {
      ran.push(unit.id);
      return unit.id !== "availability";
    });
    expect(ran).toEqual(["declarations", "availability"]);
    expect(summary.ok).toBe(false);
    expect(summary.failed).toBe("availability");
    expect(summary.ran).toEqual(["declarations"]);
  });
});

describe("harness discoverability", () => {
  test("root package.json declares the regen:all script", async () => {
    const pkg = (await Bun.file("package.json").json()) as { scripts?: Record<string, string> };
    expect(pkg.scripts?.["regen:all"]).toBe("bun scripts/regen-all.ts");
  });

  test("packages/types declares the generate-api-signatures wrapper", async () => {
    const pkg = (await Bun.file("packages/types/package.json").json()) as {
      scripts?: Record<string, string>;
    };
    expect(pkg.scripts?.["generate-api-signatures"]).toBeDefined();
    expect(pkg.scripts?.["generate-api-signatures"]).toContain("generate-api-signatures.ts");
  });
});
