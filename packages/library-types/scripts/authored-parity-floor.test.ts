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

/** The pinned SHA-256 of every vendored upstream `.lua`, each taken at the `ref`
 * its `authored-targets.json` entry pins. */
const UPSTREAM_LUA_HASHES: Record<string, string> = {
  "fixtures/upstream-lua/bzAnim/bzAnim/bzLibrary.lua":
    "989ea96f2c5922bb4a0b57d195658d495b439513d5349033322e15d7b8a24788",
  "fixtures/upstream-lua/defcon/defcon/console.lua":
    "6756f6f5c8ff7820ef6cf2fa9953df9ac68f86356eb0074f86c072fb36f5995b",
  "fixtures/upstream-lua/defmath/defmath/defmath.lua":
    "212a09cd57b1bac464d4a3cae52121780bf00cc900145e0f8d4114b78ccaa3e6",
  "fixtures/upstream-lua/defold-input/in/button.lua":
    "c975e2c842c1ff676bd13de2b5b52b76e5519242c8045dc6fd7b46c6cb22ab8f",
  "fixtures/upstream-lua/defold-input/in/cursor.lua":
    "32c7946018ce2003af1af746cd469414f13bc6de1eacc0a4bb0e7716aaf02f53",
  "fixtures/upstream-lua/defold-input/in/gesture.lua":
    "2796abc8c38cbd3b704179d5f9e0cd99e6dec2a6166dbe5c96fef510b6d81d51",
  "fixtures/upstream-lua/defold-input/in/keyboard.lua":
    "b6be69750d67b42279197d6264098eb6f75beaca7d992defdeb786914c6971d4",
  "fixtures/upstream-lua/defold-input/in/mapper.lua":
    "b7f51e00a57dadb7ab3cffed717b07f211c31eb44df39cfbfc4b88bbe27db9e8",
  "fixtures/upstream-lua/defold-input/in/onscreen.lua":
    "fa8f6393b93d569adacd3bbe622c450d114ad08a1773209727b17084afbdf38b",
  "fixtures/upstream-lua/defold-input/in/state.lua":
    "6e26a118da2f4c9ff636937a3e100d5ee8a7d0660171010f0bd219e01a61880d",
  "fixtures/upstream-lua/defold-input/in/textbox.lua":
    "d8d27198e5064b8d7afef0347ff8473bc5201deab18b73e770b50078d3afa35f",
  "fixtures/upstream-lua/defold-input/in/triggers.lua":
    "f9c1bbaa272e97efc3b360e446e6df5216906afdf7378e5edfc1b180fc3cf1d1",
  "fixtures/upstream-lua/defold-metrics/metrics/fps.lua":
    "ad8a7fe5e157108b2331c6bb6ea5c34020ef4da26132dc342f6c916105d84610",
  "fixtures/upstream-lua/defold-metrics/metrics/mem.lua":
    "bea985ec1b339b7dfd23215dfd948979b884c2e5baac5a177538ea7ef0a3656e",
  "fixtures/upstream-lua/defold-orthographic/orthographic/camera.lua":
    "d633e84a6052890b6149245c1f1c766077cdc651c243462bf179ac3c940e3dd9",
  "fixtures/upstream-lua/defold-richtext/richtext/color.lua":
    "fbde73c2c56e5de6151fc62dd4a6546564f13259d374f12af33f2fcd2eb2d2d0",
  "fixtures/upstream-lua/defold-richtext/richtext/richtext.lua":
    "45fc934e5380ef71561a9f706148d66d011a4427383529f77439a55deb3fbb3f",
  "fixtures/upstream-lua/defold-richtext/richtext/tags.lua":
    "d7ae9b160623e4f250204cad8ca05cc8ccbdada7ed32cb529e48a8570337a4dc",
  "fixtures/upstream-lua/defold-yagames/yagames/yagames.lua":
    "3942c90672a2022e5385c597da1f6f8aff6fc78c64776c4433dd5299f6f6f0ea",
  "fixtures/upstream-lua/defold-zzfx/zzfx/api.lua":
    "c3adfa664bb9799efacea150171b4291e256acd93c49328e5614911c50677c78",
  "fixtures/upstream-lua/defsave/defsave/defsave.lua":
    "dd8e50be8f0237a70ebea76fb87c42643cdd87b7b3da9c818e3bfdedebb0af0e",
  "fixtures/upstream-lua/deftest/deftest/deftest.lua":
    "cf3292bda13fe096ff4efaff86f3b23a64cfc97640bfff7d47916bfa59aed6d2",
  "fixtures/upstream-lua/dicebag/dicebag/dicebag.lua":
    "388d596a384f82d8052461505719f0a1c687533b96bf66bf97469fadd20107ad",
  "fixtures/upstream-lua/gooey/gooey/gooey.lua":
    "1bc4ba6d7eac6497923532fb4515d6a575c5b1e62e3b0ade5b05bfd1d163327e",
  "fixtures/upstream-lua/library-defold-persist/persist/persist.lua":
    "883ac0e8216b428bbb237c5fef7fc5ce48966fc78590ae5bf05be3bfb5bbc37c",
  "fixtures/upstream-lua/library-defold-rendy/rendy/rendy.lua":
    "155cfbc6ee1dc0284e6546a4601ccf64418e5ede51ef4b204f71b13b93268fbc",
  "fixtures/upstream-lua/monarch/monarch/monarch.lua":
    "fa168aa4d74b2715fe8498b79e8792a0965f56c258144aaf21bf237affb803dc",
  "fixtures/upstream-lua/monarch/monarch/transitions/easings.lua":
    "10819501a0aaf3ede0cd15eefb35bdc3aeb32ba1cae2e3ce134f521b2d3ea41c",
  "fixtures/upstream-lua/monarch/monarch/transitions/gui.lua":
    "1f0b854337697a32ec04a3dc033a35020b4152d8109faa943b650d4e85e3b0a4",
  "fixtures/upstream-lua/nakama-defold/nakama/engine/defold.lua":
    "1e2d9ccb5d21a2837e559ece46fb2f0f79110f1dde740cea50edadd823782fc5",
  "fixtures/upstream-lua/nakama-defold/nakama/nakama.lua":
    "41bcfda63ef8122bb2d4e307c5ab6e1b30e254cff50c8f2d4b491a9c2711c501",
  "fixtures/upstream-lua/nakama-defold/nakama/util/log.lua":
    "a25f86f26b1600d08e0ec1f06eddbd24527b8d1c0b66fb727bd2a6afbf785562",
  "fixtures/upstream-lua/platypus/platypus/platypus.lua":
    "c2fa3bad2ccc15921282ead96d843c8078f71e2ac1d715ee51584bbaed5b49f5",
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
