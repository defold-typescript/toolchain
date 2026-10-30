import { afterEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  authoredFloorRegressions,
  authoredParityPath,
  authoredParityTargets,
  collectAuthoredParity,
} from "./authored-parity";
import { readLibraryData } from "./library-data";
import { parityFloorsByReport } from "./library-floors";
import { NATIVE_PARITY_DIR, nativeParityPath } from "./native-parity";
import { LIBRARY_DATA_DIR, LIBRARY_TYPES_ROOT } from "./package-root";
import { readAuthoredTargets } from "./sync-authored-types";
import { readNativeTargets } from "./sync-native-types";

const PACKAGE_ROOT = LIBRARY_TYPES_ROOT;
const DATA_DIR = LIBRARY_DATA_DIR;
const PARITY_DIR = "fidelity/authored";
const REGENERATE = "bun run --cwd packages/library-types parity";

const ARTIFACTS = {
  ...collectAuthoredParity(PACKAGE_ROOT),
  ...collectAuthoredParity(PACKAGE_ROOT, NATIVE_PARITY_DIR),
};
const FLOORS = parityFloorsByReport(readLibraryData(DATA_DIR));

describe("the authored-lane surface-parity ratchet", () => {
  test("the walk finds the committed artifacts, so the gate cannot pass vacuously", () => {
    expect(Object.keys(ARTIFACTS).length).toBeGreaterThan(0);
    expect(Object.keys(ARTIFACTS)).toEqual(
      [
        ...authoredParityTargets(DATA_DIR).map((target) => authoredParityPath(target)),
        ...readNativeTargets(DATA_DIR).map((target) => nativeParityPath(target)),
      ].sort(),
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
      .map((path) => `${path}: floor entry has no such artifact — drop the key from its library`);
    expect(stale).toEqual([]);
  });

  test("neither axis of any artifact sits below its floor", () => {
    expect(authoredFloorRegressions(ARTIFACTS, FLOORS)).toEqual([]);
  });

  test("the floors read back sorted by artifact", () => {
    const keys = Object.keys(FLOORS);
    expect(keys).toEqual([...keys].sort());
  });
});

describe("every committed floor covers both axes", () => {
  test("each artifact's floor parses into two axes", () => {
    for (const [key, floor] of Object.entries(FLOORS)) {
      expect(typeof floor.callable).toBe("number");
      expect(typeof floor.field).toBe("number");
      expect(key.startsWith(`${PARITY_DIR}/`) || key.startsWith(`${NATIVE_PARITY_DIR}/`)).toBe(
        true,
      );
    }
  });
});

describe("the two-axis ratchet reports each axis on its own", () => {
  const floors = { "fidelity/authored/x.json": { callable: 0.8, field: 0.5 } };
  const artifact = (callableCoverage: number, fieldCoverage: number) => ({
    "fidelity/authored/x.json": { namespace: "x", callableCoverage, fieldCoverage },
  });

  test("a drop on either axis reds, and the message names the axis and both numbers", () => {
    const callable = authoredFloorRegressions(artifact(0.7, 1), floors);
    expect(callable.length).toBe(1);
    expect(callable[0]).toContain("x");
    expect(callable[0]).toContain("callable");
    expect(callable[0]).toContain("0.7");
    expect(callable[0]).toContain("0.8");
    expect(callable[0]).toContain("correct the fork");

    const field = authoredFloorRegressions(artifact(1, 0.25), floors);
    expect(field.length).toBe(1);
    expect(field[0]).toContain("field");
    expect(field[0]).toContain("0.25");
    expect(field[0]).toContain("0.5");
  });

  test("both axes are reported when both drop, so one cannot mask the other", () => {
    expect(authoredFloorRegressions(artifact(0.1, 0.1), floors).length).toBe(2);
  });

  test("meeting a floor exactly is not a regression", () => {
    expect(authoredFloorRegressions(artifact(0.8, 0.5), floors)).toEqual([]);
  });

  test("an arity mismatch reds at full coverage, naming the member and both remedies", () => {
    const path = "fidelity/native/x.json";
    const regressions = authoredFloorRegressions(
      {
        [path]: {
          namespace: "x",
          callableCoverage: 1,
          fieldCoverage: 1,
          arityMismatches: [{ name: "image" }],
        },
      },
      { [path]: { callable: 1, field: 1 } },
    );
    expect(regressions.length).toBe(1);
    expect(regressions[0]).toContain("x.image");
    expect(regressions[0]).toContain("correct the declaration");
    expect(regressions[0]).toContain("record why upstream is wrong");
  });

  test("an unmeasured arity axis reds nothing, an absent list being no claim", () => {
    const path = "fidelity/native/x.json";
    expect(
      authoredFloorRegressions(
        { [path]: { namespace: "x", callableCoverage: 1, fieldCoverage: 1 } },
        { [path]: { callable: 1, field: 1 } },
      ),
    ).toEqual([]);
  });

  test("a native report whose namespace is not the registered module name reds at full coverage", () => {
    const path = "fidelity/native/uuid.json";
    const regressions = authoredFloorRegressions(
      {
        [path]: {
          namespace: "uuid",
          callableCoverage: 1,
          fieldCoverage: 1,
          moduleNameMatches: false,
        },
      },
      { [path]: { callable: 1, field: 1 } },
    );
    expect(regressions.length).toBe(1);
    expect(regressions[0]).toContain("uuid");
    expect(regressions[0]).toContain("module name");
  });
});

describe("the committed native artifacts carry the module-name verdict", () => {
  test("a renamed or absent moduleNameMatches cannot read as undefined and pass", () => {
    const native = Object.entries(ARTIFACTS).filter(([path]) =>
      path.startsWith(`${NATIVE_PARITY_DIR}/`),
    );
    expect(native.length).toBe(readNativeTargets(DATA_DIR).length);
    for (const [, artifact] of native) expect(typeof artifact.moduleNameMatches).toBe("boolean");
  });
});

describe("the collector carries the arity axis a measured report declares", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  /** A package root holding one parity report under `dir`, so each case exercises the
   * collector over the JSON a regenerated report would write rather than over an
   * artifact the test hands `authoredFloorRegressions` directly. */
  function reportRoot(dir: string, report: Record<string, unknown>): string {
    const root = mkdtempSync(join(tmpdir(), "authored-parity-"));
    roots.push(root);
    mkdirSync(join(root, dir), { recursive: true });
    writeFileSync(join(root, dir, "x.json"), JSON.stringify(report));
    return root;
  }

  const KEY = `${NATIVE_PARITY_DIR}/x.json`;
  const FULL_FLOOR = { [KEY]: { callable: 1, field: 1 } };

  function nativeReport(extra: Record<string, unknown>): Record<string, unknown> {
    return {
      namespace: "x",
      callableCoverage: 1,
      fieldCoverage: 1,
      moduleNameMatches: true,
      ...extra,
    };
  }

  test("a measured mismatch reaches the ratchet, naming the member", () => {
    const root = reportRoot(
      NATIVE_PARITY_DIR,
      nativeReport({
        arityMeasured: true,
        arityMismatches: [{ name: "image", upstream: 3, declared: 1 }],
      }),
    );
    const artifacts = collectAuthoredParity(root, NATIVE_PARITY_DIR);
    expect(artifacts[KEY]?.arityMismatches).toEqual([{ name: "image" }]);

    const regressions = authoredFloorRegressions(artifacts, FULL_FLOOR);
    expect(regressions.length).toBe(1);
    expect(regressions[0]).toContain("x.image");
  });

  test("an unmeasured axis carries no list, so `false` cannot read as agreement", () => {
    const root = reportRoot(NATIVE_PARITY_DIR, nativeReport({ arityMeasured: false }));
    const artifacts = collectAuthoredParity(root, NATIVE_PARITY_DIR);
    expect(artifacts[KEY]?.arityMismatches).toBeUndefined();
    expect(authoredFloorRegressions(artifacts, FULL_FLOOR)).toEqual([]);
  });

  test("a measured axis whose list is absent or malformed throws, naming the artifact", () => {
    const malformed: Record<string, unknown>[] = [
      { arityMeasured: "true", arityMismatches: [] },
      { arityMeasured: true },
      { arityMeasured: true, arityMismatches: "image" },
      { arityMeasured: true, arityMismatches: [{ upstream: 3, declared: 1 }] },
      { arityMeasured: true, arityMismatches: [{ name: "", upstream: 3, declared: 1 }] },
      { arityMeasured: true, arityMismatches: [null] },
    ];
    for (const extra of malformed) {
      const root = reportRoot(NATIVE_PARITY_DIR, nativeReport(extra));
      expect(() => collectAuthoredParity(root, NATIVE_PARITY_DIR)).toThrow(
        /fidelity\/native\/x\.json/,
      );
    }
  });

  test("an authored-lane report declaring no measurement keeps floor-based charging", () => {
    const key = `${PARITY_DIR}/x.json`;
    const root = reportRoot(PARITY_DIR, {
      namespace: "x",
      callableCoverage: 1,
      fieldCoverage: 1,
      arityMismatches: [{ name: "f", upstream: 2, declared: 1 }],
    });
    const artifacts = collectAuthoredParity(root, PARITY_DIR);
    expect(artifacts[key]?.arityMismatches).toBeUndefined();
    expect(authoredFloorRegressions(artifacts, { [key]: { callable: 1, field: 1 } })).toEqual([]);
  });

  test("every committed native report declaring the axis is collected with a list", () => {
    const measured = readdirSync(join(PACKAGE_ROOT, NATIVE_PARITY_DIR))
      .filter((name) => name.endsWith(".json"))
      .filter((name) => {
        const raw = JSON.parse(
          readFileSync(join(PACKAGE_ROOT, NATIVE_PARITY_DIR, name), "utf8"),
        ) as Record<string, unknown>;
        return raw.arityMeasured === true;
      });
    expect(measured.length).toBeGreaterThan(0);
    for (const name of measured) {
      expect(ARTIFACTS[`${NATIVE_PARITY_DIR}/${name}`]?.arityMismatches).toBeInstanceOf(Array);
    }
  });
});

describe("the committed artifacts carry both coverage keys", () => {
  test("a renamed or absent axis key cannot read as undefined and compare nothing", () => {
    for (const name of readdirSync(join(PACKAGE_ROOT, PARITY_DIR)).sort()) {
      if (!name.endsWith(".json")) continue;
      const raw = JSON.parse(readFileSync(join(PACKAGE_ROOT, PARITY_DIR, name), "utf8")) as Record<
        string,
        unknown
      >;
      expect(typeof raw.callableCoverage).toBe("number");
      expect(typeof raw.fieldCoverage).toBe("number");
      expect(raw.coverage).toBeUndefined();
    }
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

// Every file under the `source/upstream/` of each library folder the paths name.
function vendoredUpstream(paths: readonly string[]): string[] {
  const folders = [...new Set(paths.map((path) => path.split("/")[0] as string))].sort();
  return folders.flatMap((folder) => {
    const prefix = `${folder}/source/upstream`;
    return existsSync(join(DATA_DIR, prefix))
      ? upstreamFiles(join(DATA_DIR, prefix), prefix, [])
      : [];
  });
}

function fixtureDigest(path: string): string {
  return new Bun.CryptoHasher("sha256").update(readFileSync(join(DATA_DIR, path))).digest("hex");
}

/** An upstream copy the repo does not own. A drift here means the snapshot moved
 * under a recorded measurement, so the remedy is to re-measure and rewrite the
 * artifacts — never to re-baseline the digest, which would silently change what
 * every committed number is about while leaving the numbers standing. */
function driftRemedy(path: string): string {
  return `${path} no longer matches the upstream copy the committed parity reports were measured against. Re-vendor deliberately, re-run \`${REGENERATE}\`, and review the coverage change — do not re-baseline this digest.`;
}

/** The pinned SHA-256 of every vendored upstream `.lua`, each taken at the `ref`
 * its library pins. */
const UPSTREAM_LUA_HASHES: Record<string, string> = {
  "asobi-defold/source/upstream/asobi/api/auth.lua":
    "7b22cd84ced10a91745b5c73f0f32591158cc08af65e05ee5a397718e82932c5",
  "asobi-defold/source/upstream/asobi/api/dm.lua":
    "06acfcfaefe260fb0de43d8b418138433f1b274286b871b86adc804d7b218307",
  "asobi-defold/source/upstream/asobi/api/economy.lua":
    "03f8887412ef52bc5b5527f5e938d7da2b85a152d7db84b00212f8fd417d5923",
  "asobi-defold/source/upstream/asobi/api/iap.lua":
    "50bc56c1039ac16a7b12665192531bd46d41c3d97c6391a6e460610dfe431e08",
  "asobi-defold/source/upstream/asobi/api/inventory.lua":
    "3cfdb70c87dbe580a4e4e0b9bd821364e65e624ffe1449a35853eeb64a803a46",
  "asobi-defold/source/upstream/asobi/api/leaderboards.lua":
    "9966a205d4897595cd042edbfd21bd51c1ca9f9a3adead7d9e8f0efa228c7ec7",
  "asobi-defold/source/upstream/asobi/api/matches.lua":
    "9e60c6374ccd6366f5f1abfff5bd0ca4e1918380a52d3b1c6be23edf22cf4c78",
  "asobi-defold/source/upstream/asobi/api/matchmaker.lua":
    "c7992ed3a58c023f8ca82652d5eab345a83171cd212d98b00d270507276138aa",
  "asobi-defold/source/upstream/asobi/api/notifications.lua":
    "aaab1e94570fddcccbf233a64b2cbb22e98e2c78ca67c4585313151ee79b24fe",
  "asobi-defold/source/upstream/asobi/api/players.lua":
    "438b0b879ae4fc15e46d48cbab4d896b1eb4b5df1583aa5b5be65c6f784fdf28",
  "asobi-defold/source/upstream/asobi/api/social.lua":
    "b7f702c73c5a680d14b4d7b1b2f132fc4dad64b9a467588ffd1a2f58558317f0",
  "asobi-defold/source/upstream/asobi/api/storage.lua":
    "7d5d9e7eb70a653c4c693c700f4946bcded0bf41f24b03bad39b7d47980e8ec8",
  "asobi-defold/source/upstream/asobi/api/tournaments.lua":
    "d1d08e9aa662d7c879f6df60be2d4560cd2c6e88e75ccd387d5721863ed81f33",
  "asobi-defold/source/upstream/asobi/api/votes.lua":
    "53d1cbccf9cad61f99c019b706e4ac2a687f1df23d6e7aef010658eb8b1354ed",
  "asobi-defold/source/upstream/asobi/api/worlds.lua":
    "f88eeca37c8507eac1c1661045f9a506c2fe34274d3fd66d03574ba2a950cf4b",
  "asobi-defold/source/upstream/asobi/client.lua":
    "ff40e694ebef41d18bc9f104c0894d23344726ed623536eb068a1218a3e6c7d6",
  "asobi-defold/source/upstream/asobi/device.lua":
    "9411474ff0ebba7c3e4bd56534da02695f70b5dad254c60d360d2432831026ec",
  "asobi-defold/source/upstream/asobi/http.lua":
    "1a3d0e396d35fc1a4b59c57667b09e7dd555125f455b65c5fc429e221aba0b3c",
  "asobi-defold/source/upstream/asobi/realtime.lua":
    "a65e9edb668cabf5859dfae301ae614a71024329325b752ab9becb49bf8894b7",
  "boom/source/upstream/boom/boom.lua":
    "0f033b071fc86c46c73a176205004c22b8c1eb74ea468ce66b3d326933a43811",
  "bzanim/source/upstream/bzAnim/bzLibrary.lua":
    "989ea96f2c5922bb4a0b57d195658d495b439513d5349033322e15d7b8a24788",
  "colyseus-defold/source/upstream/colyseus/sdk.lua":
    "86f1ef80eb452cf26d30f7b028281d6b92be73bca96a3f4585baf8fc61c3c447",
  "def-behavior-tree/source/upstream/def_behavior_tree/behavior_tree.lua":
    "726065a4e7a215bceff40e211125242930249c2a1908cef7c1d38c3300795139",
  "defarmy/source/upstream/defarmy/defarmy.lua":
    "dca55fee5442c25aa6af8d15a17a8222c532bddad6258f2802bd9e3d7f8505b0",
  "defcon/source/upstream/defcon/console.lua":
    "6756f6f5c8ff7820ef6cf2fa9953df9ac68f86356eb0074f86c072fb36f5995b",
  "defgraph/source/upstream/defgraph/defgraph.lua":
    "a1724ea62f81d7f0ee1b9fdd7d58197dcfae7bec9e890c92ecbfe2c7244a6c7c",
  "defmath/source/upstream/defmath/defmath.lua":
    "212a09cd57b1bac464d4a3cae52121780bf00cc900145e0f8d4114b78ccaa3e6",
  "defold-ads-wrapper/source/upstream/ads_wrapper/ads_networks/admob.lua":
    "fe137482036617b619b93c8dba1a7f4b976a27850c3dd351a0b26ddb4e634016",
  "defold-checkpoint/source/upstream/checkpoint/checkpoint.lua":
    "2b17a4f9d1fc55597d611880def782872029cdd095d94d5f07a9c1faa65008ba",
  "defold-dissolve-fx/source/upstream/dissolve_fx/dissolve_fx.lua":
    "03a889288fd71b3ab8721745334f5b5a8206f25ea3e3ff0ec6ad02d32cde3801",
  "defold-gamepush/source/upstream/gamepush/core/achievements.lua":
    "284ee4c93dc7d7cf6c26b4f0276230daff4a85646d38f58e4a0add963e25bf3b",
  "defold-gamepush/source/upstream/gamepush/core/ads.lua":
    "30f0ce35fc49fea783b4abc88c782a94991e3974f911e7ff1e167b84cff6c7ac",
  "defold-gamepush/source/upstream/gamepush/core/analytics.lua":
    "40095d6be10d1f571ff80b88513917f8ce5393de887ac8cae50045ff32756d1c",
  "defold-gamepush/source/upstream/gamepush/core/app.lua":
    "068e648426e41c84d244d20d3f17f2a757777b994d35cc0914584124a4794057",
  "defold-gamepush/source/upstream/gamepush/core/channels.lua":
    "7b7055bbe222f51ccfb327cc74160cb2abb415b9201bffdda3a8de0959d95abb",
  "defold-gamepush/source/upstream/gamepush/core/documents.lua":
    "59ef06aea08a5f81d629ec648cc44f370476d78574d50bc24366019704c24d19",
  "defold-gamepush/source/upstream/gamepush/core/events.lua":
    "0a765272d083dbd8ff6d95e317133ddc03bbc369942a9e3df41d92e8c89fb216",
  "defold-gamepush/source/upstream/gamepush/core/experiments.lua":
    "0760c61e8f3448484e0434420f4e1290e19c59e1429654389fd0534e73f442d1",
  "defold-gamepush/source/upstream/gamepush/core/feedbacks.lua":
    "52f815977dae27936e18d0fd0d7159516d63d7cc5d8b081cec1d642ecc96def7",
  "defold-gamepush/source/upstream/gamepush/core/files.lua":
    "4d8bc3bb7c2fddfd9cf20b05f088389873f91c8d9025aa132e41d278a7b66341",
  "defold-gamepush/source/upstream/gamepush/core/fullscreen.lua":
    "ec1a6d4cc6bcdcc6c02c8caff41bde69b2466794f6ade69e348dc71adaa91e53",
  "defold-gamepush/source/upstream/gamepush/core/games_collections.lua":
    "585f8e47885dbb09e8dfd4c891187c90df81c060a97d6f2b134111c8e9fadfbb",
  "defold-gamepush/source/upstream/gamepush/core/images.lua":
    "5d9cd1b55c317298f4717094f3989e6ba8f728225e73cd5676ad98aeccb919b9",
  "defold-gamepush/source/upstream/gamepush/core/leaderboard.lua":
    "a596fefb5931bef5ee486f13914e5084e20bda09d103326946e2f69a335c1aa7",
  "defold-gamepush/source/upstream/gamepush/core/logger.lua":
    "0a50548fdd9d7b8ac234289ddcb3ecd438d0b58e34106d28e39453f739708ee3",
  "defold-gamepush/source/upstream/gamepush/core/multiplayer.lua":
    "be85390de70f2934fc2e54e7e45f6ddbbd1d974e285718d385fd4122a52b8b51",
  "defold-gamepush/source/upstream/gamepush/core/payments.lua":
    "0333669353ba71f76129604e23e710e31e0eef4387d93cbb2020fe53cff3f9f3",
  "defold-gamepush/source/upstream/gamepush/core/platform.lua":
    "60c67f0d7be63419a4d939520169f8b950c8bca4c8c32590a270a5df4547df5a",
  "defold-gamepush/source/upstream/gamepush/core/player.lua":
    "40475d548941d53eb906468f38eac07407627ba9306b857ac10a6a2c3d14d7b4",
  "defold-gamepush/source/upstream/gamepush/core/player_stats.lua":
    "8cdbe67f3fb5a9c2b291a955385c39b047a68a3412ef65ff27d0f92e07e4fff6",
  "defold-gamepush/source/upstream/gamepush/core/players.lua":
    "75c97b9b72c72bc88c23833945ba934c7322b3be36c989d682d3bc882ec47a95",
  "defold-gamepush/source/upstream/gamepush/core/reactions.lua":
    "b59614926bd253d005a3f87339723b69d29493e3d9aae475ae80d76a7830d410",
  "defold-gamepush/source/upstream/gamepush/core/rewards.lua":
    "4798827ded5c500d9b7941aa915e23f881845a812bab15a90a8bd8574e459035",
  "defold-gamepush/source/upstream/gamepush/core/schedulers.lua":
    "a42e0d42ba60000ad4386117e0a4fccb1d8944f0fc74349b015c00f67b7e93f3",
  "defold-gamepush/source/upstream/gamepush/core/segments.lua":
    "309ce08e6918efe5291079200d5e8d9a083fe3f4bb1708c1f788b18cccae969a",
  "defold-gamepush/source/upstream/gamepush/core/socials.lua":
    "7b9982870c36d3c24558dc24c53a83487be44d894120e59a3d6b00279ab14395",
  "defold-gamepush/source/upstream/gamepush/core/sounds.lua":
    "b938e51cfad8ac2e8ce12582f34e84e0adeb6b51df4ffe3737d1ca93776ebe0e",
  "defold-gamepush/source/upstream/gamepush/core/storage.lua":
    "77b7076584824fe1ea3da5242df76fa8b3c111a5de211e05704393859d3b207f",
  "defold-gamepush/source/upstream/gamepush/core/triggers.lua":
    "99dab0e001a1bf31cb799fc8fc9e93cae64c0c77215c095f78f285ff46ce8915",
  "defold-gamepush/source/upstream/gamepush/core/uniques.lua":
    "1d2736b581c60e268837dbaaf16ce29fff0dfdbde05c4115c35c6b8c886041fa",
  "defold-gamepush/source/upstream/gamepush/core/variables.lua":
    "79369a31189b85d4575c76d7fc85d41d666f4c55f08c8af89871311065bfdd73",
  "defold-gamepush/source/upstream/gamepush/core/windows.lua":
    "99791b9da12d466e07106db54a16e323af0ef08a7f59d21670c606aa98f4da6c",
  "defold-gamepush/source/upstream/gamepush/gamepush.lua":
    "96466c631148284e0cb22d9322869df84a40c65410e44f1b18d64ef8c9f236bb",
  "defold-illumination/source/upstream/illumination/illumination.lua":
    "f906976082d793870deccaf2cf89594fa602006878f7e93aace50ae979d41b2d",
  "defold-ink/source/upstream/ink/story.lua":
    "52da9951272d796fa989b5677bbc8b834b623021db2aeba6f8150bc6aa835bf5",
  "defold-input/source/upstream/in/accelerometer.lua":
    "fbdf49f06a31bc860d24434d38fc5124f913cb43e88ad039640e0b32e2b545c0",
  "defold-input/source/upstream/in/button.lua":
    "e87aeed156a1593bca7bbc441cfb816a83b88fc977f70ee0db00f979afe28ace",
  "defold-input/source/upstream/in/cursor.lua":
    "32c7946018ce2003af1af746cd469414f13bc6de1eacc0a4bb0e7716aaf02f53",
  "defold-input/source/upstream/in/gesture.lua":
    "2796abc8c38cbd3b704179d5f9e0cd99e6dec2a6166dbe5c96fef510b6d81d51",
  "defold-input/source/upstream/in/keyboard.lua":
    "b6be69750d67b42279197d6264098eb6f75beaca7d992defdeb786914c6971d4",
  "defold-input/source/upstream/in/mapper.lua":
    "b7f51e00a57dadb7ab3cffed717b07f211c31eb44df39cfbfc4b88bbe27db9e8",
  "defold-input/source/upstream/in/onscreen.lua":
    "8172e9bfce7479a61ba66218a373ad75f5d42b26e14122082ef6d91cc79a9b96",
  "defold-input/source/upstream/in/state.lua":
    "6e26a118da2f4c9ff636937a3e100d5ee8a7d0660171010f0bd219e01a61880d",
  "defold-input/source/upstream/in/textbox.lua":
    "250b1cd13b3b2231bdbf6434efc9c3530e389fffc3caaade9fc05a0186e4a452",
  "defold-input/source/upstream/in/triggers.lua":
    "f9c1bbaa272e97efc3b360e446e6df5216906afdf7378e5edfc1b180fc3cf1d1",
  "defold-light-and-shadows/source/upstream/light_and_shadows/constants.lua":
    "64f4d28eaac0be33449ca7e8c6c2b8f10b2395974c258ac3b649597a2a17b4d6",
  "defold-light-and-shadows/source/upstream/light_and_shadows/light.lua":
    "2359f562ac28ddfa65dc38440ad462fa6fdd49ccaab5884ba700981bce0d3456",
  "defold-light-and-shadows/source/upstream/light_and_shadows/light_and_shadows.lua":
    "9fdbdd0b874481e3200e52d987907e0d4298307d6c4eee5cd57545156a0ba148",
  "defold-metrics/source/upstream/metrics/fps.lua":
    "ad8a7fe5e157108b2331c6bb6ea5c34020ef4da26132dc342f6c916105d84610",
  "defold-metrics/source/upstream/metrics/mem.lua":
    "bea985ec1b339b7dfd23215dfd948979b884c2e5baac5a177538ea7ef0a3656e",
  "defold-operator/source/upstream/operator/bezier.lua":
    "ed1c0611f214aae6ff90e28eabd89729bad1fa258ae67bc611ee8c7cab73381c",
  "defold-operator/source/upstream/operator/operator.lua":
    "9c0ea58e5bf11e496c058a529147639a9c17b2c31832d0002e5f56c7fb0492fd",
  "defold-orthographic/source/upstream/orthographic/camera.lua":
    "d633e84a6052890b6149245c1f1c766077cdc651c243462bf179ac3c940e3dd9",
  "defold-pointer-lock/source/upstream/pointer_lock/pointer.lua":
    "3bbb04bb0bbadf74e25bc816691c4a172539d9690d193e518dc44dd51520560e",
  "defold-printer/source/upstream/printer/printer.lua":
    "8f138d031f229ac2e29253af829363dffa68dcc638c9ce4c0bf7573feec9cc74",
  "defold-richtext/source/upstream/richtext/color.lua":
    "fbde73c2c56e5de6151fc62dd4a6546564f13259d374f12af33f2fcd2eb2d2d0",
  "defold-richtext/source/upstream/richtext/richtext.lua":
    "45fc934e5380ef71561a9f706148d66d011a4427383529f77439a55deb3fbb3f",
  "defold-richtext/source/upstream/richtext/tags.lua":
    "d7ae9b160623e4f250204cad8ca05cc8ccbdada7ed32cb529e48a8570337a4dc",
  "defold-sentinel/source/upstream/sentinel/sentry.lua":
    "13fbdaa52764b0d9952f8c94a979cd6156669e6697b9153877dddcab0dbdd69a",
  "defold-shutter/source/upstream/shutter/shutter.lua":
    "2554c3e742ce43d710c60cf09445e871c8ac3c748531ca72b53dcb1a30588fcd",
  "defold-sprite-repeat/source/upstream/node_repeat/node_repeat.lua":
    "212aefd67d63099336d9e41296d31efaddb9f41c98e978bb3b93892e5cd29204",
  "defold-sprite-repeat/source/upstream/sprite_repeat/sprite_repeat.lua":
    "2e03a6b12d288bee454e38a376bfc157da5b93f0140b30f2ff3dcff671e4125e",
  "defold-stylized-water-shader/source/upstream/water/water.lua":
    "8b417f38b0afe814554323f0d989b4b496e5abdb63dc03009b91b4c41a593f39",
  "defold-wrap/source/upstream/wrap/go.lua":
    "dcde8fe00159c8756fe695042e0f3783f46fc56e1fc4528ca532711307ab59d1",
  "defold-wrap/source/upstream/wrap/go_list.lua":
    "1ebfcb9d4305418637059dfd21a808da8c71e555c42885992b33c6af940b15e1",
  "defold-wrap/source/upstream/wrap/gui_applet.lua":
    "e7fef1ca44e68573e803d56f5bae1dff80e92de842efd74a53a44a0bdb0cd10a",
  "defold-wrap/source/upstream/wrap/gui_object.lua":
    "f5ae89fb2aec8c4a597740c756b7d1cdeb76904ec968fc5215693b2498bcf780",
  "defold-wrap/source/upstream/wrap/gui_scene.lua":
    "01ba851bfcf1ab3c9df1c505f84455786d85af8919fb2b137e02b7350bca6fe0",
  "defold-wrap/source/upstream/wrap/node.lua":
    "ab7f5a5ff2fe12eff3ccde23f5d2d81e7f706c21bd308bc89558c48e0327e98d",
  "defold-wrap/source/upstream/wrap/node_list.lua":
    "f34a292a938ad99d1c09ec149efecac7a8b6676088a8ffe1c9b031cc93174456",
  "defold-wrap/source/upstream/wrap/wrap.lua":
    "0b7344bf9810103e785fe1d9f32f745d501f057a9d63622432ee405ff8c61f46",
  "defold-yagames/source/upstream/yagames/yagames.lua":
    "3942c90672a2022e5385c597da1f6f8aff6fc78c64776c4433dd5299f6f6f0ea",
  "defold-zzfx/source/upstream/zzfx/api.lua":
    "c3adfa664bb9799efacea150171b4291e256acd93c49328e5614911c50677c78",
  "defsave/source/upstream/defsave/defsave.lua":
    "dd8e50be8f0237a70ebea76fb87c42643cdd87b7b3da9c818e3bfdedebb0af0e",
  "deftest/source/upstream/deftest/deftest.lua":
    "cf3292bda13fe096ff4efaff86f3b23a64cfc97640bfff7d47916bfa59aed6d2",
  "dicebag/source/upstream/dicebag/dicebag.lua":
    "388d596a384f82d8052461505719f0a1c687533b96bf66bf97469fadd20107ad",
  "flow/source/upstream/bottom_sheet/host.lua":
    "1f3db1074787f2dc371d2afa9697869b5ae6c5000500b427a2bcc2eed0e5cf33",
  "flow/source/upstream/bottom_sheet/init.lua":
    "86ec542e8f2b37fe659296f16fb68c0dd5e999ffe97900b6aae6b0ca33770fe7",
  "flow/source/upstream/color.lua":
    "de856660b67135f13eda8126e2188737ad2acc7d7b5803ff36e71d33c651af56",
  "flow/source/upstream/flow.lua":
    "6a3e354304e6e86056b8bd966462711d949442768868a7331ea5ab6a57b7804f",
  "gooey/source/upstream/gooey/gooey.lua":
    "1bc4ba6d7eac6497923532fb4515d6a575c5b1e62e3b0ade5b05bfd1d163327e",
  "library-defold-persist/source/upstream/persist/persist.lua":
    "883ac0e8216b428bbb237c5fef7fc5ce48966fc78590ae5bf05be3bfb5bbc37c",
  "library-defold-rendy/source/upstream/rendy/rendy.lua":
    "155cfbc6ee1dc0284e6546a4601ccf64418e5ede51ef4b204f71b13b93268fbc",
  "minit-defold/source/upstream/minit/minit.lua":
    "3d86ff11608337ace79cb7649dabf7575770552e334b3bf5c720522e30330f8f",
  "monarch/source/upstream/monarch/monarch.lua":
    "686f04e674e5436650d342f6ba310998b8eca88c9ff3eb6889dc36af43423192",
  "monarch/source/upstream/monarch/transitions/easings.lua":
    "10819501a0aaf3ede0cd15eefb35bdc3aeb32ba1cae2e3ce134f521b2d3ea41c",
  "monarch/source/upstream/monarch/transitions/gui.lua":
    "1f0b854337697a32ec04a3dc033a35020b4152d8109faa943b650d4e85e3b0a4",
  "nakama-defold/source/upstream/nakama/engine/defold.lua":
    "1e2d9ccb5d21a2837e559ece46fb2f0f79110f1dde740cea50edadd823782fc5",
  "nakama-defold/source/upstream/nakama/nakama.lua":
    "41bcfda63ef8122bb2d4e307c5ab6e1b30e254cff50c8f2d4b491a9c2711c501",
  "nakama-defold/source/upstream/nakama/session.lua":
    "fd72a6a981b0f0cf686fecd614aa25cb908de8ddca5243a84384552051541d54",
  "nakama-defold/source/upstream/nakama/socket.lua":
    "83429232422c2228e5938d7e7e86e1a41a7895952020e40499a11d4eb9dbba74",
  "nakama-defold/source/upstream/nakama/util/log.lua":
    "a25f86f26b1600d08e0ec1f06eddbd24527b8d1c0b66fb727bd2a6afbf785562",
  "platypus/source/upstream/platypus/platypus.lua":
    "c2fa3bad2ccc15921282ead96d843c8078f71e2ac1d715ee51584bbaed5b49f5",
};

describe("the vendored upstream Lua the parity reports were measured against", () => {
  test("every pinned copy still hashes to its recorded digest", () => {
    const drifted = Object.entries(UPSTREAM_LUA_HASHES)
      .filter(([path]) => existsSync(join(DATA_DIR, path)))
      .filter(([path, digest]) => fixtureDigest(path) !== digest)
      .map(([path]) => driftRemedy(path));
    expect(drifted).toEqual([]);
  });

  test("every pinned path still exists, so a rename reds", () => {
    expect(Object.keys(UPSTREAM_LUA_HASHES).length).toBeGreaterThan(0);
    expect(
      Object.keys(UPSTREAM_LUA_HASHES).filter((path) => !existsSync(join(DATA_DIR, path))),
    ).toEqual([]);
  });

  test("the pin covers every vendored upstream file, so none arrives unpinned", () => {
    const vendored = vendoredUpstream(readAuthoredTargets(DATA_DIR).map((t) => t.authored));
    expect(vendored.length).toBeGreaterThan(0);
    expect(vendored.filter((path) => !(path in UPSTREAM_LUA_HASHES))).toEqual([]);
  });

  test("the pin covers every path a measured target reads", () => {
    const read = authoredParityTargets(DATA_DIR).flatMap((target) => target.upstreamLua);
    expect(read.length).toBeGreaterThan(0);
    expect(read.filter((path) => !(path in UPSTREAM_LUA_HASHES))).toEqual([]);
  });

  test("the drift remedy forbids re-baselining, unlike the authored-lane one", () => {
    expect(driftRemedy("x/source/upstream/x.lua")).toContain("do not re-baseline this digest");
  });
});

/** The pinned SHA-256 of every vendored registering C++ file, each taken at the
 * `ref` its library pins. */
const UPSTREAM_NATIVE_HASHES: Record<string, string> = {
  "defold-daabbcc/source/upstream/daabbcc/annotation.lua":
    "1e34ced89230e1841155859ff1d3ce3359ddf0c221604ceca8361b47dd4d0d07",
  "defold-daabbcc/source/upstream/daabbcc/src/extension.cpp":
    "f22dd03e273bceb5f761929cc629af76af27e8894041181b57f89ef06a322d1c",
  "def-windward-jps/source/upstream/def_windward_jps/src/def_windward_jps.cpp":
    "93f03d106ffad0e23edce467d271565015cb02e5ce86c8b340791dbbe22bddb0",
  "defold-box2d/source/upstream/box2d/native/src/body.cpp":
    "d02c25ba9220a1dc43cc11437194be3f6044ac6a14d9ad79b6c6b157f4fbfc91",
  "defold-box2d/source/upstream/box2d/native/src/contact.cpp":
    "24d7ef5d106c7a49c44b43519dfe2f021a48920d9cb2b3b76f501b5f58e51c57",
  "defold-box2d/source/upstream/box2d/native/src/draw.cpp":
    "ad2590be791558b1eb721f02659bb4660d231cb1e895b08bbb5a9d9f2f654511",
  "defold-box2d/source/upstream/box2d/native/src/extension.cpp":
    "9431af521630b0d836a539db84cda3bda5b5e9e6b07ef22c83937bd688b8a59e",
  "defold-box2d/source/upstream/box2d/native/src/fixture.cpp":
    "043f9a61e0ed4544d9389a6839892072967174e2eb4f67bd4143d5107ce7330c",
  "defold-box2d/source/upstream/box2d/native/src/joint.cpp":
    "5c5a5d3860cb17dc4e79f7903cd7a9166b4d13ccdd73b46162c007db2902e05a",
  "defold-box2d/source/upstream/box2d/native/src/shape/chain_shape.cpp":
    "232a1540095ed77101695b3e8575a65062ba5b87601c4c388a31dc0f593db84a",
  "defold-box2d/source/upstream/box2d/native/src/shape/circle_shape.cpp":
    "54244338954a4b66a4cf47206b11c6a02002a92ff4c1a8fcf6f418c80e862546",
  "defold-box2d/source/upstream/box2d/native/src/shape/edge_shape.cpp":
    "6e269b90dae1a7ab2be8fe112d45184f21dabdf123216813d302fdab963b964e",
  "defold-box2d/source/upstream/box2d/native/src/shape/polygon_shape.cpp":
    "458b09af91625a13bfdf29b75cdfb21a9ca0bcabb58c905fcf17e3df7012dfc5",
  "defold-box2d/source/upstream/box2d/native/src/world.cpp":
    "55da1575a8da35ceb98415db1b9b85f3f67fb5fa0398e70ed71466df1ec2cae1",
  "defold-box2d/source/upstream/box2d_header.lua":
    "ebc181a896bcb7baaad94968f71d958491da72abb61bde8c68cea7be6b815a4c",
  "defold-daabbcc3d/source/upstream/daabbcc3d/annotation.lua":
    "3e85a9b227a48eb84717e907774096ab8f73aad679b420ca62b00e44539509c9",
  "defold-daabbcc3d/source/upstream/daabbcc3d/src/extension.cpp":
    "40c4a14c59bec593c250b252991692ae122d708a0b8c8dec14a8752ea9672d40",
  "def_taptic_engine/source/upstream/taptic_engine/src/tapticengine.cpp":
    "552be769202229e0145f3d841cf1829c1c8dcd253de74cf8741a5313811f230b",
  "defold-detour/source/upstream/detour/src/detour.cpp":
    "2bbee4eb120dc711c7c23391dab2bf886fc3e5e019409011a3d9c58a16249290",
  "extension-directories/source/upstream/directories/src/extension.h":
    "06bd1b568def12947e5634c3b219125748f12b30cb10e199ac80fff16fa908b2",
  "extension-directories/source/upstream/directories/src/extension_linux.cpp":
    "a4572bca96942c1d193d1a86f31930e646334f92b70a28d88e04573f85d98b0e",
  "extension-openal/source/upstream/openal/src/extension.cpp":
    "00e708c23342c36b49421c35b0434c2b89c06bf777ad2340a642768f53e3f64d",
  "extension-openal/source/upstream/openal/src/LuaListener.cpp":
    "54d882a9571e62ca6ddb0a46f82f1cac6e64bff1cf6fb2f7d9823d54294b082d",
  "extension-openal/source/upstream/openal/src/LuaSource.cpp":
    "ac2686d5eaab4471f3ebea29619823e1238fa59d32635297fe70c4f8ead34821",
  "defold-extension-uptime/source/upstream/uptime/src/UpTime.cpp":
    "362b99d47547da200f91c3f2f4856d9ae2c2962a85c3da0e63822de889332a5b",
  "defold-fontscale/source/upstream/fontscale/src/fontscale.cpp":
    "5685352a52bc182625d52e79e366de5323cc6fe1cd02a13122a8e3e272afb863",
  "defold-gyro/source/upstream/gyro/src/gyro.cpp":
    "40fbeea34a035a055208cb81ffedd1b2773ae0dc8527738207463dd1e5e8af4c",
  "defold-imp/source/upstream/imp/src/imp.cpp":
    "6396179b8f12570e8eaa48bceec8912b311bc20f7927e1c3e23856ffe2ced18b",
  "defold-png/source/upstream/png/src/png.cpp":
    "656138e16880d5161ba33b77b7c11040675d35cdcaee546d422d0b0602193956",
  "player2-ai-npc-defold/source/upstream/LICENSE":
    "8177f97513213526df2cf6184d8ff986c675afb514d4e68a404010521b880643",
  "player2-ai-npc-defold/source/upstream/player2-ai-npc/include/Player2AINPC.hpp":
    "5a1a28494a89d4436d5f84783a21300f67e7ba8ee47e4e4e9d2391d64f868ea5",
  "player2-ai-npc-defold/source/upstream/player2-ai-npc/src/Player2AINPC.cpp":
    "60b1185b55c4cfa645f86d3cb79548f024729925347bc49545caa9a0f1e0abba",
  "defold-sharing/source/upstream/share/api/share.lua":
    "f441787bb953d0fd836c5981bf2430b525f0c2b9350730ff3bd06ac940be705d",
  "defold-sharing/source/upstream/share/src/share.cpp":
    "1539132ffee8f61b4b115c59011d03616939d58c32e912d97710b7430bf5b1bc",
  "defold-tile-raycast/source/upstream/tile-raycast/src/tileraycast.cpp":
    "cc7fb70cf75b86a7a2dbef187b2c4ecde2f927dcbd34598bdde9daff862d8c09",
  "defold-uuid4/source/upstream/uuid4/src/extension.cpp":
    "a2b98177e342dc218db4dd465997ffa72cfc2680802ccb758ca2d84c0ee58045",
  "defold-wave/source/upstream/wave/annotations.lua":
    "72267a8e3c2906c8580aeb3f6bcf2171654a15adf65cc97ced96e3e92a4ec628",
  "defold-wave/source/upstream/wave/src/wave.cpp":
    "153289f1ecc196258e0c9d8ad245e6ea06f2bf8037a0a28ca7dec16b8512ab7f",
};

describe("the vendored native C++ the registration surface is read from", () => {
  test("every pinned copy still hashes to its recorded digest", () => {
    const drifted = Object.entries(UPSTREAM_NATIVE_HASHES)
      .filter(([path]) => existsSync(join(DATA_DIR, path)))
      .filter(([path, digest]) => fixtureDigest(path) !== digest)
      .map(([path]) => driftRemedy(path));
    expect(drifted).toEqual([]);
  });

  test("every pinned path still exists, so a rename reds", () => {
    expect(Object.keys(UPSTREAM_NATIVE_HASHES).length).toBeGreaterThan(0);
    expect(
      Object.keys(UPSTREAM_NATIVE_HASHES).filter((path) => !existsSync(join(DATA_DIR, path))),
    ).toEqual([]);
  });

  test("the pin covers every vendored native file, so none arrives unpinned", () => {
    const vendored = vendoredUpstream(readNativeTargets(DATA_DIR).map((t) => t.declaration));
    expect(vendored.length).toBeGreaterThan(0);
    expect(vendored.filter((path) => !(path in UPSTREAM_NATIVE_HASHES))).toEqual([]);
  });

  test("the pin covers every annotation a target reads parameter lists from", () => {
    const annotated = readNativeTargets(DATA_DIR).filter(
      (entry) => entry.upstreamAnnotation !== undefined,
    );
    expect(annotated.length).toBeGreaterThan(0);
    expect(
      annotated
        .filter((entry) => !((entry.upstreamAnnotation as string) in UPSTREAM_NATIVE_HASHES))
        .map((entry) => `${entry.namespace}: ${entry.upstreamAnnotation}`),
    ).toEqual([]);
  });

  test("the pin covers every native target's upstreamSource, upstreamHeaders and upstreamMethodSources", () => {
    const targets = readNativeTargets(DATA_DIR);
    expect(targets.length).toBeGreaterThan(0);
    expect(
      targets.flatMap((target) =>
        [
          target.upstreamSource,
          ...(target.upstreamHeaders ?? []),
          ...(target.upstreamMethodSources ?? []),
        ]
          .filter((path) => !(path in UPSTREAM_NATIVE_HASHES))
          .map((path) => `${target.namespace}: ${path}`),
      ),
    ).toEqual([]);
  });
});
