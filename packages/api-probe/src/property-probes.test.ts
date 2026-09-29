import { describe, expect, test } from "bun:test";
import { PROPERTY_DENYLIST } from "./probe-denylist";
import { callsFor, propertyProbes } from "./property-probes";
import { generateProbes, PROBE_FILES } from "./witness";

const generation = propertyProbes();
const byKey = new Map(
  generation.probes.map((probe) => [`${probe.catalog}.${probe.member}`, probe]),
);

describe("property probes", () => {
  test("every shipped catalog is read, overlays included, each against its probe component", () => {
    expect([...new Set(generation.probes.map((probe) => probe.catalog))].sort()).toEqual([
      "camera",
      "go",
      "gui",
      "label",
      "mesh",
      "model",
      "particlefx",
      "physics",
      "sound",
      "sprite",
      "tilemap",
    ]);
    expect(generation.untargeted).toEqual([]);
    expect(byKey.get("sprite.cursor")).toEqual({
      catalog: "sprite",
      member: "cursor",
      kinds: ["number"],
      target: "SPRITE",
      readonly: false,
    });
    expect(byKey.get("sprite.texture0")?.kinds).toEqual(["hash"]);
    expect(byKey.get("mesh.vertices")?.target).toBe("MESH");
    expect(byKey.get("camera.projection")?.kinds).toEqual(["matrix4"]);
    expect(byKey.get("go.scale")?.kinds).toEqual(["number", "vector3"]);
    expect(byKey.get("label.scale")?.kinds).toEqual(["vector3"]);
    expect(byKey.get("go.position")?.target).toBe("GO");
    expect(byKey.get("physics.mass")?.target).toBe("COLLISION");
  });

  test("a keyed gui catalog member addresses one of the probe gui's resources", () => {
    expect(byKey.get("gui.textures")?.options).toBe('{ key: "probe" }');
    expect(byKey.get("gui.fonts")?.options).toBe('{ key: "default" }');
    expect(byKey.get("gui.material")?.options).toBeUndefined();
  });

  test("every catalog member is probed or denied, and every denial names a catalog member", () => {
    const members = new Set([...byKey.keys(), ...generation.denied]);
    for (const key of Object.keys(PROPERTY_DENYLIST)) expect(members).toContain(key);
    for (const key of generation.denied) expect(byKey.has(key)).toBe(false);
  });

  test("a probed member reads its value and writes the same value back", () => {
    const calls = generation.calls.filter((call) => call.name === "sprite.properties.cursor");
    expect(calls.map((call) => [call.variant, call.kind, call.call])).toEqual([
      ["get", "go", 'go.get<sprite.properties>()(SPRITE, "cursor")'],
      [
        "set",
        "go",
        'go.set<sprite.properties>()(SPRITE, "cursor", go.get<sprite.properties>()(SPRITE, "cursor"))',
      ],
    ]);
    expect(calls[0]?.returns).toEqual({ kinds: [["number"]], variadic: false });
    const keyed = generation.calls.find(
      (call) => call.name === "gui.properties.textures" && call.variant === "set",
    );
    expect(keyed?.call).toBe(
      'go.set<gui.properties>()(GUI, "textures", go.get<gui.properties>()(GUI, "textures", { key: "probe" }), { key: "probe" })',
    );
  });

  test("a writable union member is also written once with each kind it declares", () => {
    const calls = generation.calls.filter((call) => call.name === "go.properties.scale");
    expect(calls.map((call) => [call.variant, call.call])).toEqual([
      ["get", 'go.get<go.properties>()(GO, "scale")'],
      ["set", 'go.set<go.properties>()(GO, "scale", go.get<go.properties>()(GO, "scale"))'],
      ["set-number", 'go.set<go.properties>()(GO, "scale", 1)'],
      ["set-vector3", 'go.set<go.properties>()(GO, "scale", vmath.vector3(1, 1, 1))'],
    ]);
  });

  test("a readonly union member gets no per-kind writes", () => {
    const scale = byKey.get("go.scale");
    if (scale === undefined) throw new Error("go.scale is not probed");
    const variants = callsFor({ ...scale, readonly: true }).map((call) => call.variant);
    expect(variants).toEqual(["get", "set"]);
  });

  test("a member the catalog declares readonly gets a write that must be refused", () => {
    expect(byKey.get("sprite.animation")?.readonly).toBe(true);
    const set = generation.calls.find(
      (call) => call.name === "sprite.properties.animation" && call.variant === "set",
    );
    expect(set?.readonlySet).toBe(true);
    const go = generateProbes(undefined, "v2").files[PROBE_FILES.go] ?? "";
    expect(go).toContain(
      '    probe("sprite.properties.animation", "set", () =>\n      // @ts-expect-error\n',
    );
  });

  test("the stock-engine pass renders the property calls into the go script", () => {
    const v2 = generateProbes(undefined, "v2");
    const v3 = generateProbes(undefined, "v3");
    expect(v2.files[PROBE_FILES.go]).toContain(
      'probe("sprite.properties.cursor", "get", () => go.get<sprite.properties>()(SPRITE, "cursor"));',
    );
    expect(v3.calls.some((call) => call.name.includes(".properties."))).toBe(false);
  });
});
