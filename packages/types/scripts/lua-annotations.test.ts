import { describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  type AnnotationModel,
  annotationInventory,
  annotationsDir,
  loadAnnotations,
  parseAnnotations,
} from "./lua-annotations";
import { loadApiTargets } from "./regen";

const DEFAULT_TARGET = loadApiTargets().find((target) => target.default === true);
if (!DEFAULT_TARGET) throw new Error("api-targets.json has no default target");
const model: AnnotationModel = loadAnnotations(DEFAULT_TARGET);

function fn(key: string) {
  const found = model.functions.get(key);
  if (!found) throw new Error(`no annotated function ${key}`);
  return found;
}

const PACKAGE_ROOT = resolve(import.meta.dir, "..");

function copyDefaultTarget(): string {
  if (!DEFAULT_TARGET) throw new Error("api-targets.json has no default target");
  const root = mkdtempSync(join(tmpdir(), "lua-annotations-inventory-"));
  const from = resolve(PACKAGE_ROOT, DEFAULT_TARGET.fixturesDir);
  const to = resolve(root, DEFAULT_TARGET.fixturesDir);
  cpSync(join(from, "annotations"), join(to, "annotations"), { recursive: true });
  cpSync(join(from, "import-manifest.json"), join(to, "import-manifest.json"));
  return root;
}

describe("loadAnnotations against the import manifest's inventory", () => {
  test("a listed file missing from the directory fails the load, naming it", () => {
    const root = copyDefaultTarget();
    expect(annotationInventory(DEFAULT_TARGET, root)).toContain("camera.lua");
    rmSync(join(annotationsDir(DEFAULT_TARGET, root), "camera.lua"));
    expect(() => loadAnnotations(DEFAULT_TARGET, root)).toThrow("camera.lua");
  });

  test("an unlisted file in the directory fails the load, naming it", () => {
    const root = copyDefaultTarget();
    expect(annotationInventory(DEFAULT_TARGET, root)).not.toContain("extra.lua");
    writeFileSync(join(annotationsDir(DEFAULT_TARGET, root), "extra.lua"), "---@meta\n");
    expect(() => loadAnnotations(DEFAULT_TARGET, root)).toThrow("extra.lua");
  });

  test("a manifest without an inventory fails the load instead of returning an empty model", () => {
    const root = copyDefaultTarget();
    const manifestPath = resolve(root, DEFAULT_TARGET.fixturesDir, "import-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    delete manifest.annotationFiles;
    writeFileSync(manifestPath, JSON.stringify(manifest));
    expect(annotationInventory(DEFAULT_TARGET, root)).toEqual([]);
    expect(() => loadAnnotations(DEFAULT_TARGET, root)).toThrow("no annotation files");
  });
});

describe("loadAnnotations over the default target", () => {
  test("vmath.clamp carries its generic constraint and T-typed params and return", () => {
    const clamp = fn("runtime:vmath.clamp");
    expect(clamp.generics).toEqual([{ name: "T", constraint: ["number", "vector3", "vector4"] }]);
    expect(clamp.params).toEqual([
      { name: "value", types: ["T"], optional: false, vararg: false },
      { name: "min", types: ["T"], optional: false, vararg: false },
      { name: "max", types: ["T"], optional: false, vararg: false },
    ]);
    expect(clamp.returns).toEqual([{ types: ["T"], name: "clamped_value" }]);
  });

  test("vmath.lerp keeps both function overloads beside the primary signature", () => {
    const lerp = fn("runtime:vmath.lerp");
    expect(lerp.params.map((p) => p.name)).toEqual(["t", "v1", "v2"]);
    expect(lerp.overloads).toEqual([
      {
        params: [
          { name: "t", types: ["number"], optional: false, vararg: false },
          { name: "q1", types: ["quaternion"], optional: false, vararg: false },
          { name: "q2", types: ["quaternion"], optional: false, vararg: false },
        ],
        returns: [{ types: ["quaternion"] }],
      },
      {
        params: [
          { name: "t", types: ["number"], optional: false, vararg: false },
          { name: "n1", types: ["number"], optional: false, vararg: false },
          { name: "n2", types: ["number"], optional: false, vararg: false },
        ],
        returns: [{ types: ["number"] }],
      },
    ]);
  });

  test("b2d.body.get_position keeps its full dotted name, and no namespaced file keys a bare member", () => {
    const getPosition = fn("runtime:b2d.body.get_position");
    expect(getPosition.file).toBe("b2d.lua");
    for (const [key, annotated] of model.functions) {
      if (annotated.file.startsWith("builtins.")) continue;
      expect(`${key} ${annotated.name}`).toContain(".");
      expect(annotated.name).toContain(".");
    }
    expect(model.functions.has("runtime:get_position")).toBe(false);
  });

  test("sys.get_config_string reads `default_value?` as an optional string", () => {
    const param = fn("runtime:sys.get_config_string").params.find(
      (p) => p.name === "default_value",
    );
    expect(param).toEqual({
      name: "default_value",
      types: ["string"],
      optional: true,
      vararg: false,
    });
  });

  test("json.decode on the editor surface has no returns and is keyed apart from runtime json", () => {
    const editorDecode = fn("editor:json.decode");
    expect(editorDecode.file).toBe("json.editor_script");
    expect(editorDecode.returns).toEqual([]);
    expect(editorDecode.params.map((p) => [p.name, p.optional])).toEqual([
      ["json", false],
      ["options", true],
    ]);
    const runtimeDecode = fn("runtime:json.decode");
    expect(runtimeDecode.file).toBe("json.lua");
    expect(runtimeDecode.returns.length).toBeGreaterThan(0);
  });

  test("builtins.lua bare globals are kept under their bare names", () => {
    expect(fn("runtime:hash").file).toBe("builtins.lua");
    const pprint = fn("runtime:pprint");
    expect(pprint.params).toEqual([{ name: "...", types: ["any"], optional: false, vararg: true }]);
  });

  test("meta.lua aliases resolve to their member types", () => {
    const metaAliases = [...model.aliases.values()].filter((a) => a.file === "meta.lua");
    expect(metaAliases.length).toBeGreaterThan(0);
    for (const alias of metaAliases) expect(alias.members.length).toBeGreaterThan(0);
    expect(model.aliases.get("runtime:b2Body")?.members).toEqual(["userdata"]);
    expect(model.aliases.get("runtime:collectionproxy.TIME_STEP_MODE")?.members).toEqual([
      "0",
      "1",
    ]);
    expect(model.aliases.get("runtime:socket_selectable")?.members).toEqual([
      "socket_master",
      "socket_client",
      "socket_server",
      "socket_connected",
      "socket_unconnected",
      "{ getfd:fun(self:any):integer, dirty:fun(self:any):boolean }",
    ]);
  });

  test("every enum resolves to its value type and members, and its `---|` alias to those members", () => {
    expect(model.enums.size).toBeGreaterThan(0);
    for (const annotated of model.enums.values()) {
      expect(annotated.types.length).toBeGreaterThan(0);
      expect(annotated.members.length).toBeGreaterThan(0);
    }
    expect(model.enums.get("runtime:defold_enum.b2d.body.B2")).toMatchObject({
      file: "b2d.lua",
      types: ["integer"],
      members: ["B2_DYNAMIC_BODY", "B2_KINEMATIC_BODY", "B2_STATIC_BODY"],
    });
    expect(model.aliases.get("runtime:b2d.body.B2")?.members).toEqual([
      "defold_enum.b2d.body.B2",
      "`b2d.body.B2_DYNAMIC_BODY`",
      "`b2d.body.B2_KINEMATIC_BODY`",
      "`b2d.body.B2_STATIC_BODY`",
    ]);
  });

  test("classes record their parents and whether they carry fields", () => {
    const loadData = model.classes.get("runtime:collectionproxy.load_data");
    expect(loadData?.fields).toEqual([
      { name: "progress", types: ["number"], optional: true },
      { name: "code", types: ["integer"], optional: true },
    ]);
    const hash = model.classes.get("runtime:hash");
    expect(hash?.parents).toEqual(["userdata"]);
    expect(hash?.fields).toEqual([]);
  });

  test("a name both surfaces declare is keyed per surface", () => {
    expect(model.classes.get("runtime:http.response")?.file).toBe("meta.lua");
    expect(model.aliases.get("editor:http.response")).toMatchObject({
      file: "meta.editor_script",
      members: ["userdata"],
    });
    expect(model.aliases.has("runtime:http.response")).toBe(false);
  });
});

describe("type splitting", () => {
  test("splits unions only at top level and keeps a bracketed type whole up to its first top-level space", () => {
    const parsed = parseAnnotations([
      {
        name: "probe.lua",
        text: [
          "---@param cb fun(self:script_instance, name:hash)|nil callback or nil",
          "---@param list { name:hash }[] named entries",
          "---@param map table<any, any> anything",
          "---@return table<integer, string|number> out the result",
          "function probe.run(cb, list, map) end",
          "",
        ].join("\n"),
      },
    ]);
    const run = parsed.functions.get("runtime:probe.run");
    expect(run?.params.map((p) => p.types)).toEqual([
      ["fun(self:script_instance, name:hash)", "nil"],
      ["{ name:hash }[]"],
      ["table<any, any>"],
    ]);
    expect(run?.returns).toEqual([{ types: ["table<integer, string|number>"], name: "out" }]);
  });
});
