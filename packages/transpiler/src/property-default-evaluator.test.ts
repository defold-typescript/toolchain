import { beforeAll, describe, expect, test } from "bun:test";
import {
  evaluatePropertyDefaults,
  loadPropertyEvaluator,
  type PropertyEvaluationResult,
  type PropertyValue,
} from "./property-default-evaluator";
import { transpileProject } from "./transpile";

beforeAll(loadPropertyEvaluator);

const CAPTURE_DECLARATION = "declare global { var ____properties: unknown; }\n";

function evaluateTranspiled(
  files: Record<string, string>,
  names: readonly string[],
): PropertyEvaluationResult {
  const result = transpileProject({ files });
  expect(result.diagnostics).toEqual([]);
  const chunks: Record<string, string> = {};
  for (const [rel, lua] of Object.entries(result.lua)) {
    chunks[rel.replace(/\.ts$/, "")] = lua;
  }
  if (result.lualib !== undefined) {
    chunks.lualib_bundle = result.lualib;
  }
  return evaluatePropertyDefaults({ chunks, entry: "script", names });
}

function evaluateLua(script: string, names: readonly string[] = ["x"]): PropertyEvaluationResult {
  return evaluatePropertyDefaults({ chunks: { script }, entry: "script", names });
}

function valuesOf(result: PropertyEvaluationResult): Record<string, PropertyValue> {
  if (!result.ok) {
    throw new Error(`expected values, got: ${result.error.message}`);
  }
  return Object.fromEntries(result.values);
}

function messageOf(result: PropertyEvaluationResult): string {
  if (result.ok) {
    throw new Error("expected a failure, got values");
  }
  return result.error.message;
}

describe("evaluatePropertyDefaults over transpiled TypeScript", () => {
  test("a realistic properties value evaluates to the values the game computes", () => {
    const result = evaluateTranspiled(
      {
        "defaults.ts":
          "export const DEFAULTS = { pointCount: 50, z: -0.5, shrink: true };\nexport const scale = (n: number) => n * 3;\n",
        "script.ts": `import { DEFAULTS, scale } from "./defaults";
${CAPTURE_DECLARATION}const BASE = 10;
const PREFIX = "enemy_";
____properties = {
  width: BASE * 2,
  ...DEFAULTS,
  z: scale(DEFAULTS.z),
  tint: vmath.vector4(1, 0.5, 0.25, 1).mul(2),
  offset: vmath.vector3(1, 2, 3).add(vmath.vector3(BASE)),
  id: hash(\`\${PREFIX}\${BASE}\`),
  target: msg.url("main", "/player", "trail"),
  label: \`w=\${BASE}\`,
  rot: vmath.quat_rotation_z(math.rad(90)),
  peak: Math.max(...[3, 7]),
  angle: Math.atan2(1, 1),
};
`,
      },
      [
        "width",
        "pointCount",
        "z",
        "shrink",
        "tint",
        "offset",
        "id",
        "target",
        "label",
        "rot",
        "peak",
        "angle",
      ],
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect([...result.values.keys()]).toEqual([
      "width",
      "pointCount",
      "z",
      "shrink",
      "tint",
      "offset",
      "id",
      "target",
      "label",
      "rot",
      "peak",
      "angle",
    ]);
    const { rot, angle, ...exact } = Object.fromEntries(result.values);
    expect(exact).toEqual({
      width: { kind: "number", value: 20 },
      pointCount: { kind: "number", value: 50 },
      z: { kind: "number", value: -1.5 },
      shrink: { kind: "boolean", value: true },
      tint: { kind: "vector4", value: [2, 1, 0.5, 2] },
      offset: { kind: "vector3", value: [11, 12, 13] },
      id: { kind: "hash", value: "enemy_10" },
      target: { kind: "url", value: "main:/player#trail" },
      label: { kind: "string", value: "w=10" },
      peak: { kind: "number", value: 7 },
    });
    expect(rot?.kind).toBe("quat");
    const components = rot?.kind === "quat" ? rot.value : [];
    [0, 0, Math.SQRT1_2, Math.SQRT1_2].forEach((expected, index) => {
      expect(components[index]).toBeCloseTo(expected, 7);
    });
    expect(angle?.kind).toBe("number");
    expect(angle?.kind === "number" ? angle.value : Number.NaN).toBeCloseTo(Math.PI / 4, 10);
  });

  test("strings built from numbers use LuaJIT's number format", () => {
    const result = evaluateTranspiled(
      {
        "script.ts": `export {};\n${CAPTURE_DECLARATION}const BIG = 1e14;\n____properties = { label: \`\${10 / 4}|\${10 / 2}|\${0.1 + 0.2}|\${1e15}|\${BIG * 10}|1000000000000000\` };\n`,
      },
      ["label"],
    );

    expect(valuesOf(result)).toEqual({
      label: { kind: "string", value: "2.5|5|0.3|1e+15|1e+15|1000000000000000" },
    });
  });
});

describe("evaluatePropertyDefaults sandbox", () => {
  test.each([
    ['io.open("x")', "io is not available"],
    ['os.execute("x")', "os is not available"],
    ['dofile("x")', "dofile is not available"],
    ['loadfile("x")', "loadfile is not available"],
    ['load("return 1")', "load is not available"],
    ['loadstring("return 1")', "loadstring is not available"],
    ['print("x")', "print is not available"],
    ['warn("@on")', "warn is not available"],
    ["collectgarbage()", "collectgarbage is not available"],
    ["string.dump(function() end)", "string.dump is not available"],
    ['("x"):dump()', "string.dump is not available"],
    ['package.loadlib("x", "y")', "package is not available"],
    ["debug.getinfo(1)", "debug is not available"],
    ['require("os").execute("x")', "module 'os' is not available"],
    ["math.random()", "math.random is not available"],
    ["math.randomseed(1)", "math.randomseed is not available"],
    ["go.get_position()", "go is not available"],
    ['sys.get_config("x")', "sys is not available"],
    ["setmetatable({}, { __gc = function() end })", "__gc is not available"],
  ])("%s is refused", (statement, refusal) => {
    const message = messageOf(evaluateLua(`${statement}\n____properties = { x = 1 }`));
    expect(message).toContain(`${refusal} when computing a property default`);
  });

  test("a library module that is not a project chunk loads as a stand-in", () => {
    expect(
      valuesOf(evaluateLua('local m = require("druid.druid")\n____properties = { x = 1 }')),
    ).toEqual({
      x: { kind: "number", value: 1 },
    });
  });

  test("reading a member of a library stand-in names the module", () => {
    const message = messageOf(
      evaluateLua('local m = require("druid.druid")\n____properties = { x = m.new }'),
    );
    expect(message).toContain("module 'druid.druid' is not available");
  });

  test("a project chunk loads once and returns its exports", () => {
    const result = evaluatePropertyDefaults({
      chunks: {
        "src.config.counter": "count = (rawget(_G, 'count') or 0) + 1\nreturn { value = 4 }",
        script:
          'local a = require("src.config.counter")\nlocal b = require("src.config.counter")\n____properties = { x = a.value + b.value + count }',
      },
      entry: "script",
      names: ["x"],
    });
    expect(valuesOf(result)).toEqual({ x: { kind: "number", value: 9 } });
  });

  test.each([
    ["while true do end"],
    ["while true do pcall(function() while true do end end) end"],
    ["while true do xpcall(function() while true do end end, function(e) return e end) end"],
  ])("%s stops at the time limit", (statement) => {
    const started = performance.now();
    const message = messageOf(evaluateLua(statement));
    expect(message).toContain("timeout");
    expect(performance.now() - started).toBeLessThan(5000);
  });

  test("an allocation past the memory limit fails and the next evaluation succeeds", () => {
    const message = messageOf(
      evaluateLua('local t = {} for i = 1, 1e9 do t[i] = string.rep("x", 1024) end'),
    );
    expect(message).toContain("memory");
    expect(valuesOf(evaluateLua("____properties = { x = 2 }"))).toEqual({
      x: { kind: "number", value: 2 },
    });
  });
});

describe("evaluatePropertyDefaults values", () => {
  test.each([
    ["{ 1, 2 }"],
    ["function() end"],
    ["0/0"],
    ['"a\\0b"'],
    ['hash("a\\0b")'],
    ["nil"],
  ])("x = %s is not a property value", (expression) => {
    const result = evaluateLua(`____properties = { x = ${expression} }`);
    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.error.name).toBe("x");
  });

  test("a requested name the properties table lacks fails on that name", () => {
    const result = evaluateLua("____properties = { y = 1 }", ["x"]);
    expect(result.ok ? undefined : result.error.name).toBe("x");
  });

  test("an entry that assigns no properties table fails", () => {
    expect(messageOf(evaluateLua("local x = 1"))).toContain("____properties");
  });

  test("infinite numbers are numbers", () => {
    expect(valuesOf(evaluateLua("____properties = { x = 1/0, y = -1/0 }", ["x", "y"]))).toEqual({
      x: { kind: "number", value: Number.POSITIVE_INFINITY },
      y: { kind: "number", value: Number.NEGATIVE_INFINITY },
    });
  });

  test.each([
    ["vmath.normalize(vmath.vector3(1, 0, 0))", "vmath.normalize is not available"],
    ['msg.post("a", "b")', "msg.post is not available"],
    ['resource.load("/a")', "resource.load is not available"],
    ["hash(1)", "hash"],
    ['vmath.vector3(1, "2", 3)', "vmath.vector3"],
    ["vmath.vector3(1, 2, 3) + vmath.vector4(1, 2, 3, 4)", "vector3"],
  ])("x = %s fails naming %s", (expression, named) => {
    expect(messageOf(evaluateLua(`____properties = { x = ${expression} }`))).toContain(named);
  });

  test.each<[string, PropertyValue]>([
    ["vmath.vector3()", { kind: "vector3", value: [0, 0, 0] }],
    ["vmath.vector3(2)", { kind: "vector3", value: [2, 2, 2] }],
    ["vmath.vector3(vmath.vector3(1, 2, 3))", { kind: "vector3", value: [1, 2, 3] }],
    ["vmath.vector4()", { kind: "vector4", value: [0, 0, 0, 0] }],
    ["vmath.vector4(3)", { kind: "vector4", value: [3, 3, 3, 3] }],
    ["vmath.quat()", { kind: "quat", value: [0, 0, 0, 1] }],
    ["vmath.quat(vmath.quat(1, 2, 3, 4))", { kind: "quat", value: [1, 2, 3, 4] }],
    ["-vmath.vector3(1, 2, 3)", { kind: "vector3", value: [-1, -2, -3] }],
    ["2 * vmath.vector4(1, 1, 1, 1)", { kind: "vector4", value: [2, 2, 2, 2] }],
    ["vmath.vector3(1, 2, 3) * 2", { kind: "vector3", value: [2, 4, 6] }],
    ["vmath.vector3(1, 2, 3) - vmath.vector3(1, 1, 1)", { kind: "vector3", value: [0, 1, 2] }],
    ["vmath.quat(1, 0, 0, 0) * vmath.quat(0, 1, 0, 0)", { kind: "quat", value: [0, 0, 1, 0] }],
    ["vmath.quat_rotation_x(0)", { kind: "quat", value: [0, 0, 0, 1] }],
    ["vmath.vector3(1, 2, 3).y", { kind: "number", value: 2 }],
    ["vmath.vector3(1, 2, 3) == vmath.vector3(1, 2, 3)", { kind: "boolean", value: true }],
    ['hash("a") == hash("a")', { kind: "boolean", value: true }],
    ["tostring(vmath.vector3(1, 2.5, 3))", { kind: "string", value: "vmath.vector3(1, 2.5, 3)" }],
    ["msg.url()", { kind: "url", value: "" }],
    ['msg.url("#sprite")', { kind: "url", value: "#sprite" }],
    ['msg.url("", "/player", "")', { kind: "url", value: "/player" }],
    ['resource.texture("/t.png")', { kind: "resource", resource: "texture", path: "/t.png" }],
    ["resource.atlas()", { kind: "resource", resource: "atlas" }],
  ])("x = %s", (expression, expected) => {
    expect(valuesOf(evaluateLua(`____properties = { x = ${expression} }`))).toEqual({
      x: expected,
    });
  });

  test("a component write changes the vector", () => {
    expect(
      valuesOf(
        evaluateLua("local v = vmath.vector3(1, 2, 3)\nv.x = 5\n____properties = { x = v }"),
      ),
    ).toEqual({ x: { kind: "vector3", value: [5, 2, 3] } });
  });
});
