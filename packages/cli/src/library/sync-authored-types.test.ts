import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FIXTURE_DATA_DIR, writeLibraryTargets } from "../library-data-fixture";
import { extractApiDoc } from "./extract-api-doc";
import { LIBRARY_DATA_DIR } from "./package-root";
import { printedModule } from "./print-corpus";
import {
  type AuthoredTarget,
  emitAuthoredDeclaration,
  lowerAuthoredApiDoc,
  readAuthoredTargets,
} from "./sync-authored-types";

const DATA_DIR = LIBRARY_DATA_DIR;

// The fixture's tally.tally fork as `readAuthoredTargets` returns it. An authored
// target vendors a first-party/forked `.d.ts` and pins the publish namespace it
// is emitted under plus the canonical golden paths. Unlike the markdown/luals/
// script_api lanes the source is already a `declare module` ambient, so the lane
// vendors + `extractApiDoc`s it rather than parsing a foreign source.
const TALLY: AuthoredTarget = {
  repo: "https://github.com/example/fixture-fork",
  ref: "2.0.0",
  license: "MIT",
  authored: "fixture-fork/fork/tally.tally.d.ts",
  moduleId: "tally.tally",
  namespace: "tally",
  apiDoc: "api-doc/tally.json",
  fidelity: "fidelity/tally.json",
  upstreamLua: ["fixture-fork/source/upstream/tally/tally.lua"],
};

interface LoweredApiDoc {
  info: { namespace: string; description?: string };
  elements: Record<string, unknown>[];
}

// The api-doc the docs-site consumes for a namespace, lowered by
// `lowerAuthoredApiDoc` -> `extractApiDoc` from the fork under `dataDir` when the
// test runs, so a fork edit reaches every case without regenerating a report.
function apiDoc(namespace: string, dataDir = DATA_DIR): LoweredApiDoc {
  const targets = readAuthoredTargets(DATA_DIR).filter((t) => t.namespace === namespace);
  const [target] = targets;
  if (targets.length !== 1 || !target) {
    throw new Error(`library data forks ${targets.length} targets under ${namespace}, not one`);
  }
  return JSON.parse(lowerAuthoredApiDoc(dataDir, target)) as LoweredApiDoc;
}

function apiDocElements(namespace: string, dataDir = DATA_DIR): Record<string, unknown>[] {
  return apiDoc(namespace, dataDir).elements;
}

interface ImportedElement {
  type: string;
  name: string;
  brief?: string;
  description?: string;
  docSource?: string;
}

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

// Paths in a written fork stay as given, relative to its library folder.
function writeConfig(targets: Partial<AuthoredTarget>[]): string {
  const root = tempDir("authored-targets-config-");
  writeLibraryTargets(root, {
    forks: targets.map((target) => ({ repo: TALLY.repo, ...target })),
  });
  return root;
}

describe("readAuthoredTargets", () => {
  test("parses the fixture's tally entry into a typed target", () => {
    const targets = readAuthoredTargets(FIXTURE_DATA_DIR);
    const tally = targets.find((t) => t.moduleId === "tally.tally");
    expect(tally).toEqual(TALLY);
  });

  test("throws naming the missing field and the offending entry", () => {
    const { authored: _drop, ...missingAuthored } = TALLY;
    const root = writeConfig([missingAuthored]);
    expect(() => readAuthoredTargets(root)).toThrow(/authored/);
    expect(() => readAuthoredTargets(root)).toThrow(/tally\.tally/);
  });

  test("names the entry index when moduleId itself is the missing field", () => {
    const { moduleId: _drop, ...missingModuleId } = TALLY;
    const root = writeConfig([missingModuleId]);
    expect(() => readAuthoredTargets(root)).toThrow(/moduleId/);
    expect(() => readAuthoredTargets(root)).toThrow(/0/);
  });

  test("defaults fidelity to fidelity/<namespace>.json and license to '' when omitted", () => {
    const { fidelity: _f, license: _l, ...bare } = TALLY;
    const root = writeConfig([bare]);
    const [target] = readAuthoredTargets(root);
    expect(target?.fidelity).toBe("fidelity/tally.json");
    expect(target?.license).toBe("");
  });
});

describe("emitAuthoredDeclaration", () => {
  test("prints the vendored authored .d.ts verbatim", () => {
    const contents = emitAuthoredDeclaration(FIXTURE_DATA_DIR, TALLY);
    // The forked ambient module keyed by moduleId, exported symbols intact
    // (assert on symbols, never the whole blob).
    expect(contents).toContain("declare module 'tally.tally' {");
    expect(contents).toContain("function push(");
    expect(contents).toContain("function flush(");
  });
});

describe("lowerAuthoredApiDoc", () => {
  test("extractApiDoc lowers the fork under the publish namespace", () => {
    const json = lowerAuthoredApiDoc(FIXTURE_DATA_DIR, TALLY);
    const doc = JSON.parse(json) as { info: { namespace: string }; elements: { name: string }[] };
    expect(doc.info.namespace).toBe("tally");
    const names = doc.elements.map((e) => e.name);
    expect(names).toContain("push");
    expect(names).toContain("flush");
  });
});

// The api-doc is the fork plus upstream's own prose where the fork supplies none.
// The vendored `.d.ts` and its emitted golden are untouched by the import, so an
// imported brief is only ever visible through this lowering and the `/api` page it
// feeds.
describe("upstream LuaDoc import at api-doc lowering", () => {
  // A fork that documents `get_level` and `LIMIT_NONE` itself and leaves `start` blank.
  const RELAY_FORK = `/** @noSelfInFile **/

/**
 * Relays messages between peers.
 * @noResolution
 */
declare module 'relay.relay' {
	export function start(port: number): void;
	/** The relay's current level. */
	export function get_level(): number;
	/** A documented limit. */
	export const LIMIT_NONE: "NONE";
}
`;

  // Upstream documents all three members, `start` with a trailing `@param` line and
  // `LIMIT_NONE` under a snake_case heading that is not the member's own name.
  const RELAY_UPSTREAM = `local M = {}

--- limit_mode
-- Limit that caps how many messages the relay holds.
M.LIMIT_NONE = "NONE"

--- Start the relay
-- @param port The port to listen for messages at
function M.start(port)
end

--- Upstream's own words for the level
function M.get_level()
	return 1
end

return M
`;

  // A data folder holding the relay fork beside its upstream `.lua`. The target names
  // that file when `measured`, and records a parity verdict in its place otherwise.
  function writeRelay(measured = true): { dataDir: string; target: AuthoredTarget } {
    const dataDir = tempDir("authored-lowering-");
    const library = join(dataDir, "relay");
    mkdirSync(join(library, "fork"), { recursive: true });
    mkdirSync(join(library, "source", "upstream", "relay"), { recursive: true });
    writeFileSync(join(library, "fork", "relay.relay.d.ts"), RELAY_FORK);
    writeFileSync(join(library, "source", "upstream", "relay", "relay.lua"), RELAY_UPSTREAM);
    writeLibraryTargets(dataDir, {
      forks: [
        {
          repo: "https://github.com/example/relay",
          ref: "1.0.0",
          authored: "fork/relay.relay.d.ts",
          moduleId: "relay.relay",
          namespace: "relay",
          apiDoc: "api-doc/relay.json",
          ...(measured
            ? { upstreamLua: ["source/upstream/relay/relay.lua"] }
            : {
                parityVerdict: {
                  reason: "no-module-file" as const,
                  note: "The relay ships no module file to measure.",
                },
              }),
        },
      ],
    });
    const [target] = readAuthoredTargets(dataDir);
    if (!target) throw new Error("the relay data folder forks nothing");
    return { dataDir, target };
  }

  function loweredElements(dataDir: string, target: AuthoredTarget): ImportedElement[] {
    const { elements } = JSON.parse(lowerAuthoredApiDoc(dataDir, target)) as {
      elements: ImportedElement[];
    };
    return elements;
  }

  function element(dataDir: string, target: AuthoredTarget, name: string): ImportedElement {
    const found = loweredElements(dataDir, target).find((entry) => entry.name === name);
    if (!found) throw new Error(`${target.namespace} lowers no element named ${name}`);
    return found;
  }

  test("tally takes upstream's summary for both members its fork leaves blank", () => {
    const imported = loweredElements(FIXTURE_DATA_DIR, TALLY).filter(
      (e) => e.docSource === "upstream",
    );
    expect(imported.map((e) => e.name).sort()).toEqual(["flush", "push"]);
  });

  test("relay.start's imported description drops the @param line", () => {
    const { dataDir, target } = writeRelay();
    const start = element(dataDir, target, "start");
    expect(start.description).toBe("Start the relay");
    expect(start.brief).toBe("Start the relay");
    expect(start.docSource).toBe("upstream");
  });

  test("relay.get_level keeps the fork's own prose over upstream's", () => {
    const { dataDir, target } = writeRelay();
    const getLevel = element(dataDir, target, "get_level");
    expect(getLevel.brief).toBe("The relay's current level.");
    expect(getLevel.docSource).toBeUndefined();
  });

  test("a target with no vendored upstream imports nothing", () => {
    const imported = ({ dataDir, target }: { dataDir: string; target: AuthoredTarget }) =>
      loweredElements(dataDir, target)
        .filter((e) => e.docSource !== undefined)
        .map((e) => e.name);
    expect(imported(writeRelay())).toEqual(["start"]);
    const unmeasured = writeRelay(false);
    expect(unmeasured.target.upstreamLua).toEqual([]);
    expect(imported(unmeasured)).toEqual([]);
  });

  // The importer's opt-out is "an element the fork gave either a `brief` or a
  // `description` is returned untouched", and it now works on the field axis too:
  // `extractApiDoc` carries a doc comment onto a `VARIABLE` element as well as a
  // `FUNCTION` one, so a constant the fork documents keeps the fork's words. The
  // relay's `LIMIT_NONE` sits under an upstream block that opens with a snake_case
  // heading `withoutNameLine` does not strip, because it is not the member's own
  // name, so a constant that failed to opt out would import that heading instead.
  test("a fork doc-comment on a constant opts the member out of the import", () => {
    const documented = extractApiDoc(
      `declare module "x.y" {\n  /** A documented constant. */\n  export const A: number;\n}\n`,
      "x.y",
    ) as { elements: { name: string; brief?: string; description?: string }[] };
    const a = documented.elements.find((element) => element.name === "A");
    expect(a?.brief).toBe("A documented constant.");
    expect(a?.description).toBe("A documented constant.");

    const { dataDir, target } = writeRelay();
    const limit = element(dataDir, target, "LIMIT_NONE");
    expect(limit.docSource).toBeUndefined();
    expect(limit.brief).toBe("A documented limit.");
  });
});

// The third Bucket-C severance, and the second to take the bare namespace. The
// bare `yagames` is free: nothing owns `api-doc/yagames.json` and yagames is
// not a markdown target. The
// import string survives byte-identical (the alias comes from the namespace's
// trailing segment, the path from `moduleId`); only the route and the dropped
// export subpath move.
//
// Unlike persist and orthographic the fork does not stay verbatim: upstream
// 0.19.0 replaced the whole `banner_*` family with the sticky-banner API, so the
// golden assertions below gate a correction rather than a copy.
describe("yagames.yagames migration integrity", () => {
  // `player_get_id` is deprecated upstream, not removed, so the correction is the
  // misspelling in the existing tag — asserting only that the text names the
  // replacement would pass with `unqiue` still sitting beside it.
  test("player_get_id survives with a correctly spelled deprecation", async () => {
    const golden = await printedModule(DATA_DIR, "yagames.yagames");
    expect(golden).toContain("export function player_get_id(): string;");
    expect(golden).toContain("Use `player_get_unique_id` instead.");
    expect(golden).not.toContain("unqiue");
  });

  // Removal needs positive evidence, and upstream supplies the opposite: at tag
  // 0.19.0 `M.leaderboards_init` still exists and prints its own deprecation
  // notice. The README simply stopped documenting it.
  test("leaderboards_init survives, marked deprecated as upstream marks it", async () => {
    const golden = await printedModule(DATA_DIR, "yagames.yagames");
    expect(golden).toContain("export function leaderboards_init(");
    // Anchored on the declaration so the tag cannot drift onto a neighbour.
    expect(golden).toMatch(/@deprecated[\s\S]{0,200}?\*\/\s*export function leaderboards_init\(/);
  });
});

// nakama.nakama's verdict comes from the openapi lane, not markdown: the REST
// swagger plus realtime proto carry no source for the Lua client's hand-written
// helpers and socket-lifecycle wrappers, so the recorded decision is `no-go` and
// the fork exists to keep exactly those members. The fork is a verbatim copy —
// the ts-defold codemod found nothing to rename in this binding — so the
// assertions below name the members the verdict counts as missing rather than a
// spelling the codemod moved.
describe("nakama.nakama migration integrity", () => {
  // Every member `compareFidelityToTsDefold` reports missing from the openapi
  // emit. `openapi-fidelity-gate.test.ts` re-derives the set from the real
  // emitter; this list is what the fork must still carry for that verdict to keep
  // describing it.
  //
  // Measured at the severance the list also held the ten `on_*` listeners,
  // `socket_connect`/`socket_send` and `create_api_update_group_request`. The
  // signature correction withdrew all thirteen — the pinned module exports no socket
  // member (it `require`s `nakama.socket` privately and exposes only `create_socket`)
  // and no longer generates that request constructor — so what remains is exactly the
  // client-lifecycle surface the structured sources never carried, which is the
  // verdict's own reason.
  const VERDICT_MEMBERS = [
    "cancel",
    "cancellation_token",
    "create_client",
    "create_socket",
    "set_bearer_token",
    "sync",
  ];

  // 174 from the callable rollout's 162: the field correction declared upstream's
  // 12 enum constants, each lowering to one `VARIABLE` element.
  test("the api-doc publishes all 174 elements under the bare namespace with the override description", () => {
    const doc = apiDoc("nakama") as {
      info: { namespace: string; description?: string };
      elements: { name: string; type: string }[];
    };
    expect(doc.info.namespace).toBe("nakama");
    expect(doc.elements).toHaveLength(174);
    expect(doc.elements.filter((e) => e.type === "VARIABLE")).toHaveLength(12);
    for (const member of VERDICT_MEMBERS) {
      expect(doc.elements.some((e) => e.name === member)).toBe(true);
    }
    // Unlike rendy and dicebag the module JSDoc is `@see` + `@noResolution`
    // only, so the page intro has to come from the description override the
    // dropped `nakama-defold` dir no longer supplies.
    const overrides = JSON.parse(
      readFileSync(join(DATA_DIR, "library-description-overrides.json"), "utf8"),
    ) as Record<string, string>;
    expect(overrides.nakama?.length).toBeGreaterThan(0);
  });
});

// Upstream is plain Lua with no annotations of any kind, so parity — which compares
// names, counts and arities — is the whole of what can be derived mechanically. These
// are the claims only a reading of the body supports, asserted against the lowered
// api-doc model the golden and the docs-site are both built from rather than against
// the fork's text, so the emit path is exercised rather than restated.
describe("shutter.shutter type claims upstream states only in its body", () => {
  const FUNCTIONS = [
    "activate",
    "cancel_shake",
    "deactivate",
    "force_update",
    "get_distance",
    "get_frustum",
    "get_projection",
    "get_view",
    "get_viewport",
    "screen_to_world",
    "shake",
    "world_to_screen",
  ];

  test("the api-doc publishes the twelve functions, four constants and the camera typedef", () => {
    const doc = apiDoc("shutter") as {
      info: { namespace: string; description?: string };
      elements: { name: string; type: string }[];
    };
    expect(doc.info.namespace).toBe("shutter");
    expect(
      doc.elements
        .filter((e) => e.type === "FUNCTION")
        .map((e) => e.name)
        .sort(),
    ).toEqual(FUNCTIONS);
    expect(
      doc.elements
        .filter((e) => e.type === "VARIABLE")
        .map((e) => e.name)
        .sort(),
    ).toEqual(["camera_table", "center_behavior", "expand_behavior", "stretch_behavior"]);
    expect(doc.elements.find((e) => e.name === "ShutterCamera")?.type).toBe("TYPEDEF");
    // Upstream ships no README and the fork's module JSDoc is `@see` + `@noResolution`
    // only, so the page intro comes from the namespace-keyed description instead.
    expect((doc.info.description ?? "").length).toBe(0);
    const descriptions = JSON.parse(
      readFileSync(join(DATA_DIR, "library-descriptions.json"), "utf8"),
    ) as Record<string, string>;
    expect(descriptions.shutter?.length).toBeGreaterThan(0);
  });
});

// Parity compares names, counts and arities, so every claim below is invisible to it:
// plain Lua states these only by what its `return` statements carry. Asserted against
// the lowered api-doc model the golden and the docs-site are both built from rather
// than against the fork's text, so the emit path is exercised rather than restated.
describe("checkpoint.checkpoint type claims upstream states only in its body", () => {
  test("the api-doc publishes the four functions and two constants", () => {
    const doc = apiDoc("checkpoint") as {
      info: { namespace: string; description?: string };
      elements: { name: string; type: string }[];
    };
    expect(doc.info.namespace).toBe("checkpoint");
    expect(
      doc.elements
        .filter((e) => e.type === "FUNCTION")
        .map((e) => e.name)
        .sort(),
    ).toEqual(["exists", "list", "read", "write"]);
    expect(
      doc.elements
        .filter((e) => e.type === "VARIABLE")
        .map((e) => e.name)
        .sort(),
    ).toEqual(["project_save_path", "project_title"]);
    // The module JSDoc is `@see` + `@noResolution` only, as with shutter, so the page
    // intro comes from the namespace-keyed description instead.
    expect((doc.info.description ?? "").length).toBe(0);
    const descriptions = JSON.parse(
      readFileSync(join(DATA_DIR, "library-descriptions.json"), "utf8"),
    ) as Record<string, string>;
    expect(descriptions.checkpoint?.length).toBeGreaterThan(0);
  });
});

// The platform modules follow the same split. `platform.lua` is where the body and the
// annotations disagree most: a `---@return string` over an `== true` comparison, and a
// native passthrough whose only check is on the method name.
describe("GamePush platform type claims upstream states only in its body", () => {
  type Returned = { types: string[] };

  function element(namespace: string, name: string, dataDir = DATA_DIR): Record<string, unknown> {
    const found = apiDocElements(namespace, dataDir).find((entry) => entry.name === name);
    if (!found) throw new Error(`${namespace} lowers no element named ${name}`);
    return found;
  }

  function secretCodeAuthReturnTypes(dataDir: string): string[][] {
    const { returnvalues } = element(
      "gamepush.core.platform",
      "is_secret_code_auth_available",
      dataDir,
    ) as { returnvalues: Returned[] };
    return returnvalues.map((r) => r.types);
  }

  // Annotated `---@return string`, but the body returns `call_api(...) == true`.
  test("is_secret_code_auth_available returns the boolean its comparison yields", () => {
    expect(secretCodeAuthReturnTypes(DATA_DIR)).toEqual([["boolean"]]);
  });

  // The check reads the declaration it is given, so a fork edit made without
  // regenerating any report reds it.
  test("a fork retyped to a string return reaches the check", () => {
    const dataDir = tempDir("authored-gamepush-retyped-");
    cpSync(join(DATA_DIR, "defold-gamepush"), join(dataDir, "defold-gamepush"), {
      recursive: true,
    });
    const fork = join(dataDir, "defold-gamepush", "fork", "gamepush.core.platform.d.ts");
    const original = readFileSync(fork, "utf8");
    const retyped = original.replace(
      "is_secret_code_auth_available(): boolean;",
      "is_secret_code_auth_available(): string;",
    );
    if (retyped === original)
      throw new Error("the GamePush fork declares no boolean secret-code check");
    writeFileSync(fork, retyped);
    expect(secretCodeAuthReturnTypes(dataDir)).toEqual([["string"]]);
  });

  test("each platform constant is the literal of its own name", () => {
    expect(element("gamepush.core.platform", "YANDEX")).toMatchObject({
      types: ['"YANDEX"'],
    });
  });
});

describe("Flow authored module type claims", () => {
  function element(namespace: string, name: string): Record<string, unknown> {
    const found = apiDocElements(namespace).find((entry) => entry.name === name);
    if (!found) throw new Error(`${namespace} lowers no element named ${name}`);
    return found;
  }

  test("flow.bottom_sheet.init requires its host config", () => {
    expect(element("flow.bottom_sheet", "init")).toMatchObject({
      type: "VARIABLE",
      types: ["(self: FlowSelf, config: Flow_BottomSheetHostConfig) => void"],
    });
  });
});
