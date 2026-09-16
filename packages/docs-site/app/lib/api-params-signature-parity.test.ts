import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { normalizedFunctionSignature, symbolIdentityKey } from "@defold-typescript/types";
import { type ApiSymbolParam, apiModuleSymbols, mapDocType } from "./api-surface";
import { loadApiSurface, loadCombinedSurface } from "./api-surface-loader";
import { combinedNamespaceToApiPage, type SlotTypes } from "./combined-surface";

const REAL_TYPES_DIR = join(import.meta.dir, "../../../types");

const combined = loadCombinedSurface(REAL_TYPES_DIR);

interface Slot {
  readonly namespace: string;
  readonly symbol: string;
  readonly signature: string;
  readonly kind: "param" | "return";
  readonly name: string;
  readonly rendered: string;
  readonly backed: boolean;
}

// Every top-level Parameters/Returns entry the `/api` pages render, paired with
// the signature printed above it. `backed` records whether the entry took its
// type from the emitter artifact or from the `mapDocType` fallback, so the two
// populations can be asserted separately instead of averaged together.
function walkSlots(): Slot[] {
  const out: Slot[] = [];
  for (const ns of combined.namespaces) {
    const page = combinedNamespaceToApiPage(ns);
    const slotMap = page.authoritativeSlotTypes;
    // The artifact slots for each FQN's primary (authoritative) row, resolved
    // through the same exact identity the render layer uses. A name with several
    // ref-doc entries renders its first as the primary row, matching the walk in
    // `apiModuleSymbols`.
    const primarySlots = new Map<string, SlotTypes | undefined>();
    for (const fn of ns.module.functions) {
      if (primarySlots.has(fn.name)) continue;
      primarySlots.set(
        fn.name,
        slotMap?.get(
          symbolIdentityKey({
            namespace: ns.namespace,
            kind: "FUNCTION",
            name: fn.name,
            signature: normalizedFunctionSignature(fn),
          }),
        ),
      );
    }
    const seen = new Set<string>();
    for (const symbol of apiModuleSymbols(page)) {
      if (symbol.kind !== "function") continue;
      // Only the first row per FQN is the primary one; the authored-override arms
      // that follow render declarations the emitter never produced.
      const isPrimary = !seen.has(symbol.name);
      seen.add(symbol.name);
      const slots = isPrimary ? primarySlots.get(symbol.name) : undefined;
      const collect = (list: readonly ApiSymbolParam[], kind: "param" | "return"): void => {
        for (const [index, p] of list.entries()) {
          out.push({
            namespace: ns.namespace,
            symbol: symbol.name,
            signature: symbol.signature,
            kind,
            name: p.name,
            rendered: p.types.join(" | "),
            backed: slots !== undefined && `${kind}:${index}:${p.name}` in slots,
          });
        }
      };
      collect(symbol.parameters, "param");
      collect(symbol.returnValues, "return");
    }
  }
  return out;
}

const slots = walkSlots();
const backed = slots.filter((s) => s.backed);
const fallback = slots.filter((s) => !s.backed);

describe("rendered slot types agree with the signature above them", () => {
  test("the walk reaches both populations, so neither assertion passes vacuously", () => {
    expect(slots.length).toBeGreaterThan(1500);
    // The emitter covers the engine surface, so the artifact must carry the
    // large majority of it; a filter that quietly empties the set reds here.
    expect(backed.length / slots.length).toBeGreaterThan(0.6);
    // Override-supplied FQNs and lua-stdlib symbols keep the token render, so an
    // empty fallback set would mean the exclusion below stopped excluding anything.
    expect(fallback.length).toBeGreaterThan(0);
  });

  test("every artifact-backed slot type appears verbatim in its own signature", () => {
    const mismatches = backed
      .filter((s) => !s.signature.includes(s.rendered))
      .map((s) => `${s.symbol} ${s.kind}:${s.name} — ${s.rendered} not in ${s.signature}`);
    expect(mismatches).toEqual([]);
  });

  test("no slot still renders the opaque placeholder its signature recovered from", () => {
    const contradictions = backed
      .filter(
        (s) =>
          (s.rendered.includes("Record<string | number, unknown>") ||
            s.rendered === 'Opaque<"constant">') &&
          !s.signature.includes(s.rendered),
      )
      .map((s) => `${s.symbol} ${s.kind}:${s.name}`);
    expect(contradictions).toEqual([]);
  });

  test("the curated slots this gate exists for render their recovered types", () => {
    const render = combined.namespaces.find((ns) => ns.namespace === "render");
    if (!render) throw new Error("render namespace missing from the combined surface");
    const symbols = apiModuleSymbols(combinedNamespaceToApiPage(render));

    const clear = symbols.find((s) => s.name === "render.clear");
    expect(clear?.parameters[0]?.types[0]).toContain("LuaMap<");
    expect(clear?.parameters[0]?.types[0]).toContain('__brand: "graphics.BUFFER_TYPE_COLOR0_BIT"');
    expect(clear?.parameters[0]?.types[0]).not.toContain("Record<string | number, unknown>");

    const enableState = symbols.find((s) => s.name === "render.enable_state");
    expect(enableState?.parameters[0]?.types[0]).toContain('__brand: "graphics.STATE_DEPTH_TEST"');
    expect(enableState?.parameters[0]?.types[0]).not.toContain('Opaque<"constant">');
  });

  test("a lua-stdlib page the artifact never covers still renders its slot types", () => {
    const pages = loadApiSurface(REAL_TYPES_DIR);
    const stdlib = pages.filter((page) => page.category === "lua-stdlib");
    expect(stdlib.length).toBeGreaterThan(0);
    let checked = 0;
    for (const page of stdlib) {
      expect(page.authoritativeSlotTypes).toBeUndefined();
      const byName = new Map(page.module.functions.map((fn) => [fn.name, fn]));
      for (const symbol of apiModuleSymbols(page)) {
        const source = byName.get(symbol.name);
        if (!source) continue;
        const tokenRender = (list: readonly { types: string[] }[]): string[][] =>
          list.map((p) =>
            p.types
              .map((t) => t.trim())
              .filter(Boolean)
              .map(mapDocType),
          );
        expect(symbol.parameters.map((p) => p.types)).toEqual(tokenRender(source.parameters));
        expect(symbol.returnValues.map((p) => p.types)).toEqual(tokenRender(source.returnValues));
        checked += symbol.parameters.length + symbol.returnValues.length;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  test("fallback slots stay live on the token render rather than being dropped", () => {
    expect(fallback.every((s) => s.rendered.length > 0)).toBe(true);
    // The fallback population is real symbols, not a single stray entry.
    expect(new Set(fallback.map((s) => s.symbol)).size).toBeGreaterThan(1);
  });
});
