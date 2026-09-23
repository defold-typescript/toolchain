import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type ApiFunction,
  type ApiModule,
  parseDefoldApiDoc,
  symbolIdentityKey,
} from "@defold-typescript/types";
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
//
// `deprecationWidened` adds one more namespace, off by default so every existing
// caller sees an unchanged registry: `held.thing` ships typings at 3.0.0 alone
// yet is curated `deprecated since 3.0.0`, which widens its availability back
// across the whole axis. It is the only case here that separates a version's
// curated availability from its on-disk surface — every other namespace is
// present exactly where its typings are, so those two sources agree and a
// substitution between them stays invisible.
export const NEWEST = "3.0.0";
export const MIDDLE = "2.0.0";
export const OLDEST = "1.0.0";
export const AXIS = [NEWEST, MIDDLE, OLDEST];

// `gone` ships at `OLDEST` alone, so the Combined union carries it while no single
// later version's own surface does. Declared once here and read by the canonical
// index guards, so neither transcribes an identity the fixture owns.
export const HISTORICAL_ONLY_NAMESPACE = "gone";
export const HISTORICAL_ONLY_SYMBOL = "gone.thing";

// `typedefShape` gives `demo` a member-bearing typedef named for the module-function
// section heading, plus `demo.configure(opts: Functions)` whose recorded declaration
// names it too. The shape's own `## Functions` heading therefore collides by slug
// with the section's, which is the only way to observe that a signature deep-link
// resolves against the id the render minted rather than the bare label. Off by
// default, so every existing caller sees an unchanged registry.
export const TYPEDEF_SHAPE_NAME = "Functions";
export const TYPEDEF_SHAPE_CONSUMER = "demo.configure";

// `constantUnionAlias` gives `demo` the emitter-minted constant-union alias
// `demo.Easing`, the two constants it unions, and a consumer typed by both the
// alias and the canonical `Opaque` brand. That one page makes the versioned
// route's two link sources observable at once: the alias must resolve against
// the windowed collection (so its href carries this version's prefix) while the
// brand must resolve against the canonical one (so it keeps its single home).
// The alias needs no ref-doc element — it is minted from an `api-signatures.json`
// key alone — so the fixture declares it exactly as the emitter does. Off by
// default, so every existing caller sees an unchanged registry.
const ALIAS_LOCAL_NAME = "Easing";
export const CONSTANT_UNION_ALIAS = `demo.${ALIAS_LOCAL_NAME}`;
const ALIAS_MEMBERS = ["demo.EASING_LINEAR", "demo.EASING_OUTSINE"];
export const CONSTANT_UNION_ALIAS_SIGNATURE = `type ${ALIAS_LOCAL_NAME} = ${ALIAS_MEMBERS.map(
  (member) => `typeof ${member}`,
).join(" | ")}`;
export const CONSTANT_UNION_ALIAS_CONSUMER = "demo.tween";

// The brand source for the canonical half of the route's link map:
// `loadVersionIndependentPages` parses this file out of `<typesDir>/src`, and
// `Opaque` is in the value-type allowlist, so writing it gives the surface an
// `/api/Opaque` page.
const OPAQUE_CORE_TYPES = `declare const OpaqueBrand: unique symbol;

/**
 * An opaque engine handle. The engine hands these back; TypeScript keeps them
 * apart by name rather than letting you look inside.
 */
export interface Opaque<Name extends string> {
  readonly [OpaqueBrand]: Name;
}
`;

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

// The shape consumer: its one parameter is typed by the typedef below, so the
// rendered signature carries a `Functions` token for the link map to claim.
const shapeConsumer = fn(TYPEDEF_SHAPE_CONSUMER, [param("opts", [TYPEDEF_SHAPE_NAME])]);

// The member-bearing typedef itself. `apiModuleSymbols` projects each member as a
// `Functions.<member>` `type` symbol, which `groupTypeSymbols` gathers back under
// one `Functions` heading.
const shapeTypedef = {
  type: "TYPEDEF",
  name: TYPEDEF_SHAPE_NAME,
  functions: [
    { name: "run", brief: "Run it.", description: "Run it.", parameters: [], returnvalues: [] },
  ],
  properties: [{ name: "count", types: ["number"] }],
};

// The alias members, as real page symbols: the entry's union arms name them, so
// a reader following an alias link lands on a page that actually declares them.
const aliasConstants = ALIAS_MEMBERS.map((name) => ({ type: "CONSTANT", name }));

// The alias consumer. Its two parameter types are the whole point of the
// fixture: one resolves through the windowed collection, the other through the
// canonical one.
const aliasConsumer = fn(CONSTANT_UNION_ALIAS_CONSUMER, [
  param("node", ['Opaque<"node">']),
  param("easing", [CONSTANT_UNION_ALIAS]),
]);

// The alias' own `api-signatures.json` key, shaped exactly as the emitter writes
// it: a `TYPEDEF` identity with an empty signature, which is what
// `buildCombinedSurface` scans for when it mints alias entries no ref-doc
// accumulator declares.
const aliasSignatureEntry = (): [string, string] => [
  symbolIdentityKey({ namespace: "demo", kind: "TYPEDEF", name: ALIAS_LOCAL_NAME, signature: "" }),
  `${CONSTANT_UNION_ALIAS_SIGNATURE};`,
];

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

// The authoritative declaration a rendered signature is built from. The shape
// consumer needs its parameter type spelled out here too: the render prefers the
// recorded declaration over the ref-doc-derived one, so a flat `(): void` here
// would erase the very token the link map is supposed to claim.
function declarationFor(name: string, version: string): string {
  if (name === "demo.evolving") return evolvingDeclaration[version] as string;
  if (name === TYPEDEF_SHAPE_CONSUMER) {
    return `function ${name}(opts: ${TYPEDEF_SHAPE_NAME}): void;`;
  }
  if (name === CONSTANT_UNION_ALIAS_CONSUMER) {
    return `function ${name}(node: Opaque<"node">, easing: ${CONSTANT_UNION_ALIAS}): void;`;
  }
  return flatDeclaration(name);
}

// Keyed through the production identity encoding rather than a transcribed
// literal, so the artifact cannot drift from what `buildCombinedSurface` looks up.
function signaturesFor(namespace: string, module: ApiModule, version: string): [string, string][] {
  return module.functions.map((f) => [
    symbolIdentityKey(funcIdentity(namespace, f)),
    declarationFor(f.name, version),
  ]);
}

/**
 * Materialize the synthetic registry into a fresh temp dir and return its path.
 * The caller owns cleanup (`rmSync(dir, { recursive: true, force: true })`).
 */
export interface WindowedTypesDirOptions {
  /** Include the curated-availability namespace described above. */
  deprecationWidened?: boolean;
  /** Give `demo` the slug-colliding typedef shape described above. */
  typedefShape?: boolean;
  /** Give `demo` the constant-union alias and its consumer described above. */
  constantUnionAlias?: boolean;
}

export function makeWindowedTypesDir(options: WindowedTypesDirOptions = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "version-window-routes-"));
  if (options.constantUnionAlias) {
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "core-types.ts"), OPAQUE_CORE_TYPES);
  }
  const signatureVersions: Record<string, Record<string, string>> = {};
  let heldIdentity: unknown;

  const targets = AXIS.map((bare) => {
    const fixturesDir = `fixtures/${versionId(bare)}`;
    mkdirSync(join(dir, fixturesDir), { recursive: true });
    const entries: [string, string][] = [];

    const demoElements = [...(demoFunctions[bare] as unknown[])];
    if (options.typedefShape) demoElements.push(shapeConsumer, shapeTypedef);
    if (options.constantUnionAlias) demoElements.push(aliasConsumer, ...aliasConstants);
    const demoRaw = doc("demo", demoElements);
    writeFileSync(join(dir, fixturesDir, "demo_doc.json"), demoRaw);
    entries.push(...signaturesFor("demo", parseDefoldApiDoc(JSON.parse(demoRaw)), bare));
    if (options.constantUnionAlias) entries.push(aliasSignatureEntry());

    const modules = [{ namespace: "demo", fixture: "demo_doc.json" }];
    if (options.deprecationWidened && bare === NEWEST) {
      const heldRaw = doc("held", [fn("held.thing")]);
      writeFileSync(join(dir, fixturesDir, "held_doc.json"), heldRaw);
      const heldModule = parseDefoldApiDoc(JSON.parse(heldRaw));
      entries.push(...signaturesFor("held", heldModule, bare));
      heldIdentity = funcIdentity("held", heldModule.functions[0] as ApiFunction);
      modules.push({ namespace: "held", fixture: "held_doc.json" });
    }
    if (bare === OLDEST) {
      const goneRaw = doc(HISTORICAL_ONLY_NAMESPACE, [fn(HISTORICAL_ONLY_SYMBOL)]);
      writeFileSync(join(dir, fixturesDir, "gone_doc.json"), goneRaw);
      entries.push(
        ...signaturesFor(HISTORICAL_ONLY_NAMESPACE, parseDefoldApiDoc(JSON.parse(goneRaw)), bare),
      );
      modules.push({ namespace: HISTORICAL_ONLY_NAMESPACE, fixture: "gone_doc.json" });
    }

    signatureVersions[bare] = Object.fromEntries(entries);
    return { id: versionId(bare), default: bare === NEWEST, fixturesDir, modules };
  });

  writeFileSync(join(dir, "api-targets.json"), JSON.stringify({ targets }));
  writeFileSync(join(dir, "api-signatures.json"), JSON.stringify({ versions: signatureVersions }));
  if (heldIdentity) {
    writeFileSync(
      join(dir, "api-availability.json"),
      JSON.stringify({
        versions: AXIS,
        records: [{ identity: heldIdentity, availableIn: AXIS, deprecatedSince: NEWEST }],
      }),
    );
  }
  return dir;
}
