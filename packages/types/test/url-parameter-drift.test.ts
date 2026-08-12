import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadApiTargets, loadTargetModules } from "../scripts/regen";
import { parseDefoldApiDoc } from "../src/api-doc";
import {
  collectParameterSlots,
  parameterTypesSatisfyClass,
  type UrlParameterSlot,
  type UrlParameterSource,
  type UrlParameterTable,
} from "../src/url-parameters";
import { enumerateDeclaredParameters } from "./fixture-surface-enumerate";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");

const table: UrlParameterTable = JSON.parse(
  readFileSync(resolve(PACKAGE_ROOT, "url-parameters.json"), "utf8"),
);

const target = loadApiTargets().find((candidate) => candidate.default === true);
if (!target) throw new Error("api-targets.json: no default target");

const sources: UrlParameterSource[] = loadTargetModules(target).map((entry) => ({
  module: parseDefoldApiDoc(entry.doc),
  ...(entry.skipFunctions ? { skipFunctions: entry.skipFunctions } : {}),
}));

// Every parameter slot, not just the address-triple ones: two class shapes now
// share the table, and `parameterTypesSatisfyClass` is what re-imposes the type
// requirement the address filter used to carry on its own.
const slots = new Map<string, UrlParameterSlot>(
  collectParameterSlots(sources).map((slot) => [`${slot.fqn}#${slot.parameter}`, slot]),
);

const skippedFqns = new Set(
  target.modules.flatMap((module) =>
    (module.skipFunctions ?? []).map((name) => `${module.namespace}.${name}`),
  ),
);

const generated = table.filter((entry) => entry.source === "generated");
const authored = table.filter((entry) => entry.source !== "generated");

describe("url-parameters.json generated entries", () => {
  test("every entry still resolves to a live slot", () => {
    const missing = generated
      .filter((entry) => !slots.has(`${entry.fqn}#${entry.parameter}`))
      .map((entry) => `${entry.fqn}#${entry.parameter}`);
    expect(missing).toEqual([]);
  });

  test("every entry's class is one the slot's declared types can carry", () => {
    const mismatched: string[] = [];
    for (const entry of generated) {
      const key = `${entry.fqn}#${entry.parameter}`;
      const slot = slots.get(key);
      if (!slot) continue;
      if (!parameterTypesSatisfyClass(slot.types, entry.class)) {
        mismatched.push(`${key}: ${entry.class} on ${JSON.stringify(slot.types)}`);
      }
    }
    expect(mismatched).toEqual([]);
  });

  test("the node-id class is recorded against the one slot that carries it", () => {
    const nodeIds = table
      .filter((entry) => entry.class === "gui-node")
      .map((entry) => `${entry.fqn}#${entry.parameter}`);
    expect(nodeIds).toEqual(["gui.get_node#id"]);
    expect(slots.get("gui.get_node#id")?.types).toEqual(["string", "hash"]);
  });

  test("every entry's recorded evidence still reads in the ref-doc prose", () => {
    const stale: string[] = [];
    for (const entry of generated) {
      const key = `${entry.fqn}#${entry.parameter}`;
      const slot = slots.get(key);
      if (!slot) continue;
      if (entry.evidence === undefined || !slot.doc.includes(entry.evidence)) {
        stale.push(`${key}: ${JSON.stringify(entry.evidence)} not in ${JSON.stringify(slot.doc)}`);
      }
    }
    expect(stale).toEqual([]);
  });

  test("no entry names a function the target hands to the authored overloads", () => {
    expect(
      generated.filter((entry) => skippedFqns.has(entry.fqn)).map((entry) => entry.fqn),
    ).toEqual([]);
  });
});

describe("url-parameters.json hand-authored entries", () => {
  test("every entry names a file that declares the parameter", () => {
    const unresolved: string[] = [];
    for (const entry of authored) {
      const path = resolve(PACKAGE_ROOT, entry.source);
      if (!existsSync(path)) {
        unresolved.push(`${entry.fqn}#${entry.parameter}: no such file ${entry.source}`);
        continue;
      }
      const declared = enumerateDeclaredParameters(readFileSync(path, "utf8"), entry.source);
      const parameters = declared.get(entry.fqn);
      if (!parameters) {
        unresolved.push(
          `${entry.fqn}#${entry.parameter}: ${entry.source} declares no ${entry.fqn}`,
        );
        continue;
      }
      if (!parameters.has(entry.parameter)) {
        unresolved.push(
          `${entry.fqn}#${entry.parameter}: ${entry.source} declares ${entry.fqn}(${[...parameters].join(", ")})`,
        );
      }
    }
    expect(unresolved).toEqual([]);
  });
});

describe("url-parameters.json shape", () => {
  test("no two entries share an fqn + parameter key", () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const entry of table) {
      const key = `${entry.fqn}#${entry.parameter}`;
      if (seen.has(key)) duplicates.push(key);
      seen.add(key);
    }
    expect(duplicates).toEqual([]);
  });
});
