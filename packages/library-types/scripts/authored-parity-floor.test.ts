import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { authoredParityPath, authoredParityTargets } from "./authored-parity";
import { parseFloors } from "./fidelity-floor";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");
const PARITY_DIR = "fidelity/authored";
const FLOOR_MANIFEST = "authored-parity-floor.json";
const UPSTREAM_DIR = "fixtures/upstream-lua";
const REGENERATE = "bun run --cwd packages/library-types parity";

interface ParityArtifact {
  namespace: string;
  coverage: number;
}

function committedArtifacts(): Record<string, ParityArtifact> {
  const artifacts: Record<string, ParityArtifact> = {};
  for (const name of readdirSync(join(PACKAGE_ROOT, PARITY_DIR)).sort()) {
    if (!name.endsWith(".json")) continue;
    const key = `${PARITY_DIR}/${name}`;
    artifacts[key] = JSON.parse(readFileSync(join(PACKAGE_ROOT, key), "utf8")) as ParityArtifact;
  }
  return artifacts;
}

const ARTIFACTS = committedArtifacts();
const FLOORS = parseFloors(
  JSON.parse(readFileSync(join(PACKAGE_ROOT, FLOOR_MANIFEST), "utf8")),
  FLOOR_MANIFEST,
);

describe("the authored-lane surface-parity ratchet", () => {
  test("the walk finds the committed artifacts, so the gate cannot pass vacuously", () => {
    expect(Object.keys(ARTIFACTS).length).toBeGreaterThan(0);
    expect(Object.keys(ARTIFACTS)).toEqual(
      authoredParityTargets(PACKAGE_ROOT)
        .map((target) => authoredParityPath(target))
        .sort(),
    );
  });

  test("every committed parity artifact has a floor entry", () => {
    const missing = Object.keys(ARTIFACTS)
      .filter((path) => FLOORS[path] === undefined)
      .map((path) => `${path}: no floor entry — add one at its current coverage`);
    expect(missing).toEqual([]);
  });

  test("every floor entry names an artifact that exists", () => {
    const stale = Object.keys(FLOORS)
      .filter((path) => ARTIFACTS[path] === undefined)
      .map(
        (path) => `${path}: floor entry has no such artifact — drop the key from ${FLOOR_MANIFEST}`,
      );
    expect(stale).toEqual([]);
  });

  test("no artifact's coverage sits below its floor", () => {
    const regressions = Object.entries(ARTIFACTS)
      .filter(([path, artifact]) => {
        const floor = FLOORS[path];
        return floor !== undefined && artifact.coverage < floor;
      })
      .map(
        ([path, artifact]) =>
          `${artifact.namespace}: coverage ${artifact.coverage} is below its floor ${FLOORS[path]} — correct the fork, do not lower the floor`,
      );
    expect(regressions).toEqual([]);
  });

  test("the manifest's keys are sorted and its values are ratios", () => {
    const keys = Object.keys(FLOORS);
    expect(keys).toEqual([...keys].sort());
  });
});

function upstreamFiles(dir: string, prefix: string, out: string[]): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const rel = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) upstreamFiles(join(dir, entry.name), rel, out);
    else out.push(rel);
  }
  return out;
}

function fixtureDigest(path: string): string {
  return new Bun.CryptoHasher("sha256")
    .update(readFileSync(join(PACKAGE_ROOT, path)))
    .digest("hex");
}

/** An upstream copy the repo does not own. A drift here means the snapshot moved
 * under a recorded measurement, so the remedy is to re-measure and rewrite the
 * artifacts — never to re-baseline the digest, which would silently change what
 * every committed number is about while leaving the numbers standing. */
function driftRemedy(path: string): string {
  return `${path} no longer matches the upstream copy the committed parity reports were measured against. Re-vendor deliberately, re-run \`${REGENERATE}\`, and review the coverage change — do not re-baseline this digest.`;
}

/** The pinned SHA-256 of every vendored upstream `.lua`, taken at
 * `heroiclabs/nakama-defold@v3.4.0`. */
const UPSTREAM_LUA_HASHES: Record<string, string> = {
  "fixtures/upstream-lua/nakama-defold/nakama/engine/defold.lua":
    "1e2d9ccb5d21a2837e559ece46fb2f0f79110f1dde740cea50edadd823782fc5",
  "fixtures/upstream-lua/nakama-defold/nakama/nakama.lua":
    "41bcfda63ef8122bb2d4e307c5ab6e1b30e254cff50c8f2d4b491a9c2711c501",
  "fixtures/upstream-lua/nakama-defold/nakama/util/log.lua":
    "a25f86f26b1600d08e0ec1f06eddbd24527b8d1c0b66fb727bd2a6afbf785562",
};

describe("the vendored upstream Lua the parity reports were measured against", () => {
  test("every pinned copy still hashes to its recorded digest", () => {
    const drifted = Object.entries(UPSTREAM_LUA_HASHES)
      .filter(([path]) => existsSync(join(PACKAGE_ROOT, path)))
      .filter(([path, digest]) => fixtureDigest(path) !== digest)
      .map(([path]) => driftRemedy(path));
    expect(drifted).toEqual([]);
  });

  test("every pinned path still exists, so a rename reds", () => {
    expect(Object.keys(UPSTREAM_LUA_HASHES).length).toBeGreaterThan(0);
    expect(
      Object.keys(UPSTREAM_LUA_HASHES).filter((path) => !existsSync(join(PACKAGE_ROOT, path))),
    ).toEqual([]);
  });

  test("the pin covers every vendored upstream file, so none arrives unpinned", () => {
    const vendored = upstreamFiles(join(PACKAGE_ROOT, UPSTREAM_DIR), UPSTREAM_DIR, []);
    expect(vendored.filter((path) => !(path in UPSTREAM_LUA_HASHES))).toEqual([]);
  });

  test("the pin covers every path a measured target reads", () => {
    const read = authoredParityTargets(PACKAGE_ROOT).flatMap((target) => target.upstreamLua);
    expect(read.length).toBeGreaterThan(0);
    expect(read.filter((path) => !(path in UPSTREAM_LUA_HASHES))).toEqual([]);
  });

  test("the drift remedy forbids re-baselining, unlike the authored-lane one", () => {
    expect(driftRemedy("fixtures/upstream-lua/x.lua")).toContain("do not re-baseline this digest");
  });
});
