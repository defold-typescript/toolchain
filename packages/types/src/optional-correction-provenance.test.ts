import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import apiTargets from "../api-targets.json" with { type: "json" };
import { OPTIONAL_SLOT_CORRECTIONS } from "./emit-dts";

const PKG = resolve(import.meta.dir, "..");

interface TargetModule {
  readonly namespace: string;
  readonly fixture: string;
}

interface Target {
  readonly id: string;
  readonly fixturesDir: string;
  readonly modules: readonly TargetModule[];
}

const TARGETS = (apiTargets as { targets: readonly Target[] }).targets;

interface RefDocParameter {
  readonly name?: string;
  readonly types?: readonly string[];
  readonly is_optional?: string;
}

interface RefDocElement {
  readonly type?: string;
  readonly name?: string;
  readonly parameters?: readonly RefDocParameter[];
}

interface ModuleDoc {
  readonly target: string;
  readonly namespace: string;
  readonly functions: readonly RefDocElement[];
}

// Every vendored ref-doc module the generators read, across every release still
// in `api-targets.json`, so a pin holds against the release a correction ships
// from and every older one.
function moduleDocs(): ModuleDoc[] {
  const out: ModuleDoc[] = [];
  for (const target of TARGETS) {
    for (const module of target.modules) {
      const path = join(PKG, target.fixturesDir, module.fixture);
      if (!existsSync(path)) continue;
      const doc = JSON.parse(readFileSync(path, "utf8")) as { elements?: RefDocElement[] };
      const functions = (doc.elements ?? []).filter((element) => element.type === "FUNCTION");
      out.push({ target: target.id, namespace: module.namespace, functions });
    }
  }
  return out;
}

const MODULE_DOCS = moduleDocs();

interface Sighting {
  readonly target: string;
  readonly parameter: RefDocParameter;
}

// Every declaration of the slot a `<element>:param:<slot>` key names. An
// overloaded element contributes one sighting per same-named declaration.
function sightings(key: string): Sighting[] {
  const separator = key.lastIndexOf(":param:");
  const element = key.slice(0, separator);
  const slot = key.slice(separator + ":param:".length);
  const namespace = element.slice(0, element.lastIndexOf("."));
  const out: Sighting[] = [];
  for (const module of MODULE_DOCS) {
    if (module.namespace !== namespace) continue;
    for (const fn of module.functions) {
      if (fn.name !== element) continue;
      for (const parameter of fn.parameters ?? []) {
        if (parameter.name === slot) out.push({ target: module.target, parameter });
      }
    }
  }
  return out;
}

describe("optional-slot correction provenance", () => {
  const entries = [...OPTIONAL_SLOT_CORRECTIONS.entries()];

  test("the correction set is non-empty and every entry resolves to a real ref-doc parameter", () => {
    expect(entries.length).toBeGreaterThan(0);
    const unresolved = entries.filter(([key]) => sightings(key).length === 0).map(([key]) => key);
    expect(unresolved).toEqual([]);
  });

  test("every vendored ref-doc still leaves each corrected slot unmarked", () => {
    // A red here means upstream fixed the metadata: delete the
    // OPTIONAL_SLOT_CORRECTIONS entry, never re-pin it. Kept after the fix, the
    // entry would silently outlive the evidence that justified it.
    const fixed: string[] = [];
    for (const [key] of entries) {
      for (const { target, parameter } of sightings(key)) {
        if (parameter.is_optional === "True" || (parameter.types ?? []).includes("nil")) {
          fixed.push(
            `${key} in ${target}: upstream now marks it optional (is_optional ${parameter.is_optional}, types ${JSON.stringify(parameter.types)}) — delete the correction`,
          );
        }
      }
    }
    expect(fixed).toEqual([]);
  });

  test("every correction records the upstream evidence behind it", () => {
    const unexplained = entries
      .filter(([, evidence]) => evidence.trim().length === 0)
      .map(([key]) => key);
    expect(unexplained).toEqual([]);
  });
});

describe("modules upstream leaves wholly unmarked", () => {
  // In these modules `is_optional` is absent from every parameter, so every
  // parameter emits required whether or not the engine needs it, and only prose
  // or examples can tell the fidelity audit otherwise. When upstream starts
  // marking one, it leaves this list and gets a real optionality audit; a new
  // module that arrives unmarked has to be recorded here.
  const UNMARKED = ["iac", "iap", "push", "webview"];

  test("exactly the recorded modules carry no is_optional field on any parameter", () => {
    const targets = new Set(MODULE_DOCS.map((module) => module.target));
    expect(targets.size).toBeGreaterThan(0);
    for (const target of targets) {
      const unmarked = MODULE_DOCS.filter((module) => module.target === target)
        .filter((module) => {
          const parameters = module.functions.flatMap((fn) => fn.parameters ?? []);
          return parameters.length > 0 && parameters.every((p) => !("is_optional" in p));
        })
        .map((module) => module.namespace)
        .sort();
      expect({ target, unmarked }).toEqual({ target, unmarked: UNMARKED });
    }
  });
});
