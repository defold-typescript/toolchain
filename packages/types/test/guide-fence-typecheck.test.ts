/**
 * The guide presents some fences as working code a reader can copy. This gate
 * compiles those against the shipped declarations at the strictness
 * `defold-typescript init` writes, so a fence naming a type the surface does not
 * ship fails here instead of failing in the reader's editor.
 *
 * Most fences in this guide are deliberately uncompilable — `@ts-expect-error`
 * pins, `// TS error` markers, bodies that depend on undeclared locals — so the
 * selection is an explicit list rather than a sweep. Each entry resolves through
 * its lead-in text, and an entry that resolves to no fence fails: a renamed
 * lead-in reds rather than quietly emptying the selection.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { type ExampleSurface, exampleSurfaces } from "../scripts/example-surfaces";
import { compileSurface, exampleUnit } from "../scripts/example-typecheck";

const GUIDE_DIR = resolve(import.meta.dir, "..", "..", "docs", "guide");
const GENERATED_ROOT = resolve(import.meta.dir, "..", "generated");

/** A fence the guide presents as working code, addressed by its lead-in. */
interface FenceSelection {
  /** The guide page, relative to the guide directory. */
  readonly page: string;
  /** Literal guide text the fence follows; renaming it reds this gate. */
  readonly lead: string;
  /** Which `ts` fence after the lead-in, counting from 0. */
  readonly nth: number;
  /**
   * The script kind the fence is written for. Each kind declares only the
   * namespaces that kind can reach — `gui` exists in a gui script and nowhere
   * else — so a fence judged on the wrong kind fails for a reason the fence
   * cannot fix.
   */
  readonly kind: string;
}

const SELECTED: readonly FenceSelection[] = [
  { page: "typescript-gotchas.md", lead: "**Naming the enum.**", nth: 0, kind: "gui-script" },
  {
    page: "typescript-vs-lua.md",
    lead: "### Engine indexes use Defold's base",
    nth: 0,
    kind: "script",
  },
  {
    page: "typescript-vs-lua.md",
    lead: "### Engine array properties: `options.index`",
    nth: 0,
    kind: "script",
  },
];

const surfaces = await exampleSurfaces();

/**
 * The surface a `defold-typescript init` project compiles a script of this kind
 * against: the kind whose entry is the package's own `generated/` output.
 * Selecting by entry path rather than by version id keeps the gate on the
 * shipped surface when the tracked axis gains a release.
 */
function shippedSurface(kind: string): ExampleSurface {
  const found = surfaces.filter(
    (surface) =>
      surface.id.endsWith(`/kinds/${kind}`) && surface.entry.startsWith(`${GENERATED_ROOT}${sep}`),
  );
  expect(found, `one shipped ${kind} surface`).toHaveLength(1);
  return found[0] as ExampleSurface;
}

/** Every ```ts fence body following `lead`, in document order. */
function fencesAfter(guide: string, lead: string): string[] {
  const at = guide.indexOf(lead);
  if (at === -1) return [];
  const bodies: string[] = [];
  for (const m of guide.slice(at).matchAll(/```ts\n([\s\S]*?)```/g)) bodies.push(m[1] as string);
  return bodies;
}

function selectedFence(selection: FenceSelection): string {
  const guide = readFileSync(resolve(GUIDE_DIR, selection.page), "utf8");
  const bodies = fencesAfter(guide, selection.lead);
  const body = bodies[selection.nth];
  expect(
    body,
    `no ts fence #${selection.nth} follows ${selection.lead} in ${selection.page}`,
  ).toBeString();
  return body as string;
}

function diagnosticsFor(surface: ExampleSurface, bodies: readonly string[]): string[][] {
  const units = bodies.map((body, i) => exampleUnit(surface, `guide-fence-${i}`, "authored", body));
  const compiled = compileSurface(surface, units);
  expect(compiled.entry).toEqual([]);
  return units.map((unit) =>
    (compiled.units.get(unit.identity) ?? []).map((d) => `TS${d.code}: ${d.text}`),
  );
}

describe("guide fences presented as working code", () => {
  test("every selected fence resolves to a fence body", () => {
    expect(SELECTED.length).toBeGreaterThan(0);
    for (const selection of SELECTED) {
      expect(selectedFence(selection).trim()).not.toBe("");
    }
  });

  test("every selected fence compiles against the surface its kind ships", () => {
    for (const selection of SELECTED) {
      const [found] = diagnosticsFor(shippedSurface(selection.kind), [selectedFence(selection)]);
      expect(found, `${selection.lead} fence`).toEqual([]);
    }
  });

  test("the gate can fail: a fence naming an unshipped type reports a diagnostic", () => {
    const [found] = diagnosticsFor(shippedSurface("gui-script"), [
      "function f(easing: gui.NoSuchAlias) {\n  void easing;\n}\nvoid f;\n",
    ]);
    expect(found?.length ?? 0).toBeGreaterThan(0);
  });
});
