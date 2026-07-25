import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  buildScriptApiFidelity,
  computeScriptApiFidelity,
  emitScriptApiDeclaration,
  type FetchText,
  fetchScriptApiFixture,
  loadTypeResolver,
  lowerScriptApiApiDoc,
  readScriptApiTargets,
  type ScriptApiDoc,
  type ScriptApiTarget,
} from "./sync-script-api-types";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");

// The bridge target as it appears in a validated config. Unlike the LuaLS
// front-end (which pins source globs), a script_api target pins one `.script_api`
// path and the exact non-canonical golden paths it owns — the ts-defold
// `generated/bridge.bridge.d.ts` stays byte-frozen until the migration slice.
const BRIDGE: ScriptApiTarget = {
  repo: "https://github.com/Playgama/bridge-defold",
  ref: "v2.0.0",
  license: "MIT",
  scriptApi: "bridge/api/bridge.script_api",
  moduleId: "bridge.bridge",
  namespace: "bridge",
  generated: "generated/script-api/bridge.bridge.d.ts",
  apiDoc: "api-doc/script-api/bridge.bridge.json",
  fidelity: "fidelity/script-api/bridge.bridge.json",
};

function writeConfig(config: unknown): string {
  const root = mkdtempSync(join(tmpdir(), "script-api-targets-config-"));
  writeFileSync(join(root, "script-api-targets.json"), JSON.stringify(config));
  return root;
}

describe("readScriptApiTargets", () => {
  test("parses the committed bridge entry into a typed target", () => {
    const targets = readScriptApiTargets(PACKAGE_ROOT);
    const bridge = targets.find((t) => t.moduleId === "bridge.bridge");
    expect(bridge).toBeDefined();
    expect(bridge?.namespace).toBe("bridge");
    expect(bridge?.repo).toBe("https://github.com/Playgama/bridge-defold");
    expect(bridge?.ref).toBe("v2.0.0");
    expect(bridge?.scriptApi).toBe("bridge/api/bridge.script_api");
    expect(bridge?.generated).toBe("generated/script-api/bridge.bridge.d.ts");
    expect(bridge?.apiDoc).toBe("api-doc/script-api/bridge.bridge.json");
  });

  test("throws naming the missing field and the offending entry", () => {
    const { scriptApi: _drop, ...missingScriptApi } = BRIDGE;
    const root = writeConfig({ targets: [missingScriptApi] });
    expect(() => readScriptApiTargets(root)).toThrow(/scriptApi/);
    expect(() => readScriptApiTargets(root)).toThrow(/bridge\.bridge/);
  });

  test("names the entry index when moduleId itself is the missing field", () => {
    const { moduleId: _drop, ...missingModuleId } = BRIDGE;
    const root = writeConfig({ targets: [missingModuleId] });
    expect(() => readScriptApiTargets(root)).toThrow(/moduleId/);
    expect(() => readScriptApiTargets(root)).toThrow(/0/);
  });

  test("defaults fidelity to fidelity/script-api/<moduleId>.json and license to '' when omitted", () => {
    const { fidelity: _f, license: _l, ...bare } = BRIDGE;
    const root = writeConfig({ targets: [bare] });
    const [target] = readScriptApiTargets(root);
    expect(target?.fidelity).toBe("fidelity/script-api/bridge.bridge.json");
    expect(target?.license).toBe("");
  });
});

describe("fetchScriptApiFixture", () => {
  test("snapshots the pinned .script_api under fixtures/script-api/<moduleId>.script_api, offline", async () => {
    const root = mkdtempSync(join(tmpdir(), "script-api-fetch-"));
    const fetched: string[] = [];
    const fetchText: FetchText = async (url) => {
      fetched.push(url);
      return `# ${url}\n`;
    };

    await fetchScriptApiFixture(root, BRIDGE, { fetchText });

    expect(fetched).toEqual([
      "https://raw.githubusercontent.com/Playgama/bridge-defold/v2.0.0/bridge/api/bridge.script_api",
    ]);
    const dest = join(root, "fixtures/script-api/bridge.bridge.script_api");
    expect(existsSync(dest)).toBe(true);
    expect(readFileSync(dest, "utf8")).toBe(
      "# https://raw.githubusercontent.com/Playgama/bridge-defold/v2.0.0/bridge/api/bridge.script_api\n",
    );
  });
});

describe("emitScriptApiDeclaration", () => {
  test("routes the vendored .script_api through scriptApiToFixtureJson -> generateModuleDeclaration", async () => {
    const contents = await emitScriptApiDeclaration(PACKAGE_ROOT, BRIDGE);
    // The output is an importable module keyed by moduleId, not a global namespace.
    expect(contents).toContain("declare module 'bridge.bridge' {");
    expect(contents).toContain("export namespace bridge {");
    // The one-level nested sub-namespace survives the parser.
    expect(contents).toContain("namespace achievements {");
    // A stable exported function symbol (assert on the symbol, not the whole blob).
    expect(contents).toContain("function get_achievements(");
  });
});

describe("script_api goldens regenerate byte-for-byte", () => {
  test("each target's .d.ts matches its committed generated/script-api golden", async () => {
    for (const target of readScriptApiTargets(PACKAGE_ROOT)) {
      const regenerated = await emitScriptApiDeclaration(PACKAGE_ROOT, target);
      const committed = readFileSync(join(PACKAGE_ROOT, target.generated), "utf8");
      expect(regenerated).toBe(committed);
    }
  });

  test("each target's lowered api-doc matches its committed api-doc/script-api golden", async () => {
    for (const target of readScriptApiTargets(PACKAGE_ROOT)) {
      const regenerated = await lowerScriptApiApiDoc(PACKAGE_ROOT, target);
      const committed = readFileSync(join(PACKAGE_ROOT, target.apiDoc), "utf8");
      expect(regenerated).toBe(committed);
    }
  });
});

describe("script_api fidelity", () => {
  test("each target's report matches its committed fidelity/script-api golden", async () => {
    for (const target of readScriptApiTargets(PACKAGE_ROOT)) {
      const report = await buildScriptApiFidelity(PACKAGE_ROOT, target);
      const committed = readFileSync(join(PACKAGE_ROOT, target.fidelity), "utf8");
      expect(`${JSON.stringify(report, null, 2)}\n`).toBe(committed);
    }
  });

  // The emitter has no mapping for the `string | nil` union token (it renders
  // `unknown`), so bridge's honest coverage is 0.962, below 1 — the report
  // surfaces the gap rather than hiding it.
  test("bridge fidelity reflects the real emitter: coverage 0.962, string | nil unmapped", async () => {
    const report = await buildScriptApiFidelity(PACKAGE_ROOT, BRIDGE);
    expect(report.namespace).toBe("bridge");
    expect(report.totalMembers).toBe(81);
    expect(report.totalTypeTokens).toBe(130);
    expect(report.unknownFallbacks).toBe(5);
    expect(report.unknownTokens).toEqual(["string | nil"]);
    expect(report.undocumentedMembers).toBe(0);
    expect(report.coverage).toBe(0.962);
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

  test("the real emitter resolver maps bridge's mapped tokens and rejects a made-up token", async () => {
    const resolver = await loadTypeResolver(PACKAGE_ROOT);
    expect(resolver.resolves("string")).toBe(true);
    expect(resolver.resolves("boolean")).toBe(true);
    expect(resolver.resolves("table")).toBe(true);
    expect(resolver.resolves("function")).toBe(true);
    expect(resolver.resolves("string | nil")).toBe(false);
    expect(resolver.resolves("Frobnicate")).toBe(false);
  });
});
