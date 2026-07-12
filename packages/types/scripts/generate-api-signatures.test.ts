import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import committed from "../api-signatures.json" with { type: "json" };
import {
  buildSignaturesArtifact,
  type SignaturesArtifact,
  serializeSignaturesArtifact,
} from "./generate-api-signatures";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");
const SIGNATURES_PATH = resolve(PACKAGE_ROOT, "api-signatures.json");

function committedDtsBlob(version: string): string {
  const dir =
    version === "1.13.0"
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
    expect(Object.keys(artifact.versions).sort()).toEqual(["1.12.4", "1.13.0"]);
    for (const perSymbol of Object.values(artifact.versions)) {
      expect(Object.keys(perSymbol).length).toBeGreaterThan(500);
      expect(Object.values(perSymbol).every((s) => typeof s === "string" && s.length > 0)).toBe(
        true,
      );
    }
  });

  test("every authoritative signature appears verbatim in that version's committed .d.ts", () => {
    for (const [version, perSymbol] of Object.entries(artifact.versions)) {
      const blob = committedDtsBlob(version);
      const missing = Object.entries(perSymbol).filter(
        ([, signature]) => !blob.includes(signature),
      );
      expect(missing).toEqual([]);
    }
  });

  test("the audited drift cases resolve to their curated declaration-backed shapes", () => {
    const v13 = artifact.versions["1.13.0"] as Record<string, string>;
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

describe("committed artifact drift gate", () => {
  test("fresh derivation equals the committed api-signatures.json", () => {
    expect(buildSignaturesArtifact()).toEqual(committed as unknown as SignaturesArtifact);
  });

  test("committed api-signatures.json is byte-equal to a fresh serialization", () => {
    const fresh = serializeSignaturesArtifact(buildSignaturesArtifact());
    expect(fresh).toBe(readFileSync(SIGNATURES_PATH, "utf8"));
  });
});
