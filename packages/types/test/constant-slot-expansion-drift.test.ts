import { describe, expect, test } from "bun:test";
import {
  collectConstantFqns,
  generateModuleDeclaration,
  generateModuleSignatures,
  loadApiTargets,
  MODULE_MANIFEST,
  type ModuleManifestEntry,
  VERSIONED_MODULE_MANIFEST,
} from "../scripts/regen";
import { normalizedFunctionSignature } from "../src/api-availability";
import { type ApiFunction, type ApiModule, parseDefoldApiDoc } from "../src/api-doc";
import {
  CONSTANT_SLOT_RESOLUTIONS,
  documentedConstantTokens,
  resolveConstantSlotTokens,
} from "../src/emit-dts";

const defaultTarget = loadApiTargets().find((candidate) => candidate.default === true);
if (!defaultTarget) throw new Error("api-targets.json: no default target");

const knownConstantFqns = collectConstantFqns();

interface Surface {
  readonly target: string;
  readonly entry: ModuleManifestEntry;
  readonly module: ApiModule;
  readonly universe: ReadonlySet<string>;
  readonly contents: string;
  readonly signatures: ReadonlyMap<string, string>;
}

interface ConstantSlot {
  readonly surface: Surface;
  readonly fn: ApiFunction;
  readonly key: string;
  readonly doc: string;
}

// Every runtime module regen emits, for the default target and every older
// committed target: the same retained set the optional-slot corrections walk.
const surfaces: Surface[] = [
  ...MODULE_MANIFEST.map((entry) => ({ target: defaultTarget.id, entry })),
  ...VERSIONED_MODULE_MANIFEST.filter((entry) => entry.editor !== true).map((entry) => ({
    target: entry.versionId,
    entry,
  })),
].map(({ target, entry }) => {
  const options = { knownConstantFqns, translations: {} };
  const { contents, dropped } = generateModuleDeclaration(entry, options);
  const module = parseDefoldApiDoc(entry.doc);
  module.functions = module.functions.filter((fn) => !dropped.includes(fn.name));
  const signatures = new Map(
    generateModuleSignatures(entry, options)
      .filter(({ identity }) => identity.kind === "FUNCTION")
      .map(({ identity, tsSignature }) => [`${identity.name}(${identity.signature})`, tsSignature]),
  );
  return {
    target,
    entry,
    module,
    universe: new Set([...knownConstantFqns, ...module.constants.map((c) => c.name)]),
    contents,
    signatures,
  };
});

const slots: ConstantSlot[] = surfaces.flatMap((surface) =>
  surface.module.functions.flatMap((fn) => [
    ...fn.parameters
      .filter((p) => p.types.includes("constant"))
      .map((p) => ({ surface, fn, key: `${fn.name}:param:${p.name}`, doc: p.doc })),
    ...fn.returnValues
      .filter((rv) => rv.types.includes("constant"))
      .map((rv) => ({ surface, fn, key: `${fn.name}:return:${rv.name}`, doc: rv.doc })),
  ]),
);

const isResidual = (key: string): boolean => {
  const entry = CONSTANT_SLOT_RESOLUTIONS.get(key);
  return entry !== undefined && "residual" in entry;
};

const signatureOf = (surface: Surface, fn: ApiFunction): string | undefined =>
  surface.signatures.get(`${fn.name}(${normalizedFunctionSignature(fn)})`);

describe("documented constant slots reach both shipped surfaces", () => {
  test("the retained surfaces carry constant slots", () => {
    // Every assertion below iterates these, so an empty walk would pass them all.
    expect(slots.length).toBeGreaterThan(0);
  });

  test("every constant slot expands into constants or is a named residual", () => {
    const unresolved = slots
      .filter(
        ({ surface, key }) =>
          resolveConstantSlotTokens(surface.module, key, surface.universe).length === 0 &&
          !isResidual(key),
      )
      .map(({ surface, key }) => `${surface.target}: ${key} names no constant and has no entry`);
    expect(unresolved).toEqual([]);
  });

  test("every resolved constant is branded in the declaration and the signature ledger", () => {
    const missing: string[] = [];
    for (const { surface, fn, key } of slots) {
      const signature = signatureOf(surface, fn);
      if (signature === undefined) {
        missing.push(`${surface.target}: ${key} has no ledger signature`);
        continue;
      }
      if (!surface.contents.includes(signature)) {
        missing.push(`${surface.target}: ${key} ledger signature is not in the declaration`);
      }
      for (const fqn of resolveConstantSlotTokens(surface.module, key, surface.universe)) {
        if (!signature.includes(`__brand: "${fqn}"`)) {
          missing.push(`${surface.target}: ${key} does not brand ${fqn}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  test("the generic constant survives at the top level only in a residual slot", () => {
    // Nested table fields (`resource.get_atlas` animations `playback`) are out of
    // scope and render inside an inline object, so braces are stripped first.
    const unexplained: string[] = [];
    for (const surface of surfaces) {
      for (const fn of surface.module.functions) {
        const signature = signatureOf(surface, fn);
        if (signature === undefined) continue;
        let topLevel = signature;
        while (/\{[^{}]*\}/.test(topLevel)) topLevel = topLevel.replace(/\{[^{}]*\}/g, "");
        const generic = topLevel.split('Opaque<"constant">').length - 1;
        const residuals = [
          ...fn.parameters.map((p) => `${fn.name}:param:${p.name}`),
          ...fn.returnValues.map((rv) => `${fn.name}:return:${rv.name}`),
        ].filter(isResidual).length;
        if (generic !== residuals) {
          unexplained.push(
            `${surface.target}: ${fn.name} emits ${generic} top-level Opaque<"constant"> for ${residuals} residual slot(s)`,
          );
        }
      }
    }
    expect(unexplained).toEqual([]);
  });

  test("every table entry names a live constant slot whose own doc still names none", () => {
    const problems: string[] = [];
    for (const key of CONSTANT_SLOT_RESOLUTIONS.keys()) {
      const live = slots.filter((slot) => slot.key === key);
      if (live.length === 0) {
        problems.push(`${key}: no retained target has this constant slot`);
        continue;
      }
      for (const { surface, doc } of live) {
        if (documentedConstantTokens(doc, surface.universe).length > 0) {
          problems.push(`${surface.target}: ${key} doc now names its constants; delete the entry`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  test("every borrow and family entry still yields constants from its evidence", () => {
    const problems: string[] = [];
    for (const [key, entry] of CONSTANT_SLOT_RESOLUTIONS) {
      if ("residual" in entry) {
        if (entry.residual.trim() === "") problems.push(`${key}: residual records no reason`);
        continue;
      }
      for (const { surface } of slots.filter((slot) => slot.key === key)) {
        if ("borrow" in entry) {
          if (
            resolveConstantSlotTokens(surface.module, entry.borrow, surface.universe).length === 0
          ) {
            problems.push(`${surface.target}: ${key} borrows ${entry.borrow}, which names none`);
          }
          continue;
        }
        const family = new Set(documentedConstantTokens(entry.family, surface.universe));
        if (family.size === 0) {
          problems.push(`${surface.target}: ${key} family ${entry.family} matches no constant`);
          continue;
        }
        const evidence = surface.module.functions.find((fn) => fn.name === entry.evidence);
        if (documentedConstantTokens(evidence?.examples ?? "", family).length === 0) {
          problems.push(
            `${surface.target}: ${key} evidence ${entry.evidence} example names no ${entry.family}`,
          );
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
