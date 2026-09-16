import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import committed from "../api-signatures.json" with { type: "json" };
import { OVERLOAD_COVERED_SKIPS } from "../src/emit-dts";
import { selectCompleteVersionSurfaces } from "./generate-api-availability";
import {
  buildSignaturesArtifact,
  type SignaturesArtifact,
  serializeSignaturesArtifact,
  withheldSymbols,
} from "./generate-api-signatures";
import { loadApiTargets, loadTargetModules } from "./regen";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");
const SIGNATURES_PATH = resolve(PACKAGE_ROOT, "api-signatures.json");

// The committed version axis, read from the same production selector the
// artifact builder uses, so a version rotation needs no edit here.
const COMPLETE_TARGETS = selectCompleteVersionSurfaces(loadApiTargets());
const CURRENT_VERSION = (COMPLETE_TARGETS.find((t) => t.default)?.id ?? "").replace(/^defold-/, "");

function committedDtsBlob(version: string): string {
  const dir =
    version === CURRENT_VERSION
      ? resolve(PACKAGE_ROOT, "generated")
      : resolve(PACKAGE_ROOT, "generated", "versions", `defold-${version}`);
  return readdirSync(dir)
    .filter((file) => file.endsWith(".d.ts"))
    .map((file) => readFileSync(resolve(dir, file), "utf8"))
    .join("\n");
}

describe("authoritative signature artifact", () => {
  const artifact = buildSignaturesArtifact();

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
    for (const entry of loadTargetModules(target, PACKAGE_ROOT)) {
      for (const { key } of withheldSymbols(entry)) keys.add(key);
    }
    return keys;
  };

  test("every generated authoritative signature appears verbatim in that version's committed .d.ts", () => {
    for (const target of COMPLETE_TARGETS) {
      const version = target.id.replace(/^defold-/, "");
      const perSymbol = artifact.versions[version] as Record<string, string>;
      const folded = foldedKeysFor(target);
      const blob = committedDtsBlob(version);
      const missing = Object.entries(perSymbol).filter(
        ([key, signature]) => !folded.has(key) && !blob.includes(signature),
      );
      expect(missing).toEqual([]);
      // The exclusion must not swallow the whole assertion.
      expect(Object.keys(perSymbol).length).toBeGreaterThan(folded.size * 10);
    }
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
      "constants: Record<string, { type?: number; value?:",
    );
    expect(find("material", "material.set_vertex_attributes")).toContain(
      "attributes: Record<string, {",
    );
    // The 7 compute/material getters render as array-of-records.
    for (const [ns, name] of [
      ["compute", "compute.get_constants"],
      ["compute", "compute.get_samplers"],
      ["compute", "compute.get_textures"],
      ["material", "material.get_constants"],
      ["material", "material.get_samplers"],
      ["material", "material.get_textures"],
      ["material", "material.get_vertex_attributes"],
    ] as const) {
      expect(find(ns, name)).toMatch(/\}\[\];$/);
    }
  });
});

// A skipped symbol is withheld from `generateModuleSignatures`, so without the
// authored fold it vanishes from this artifact — and the canonical `/api/<ns>`
// page, which reads only this artifact, renders an empty signature for a symbol
// the surface really ships.
describe("hand-authored symbols survive the skip filter", () => {
  const artifact = buildSignaturesArtifact();

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
});

describe("per-slot rendered types travel with the signature", () => {
  const artifact = buildSignaturesArtifact();

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
    const buffers = artifact.slotTypes[CURRENT_VERSION]?.[key]?.["param:0:buffers"];
    expect(buffers).toContain("LuaMap<");
    expect(buffers).not.toContain("Record<string | number, unknown>");

    const stateKey = functionKey(CURRENT_VERSION, "render", "render.enable_state");
    const state = artifact.slotTypes[CURRENT_VERSION]?.[stateKey]?.["param:0:state"];
    expect(state).toContain('__brand: "graphics.STATE_DEPTH_TEST"');
    expect(state).not.toContain('Opaque<"constant">');
  });

  test("every recorded slot type is a substring of that symbol's own signature", () => {
    const mismatches: string[] = [];
    let compared = 0;
    for (const [version, perSymbol] of Object.entries(artifact.slotTypes)) {
      for (const [key, slots] of Object.entries(perSymbol)) {
        const signature = artifact.versions[version]?.[key];
        expect(signature).toBeDefined();
        for (const [slot, ts] of Object.entries(slots)) {
          compared += 1;
          if (!(signature as string).includes(ts)) {
            mismatches.push(`${version} ${key.split("\0")[2]} ${slot}: ${ts}`);
          }
        }
      }
    }
    expect(mismatches).toEqual([]);
    expect(compared).toBeGreaterThan(1000);
  });

  test("an authored-fold symbol records no slots, so the render falls back", () => {
    for (const target of COMPLETE_TARGETS) {
      const version = target.id.replace(/^defold-/, "");
      for (const entry of loadTargetModules(target, PACKAGE_ROOT)) {
        for (const { key } of withheldSymbols(entry)) {
          expect(artifact.slotTypes[version]?.[key]).toBeUndefined();
        }
      }
    }
  });
});

describe("committed artifact drift gate", () => {
  test("fresh derivation equals the committed api-signatures.json", () => {
    expect(buildSignaturesArtifact()).toEqual(committed as unknown as SignaturesArtifact);
  });

  test("committed api-signatures.json is byte-equal to a fresh serialization", () => {
    const fresh = serializeSignaturesArtifact(buildSignaturesArtifact());
    expect(fresh).toBe(readFileSync(SIGNATURES_PATH, "utf8"));
  });
});
