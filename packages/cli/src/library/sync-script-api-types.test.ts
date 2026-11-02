import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FIXTURE_DATA_DIR,
  type FlatLibraryTargets,
  writeLibraryTargets,
} from "../library-data-fixture";
import {
  applyOmittableSlots,
  buildScriptApiFidelity,
  computeScriptApiFidelity,
  emitScriptApiDeclaration,
  type FetchText,
  fetchScriptApiFixture,
  loadTypeResolver,
  readScriptApiTargets,
  type ScriptApiDoc,
  type ScriptApiDocElement,
  type ScriptApiTarget,
} from "./sync-script-api-types";

// The fixture's beacon target as it appears in a validated config. Unlike the
// LuaLS front-end (which pins source globs), a script_api target pins one
// `.script_api` path and the exact canonical golden paths it owns. Like the LuaLS
// libraries, its goldens are named for the single-segment `namespace`
// (`api-doc/beacon.json`), not the dotted `moduleId`, keeping the docs tree and
// file layout clean.
const BEACON: ScriptApiTarget = {
  repo: "https://github.com/example/fixture-script-api",
  ref: "3.0.0",
  license: "MIT",
  scriptApi: "beacon/api/beacon.script_api",
  moduleId: "beacon.beacon",
  namespace: "beacon",
  apiDoc: "api-doc/beacon.json",
  fidelity: "fidelity/beacon.json",
  omittableSlots: [
    {
      element: "beacon.platform.send",
      slot: "options",
      evidence: "Optional message-specific options (may be omitted).",
    },
  ],
  sourceFile: "fixture-script-api/source/beacon.beacon.script_api",
};

const temps: string[] = [];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

// Entries as written, a malformed omittable slot included.
function writeConfig(targets: Record<string, unknown>[]): string {
  const root = tempDir("script-api-targets-config-");
  writeLibraryTargets(root, {
    scriptApi: targets.map(({ sourceFile: _sourceFile, ...target }) => ({
      repo: BEACON.repo,
      ...target,
    })) as NonNullable<FlatLibraryTargets["scriptApi"]>,
  });
  return root;
}

describe("readScriptApiTargets", () => {
  test("parses the fixture's beacon entry into a typed target", () => {
    const targets = readScriptApiTargets(FIXTURE_DATA_DIR);
    const beacon = targets.find((t) => t.moduleId === "beacon.beacon");
    expect(beacon).toEqual(BEACON);
  });

  test("throws naming the missing field and the offending entry", () => {
    const { scriptApi: _drop, ...missingScriptApi } = BEACON;
    const root = writeConfig([missingScriptApi]);
    expect(() => readScriptApiTargets(root)).toThrow(/scriptApi/);
    expect(() => readScriptApiTargets(root)).toThrow(/beacon\.beacon/);
  });

  test("names the entry index when moduleId itself is the missing field", () => {
    const { moduleId: _drop, ...missingModuleId } = BEACON;
    const root = writeConfig([missingModuleId]);
    expect(() => readScriptApiTargets(root)).toThrow(/moduleId/);
    expect(() => readScriptApiTargets(root)).toThrow(/0/);
  });

  test("rejects an omittableSlots entry missing its element, slot or evidence", () => {
    const complete = { element: "beacon.platform.send", slot: "options", evidence: "e" };
    for (const field of ["element", "slot", "evidence"] as const) {
      const { [field]: _drop, ...partial } = complete;
      const root = writeConfig([{ ...BEACON, omittableSlots: [partial] }]);
      expect(() => readScriptApiTargets(root)).toThrow(new RegExp(field));
    }
    const blank = writeConfig([{ ...BEACON, omittableSlots: [{ ...complete, evidence: "  " }] }]);
    expect(() => readScriptApiTargets(blank)).toThrow(/evidence/);
  });

  test("defaults fidelity to fidelity/<namespace>.json and license to '' when omitted", () => {
    const { fidelity: _f, license: _l, ...bare } = BEACON;
    const root = writeConfig([bare]);
    const [target] = readScriptApiTargets(root);
    expect(target?.fidelity).toBe("fidelity/beacon.json");
    expect(target?.license).toBe("");
  });
});

describe("fetchScriptApiFixture", () => {
  test("snapshots the pinned .script_api at the target's sourceFile, offline", async () => {
    const root = tempDir("script-api-fetch-");
    const fetched: string[] = [];
    const fetchText: FetchText = async (url) => {
      fetched.push(url);
      return `# ${url}\n`;
    };

    await fetchScriptApiFixture(root, BEACON, { fetchText });

    expect(fetched).toEqual([
      "https://raw.githubusercontent.com/example/fixture-script-api/3.0.0/beacon/api/beacon.script_api",
    ]);
    const dest = join(root, "fixture-script-api/source/beacon.beacon.script_api");
    expect(existsSync(dest)).toBe(true);
    expect(readFileSync(dest, "utf8")).toBe(
      "# https://raw.githubusercontent.com/example/fixture-script-api/3.0.0/beacon/api/beacon.script_api\n",
    );
  });
});

// A callback whose `day` argument the library counts from 0, on a page
// (`api-doc/rewards.json`) named apart from the namespace, so a note keyed by the
// namespace would miss it.
const REWARDS_SCRIPT_API = `- name: beacon
  type: table
  desc: Functions for talking to the host platform
  members:

  - name: rewards
    type: table
    desc: Daily rewards the platform hands out.
    members:
    - name: get_current_day
      type: function
      desc: Returns the 0-based index of the reward the player is currently on.
      parameters:
        - name: on_success
          type: function
          desc: function(_, day)
        - name: on_failure
          type: function
          desc: function(_, error)
`;

describe("emitScriptApiDeclaration", () => {
  test("routes the vendored .script_api through scriptApiToFixtureJson -> generateModuleDeclaration", async () => {
    const contents = await emitScriptApiDeclaration(FIXTURE_DATA_DIR, BEACON);
    // The output is an importable module keyed by moduleId, not a global namespace.
    expect(contents).toContain("declare module 'beacon.beacon' {");
    expect(contents).toContain("export namespace beacon {");
    // The one-level nested sub-namespace survives the parser.
    expect(contents).toContain("namespace platform {");
    // A stable exported function symbol (assert on the symbol, not the whole blob).
    expect(contents).toContain("function language(");
  });

  test("notes a classified callback argument naming the library, under its api-doc page", async () => {
    const dataDir = tempDir("script-api-index-slot-");
    const [folder] = writeLibraryTargets(dataDir, {
      scriptApi: [
        {
          repo: "https://github.com/example/beacon-rewards",
          ref: "1.0.0",
          scriptApi: "beacon/api/beacon.script_api",
          moduleId: "beacon.beacon",
          namespace: "beacon",
          apiDoc: "api-doc/rewards.json",
        },
      ],
      indexSlots: {
        "rewards/beacon.rewards.get_current_day:param:on_success:day": {
          class: "native-0",
          evidence: "Returns the 0-based index of the reward the player is currently on",
        },
      },
    });
    mkdirSync(join(dataDir, folder as string, "source"), { recursive: true });
    writeFileSync(
      join(dataDir, folder as string, "source/beacon.beacon.script_api"),
      REWARDS_SCRIPT_API,
    );
    const [target] = readScriptApiTargets(dataDir);
    if (target === undefined) throw new Error("the temp data folder holds no script_api target");

    const contents = await emitScriptApiDeclaration(dataDir, target);
    expect(contents).toContain(
      "@param on_success - function(_, day). **0️⃣ `day` is 0-based; passed to `rewards` unchanged.**",
    );
    expect(contents).not.toContain("passed to Defold");
  });
});

describe("applyOmittableSlots", () => {
  const send: ScriptApiDocElement = {
    type: "FUNCTION",
    name: "beacon.platform.send",
    description: "send a message",
    parameters: [
      { name: "message", types: ["string"] },
      { name: "options", types: ["table", "string"] },
      { name: "on_success", types: ["function"] },
      { name: "on_failure", types: ["function"] },
    ],
    returnvalues: [],
  };
  const broadcast: ScriptApiDocElement = { ...send, name: "beacon.platform.broadcast" };
  const doc: ScriptApiDoc = { info: { namespace: "beacon" }, elements: [send, broadcast] };
  const options = { element: "beacon.platform.send", slot: "options", evidence: "e" };

  test("follows the element with a same-named copy that omits the declared slot", () => {
    const expanded = applyOmittableSlots(doc, [options]);
    expect(expanded.elements.map((e) => e.name)).toEqual([
      "beacon.platform.send",
      "beacon.platform.send",
      "beacon.platform.broadcast",
    ]);
    expect(expanded.elements[0]).toEqual(send);
    expect(expanded.elements[1]?.parameters.map((p) => p.name)).toEqual([
      "message",
      "on_success",
      "on_failure",
    ]);
    expect(expanded.elements[2]).toEqual(broadcast);
  });

  test("throws naming the element and slot when the slot is gone upstream", () => {
    const stale = { ...options, slot: "seed" };
    expect(() => applyOmittableSlots(doc, [stale])).toThrow(/beacon\.platform\.send/);
    expect(() => applyOmittableSlots(doc, [stale])).toThrow(/seed/);
  });

  test("throws naming the element and slot when the element is gone upstream", () => {
    const stale = { ...options, element: "beacon.platform.dispatch" };
    expect(() => applyOmittableSlots(doc, [stale])).toThrow(/beacon\.platform\.dispatch/);
    expect(() => applyOmittableSlots(doc, [stale])).toThrow(/options/);
  });
});

describe("script_api fidelity", () => {
  // A pipe-separated `.script_api` `type:` parses into its tokens, so the
  // fixture's `string | nil` return counts one resolved token per alternative
  // rather than one unmapped union or none at all.
  test("beacon fidelity reflects the real emitter: coverage 1, no unmapped tokens", async () => {
    const report = await buildScriptApiFidelity(FIXTURE_DATA_DIR, BEACON);
    expect(report.namespace).toBe("beacon");
    expect(report.totalMembers).toBe(3);
    expect(report.totalTypeTokens).toBe(7);
    expect(report.unknownFallbacks).toBe(0);
    expect(report.unknownTokens).toEqual([]);
    expect(report.undocumentedMembers).toBe(0);
    expect(report.coverage).toBe(1);
  });

  test("computeScriptApiFidelity loudly surfaces an unmapped token in unknownTokens", () => {
    const doc: ScriptApiDoc = {
      info: { namespace: "x" },
      elements: [
        {
          type: "FUNCTION",
          name: "x.f",
          description: "d",
          parameters: [{ types: ["NopeType", "string"] }],
          returnvalues: [],
        },
      ],
    };
    const report = computeScriptApiFidelity("x", doc, { resolves: (t) => t === "string" });
    expect(report.unknownFallbacks).toBe(1);
    expect(report.unknownTokens).toEqual(["NopeType"]);
    expect(report.totalTypeTokens).toBe(2);
    expect(report.coverage).toBe(0.5);
  });

  test("computeScriptApiFidelity counts a slot with no type token as an unknown fallback", () => {
    const doc: ScriptApiDoc = {
      info: { namespace: "x" },
      elements: [
        {
          type: "FUNCTION",
          name: "x.f",
          description: "d",
          parameters: [{ types: [] }, { types: ["string"] }],
          returnvalues: [],
        },
      ],
    };
    const report = computeScriptApiFidelity("x", doc, { resolves: (t) => t === "string" });
    expect(report.totalTypeTokens).toBe(2);
    expect(report.unknownFallbacks).toBe(1);
    expect(report.unknownTokens).toEqual(["(untyped)"]);
    expect(report.coverage).toBe(0.5);
  });

  test("the real emitter resolver maps the script_api type tokens and rejects a made-up token", async () => {
    const resolver = await loadTypeResolver();
    expect(resolver.resolves("string")).toBe(true);
    expect(resolver.resolves("boolean")).toBe(true);
    expect(resolver.resolves("table")).toBe(true);
    expect(resolver.resolves("function")).toBe(true);
    expect(resolver.resolves("string | nil")).toBe(true);
    expect(resolver.resolves("string | Frobnicate")).toBe(false);
    expect(resolver.resolves("Frobnicate")).toBe(false);
  });

  // `nil` is absent from `DEFOLD_TYPE_MAP` because the emitter lowers it
  // structurally — stripped into optionality in parameter position, rendered
  // `undefined` in return position — so counting it unresolved understated
  // coverage for a token that is in fact fully mapped.
  test("the real emitter resolver counts `nil` as resolved", async () => {
    const resolver = await loadTypeResolver();
    expect(resolver.resolves("nil")).toBe(true);
    expect(resolver.resolves("enabled_state")).toBe(false);
  });

  test("a doc whose only slot type is `nil` reports full coverage", async () => {
    const resolver = await loadTypeResolver();
    const doc: ScriptApiDoc = {
      info: { namespace: "x" },
      elements: [
        {
          type: "FUNCTION",
          name: "x.f",
          description: "d",
          parameters: [],
          returnvalues: [{ types: ["nil"] }],
        },
      ],
    };
    const report = computeScriptApiFidelity("x", doc, resolver);
    expect(report.totalTypeTokens).toBe(1);
    expect(report.unknownFallbacks).toBe(0);
    expect(report.unknownTokens).toEqual([]);
    expect(report.coverage).toBe(1);
  });
});
