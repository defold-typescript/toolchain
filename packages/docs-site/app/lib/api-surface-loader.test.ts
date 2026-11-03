import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { apiModuleSymbols } from "@defold-typescript/docs-render/api-surface";
import { SCRIPT_HOOK_NAMES } from "@defold-typescript/types";
import {
  loadApiSurface,
  loadApiSurfaceForVersion,
  loadCombinedSurface,
  loadVersionIndependentPages,
} from "./api-surface-loader";
import { combinedNamespaceToApiPage } from "./combined-surface";

const ENGINE_FIXTURE_DIR = join(import.meta.dir, "__fixtures__/api-surface");
const REAL_TYPES_DIR = join(import.meta.dir, "../../../types");

describe("loadApiSurfaceForVersion — engine + globals only, always prefixed", () => {
  test("the default target's engine pages take the version prefix, with no version-independent page", () => {
    const pages = loadApiSurfaceForVersion(ENGINE_FIXTURE_DIR, "cur");
    for (const page of pages) {
      expect(page.category).toBe("engine");
      expect(page.route).toBe(`/api/cur/${page.namespace}`);
    }
    expect(pages.some((p) => p.category === "lua-stdlib")).toBe(false);
    expect(pages.some((p) => p.category === "global-type")).toBe(false);
    expect(pages.some((p) => p.namespace === "camera")).toBe(true);
    expect(pages.some((p) => p.namespace === "globals")).toBe(true);
  });

  test("a non-default target emits no lua-stdlib copy", () => {
    const pages = loadApiSurfaceForVersion(ENGINE_FIXTURE_DIR, "old");
    expect(pages.some((p) => p.category === "lua-stdlib")).toBe(false);
    expect(pages.find((p) => p.namespace === "wmath")?.route).toBe("/api/old/wmath");
  });
});

describe("loadVersionIndependentPages", () => {
  test("emits the default target's lua-stdlib at canonical /api/<ns>, no engine page", () => {
    const pages = loadVersionIndependentPages(ENGINE_FIXTURE_DIR);
    const lua = pages.filter((p) => p.category === "lua-stdlib");
    expect(lua.map((p) => p.namespace).sort()).toEqual(["base", "bit"]);
    expect(lua.find((p) => p.namespace === "base")?.route).toBe("/api/base");
    expect(pages.some((p) => p.category === "engine")).toBe(false);
  });
});

describe("engine pages withhold the overloads the declarations withhold", () => {
  const typed = (fn: { parameters: { name: string; types: string[] }[] }, param: string) =>
    fn.parameters.find((p) => p.name === param)?.types;

  test("each 1.13 b2d.body page drops the handle forms and keeps the table forms", () => {
    for (const id of ["defold-1.13.0", "defold-1.13.1"]) {
      const page = loadApiSurfaceForVersion(REAL_TYPES_DIR, id).find(
        (p) => p.namespace === "b2d.body",
      );
      const named = (name: string) =>
        page?.module.functions.filter((fn) => fn.name === `b2d.body.${name}`) ?? [];
      const fixture = named("create_fixture");
      const massData = named("set_mass_data");
      expect(fixture.map((fn) => typed(fn, "shape"))).not.toContainEqual(["b2Shape"]);
      expect(massData.map((fn) => typed(fn, "data"))).not.toContainEqual(["b2MassData"]);
      expect(fixture.map((fn) => typed(fn, "definition"))).toContainEqual(["table"]);
      expect(massData.map((fn) => typed(fn, "data"))).toContainEqual(["table"]);
    }
  });

  test("the combined b2d.body page carries one curated signature per withheld name", () => {
    const ns = loadCombinedSurface(REAL_TYPES_DIR).namespaces.find(
      (n) => n.namespace === "b2d.body",
    );
    const entries = (name: string) =>
      ns?.entries.filter((e) => e.identity.name === `b2d.body.${name}`) ?? [];
    for (const name of ["create_fixture", "set_mass_data"]) {
      const [entry, ...rest] = entries(name);
      expect(rest).toHaveLength(0);
      expect(entry?.authoritativeSignature).not.toBe("");
      expect(entry?.authoritativeSignature).not.toContain("Record<string | number, unknown>");
    }
    expect(entries("set_mass_data")[0]?.authoritativeSignature).toContain("data: b2d.MassData");
  });
});

describe("engine pages route a function to the namespace that owns it", () => {
  const MOVED = [
    "bullet3d.collision_object.get_shape",
    "bullet3d.collision_object.get_shape_count",
    "bullet3d.collision_object.get_shapes",
  ];

  test("the exact-version page lists each moved function under its owning namespace only", () => {
    const pages = loadApiSurfaceForVersion(REAL_TYPES_DIR, "defold-1.13.2");
    const functionsOf = (namespace: string) =>
      pages.find((page) => page.namespace === namespace)?.module.functions.map((fn) => fn.name) ??
      [];
    const owner = functionsOf("bullet3d.collision_object");
    const shape = functionsOf("bullet3d.shape");
    for (const name of MOVED) {
      expect(owner).toContain(name);
      expect(shape).not.toContain(name);
    }
  });

  test("the Combined surface joins each moved function to an authoritative signature", () => {
    const { namespaces } = loadCombinedSurface(REAL_TYPES_DIR);
    const owner = namespaces.find((ns) => ns.namespace === "bullet3d.collision_object");
    const shape = namespaces.find((ns) => ns.namespace === "bullet3d.shape");
    const ownerFunctions = owner?.module.functions.map((fn) => fn.name) ?? [];
    for (const name of MOVED) {
      expect(ownerFunctions).toContain(name);
      const entry = owner?.entries.find((e) => e.identity.name === name);
      expect(entry?.identity.namespace).toBe("bullet3d.collision_object");
      expect(entry?.authoritativeSignature).not.toBe("");
      expect(shape?.module.functions.map((fn) => fn.name) ?? []).not.toContain(name);
      expect(shape?.entries.map((e) => e.identity.name) ?? []).not.toContain(name);
    }
  });
});

describe("lifecycle hooks are not listed as go or gui functions", () => {
  const CONTROLS = { go: "go.get_position", gui: "gui.get_node" } as const;
  const isHook = (namespace: string, name: string): boolean =>
    SCRIPT_HOOK_NAMES.some((hook) => name === hook || name === `${namespace}.${hook}`);
  const functionNames = (page: Parameters<typeof apiModuleSymbols>[0]): string[] =>
    apiModuleSymbols(page)
      .filter((symbol) => symbol.kind === "function")
      .map((symbol) => symbol.name);

  test("the go and gui pages list no hook", () => {
    const pages = loadApiSurface(REAL_TYPES_DIR);
    for (const [namespace, control] of Object.entries(CONTROLS)) {
      const page = pages.find((p) => p.category === "engine" && p.namespace === namespace);
      if (!page) throw new Error(`${namespace} page missing`);
      const names = functionNames(page);
      expect(names).toContain(control);
      expect(names.filter((name) => isHook(namespace, name))).toEqual([]);
    }
  });

  test("the combined go and gui pages list no hook", () => {
    const combined = loadCombinedSurface(REAL_TYPES_DIR);
    for (const [namespace, control] of Object.entries(CONTROLS)) {
      const ns = combined.namespaces.find((n) => n.namespace === namespace);
      if (!ns) throw new Error(`combined ${namespace} namespace missing`);
      const names = functionNames(combinedNamespaceToApiPage(ns));
      expect(names).toContain(control);
      expect(names.filter((name) => isHook(namespace, name))).toEqual([]);
    }
  });
});
