import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { loadTranslations } from "./example-store-io";
import {
  exampleIdentity,
  exampleSurfaces,
  refDocSkippedTargets,
  translationOwnership,
  unownedTranslations,
} from "./example-surfaces";
import { loadApiTargets } from "./regen";

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
