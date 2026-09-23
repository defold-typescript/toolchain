import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { lookupSignature } from "@defold-typescript/types";
import { type ApiSymbolParam, apiModuleSymbols, mapDocType } from "./api-surface";
import { loadApiSurface, loadCombinedSurface } from "./api-surface-loader";
import { combinedNamespaceToApiPage } from "./combined-surface";

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
  /** The row renders no single ref-doc declaration — an authored override arm. */
  readonly unidentified: boolean;
  /** The row's FQN already rendered a row above it — an ordinary later overload. */
  readonly sharedFqn: boolean;
  /** The FQN is covered by an authored override in the production signature store. */
  readonly overrideCovered: boolean;
}

// Every top-level Parameters/Returns entry the `/api` pages render, paired with
// the signature printed above it. Rows are rendered with the production
// translation and signature stores, so the authored-override collapse the site
// performs is the collapse measured here.
//
// `backed` records whether the entry took its type from the emitter artifact or
// from the `mapDocType` fallback, so the two populations can be asserted
// separately instead of averaged together. It is keyed on the row's own
// `declarationIdentity` — the identity the render layer resolved its signature
// and slots through — so every ordinary overload is compared against the
// signature printed above it rather than against the first row of its name.
function walkSlots(): Slot[] {
  const out: Slot[] = [];
  for (const ns of combined.namespaces) {
    const page = combinedNamespaceToApiPage(ns);
    const slotMap = page.authoritativeSlotTypes;
    const emitted = new Set<string>();
    for (const symbol of apiModuleSymbols(page, page.translations, page.signatures)) {
      if (symbol.kind !== "function") continue;
      const identity = symbol.declarationIdentity;
      const slots = identity === undefined ? undefined : slotMap?.get(identity);
      const sharedFqn = emitted.has(symbol.name);
      emitted.add(symbol.name);
      const overrideCovered = lookupSignature(page.signatures, symbol.name) !== null;
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
            unidentified: identity === undefined,
            sharedFqn,
            overrideCovered,
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

  test("the authored-arm exclusion skips arm rows only, for the reason it claims", () => {
    const unidentified = slots.filter((s) => s.unidentified);
    // Non-empty, so the exclusion is exercised rather than vacuous.
    expect(new Set(unidentified.map((s) => `${s.namespace}:${s.signature}`)).size).toBeGreaterThan(
      0,
    );
    // An unidentified row must be an authored-override arm. An ordinary overload
    // losing its identity would land here with no override behind it.
    expect(unidentified.filter((s) => !s.overrideCovered)).toEqual([]);
    // Arm rows render `.d.ts` text no single declaration produced, so none of
    // their slots may claim artifact backing.
    expect(unidentified.filter((s) => s.backed)).toEqual([]);
  });

  test("the gate reaches rows sharing an FQN with a row above them", () => {
    // A return to name-keyed classification would empty this population while
    // every other assertion here stayed green.
    expect(backed.filter((s) => s.sharedFqn).length).toBeGreaterThan(0);
  });

  test("a later overload's recovered inline object renders instead of the raw table", () => {
    const definition = slots.find(
      (s) =>
        s.symbol === "b2d.body.create_fixture" && s.kind === "param" && s.name === "definition",
    );
    if (!definition) throw new Error("b2d.body.create_fixture definition parameter not rendered");
    expect(definition.rendered).toContain("shape?:");
    expect(definition.rendered).not.toBe("Record<string | number, unknown>");
    expect(definition.signature).toContain(definition.rendered);
    expect(definition.backed).toBe(true);
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

    // Both slots resolve to a constant union with an alias row, so the Parameters
    // table renders the alias — the same short form the signature above it
    // carries. The members stay readable through the alias's own page entry,
    // which is what the alias-entry tests in api-page-render cover.
    const clear = symbols.find((s) => s.name === "render.clear");
    expect(clear?.parameters[0]?.types[0]).toBe("LuaMap<render.ClearBufferKey, number | Vector4>");
    expect(clear?.parameters[0]?.types[0]).not.toContain("Record<string | number, unknown>");

    const enableState = symbols.find((s) => s.name === "render.enable_state");
    expect(enableState?.parameters[0]?.types[0]).toBe("graphics.State");
    expect(enableState?.parameters[0]?.types[0]).not.toContain('Opaque<"constant">');

    // The alias each of them names is a symbol on its home page, so neither row
    // is a dead end: `ClearBufferKey` is render's own, `State` is graphics'.
    const renderTypes = symbols.filter((s) => s.kind === "type").map((s) => s.name);
    expect(renderTypes).toContain("ClearBufferKey");
    const graphics = combined.namespaces.find((ns) => ns.namespace === "graphics");
    if (!graphics) throw new Error("graphics namespace missing from the combined surface");
    const graphicsTypes = apiModuleSymbols(combinedNamespaceToApiPage(graphics))
      .filter((s) => s.kind === "type")
      .map((s) => s.name);
    expect(graphicsTypes).toContain("State");
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
