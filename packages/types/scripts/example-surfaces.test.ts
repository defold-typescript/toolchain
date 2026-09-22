import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import type { TranslationStore } from "../src/example-store";
import { loadTranslations } from "./example-store-io";
import {
  exampleIdentity,
  exampleSurfaces,
  factoryBoundOwnership,
  kindFactoryNames,
  moduleBoundOwnership,
  moduleKey,
  moduleNamespaces,
  refDocSkippedTargets,
  referencedNamespaces,
  translationOwnership,
  unownedTranslations,
} from "./example-surfaces";
import { KIND_MODULE_MANIFEST, loadApiTargets } from "./regen";

const surfaces = await exampleSurfaces();
const store = loadTranslations();
const ownership = translationOwnership(store, surfaces);

function surfaceIds(): string[] {
  return surfaces.map((surface) => surface.id).sort();
}

function ownersOf(fqn: string): string[] {
  const identities = (store[fqn] ?? []).map((entry) => exampleIdentity(fqn, entry.sourceHash));
  return [...new Set(identities.flatMap((identity) => ownership.get(identity) ?? []))].sort();
}

describe("surface inventory", () => {
  test("every committed target contributes a root entrypoint that exists on disk", () => {
    const committed = loadApiTargets()
      .filter((target) => (target.source ?? null) === null)
      .map((target) => target.id);
    const roots = surfaces.filter((surface) => surface.kind === null);
    expect(roots.map((surface) => surface.targetId).sort()).toEqual([...committed].sort());
    for (const root of roots) {
      expect(root.origin).toBe("committed");
      expect(existsSync(root.entry)).toBe(true);
    }
  });

  test("the default target contributes all four committed kind entrypoints", () => {
    const kinds = surfaces
      .filter((surface) => surface.targetId === "defold-1.13.1" && surface.kind !== null)
      .sort((a, b) => a.id.localeCompare(b.id));
    expect(kinds.map((surface) => surface.kind)).toEqual([
      "editor-script",
      "gui-script",
      "render-script",
      "script",
    ]);
    for (const kind of kinds) {
      expect(kind.origin).toBe("committed");
      expect(existsSync(kind.entry)).toBe(true);
    }
  });

  test("a versioned runtime kind is materialized in memory, never read from generated/versions", () => {
    const runtime = surfaces.filter(
      (surface) =>
        surface.targetId === "defold-1.13.0" &&
        surface.kind !== null &&
        surface.kind !== "editor-script",
    );
    expect(runtime.map((surface) => surface.kind).sort()).toEqual([
      "gui-script",
      "render-script",
      "script",
    ]);
    for (const surface of runtime) {
      expect(surface.origin).toBe("materialized");
      // `regen.ts` writes `versions/<id>/kinds/` for `entry.only !== undefined`
      // kinds alone, so asserting a committed path for a runtime kind is what a
      // disk-reading resolver would get wrong.
      expect(existsSync(surface.entry)).toBe(false);
      expect(surface.virtualFiles.some((file) => file.path === surface.entry)).toBe(true);
    }
  });

  test("a versioned target's editor kind is committed, and a target with no editor document has none", () => {
    const withEditor = surfaces.find(
      (surface) => surface.id === "defold-1.13.0/kinds/editor-script",
    );
    expect(withEditor?.origin).toBe("committed");
    expect(existsSync(withEditor?.entry ?? "")).toBe(true);
    expect(surfaces.some((surface) => surface.id === "defold-1.12.4/kinds/editor-script")).toBe(
      false,
    );
  });

  test("every target carrying a non-null source is skipped by the explicit ref-doc rule", () => {
    const expected = loadApiTargets()
      .filter((target) => (target.source ?? null) !== null)
      .map((target) => target.id)
      .sort();
    expect(
      refDocSkippedTargets()
        .map((skip) => skip.id)
        .sort(),
    ).toEqual(expected);
    for (const skip of refDocSkippedTargets()) {
      expect(skip.reason).toMatch(/not vendored/);
    }
    // The boundary is a stated contract: no skipped target may also ship a surface.
    const skipped = new Set(expected);
    expect(surfaces.filter((surface) => skipped.has(surface.targetId))).toEqual([]);
  });
});

describe("translation ownership", () => {
  test("no translation is unowned", () => {
    expect(unownedTranslations(store, surfaces)).toEqual([]);
  });

  test("an editor FQN resolves to editor-script surfaces only, never a runtime surface", () => {
    const owners = ownersOf("editor.create_directory");
    expect(owners.length).toBeGreaterThan(0);
    for (const owner of owners) expect(owner).toMatch(/\/kinds\/editor-script$/);
  });

  test("a namespace shared by both lanes keeps its runtime body off the editor kind", () => {
    // `zlib` names a runtime namespace *and* an editor-VM one, so a resolver
    // keyed on the bare namespace puts the runtime `zlib.inflate` on the editor
    // kind, which never carries it.
    const owners = ownersOf("zlib.inflate");
    expect(owners).toContain("defold-1.13.1");
    expect(owners).toContain("defold-1.13.1/kinds/script");
    expect(owners).not.toContain("defold-1.13.1/kinds/editor-script");
  });

  test("a body carried by several targets resolves to all of them, not just the newest", () => {
    const owners = ownersOf("go.get_position");
    const targets = new Set(owners.map((id) => id.split("/")[0]));
    expect(targets.size).toBeGreaterThan(1);
  });

  test("a skipFunctions FQN resolves to the surfaces that compose its hand-authored overload", () => {
    // `go.get` has no body in `generated/go.d.ts` (api-targets.json skips it);
    // its declaration rides `src/go-overloads.d.ts`, which every runtime
    // entrypoint imports. A resolver keyed on the emitted file strands it.
    const owners = ownersOf("go.get");
    expect(owners).toContain("defold-1.13.1");
    expect(owners).toContain("defold-1.13.1/kinds/script");
  });

  test("a kind-restricted namespace resolves to its own kind and never to a sibling runtime kind", () => {
    const render = ownersOf("render.clear");
    expect(render).toContain("defold-1.13.1/kinds/render-script");
    expect(render).not.toContain("defold-1.13.1/kinds/script");
    expect(render).not.toContain("defold-1.13.1/kinds/gui-script");

    const gui = ownersOf("gui.get_node");
    expect(gui).toContain("defold-1.13.1/kinds/gui-script");
    expect(gui).not.toContain("defold-1.13.1/kinds/script");
  });

  test("a universal namespace rides every runtime kind of its target", () => {
    const owners = ownersOf("go.get_position");
    for (const kind of ["script", "gui-script", "render-script"]) {
      expect(owners).toContain(`defold-1.13.1/kinds/${kind}`);
    }
    expect(owners).not.toContain("defold-1.13.1/kinds/editor-script");
  });

  test("the kind set comes from the manifest, so every manifest kind appears in the inventory", () => {
    expect(surfaceIds()).toContain("defold-1.13.1/kinds/editor-script");
    expect(surfaceIds()).toContain("defold-1.12.4/kinds/script");
  });
});

describe("factory-bound ownership", () => {
  const surfaceOf = (id: string) => {
    const surface = surfaces.find((candidate) => candidate.id === id);
    if (!surface) throw new Error(`no surface ${id}`);
    return surface;
  };

  function bindSynthetic(ts: string, owners: readonly string[]): string[] {
    const store: TranslationStore = { "synthetic.body": [{ sourceHash: "deadbeef", ts }] };
    const identity = exampleIdentity("synthetic.body", "deadbeef");
    const bound = factoryBoundOwnership(store, new Map([[identity, [...owners]]]), surfaces);
    return (bound.get(identity) ?? []).sort();
  }

  const everyRuntimeSurface = [
    "defold-1.13.1",
    "defold-1.13.0",
    "defold-1.13.1/kinds/script",
    "defold-1.13.1/kinds/gui-script",
    "defold-1.13.1/kinds/render-script",
  ];

  test("the factory inventory is the manifest's, not a hand-list", () => {
    expect([...kindFactoryNames()].sort()).toEqual(
      KIND_MODULE_MANIFEST.map((entry) => entry.factory).sort(),
    );
    expect(kindFactoryNames().length).toBe(KIND_MODULE_MANIFEST.length);
    for (const entry of KIND_MODULE_MANIFEST) {
      expect(kindFactoryNames()).toContain(entry.factory);
    }
  });

  test("a body calling a kind factory keeps only the surfaces exporting that name", () => {
    const kept = bindSynthetic(
      "export default defineScript({ init(self) {} });",
      everyRuntimeSurface,
    );
    expect(kept).toEqual(["defold-1.13.1", "defold-1.13.1/kinds/script"]);
    for (const id of kept) expect(surfaceOf(id).exports.values).toContain("defineScript");
  });

  test("a body calling no manifest factory keeps every surface ownership gave it", () => {
    const kept = bindSynthetic('label.set_text("#label", "Hello World!");', everyRuntimeSurface);
    expect(kept).toEqual([...everyRuntimeSurface].sort());
  });

  test("a misspelled factory narrows nothing, so it still reds as an unpinned diagnostic", () => {
    const kept = bindSynthetic(
      "export default defineScrpt({ init(self) {} });",
      everyRuntimeSurface,
    );
    expect(kept).toEqual([...everyRuntimeSurface].sort());
  });

  test("a factory named only in a comment still narrows — the stated cost of a token match", () => {
    const kept = bindSynthetic(
      "// defineGuiScript is the gui equivalent\nlabel.set_text('#label', 'hi');",
      everyRuntimeSurface,
    );
    expect(kept).toEqual(["defold-1.13.1", "defold-1.13.1/kinds/gui-script"]);
  });

  test("binding empties no owner list on the committed store", () => {
    const bound = factoryBoundOwnership(store, ownership, surfaces);
    expect(bound.size).toBe(ownership.size);
    const emptied = [...bound.entries()]
      .filter(([, owners]) => owners.length === 0)
      .map(([identity]) => identity)
      .sort();
    expect(emptied).toEqual([]);
  });

  test("every surface a bound body keeps exports every factory that body calls", () => {
    const bound = factoryBoundOwnership(store, ownership, surfaces);
    const factories = kindFactoryNames();
    for (const [fqn, entries] of Object.entries(store)) {
      for (const entry of entries) {
        const identity = exampleIdentity(fqn, entry.sourceHash);
        const called = factories.filter((name) => new RegExp(`\\b${name}\\b`).test(entry.ts));
        if (called.length === 0) continue;
        for (const id of bound.get(identity) ?? []) {
          for (const name of called) expect(surfaceOf(id).exports.values).toContain(name);
        }
      }
    }
  });
});

describe("module-bound ownership", () => {
  const surfaceOf = (id: string) => {
    const surface = surfaces.find((candidate) => candidate.id === id);
    if (!surface) throw new Error(`no surface ${id}`);
    return surface;
  };

  function bodyOf(fqn: string): string {
    const entries = store[fqn] ?? [];
    const only = entries.length === 1 ? entries[0] : undefined;
    if (!only) throw new Error(`${fqn}: expected one stored body, got ${entries.length}`);
    return only.ts;
  }

  function bindStored(fqn: string): string[] {
    const bound = moduleBoundOwnership(store, ownership, surfaces);
    const identities = (store[fqn] ?? []).map((entry) => exampleIdentity(fqn, entry.sourceHash));
    return [...new Set(identities.flatMap((identity) => bound.get(identity) ?? []))].sort();
  }

  function carries(id: string, namespace: string): boolean {
    const modules = surfaceOf(id).modules;
    return (
      modules.has(moduleKey(namespace, "runtime")) || modules.has(moduleKey(namespace, "editor"))
    );
  }

  test("the narrowing vocabulary is the surfaces' own module set, not a hand-list", () => {
    const namespaces = moduleNamespaces(surfaces);
    expect(namespaces.size).toBeGreaterThan(0);

    // Both directions go through the production key builder, so a test-local
    // split of `lane:namespace` never stands in for the function under test.
    const uncovered: string[] = [];
    for (const surface of surfaces) {
      for (const key of surface.modules) {
        const covered = [...namespaces].some(
          (namespace) =>
            moduleKey(namespace, "runtime") === key || moduleKey(namespace, "editor") === key,
        );
        if (!covered) uncovered.push(`${surface.id}: ${key}`);
      }
    }
    expect(uncovered).toEqual([]);

    const invented = [...namespaces].filter(
      (namespace) => !surfaces.some((surface) => carries(surface.id, namespace)),
    );
    expect(invented).toEqual([]);

    for (const namespace of ["render", "gui", "editor"])
      expect(namespaces.has(namespace)).toBe(true);
  });

  test("a body reaching a second namespace reports both", () => {
    const referenced = referencedNamespaces(
      bodyOf("camera.get_cameras"),
      moduleNamespaces(surfaces),
    );
    expect([...referenced].sort()).toEqual(["camera", "render"]);
  });

  test("a namespace named only inside a string literal is not a reference", () => {
    const body = bodyOf("editor.create_resources");
    expect(body).toContain("go.property");
    expect(referencedNamespaces(body, moduleNamespaces(surfaces))).toEqual(["editor"]);
  });

  test("a namespace name used as a local or a property is not a reference", () => {
    const referenced = referencedNamespaces(
      "const render = 1;\nconst n = self.render;\n",
      moduleNamespaces(surfaces),
    );
    expect(referenced).toEqual([]);
  });

  test("a body reaching a restricted namespace keeps only the surfaces carrying it", () => {
    const kept = bindStored("camera.get_cameras");
    expect(kept.length).toBeGreaterThan(0);
    expect(kept).toContain("defold-1.13.1");
    expect(kept).toContain("defold-1.13.1/kinds/render-script");
    // `camera` alone would keep these; the body also calls `render.*`, so a
    // predicate satisfied by any one referenced namespace fails here.
    expect(kept).not.toContain("defold-1.13.1/kinds/script");
    expect(kept).not.toContain("defold-1.13.1/kinds/gui-script");
    for (const id of kept) expect(carries(id, "render")).toBe(true);
  });

  test("a namespace carried in the editor lane satisfies a reference to it", () => {
    const owners = ownersOf("editor.create_resources");
    expect(owners.length).toBeGreaterThan(0);
    expect(bindStored("editor.create_resources")).toEqual(owners);
  });

  test("binding empties no owner list on the committed store", () => {
    const bound = moduleBoundOwnership(store, ownership, surfaces);
    expect(bound.size).toBe(ownership.size);
    const emptied = [...bound.entries()]
      .filter(([, owners]) => owners.length === 0)
      .map(([identity]) => identity)
      .sort();
    expect(emptied).toEqual([]);
  });

  test("every surface a bound body keeps carries every namespace that body references", () => {
    const namespaces = moduleNamespaces(surfaces);
    const bound = moduleBoundOwnership(store, ownership, surfaces);
    const offenders: string[] = [];
    for (const [fqn, entries] of Object.entries(store)) {
      for (const entry of entries) {
        const identity = exampleIdentity(fqn, entry.sourceHash);
        const referenced = referencedNamespaces(entry.ts, namespaces);
        for (const id of bound.get(identity) ?? []) {
          for (const namespace of referenced) {
            if (!carries(id, namespace)) offenders.push(`${identity}: ${namespace} not on ${id}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("authored factory agreement", () => {
  test("every translation calls the factory its documenting kinds export", () => {
    // Binding narrows what the gate compiles; it cannot make a body correct.
    // A `gui.*` example that calls `defineScript` still survives on the
    // aggregate root, which re-exports every factory — so the body ships in the
    // declaration a user reads with a factory that kind cannot import.
    const factories = kindFactoryNames();
    const exportsById = new Map(
      surfaces.map((surface) => [surface.id, surface.exports.values] as const),
    );
    const offenders: string[] = [];
    for (const [fqn, entries] of Object.entries(store)) {
      for (const entry of entries) {
        const identity = exampleIdentity(fqn, entry.sourceHash);
        const called = factories.filter((name) => new RegExp(`\\b${name}\\b`).test(entry.ts));
        if (called.length === 0) continue;
        const kindOwners = (ownership.get(identity) ?? []).filter((id) => id.includes("/kinds/"));
        if (kindOwners.length === 0) continue;
        const available = new Set(
          kindOwners
            .flatMap((id) => exportsById.get(id) ?? [])
            .filter((v) => factories.includes(v)),
        );
        for (const name of called) {
          if (!available.has(name)) offenders.push(`${identity}: ${name} not on ${kindOwners[0]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
