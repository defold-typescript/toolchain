import { describe, expect, test } from "bun:test";
import {
  type ExecUnit,
  plan,
  REGEN_UNITS,
  type RegenIo,
  type RegenUnit,
  type RegenUnitId,
  runRegenCli,
  runRegenSequence,
} from "./regen-all.ts";

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

function makeIo(): { io: RegenIo; out: () => string; err: () => string } {
  const out: string[] = [];
  const err: string[] = [];
  return {
    io: { stdout: (c) => out.push(c), stderr: (c) => err.push(c) },
    out: () => out.join(""),
    err: () => err.join(""),
  };
}

function lines(s: string): string[] {
  return s.split("\n").filter((l) => l.length > 0);
}

describe("runRegenCli", () => {
  const passAll: ExecUnit = (unit, _json, io) => {
    io.stderr(`child output for ${unit.id}\n`);
    return true;
  };
  const failAt =
    (id: RegenUnitId): ExecUnit =>
    (unit, _json, io) => {
      io.stderr(`child output for ${unit.id}\n`);
      return unit.id !== id;
    };

  test("json success: stdout is exactly the summary object, banners+child on stderr", () => {
    const { io, out, err } = makeIo();
    const code = runRegenCli(["--json"], passAll, io);
    expect(code).toBe(0);
    expect(lines(out())).toHaveLength(1);
    expect(JSON.parse(out().trim())).toEqual({
      ok: true,
      ran: ["declarations", "availability", "signatures", "llms"],
    });
    expect(err()).toContain("$ ");
    expect(err()).toContain("child output for");
    expect(out()).not.toContain("$ ");
    expect(out()).not.toContain("child output for");
  });

  test("json failure: stdout is exactly one object naming the failed unit", () => {
    const { io, out } = makeIo();
    const code = runRegenCli(["--json"], failAt("availability"), io);
    expect(code).toBe(1);
    expect(lines(out())).toHaveLength(1);
    expect(JSON.parse(out().trim())).toEqual({
      ok: false,
      ran: ["declarations"],
      failed: "availability",
    });
  });

  test("json --plan: stdout is exactly one plan object with no banners", () => {
    const { io, out, err } = makeIo();
    const code = runRegenCli(["--plan", "--json"], passAll, io);
    expect(code).toBe(0);
    expect(lines(out())).toHaveLength(1);
    expect(JSON.parse(out().trim())).toEqual({ plan: plan() });
    expect(out()).not.toContain("$ ");
    expect(err()).not.toContain("$ ");
  });

  test("normal success: banners and human summary on stdout, code 0", () => {
    const { io, out } = makeIo();
    const code = runRegenCli([], passAll, io);
    expect(code).toBe(0);
    expect(out()).toContain("$ ");
    expect(out()).toContain("regen:all — regenerated 4 artifact set(s)");
  });

  test("normal failure: FAILED line on stderr, no summary on stdout, code 1", () => {
    const { io, out, err } = makeIo();
    const code = runRegenCli([], failAt("availability"), io);
    expect(code).toBe(1);
    expect(err()).toContain("regen:all FAILED at `availability`");
    expect(out()).not.toContain("{");
    expect(out()).not.toContain("regen:all — regenerated");
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
    expect(pkg.scripts?.["generate-api-signatures"]).toContain("--write");
  });
});
