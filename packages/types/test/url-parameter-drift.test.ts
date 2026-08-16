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
import { enumerateDeclaredParameters, scriptHookParameters } from "./fixture-surface-enumerate";

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

// A config reader is named by its shape, not by a list kept here: the class
// covers a family upstream can extend, so the expected membership is read off
// the same ref-doc source the emitter consumes rather than restated. A fifth
// reader joins this set the moment it appears in the source.
const CONFIG_READER_FQN = /^sys\.get_config_[a-z0-9_]+$/;
const configReaderSlots = [...slots.values()]
  .filter((slot) => CONFIG_READER_FQN.test(slot.fqn) && slot.parameter === "key")
  .map((slot) => `${slot.fqn}#${slot.parameter}`)
  .sort();

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

  test("the animation-id class is recorded against the one slot that carries it", () => {
    const animations = table
      .filter((entry) => entry.class === "animation")
      .map((entry) => `${entry.fqn}#${entry.parameter}`);
    expect(animations).toEqual(["sprite.play_flipbook#id"]);
    expect(slots.get("sprite.play_flipbook#id")?.types).toEqual(["string", "hash"]);
  });

  test("every animation entry names an address companion that is a live sibling slot", () => {
    // The companion is what scopes the candidate set. A typo here would not fail
    // anything at runtime — it would silently disable every suggestion — so the
    // name is checked against the same slot universe the classes are.
    const unresolved: string[] = [];
    for (const entry of table.filter((candidate) => candidate.class === "animation")) {
      const key = `${entry.fqn}#${entry.parameter}`;
      if (entry.addressParameter === undefined) {
        unresolved.push(`${key}: an animation entry must name an addressParameter`);
        continue;
      }
      const companion = slots.get(`${entry.fqn}#${entry.addressParameter}`);
      if (!companion) {
        unresolved.push(`${key}: ${entry.fqn} declares no ${entry.addressParameter} parameter`);
        continue;
      }
      if (!parameterTypesSatisfyClass(companion.types, "component")) {
        unresolved.push(
          `${key}: ${entry.addressParameter} is ${JSON.stringify(companion.types)}, which cannot address a component`,
        );
      }
    }
    expect(unresolved).toEqual([]);
  });

  test("the resource-path class is recorded against exactly the six constructors", () => {
    const resourcePaths = table
      .filter((entry) => entry.class === "resource-path")
      .map((entry) => `${entry.fqn}#${entry.parameter}`);
    expect(resourcePaths).toEqual([
      "resource.atlas#path",
      "resource.buffer#path",
      "resource.font#path",
      "resource.material#path",
      "resource.texture#path",
      "resource.tile_source#path",
    ]);
  });

  test("the config-key class covers every config reader the ref-doc declares", () => {
    // Guard against a namespace change that stops the shape matching and turns
    // this into a comparison of two empty sets.
    expect(configReaderSlots.length).toBeGreaterThan(0);
    const configKeys = table
      .filter((entry) => entry.class === "config-key")
      .map((entry) => `${entry.fqn}#${entry.parameter}`)
      .sort();
    expect(configKeys).toEqual(configReaderSlots);
    for (const key of configReaderSlots) {
      expect(slots.get(key)?.types).toEqual(["string"]);
    }
  });

  test("every resource-path extension reads in its own function's ref-doc example", () => {
    // The parameter doc says *resource path* without saying which kind, so the
    // only refutable evidence for the extension is the example the ref-doc
    // writes. Matching the path-ending form pins `.png` to `/texture.png"` and
    // not to a `.pngsomething` mentioned in prose.
    const unproven: string[] = [];
    for (const entry of table.filter((candidate) => candidate.class === "resource-path")) {
      const key = `${entry.fqn}#${entry.parameter}`;
      const slot = slots.get(key);
      if (!slot) continue;
      for (const extension of entry.resourceExtensions ?? []) {
        if (!slot.examples.includes(`${extension}&quot;`)) {
          unproven.push(`${key}: no example ends a path with ${extension}`);
        }
      }
    }
    expect(unproven).toEqual([]);
  });

  test("every resource-path entry declares the extensions it accepts", () => {
    expect(
      table
        .filter(
          (entry) =>
            entry.class === "resource-path" && (entry.resourceExtensions?.length ?? 0) === 0,
        )
        .map((entry) => `${entry.fqn}#${entry.parameter}`),
    ).toEqual([]);
  });

  test("only a resource-path entry carries accepted extensions", () => {
    expect(
      table
        .filter(
          (entry) => entry.class !== "resource-path" && entry.resourceExtensions !== undefined,
        )
        .map((entry) => `${entry.fqn}#${entry.parameter}`),
    ).toEqual([]);
  });

  test("the action-id class is recorded against the one slot that carries it", () => {
    const actionIds = table
      .filter((entry) => entry.class === "action-id")
      .map((entry) => `${entry.fqn}#${entry.parameter}`);
    expect(actionIds).toEqual(["hash#s"]);
    // Hand-authored, not generated: `hash` is a prefixless global the ref-doc
    // ships no entry for, so the authored-entry rule above is what proves the
    // slot exists at all.
    const entry = table.find((candidate) => candidate.class === "action-id");
    expect(entry?.source).toBe("src/engine-globals.d.ts");
    expect(entry?.evidence).toBeUndefined();
  });

  test("every action-id entry names the parameter its call must be compared against", () => {
    // Without the scope the class would offer action ids inside every
    // `hash("…")` a project writes, so a missing name is a silent widening
    // rather than a failure.
    expect(
      table
        .filter((entry) => entry.class === "action-id" && entry.comparedParameter === undefined)
        .map((entry) => `${entry.fqn}#${entry.parameter}`),
    ).toEqual([]);
  });

  test("only an action-id entry carries a compared parameter", () => {
    expect(
      table
        .filter((entry) => entry.class !== "action-id" && entry.comparedParameter !== undefined)
        .map((entry) => `${entry.fqn}#${entry.parameter}`),
    ).toEqual([]);
  });

  test("every compared parameter still names a parameter of the shipped on_input hook", () => {
    // The name is what scopes the class, and it is the name the shipped hook
    // signature — and the `@example` under it — teaches users to write. A
    // lifecycle rename leaves the two disagreeing with nothing else to catch it.
    const hookParameters = scriptHookParameters(
      readFileSync(resolve(PACKAGE_ROOT, "src/lifecycle.ts"), "utf8"),
      "on_input",
    );
    expect(hookParameters.length).toBeGreaterThan(0);
    const unresolved = table
      .filter(
        (entry) =>
          entry.comparedParameter !== undefined &&
          !hookParameters.includes(entry.comparedParameter),
      )
      .map((entry) => `${entry.fqn}#${entry.parameter}: ${entry.comparedParameter}`);
    expect(unresolved).toEqual([]);
  });

  test("only an animation entry carries an address companion", () => {
    expect(
      table
        .filter((entry) => entry.class !== "animation" && entry.addressParameter !== undefined)
        .map((entry) => `${entry.fqn}#${entry.parameter}`),
    ).toEqual([]);
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
