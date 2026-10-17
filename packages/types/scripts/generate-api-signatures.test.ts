import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import committed from "../api-signatures.json" with { type: "json" };
import { OVERLOAD_COVERED_SKIPS } from "../src/emit-dts";
import { splitTopLevel } from "../src/luals-type-expr";
import { signatureArmsFor } from "../src/signature-store";
import { targetBindingOptions } from "./binding-pin";
import { selectCompleteVersionSurfaces } from "./generate-api-availability";
import {
  buildSignaturesArtifact,
  type SignaturesArtifact,
  serializeSignaturesArtifact,
  withheldSymbols,
} from "./generate-api-signatures";
import { loadApiTargets, loadTargetModules } from "./regen";
import { loadSignatureFile } from "./signature-store-fs";
import { compareVersions } from "./target-version";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");
const SIGNATURES_PATH = resolve(PACKAGE_ROOT, "api-signatures.json");
// The options `generate-api-signatures --write` builds the committed artifact with.
const COMMITTED_OPTIONS = {
  emitOptionsOf: (target: Parameters<typeof targetBindingOptions>[0]) =>
    targetBindingOptions(target),
};

// The committed version axis, read from the same production selector the
// artifact builder uses, so a version rotation needs no edit here.
const COMPLETE_TARGETS = selectCompleteVersionSurfaces(loadApiTargets());
const CURRENT_VERSION = (COMPLETE_TARGETS.find((t) => t.default)?.id ?? "").replace(/^defold-/, "");

function committedDtsDir(version: string): string {
  return version === CURRENT_VERSION
    ? resolve(PACKAGE_ROOT, "generated")
    : resolve(PACKAGE_ROOT, "generated", "versions", `defold-${version}`);
}

function committedDtsBlob(version: string): string {
  const dir = committedDtsDir(version);
  return readdirSync(dir)
    .filter((file) => file.endsWith(".d.ts"))
    .map((file) => readFileSync(resolve(dir, file), "utf8"))
    .join("\n");
}

describe("authoritative signature artifact", () => {
  const artifact = buildSignaturesArtifact(COMMITTED_OPTIONS);

  test("emits one signature string per emitted symbol per committed version", () => {
    expect(Object.keys(artifact.versions).sort()).toEqual(
      COMPLETE_TARGETS.map((t) => t.id.replace(/^defold-/, "")).sort(),
    );
    for (const perSymbol of Object.values(artifact.versions)) {
      expect(Object.keys(perSymbol).length).toBeGreaterThan(500);
      expect(Object.values(perSymbol).every((s) => typeof s === "string" && s.length > 0)).toBe(
        true,
      );
    }
  });

  // Folded authored entries are excluded: they are rendered call forms from
  // `signatures/<ns>.json`, not declaration text, and they are declared in
  // `src/*-overloads.d.ts` rather than in the generated modules this blob reads.
  // `overloads-signature-parity` is what pins that store to its declarations.
  const foldedKeysFor = (target: (typeof COMPLETE_TARGETS)[number]): Set<string> => {
    const keys = new Set<string>();
    const surface = loadTargetModules(target, PACKAGE_ROOT);
    for (const entry of surface) {
      for (const { key } of withheldSymbols(entry, surface)) keys.add(key);
    }
    return keys;
  };

  // A struct signs as its interface on one line, while the .d.ts spreads its
  // members over lines with doc comments between them, so each member line is
  // what appears verbatim.
  const declaredIn = (blob: string, signature: string): boolean => {
    const struct = /^interface \w+ \{ (.*) \}$/.exec(signature);
    if (struct === null) return signature.split("\n").every((arm) => blob.includes(arm));
    return splitTopLevel(struct[1] as string, ";")
      .map((member) => member.trim())
      .filter((member) => member.length > 0)
      .every((member) => blob.includes(`${member};`));
  };

  test("every generated authoritative signature appears verbatim in that version's committed .d.ts", () => {
    for (const target of COMPLETE_TARGETS) {
      const version = target.id.replace(/^defold-/, "");
      const perSymbol = artifact.versions[version] as Record<string, string>;
      const folded = foldedKeysFor(target);
      const blob = committedDtsBlob(version);
      const missing = Object.entries(perSymbol).filter(
        ([key, signature]) => !folded.has(key) && !declaredIn(blob, signature),
      );
      expect(missing).toEqual([]);
      // The exclusion must not swallow the whole assertion.
      expect(Object.keys(perSymbol).length).toBeGreaterThan(folded.size * 10);
    }
  });

  test("every b2d.shape function lists each arm its version's committed b2d_shape.d.ts declares", () => {
    let checked = 0;
    for (const target of COMPLETE_TARGETS) {
      const version = target.id.replace(/^defold-/, "");
      const file = resolve(committedDtsDir(version), "b2d_shape.d.ts");
      if (!existsSync(file)) continue;
      const declared = readFileSync(file, "utf8")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("function "));
      const perSymbol = artifact.versions[version] as Record<string, string>;
      const entries = Object.entries(perSymbol).filter(([key]) => {
        const [ns, kind] = key.split("\0");
        return ns === "b2d.shape" && kind === "FUNCTION";
      });
      expect(entries.length).toBeGreaterThan(0);
      for (const [key, signature] of entries) {
        const name = (key.split("\0")[2] ?? "").slice("b2d.shape.".length);
        const arms = declared.filter((line) => line.startsWith(`function ${name}(`));
        expect({ key, arms: signature.split("\n") }).toEqual({ key, arms });
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  test("the audited drift cases resolve to their curated declaration-backed shapes", () => {
    const v13 = artifact.versions[CURRENT_VERSION] as Record<string, string>;
    const find = (namespace: string, name: string): string => {
      const hit = Object.entries(v13).find(([key]) => {
        const [ns, kind, symbolName] = key.split("\0");
        return ns === namespace && kind === "FUNCTION" && symbolName === name;
      });
      if (!hit) throw new Error(`no signature for ${name}`);
      return hit[1];
    };
    expect(find("model", "model.set_blend_weights")).toContain("weights?: number[]");
    expect(find("compute", "compute.set_constants")).toContain(
      "Record<string, material.constant_options>",
    );
    expect(find("material", "material.set_vertex_attributes")).toContain(
      "Record<string, material.vertex_attribute_options>",
    );
    // The 6 compute/material getters render as arrays of records, inline or the
    // named `material.*_info` structs 1.13.2 declares.
    for (const [ns, name] of [
      ["compute", "compute.get_constants"],
      ["compute", "compute.get_samplers"],
      ["compute", "compute.get_textures"],
      ["material", "material.get_constants"],
      ["material", "material.get_samplers"],
      ["material", "material.get_vertex_attributes"],
    ] as const) {
      expect(find(ns, name)).toMatch(/(\}|\bmaterial\.\w+_info)\[\];$/);
    }
    // The material's textures are keyed by sampler slot, with holes.
    expect(find("material", "material.get_textures")).toMatch(
      /: LuaMap<number, material\.texture_info>;$/,
    );
  });
});

// A skipped symbol is withheld from `generateModuleSignatures`, so without the
// authored fold it vanishes from this artifact — and the canonical `/api/<ns>`
// page, which reads only this artifact, renders an empty signature for a symbol
// the surface really ships.
describe("hand-authored symbols survive the skip filter", () => {
  const artifact = buildSignaturesArtifact(COMMITTED_OPTIONS);

  const declaredSkips = (target: (typeof COMPLETE_TARGETS)[number]): string[] => {
    const out: string[] = [];
    for (const fqn of OVERLOAD_COVERED_SKIPS) {
      const dot = fqn.indexOf(".");
      const module = target.modules.find((m) => m.namespace === fqn.slice(0, dot));
      if (module && (module.skipFunctions ?? []).includes(fqn.slice(dot + 1))) out.push(fqn);
    }
    return out;
  };

  const symbolNamesIn = (version: string): Set<string> => {
    const names = new Set<string>();
    for (const key of Object.keys(artifact.versions[version] ?? {})) {
      const [, kind, symbolName] = key.split("\0");
      if (kind === "FUNCTION") names.add(symbolName as string);
    }
    return names;
  };

  for (const target of COMPLETE_TARGETS) {
    const version = target.id.replace(/^defold-/, "");

    test(`${version} carries every overload-covered skip it declares`, () => {
      const expected = declaredSkips(target);
      expect(expected.length).toBeGreaterThan(0);
      const present = symbolNamesIn(version);
      expect(expected.filter((fqn) => !present.has(fqn))).toEqual([]);
    });

    test(`${version} folds authored declarations without inventing entries`, () => {
      const present = symbolNamesIn(version);
      // Neither generated on this surface nor hand-authored anywhere: the fold
      // adds only what a store really declares.
      expect(present.has("vmath.not_a_real_function")).toBe(false);
      expect(present.has("render.not_a_real_function")).toBe(false);
    });
  }

  test("each target folds exactly the store arms its version declares", () => {
    let withheldArms = 0;
    let gatedArms = 0;
    for (const target of COMPLETE_TARGETS) {
      const version = target.id.replace(/^defold-/, "");
      const perSymbol = artifact.versions[version] ?? {};
      const surface = loadTargetModules(target, PACKAGE_ROOT);
      for (const entry of surface) {
        const store = loadSignatureFile(
          resolve(PACKAGE_ROOT, "signatures", `${entry.namespace}.json`),
        );
        for (const { key, fqn } of withheldSymbols(entry, surface)) {
          const override = store[fqn];
          if (override === undefined) continue;
          const lines = perSymbol[key]?.split("\n") ?? [];
          expect({ version, fqn, lines }).toEqual({
            version,
            fqn,
            lines: signatureArmsFor(override, version).signatures,
          });
          withheldArms += override.signatures.length - lines.length;
          // The import gate's own comparison, so an arm folds on exactly the
          // targets whose surface imports the file declaring it.
          for (const [index, since] of (override.since ?? []).entries()) {
            if (since === null) continue;
            gatedArms++;
            const arm = override.signatures[index] as string;
            expect({ version, arm, folded: lines.includes(arm) }).toEqual({
              version,
              arm,
              folded: compareVersions(version, since) >= 0,
            });
          }
        }
      }
    }
    expect(gatedArms).toBeGreaterThan(0);
    expect(withheldArms).toBeGreaterThan(0);
  });
});

describe("per-slot rendered types travel with the signature", () => {
  const artifact = buildSignaturesArtifact(COMMITTED_OPTIONS);

  const functionKey = (version: string, namespace: string, name: string): string => {
    const hit = Object.keys(artifact.versions[version] ?? {}).find((key) => {
      const [ns, kind, symbolName] = key.split("\0");
      return ns === namespace && kind === "FUNCTION" && symbolName === name;
    });
    if (!hit) throw new Error(`no signature for ${name}`);
    return hit;
  };

  test("the slot map spans the same version axis as the signature map", () => {
    expect(Object.keys(artifact.slotTypes).sort()).toEqual(Object.keys(artifact.versions).sort());
  });

  test("a curated slot carries the recovered type the token map cannot reach", () => {
    const key = functionKey(CURRENT_VERSION, "render", "render.clear");
    const buffers = artifact.slotTypes[CURRENT_VERSION]?.[key]?.["param:0:buffers"]?.type;
    expect(buffers).toContain("LuaMap<");
    expect(buffers).not.toContain("Record<string | number, unknown>");

    const stateKey = functionKey(CURRENT_VERSION, "render", "render.enable_state");
    const state = artifact.slotTypes[CURRENT_VERSION]?.[stateKey]?.["param:0:state"]?.type;
    expect(state).toBe("graphics.State");
    expect(state).not.toContain('Opaque<"constant">');
  });

  test("a param record carries the optionality its declaration prints", () => {
    const slot = (namespace: string, name: string, slotKey: string) =>
      artifact.slotTypes[CURRENT_VERSION]?.[functionKey(CURRENT_VERSION, namespace, name)]?.[
        slotKey
      ];
    expect(slot("collectionfactory", "collectionfactory.get_status", "param:0:url")).toEqual({
      type: "string | Hash | Url",
      optional: false,
    });
    expect(slot("camera", "camera.get_fov", "param:0:camera")?.optional).toBe(true);
    expect(
      slot("collectionfactory", "collectionfactory.set_prototype", "param:1:prototype"),
    ).toEqual({ type: "string | undefined", optional: false });
  });

  test("every recorded slot type is a substring of that symbol's own signature", () => {
    const mismatches: string[] = [];
    let compared = 0;
    for (const [version, perSymbol] of Object.entries(artifact.slotTypes)) {
      for (const [key, slots] of Object.entries(perSymbol)) {
        const signature = artifact.versions[version]?.[key];
        expect(signature).toBeDefined();
        for (const [slot, { type }] of Object.entries(slots)) {
          compared += 1;
          if (!(signature as string).includes(type)) {
            mismatches.push(`${version} ${key.split("\0")[2]} ${slot}: ${type}`);
          }
        }
      }
    }
    expect(mismatches).toEqual([]);
    expect(compared).toBeGreaterThan(1000);
  });

  test("every param record's optionality is the one printed after its name", () => {
    const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const mismatches: string[] = [];
    let compared = 0;
    for (const [version, perSymbol] of Object.entries(artifact.slotTypes)) {
      for (const [key, slots] of Object.entries(perSymbol)) {
        // Slot records describe the primary arm, which is the first line.
        const [primary = ""] = (artifact.versions[version]?.[key] ?? "").split("\n");
        const restStart = primary.indexOf("...");
        for (const [slot, { type, optional }] of Object.entries(slots)) {
          if (!slot.startsWith("param:")) continue;
          compared += 1;
          const printed = new RegExp(
            `[A-Za-z_$][\\w$]*${optional ? "\\?" : ""}: ${escapeRegExp(type)}(?=, |\\))`,
          );
          if (printed.test(primary)) continue;
          // A slot folded into the rest element prints no name of its own.
          if (!optional && restStart !== -1 && primary.slice(restStart).includes(type)) continue;
          mismatches.push(
            `${version} ${key.split("\0")[2]} ${slot}: ${optional ? "?" : ""}${type}`,
          );
        }
      }
    }
    expect(mismatches).toEqual([]);
    expect(compared).toBeGreaterThan(1000);
  });

  test("a key two ref-doc elements share lists both arms and keeps only their common slots", () => {
    const backendVersions = COMPLETE_TARGETS.map((t) => t.id.replace(/^defold-/, "")).filter(
      (version) => compareVersions(version, "1.13.2") >= 0,
    );
    expect(backendVersions.length).toBeGreaterThan(0);
    for (const version of backendVersions) {
      const key = functionKey(version, "b2d.world", "b2d.world.cast_ray");
      const [v2 = "", v3 = "", ...rest] = (artifact.versions[version]?.[key] ?? "").split("\n");
      expect({ version, rest }).toEqual({ version, rest: [] });
      expect(v2).toStartWith('function cast_ray<Backend extends "v2" = "v2">(');
      expect(v2).toEndWith("): LuaMultiReturn<[b2d.fixture_cast_hit[], b2d.tree_stats]>;");
      expect(v3).toStartWith('function cast_ray<Backend extends "v3">(');
      expect(v3).toEndWith("): LuaMultiReturn<[b2d.shape_cast_hit[], b2d.tree_stats]>;");
      const slots = artifact.slotTypes[version]?.[key];
      expect(slots?.["param:3:filter"]).toEqual({ type: "b2d.query_filter", optional: true });
      expect(slots?.["return:1:stats"]).toEqual({ type: "b2d.tree_stats", optional: false });
      expect(slots?.["return:0:hits"]).toBeUndefined();

      const mover = functionKey(version, "b2d.world", "b2d.world.cast_mover");
      expect(artifact.versions[version]?.[mover]?.split("\n")).toHaveLength(1);
      expect(artifact.slotTypes[version]?.[mover]?.["param:1:capsule"]).toEqual({
        type: "b2d.mover_capsule",
        optional: false,
      });
    }
  });

  test("an authored-fold symbol records no slots, so the render falls back", () => {
    for (const target of COMPLETE_TARGETS) {
      const version = target.id.replace(/^defold-/, "");
      const surface = loadTargetModules(target, PACKAGE_ROOT);
      for (const entry of surface) {
        for (const { key } of withheldSymbols(entry, surface)) {
          expect(artifact.slotTypes[version]?.[key]).toBeUndefined();
        }
      }
    }
  });
});

describe("committed artifact drift gate", () => {
  test("fresh derivation equals the committed api-signatures.json", () => {
    expect(buildSignaturesArtifact(COMMITTED_OPTIONS)).toEqual(
      committed as unknown as SignaturesArtifact,
    );
  });

  test("committed api-signatures.json is byte-equal to a fresh serialization", () => {
    const fresh = serializeSignaturesArtifact(buildSignaturesArtifact(COMMITTED_OPTIONS));
    expect(fresh).toBe(readFileSync(SIGNATURES_PATH, "utf8"));
  });
});
