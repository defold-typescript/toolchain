import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { formatJsonLikeBiome } from "./format-json";
import { runInit } from "./init";
import { ensureMaterializedReference, MATERIALIZED_ROOT } from "./materialize";

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(path.join(os.tmpdir(), "dts-json-idempotent-"));
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

test("repointing a Biome-formatted tsconfig produces a stable, Biome-shaped file", () => {
  const consumer = {
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      lib: ["ES2022"],
      strict: true,
    },
    include: ["src/**/*.ts"],
  };
  const tsconfigPath = path.join(cwd, "tsconfig.json");
  writeFileSync(tsconfigPath, `${formatJsonLikeBiome(consumer)}\n`);

  const materializedDir = `${MATERIALIZED_ROOT}/defold-1_2_3`;
  ensureMaterializedReference(cwd, materializedDir);
  const afterFirst = readFileSync(tsconfigPath, "utf8");
  ensureMaterializedReference(cwd, materializedDir);
  const afterSecond = readFileSync(tsconfigPath, "utf8");

  expect(afterSecond).toBe(afterFirst);
  expect(afterSecond).toBe(`${formatJsonLikeBiome(JSON.parse(afterSecond))}\n`);
});

test("freshly scaffolded JSON files are already in Biome shape", () => {
  runInit({ cwd });
  for (const file of ["tsconfig.json", "package.json", "biome.json"]) {
    const bytes = readFileSync(path.join(cwd, file), "utf8");
    expect(bytes).toBe(`${formatJsonLikeBiome(JSON.parse(bytes))}\n`);
  }
});
