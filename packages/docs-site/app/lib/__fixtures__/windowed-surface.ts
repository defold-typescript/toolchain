import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ApiModule, parseDefoldApiDoc, symbolIdentityKey } from "@defold-typescript/types";
import { funcIdentity } from "../combined-surface";

// A three-version synthetic types dir for the version-window route tests. The
// real corpus cannot exercise the window's interesting cases: its tracked axis
// carries no namespace that was removed between versions, so the widened family
// has no instance there, and its version ids must sort by semver for the window
// to slice them at all (the older `cur`/`old` fixture registry does not).
//
// The axis is newest-first `3.0.0, 2.0.0, 1.0.0`, and every symbol below is
// placed to make exactly one window property observable:
//
// - `demo.always`       — all three versions, so it carries no availability label
// - `demo.added_in_two` — 3.0.0 + 2.0.0, so it reads `Since Defold 2.0.0`
// - `demo.newest_only`  — 3.0.0 only, so a window capped at 2.0.0 drops it
// - `demo.evolving`     — all three, identical ref-doc tokens (hence one identity)
//                         but a different declaration per version, so a capped
//                         window must resolve the declaration at its own bound
// - `gone.thing`        — 1.0.0 only, so the namespace `gone` exists in the full
//                         window but in no single later version's own surface
export const NEWEST = "3.0.0";
export const MIDDLE = "2.0.0";
export const OLDEST = "1.0.0";
export const AXIS = [NEWEST, MIDDLE, OLDEST];

export const versionId = (bare: string): string => `defold-${bare}`;

const param = (name: string, types: string[]) => ({
  name,
  doc: "",
  types,
  is_optional: "False",
});

const fn = (name: string, parameters: unknown[] = []) => ({
  type: "FUNCTION",
  name,
  parameters,
  returnvalues: [],
});

const doc = (namespace: string, elements: unknown[]): string =>
  JSON.stringify({ info: { namespace }, elements });

// `demo.evolving`'s ref-doc tokens are deliberately identical across versions:
// the identity key folds the normalized token signature in, so differing tokens
// would split it into two entries (a transition) instead of the single entry
// whose *declaration* moves, which is what a capped window has to resolve.
const evolving = fn("demo.evolving", [param("a", ["string"])]);

const demoFunctions: Record<string, unknown[]> = {
  [NEWEST]: [fn("demo.always"), fn("demo.added_in_two"), fn("demo.newest_only"), evolving],
  [MIDDLE]: [fn("demo.always"), fn("demo.added_in_two"), evolving],
  [OLDEST]: [fn("demo.always"), evolving],
};

// The authoritative declaration per version. `demo.evolving` gains an optional
// parameter at 3.0.0, so a window capped at 2.0.0 that reads the newest
// declaration instead of its own bound's renders a signature that version never
// shipped.
const evolvingDeclaration: Record<string, string> = {
  [NEWEST]: "function demo.evolving(a: string, b?: number): void;",
  [MIDDLE]: "function demo.evolving(a: string): void;",
  [OLDEST]: "function demo.evolving(a: string): void;",
};

// The declaration for every symbol other than `demo.evolving`, whose text is the
// same in every version that carries it.
const flatDeclaration = (name: string): string => `function ${name}(): void;`;

// Keyed through the production identity encoding rather than a transcribed
// literal, so the artifact cannot drift from what `buildCombinedSurface` looks up.
function signaturesFor(namespace: string, module: ApiModule, version: string): [string, string][] {
  return module.functions.map((f) => [
    symbolIdentityKey(funcIdentity(namespace, f)),
    f.name === "demo.evolving" ? (evolvingDeclaration[version] as string) : flatDeclaration(f.name),
  ]);
}

/**
 * Materialize the synthetic registry into a fresh temp dir and return its path.
 * The caller owns cleanup (`rmSync(dir, { recursive: true, force: true })`).
 */
export function makeWindowedTypesDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "version-window-routes-"));
  const signatureVersions: Record<string, Record<string, string>> = {};

  const targets = AXIS.map((bare) => {
    const fixturesDir = `fixtures/${versionId(bare)}`;
    mkdirSync(join(dir, fixturesDir), { recursive: true });
    const entries: [string, string][] = [];

    const demoRaw = doc("demo", demoFunctions[bare] as unknown[]);
    writeFileSync(join(dir, fixturesDir, "demo_doc.json"), demoRaw);
    entries.push(...signaturesFor("demo", parseDefoldApiDoc(JSON.parse(demoRaw)), bare));

    const modules = [{ namespace: "demo", fixture: "demo_doc.json" }];
    if (bare === OLDEST) {
      const goneRaw = doc("gone", [fn("gone.thing")]);
      writeFileSync(join(dir, fixturesDir, "gone_doc.json"), goneRaw);
      entries.push(...signaturesFor("gone", parseDefoldApiDoc(JSON.parse(goneRaw)), bare));
      modules.push({ namespace: "gone", fixture: "gone_doc.json" });
    }

    signatureVersions[bare] = Object.fromEntries(entries);
    return { id: versionId(bare), default: bare === NEWEST, fixturesDir, modules };
  });

  writeFileSync(join(dir, "api-targets.json"), JSON.stringify({ targets }));
  writeFileSync(join(dir, "api-signatures.json"), JSON.stringify({ versions: signatureVersions }));
  return dir;
}
