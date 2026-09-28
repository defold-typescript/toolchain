import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { transpileProject } from "@defold-typescript/transpiler";
import { BOX2D_BACKENDS } from "./contexts";
import { describeDiagnostic } from "./negative-witness";
import { PROBE_DENYLIST } from "./probe-denylist";
import { generateProbes, PROBE_FILES, type ProbeGeneration } from "./witness";

const RUNTIME = resolve(import.meta.dir, "..", "project", "probe", "runtime.ts");
const generations: ProbeGeneration[] = BOX2D_BACKENDS.map((backend) =>
  generateProbes(undefined, backend),
);
const [v2] = generations as [ProbeGeneration, ProbeGeneration];

describe("witness generation", () => {
  test("sprite.play_flipbook gets a required-slot call and one with every optional slot", () => {
    const calls = v2.calls.filter(
      (call) => call.name === "sprite.play_flipbook" && call.witness === undefined,
    );
    expect(calls.map((call) => [call.variant, call.call])).toEqual([
      ["required", 'sprite.play_flipbook(SPRITE, hash("anim"))'],
      ["optional", 'sprite.play_flipbook(SPRITE, hash("anim"), () => {}, {})'],
    ]);
    const go = v2.files[PROBE_FILES.go] ?? "";
    expect(go).toContain('const SPRITE = msg.url("main:/probe#sprite");');
    expect(go).toContain(
      'probe("sprite.play_flipbook", "required", () => sprite.play_flipbook(SPRITE, hash("anim")));',
    );
  });

  test(
    "every generated file type-checks and transpiles with zero diagnostics",
    () => {
      for (const generation of generations) {
        const files: Record<string, string> = { "probe/runtime.ts": readFileSync(RUNTIME, "utf8") };
        for (const [file, source] of Object.entries(generation.files))
          files[`main/${file}`] = source;
        const result = transpileProject({ files });
        const errors = result.diagnostics
          .filter((d) => d.category !== "warning")
          .map((d) => {
            const source = files[d.file ?? ""] ?? "";
            return `${generation.backend} ${describeDiagnostic(source, generation.calls, d)}`;
          });
        expect(errors).toEqual([]);
      }
    },
    { timeout: 120_000 },
  );

  test("every declared function is probed from exactly one script or denied", () => {
    const declared = new Set(generations.flatMap((generation) => generation.functions));
    const kinds = new Map<string, Set<string>>();
    for (const call of generations.flatMap((generation) => generation.calls)) {
      const set = kinds.get(call.name) ?? new Set<string>();
      set.add(call.kind);
      kinds.set(call.name, set);
    }
    const denied = (fqn: string) =>
      PROBE_DENYLIST[fqn] !== undefined ||
      PROBE_DENYLIST[`${fqn.slice(0, fqn.lastIndexOf("."))}.*`] !== undefined;
    const problems: string[] = [];
    for (const fqn of declared) {
      const scripts = kinds.get(fqn)?.size ?? 0;
      if (denied(fqn) && scripts > 0) problems.push(`${fqn}: denied and probed`);
      if (!denied(fqn) && scripts !== 1) problems.push(`${fqn}: probed from ${scripts} scripts`);
    }
    for (const key of Object.keys(PROBE_DENYLIST)) {
      const fqn = key.replace(/:overload\d+$/, "");
      const matches = fqn.endsWith(".*")
        ? [...declared].some((name) => name.startsWith(fqn.slice(0, -1)))
        : declared.has(fqn);
      if (!matches) problems.push(`${key}: denylist names no declared function`);
    }
    for (const generation of generations) {
      for (const { name, reason } of generation.unwitnessed) {
        problems.push(`${generation.backend} ${name}: ${reason}`);
      }
    }
    expect(problems).toEqual([]);
  });
});
