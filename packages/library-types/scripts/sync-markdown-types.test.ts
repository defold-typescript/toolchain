import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { MarkdownDoc } from "./parse-markdown-api";
import {
  buildMarkdownFidelity,
  compareFidelityToTsDefold,
  computeMarkdownFidelity,
  emitMarkdownDeclaration,
  evaluateMarkdownCandidate,
  fetchMarkdownFixture,
  lowerMarkdownApiDoc,
  type MarkdownTarget,
  readMarkdownTargets,
  tsDefoldMembers,
  tsDefoldSurface,
} from "./sync-markdown-types";
import { type FetchText, loadTypeResolver } from "./sync-script-api-types";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");

// The orthographic.camera target as it appears in a validated config. A markdown
// target pins one README/`.md` path plus the publish namespace the README's own
// `camera.` alias is retargeted onto, and the exact canonical golden paths.
const ORTHOGRAPHIC: MarkdownTarget = {
  repo: "https://github.com/britzl/defold-orthographic",
  ref: "3.6.3",
  license: "MIT",
  markdown: "README.md",
  moduleId: "orthographic.camera",
  namespace: "orthographic",
  generated: "generated/orthographic.d.ts",
  apiDoc: "api-doc/orthographic.json",
  fidelity: "fidelity/orthographic.json",
  decision: "no-go",
};

function writeConfig(config: unknown): string {
  const root = mkdtempSync(join(tmpdir(), "markdown-targets-config-"));
  writeFileSync(join(root, "markdown-targets.json"), JSON.stringify(config));
  return root;
}

describe("readMarkdownTargets", () => {
  test("parses the committed orthographic entry into a typed target", () => {
    const targets = readMarkdownTargets(PACKAGE_ROOT);
    const ortho = targets.find((t) => t.moduleId === "orthographic.camera");
    expect(ortho).toBeDefined();
    expect(ortho?.namespace).toBe("orthographic");
    expect(ortho?.repo).toBe("https://github.com/britzl/defold-orthographic");
    expect(ortho?.ref).toBe("3.6.3");
    expect(ortho?.markdown).toBe("README.md");
    expect(ortho?.generated).toBe("generated/orthographic.d.ts");
    expect(ortho?.apiDoc).toBe("api-doc/orthographic.json");
  });

  test("throws naming the missing field and the offending entry", () => {
    const { markdown: _drop, ...missingMarkdown } = ORTHOGRAPHIC;
    const root = writeConfig({ targets: [missingMarkdown] });
    expect(() => readMarkdownTargets(root)).toThrow(/markdown/);
    expect(() => readMarkdownTargets(root)).toThrow(/orthographic\.camera/);
  });

  test("names the entry index when moduleId itself is the missing field", () => {
    const { moduleId: _drop, ...missingModuleId } = ORTHOGRAPHIC;
    const root = writeConfig({ targets: [missingModuleId] });
    expect(() => readMarkdownTargets(root)).toThrow(/moduleId/);
    expect(() => readMarkdownTargets(root)).toThrow(/0/);
  });

  test("defaults fidelity to fidelity/<namespace>.json and license to '' when omitted", () => {
    const { fidelity: _f, license: _l, decision: _d, ...bare } = ORTHOGRAPHIC;
    const root = writeConfig({ targets: [bare] });
    const [target] = readMarkdownTargets(root);
    expect(target?.fidelity).toBe("fidelity/orthographic.json");
    expect(target?.license).toBe("");
    expect(target?.decision).toBeUndefined();
  });
});

// A markdown `no-go` judges the markdown source, not the ts-defold dependency:
// orthographic severed into the authored lane while its markdown verdict stands.
// The proof artifacts the no-go produced are untouched by that severance.
describe("orthographic severed to the authored lane without disturbing the markdown proof", () => {
  test("orthographic.camera is no longer a ts-defold library-targets row", () => {
    const targets = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-targets.json"), "utf8"),
    ) as { targets: { module: string }[] };
    expect(targets.targets.some((t) => t.module === "orthographic.camera")).toBe(false);
  });

  test("the vendored authored fork replaced the retired ts-defold fixture", () => {
    expect(existsSync(join(PACKAGE_ROOT, "fixtures/authored/orthographic.camera.d.ts"))).toBe(true);
    expect(existsSync(join(PACKAGE_ROOT, "fixtures/ts-defold/orthographic.camera.d.ts"))).toBe(
      false,
    );
  });

  test("the markdown golden is still not wired into the dts-check include (no cutover)", () => {
    const { include } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "tsconfig.dts-check.json"), "utf8"),
    ) as { include: string[] };
    expect(include).not.toContain("generated/orthographic.d.ts");
  });

  test("the markdown target, its no-go decision, and its fidelity artifact are untouched", () => {
    const target = readMarkdownTargets(PACKAGE_ROOT).find(
      (t) => t.moduleId === "orthographic.camera",
    );
    expect(target).toBeDefined();
    expect(target?.namespace).toBe("orthographic");
    expect(target?.generated).toBe("generated/orthographic.d.ts");
    expect(target?.apiDoc).toBe("api-doc/orthographic.json");
    expect(target?.decision).toBe("no-go");
    expect(existsSync(join(PACKAGE_ROOT, "fidelity/orthographic.json"))).toBe(true);
  });
});

describe("defold-input registers no markdown target on the all-no-go outcome", () => {
  test("markdown-targets.json carries no in.* entry", () => {
    const targets = readMarkdownTargets(PACKAGE_ROOT);
    expect(targets.filter((t) => t.moduleId.startsWith("in."))).toEqual([]);
  });

  // A markdown target's goldens are the canonical `generated/<ns>.d.ts` +
  // `api-doc/<ns>.json`, and for defold-input the markdown namespace `in.<mod>`
  // is the *same* key the live ts-defold module already publishes under (unlike
  // orthographic, whose `orthographic` namespace differs from `orthographic.camera`).
  // Registering a no-go target would therefore overwrite the live artifacts, and
  // the namespace-keyed `decision != "go"` skip would drop the module's docs page
  // outright. The decisions live in `markdown-fidelity-gate.test.ts` instead.
  test("the live ts-defold in.* goldens are the ones the docs site still enumerates", () => {
    for (const mod of ["cursor", "state"]) {
      expect(existsSync(join(PACKAGE_ROOT, "generated", `in.${mod}.d.ts`))).toBe(true);
      expect(existsSync(join(PACKAGE_ROOT, "api-doc", `in.${mod}.json`))).toBe(true);
    }
  });
});

describe("evaluateMarkdownCandidate", () => {
  // An unregistered in-memory target for a library whose markdown namespace is
  // its live ts-defold moduleId. Evaluating it must not touch the canonical
  // paths that module already publishes under.
  const MONARCH: MarkdownTarget = {
    repo: "https://github.com/britzl/monarch",
    ref: "6.0.2",
    license: "MIT",
    markdown: "README_API.md",
    moduleId: "monarch.monarch",
    namespace: "monarch.monarch",
    generated: "generated/monarch.monarch.d.ts",
    apiDoc: "api-doc/monarch.monarch.json",
    fidelity: "fidelity/monarch.monarch.json",
    decision: "no-go",
  };

  test("returns the emitted declaration plus the fidelity-comparison fields", async () => {
    const result = await evaluateMarkdownCandidate(PACKAGE_ROOT, MONARCH);
    expect(result.emitted).toContain("declare module 'monarch.monarch' {");
    expect(result.emitted).toContain("function show(");
    expect(result.markdownMembers).toContain("show");
    expect(result.tsDefoldMembers).toContain("show");
    expect(result.decision).toBe("no-go");
  });

  test("writes nothing — the live in-place goldens survive byte-identical", async () => {
    const live = [MONARCH.generated, MONARCH.apiDoc].map((rel) => ({
      rel,
      before: readFileSync(join(PACKAGE_ROOT, rel), "utf8"),
    }));

    await evaluateMarkdownCandidate(PACKAGE_ROOT, MONARCH);

    for (const { rel, before } of live) {
      expect(readFileSync(join(PACKAGE_ROOT, rel), "utf8")).toBe(before);
    }
    // The fidelity path has no live occupant, so it must simply never appear.
    expect(existsSync(join(PACKAGE_ROOT, MONARCH.fidelity))).toBe(false);
  });
});

describe("fetchMarkdownFixture", () => {
  test("snapshots the pinned README under fixtures/markdown/<moduleId>.md, offline", async () => {
    const root = mkdtempSync(join(tmpdir(), "markdown-fetch-"));
    const fetched: string[] = [];
    const fetchText: FetchText = async (url) => {
      fetched.push(url);
      return `# ${url}\n`;
    };

    await fetchMarkdownFixture(root, ORTHOGRAPHIC, { fetchText });

    expect(fetched).toEqual([
      "https://raw.githubusercontent.com/britzl/defold-orthographic/3.6.3/README.md",
    ]);
    const dest = join(root, "fixtures/markdown/orthographic.camera.md");
    expect(existsSync(dest)).toBe(true);
    expect(readFileSync(dest, "utf8")).toBe(
      "# https://raw.githubusercontent.com/britzl/defold-orthographic/3.6.3/README.md\n",
    );
  });
});

describe("emitMarkdownDeclaration", () => {
  test("routes the README through parseMarkdownApi -> retarget -> generateModuleDeclaration", async () => {
    const contents = await emitMarkdownDeclaration(PACKAGE_ROOT, ORTHOGRAPHIC);
    // Importable module keyed by moduleId, retargeted onto the `orthographic`
    // namespace (the README documents its API under the `camera.` alias).
    expect(contents).toContain("declare module 'orthographic.camera' {");
    expect(contents).toContain("namespace orthographic {");
    // Stable exported function symbols (assert on symbols, not the whole blob).
    expect(contents).toContain("function follow(");
    expect(contents).toContain("function screen_to_world(");
  });

  // The golden is deliberately outside `tsconfig.dts-check.json` (no cutover), so
  // the proof that the README's `matrix` shorthand reaches a real type is the
  // emitted text rather than a consumer compile.
  test("renders the README's `matrix` returns as Matrix4", async () => {
    const contents = await emitMarkdownDeclaration(PACKAGE_ROOT, ORTHOGRAPHIC);
    expect(contents).toContain("function get_view(");
    expect(contents).toContain("function get_projection(");
    expect(contents).not.toContain("): unknown;");
    for (const line of contents.split("\n")) {
      if (line.includes("function get_view(") || line.includes("function get_projection(")) {
        expect(line).toContain("Matrix4");
      }
    }
  });
});

describe("markdown goldens regenerate byte-for-byte", () => {
  test("each target's .d.ts matches its committed generated golden", async () => {
    for (const target of readMarkdownTargets(PACKAGE_ROOT)) {
      const regenerated = await emitMarkdownDeclaration(PACKAGE_ROOT, target);
      const committed = readFileSync(join(PACKAGE_ROOT, target.generated), "utf8");
      expect(regenerated).toBe(committed);
    }
  });

  test("each target's lowered api-doc matches its committed api-doc golden", () => {
    for (const target of readMarkdownTargets(PACKAGE_ROOT)) {
      const regenerated = lowerMarkdownApiDoc(PACKAGE_ROOT, target);
      const committed = readFileSync(join(PACKAGE_ROOT, target.apiDoc), "utf8");
      expect(regenerated).toBe(committed);
    }
  });
});

describe("markdown fidelity", () => {
  test("each target's report matches its committed fidelity golden", async () => {
    for (const target of readMarkdownTargets(PACKAGE_ROOT)) {
      const report = await buildMarkdownFidelity(PACKAGE_ROOT, target);
      const committed = readFileSync(join(PACKAGE_ROOT, target.fidelity), "utf8");
      expect(`${JSON.stringify(report, null, 2)}\n`).toBe(committed);
    }
  });

  // The README's `matrix` alias maps to `Matrix4` and its `nil` union members
  // render `undefined`, so every one of orthographic's type tokens now reaches a
  // real TS type.
  test("orthographic fidelity reflects the real emitter: coverage 1, no unmapped tokens", async () => {
    const report = await buildMarkdownFidelity(PACKAGE_ROOT, ORTHOGRAPHIC);
    expect(report.namespace).toBe("orthographic");
    expect(report.totalMembers).toBe(21);
    expect(report.totalTypeTokens).toBe(87);
    expect(report.unknownFallbacks).toBe(0);
    expect(report.unknownTokens).toEqual([]);
    expect(report.undocumentedMembers).toBe(0);
    expect(report.coverage).toBe(1);
  });

  test("computeMarkdownFidelity throws on an unresolved token outside KNOWN_LOSSY_TOKENS", async () => {
    const resolver = await loadTypeResolver(PACKAGE_ROOT);
    const doc: MarkdownDoc = {
      info: { namespace: "demo", brief: "", description: "" },
      elements: [
        {
          type: "FUNCTION",
          name: "demo.frob",
          description: "does a thing",
          parameters: [{ name: "x", doc: "", types: ["Frobnicate"] }],
          returnvalues: [],
        },
      ],
    };
    expect(() => computeMarkdownFidelity("demo", doc, resolver)).toThrow(/demo/);
    expect(() => computeMarkdownFidelity("demo", doc, resolver)).toThrow(/Frobnicate/);
  });
});

// A prose-only README documents member *names* with no `**PARAMETERS**` /
// `**RETURN**` blocks, so the flat parse keeps every member and emits it
// zero-arity `(): void`. Neither the missing-member term nor the `unknown`
// downgrade term sees that, so the loss needs a term of its own.
describe("compareFidelityToTsDefold signature-loss term", () => {
  test("a dropped parameter list is a loss even when no member and no type token is lost", () => {
    const comparison = compareFidelityToTsDefold(
      "function f(): void;",
      "function f(a: string): void;",
    );
    expect(comparison.signatureLossMembers).toContain("f");
    expect(comparison.missingMembers).toEqual([]);
    expect(comparison.downgradedMembers).toEqual([]);
    expect(comparison.decision).toBe("no-go");
  });

  test("a non-void return lost to void is a loss on its own", () => {
    const comparison = compareFidelityToTsDefold(
      "function g(a: string): void;",
      "function g(a: string): string;",
    );
    expect(comparison.signatureLossMembers).toContain("g");
    expect(comparison.decision).toBe("no-go");
  });

  test("identical signatures keep the decision at go", () => {
    const comparison = compareFidelityToTsDefold(
      "function f(a: string, b?: number): string;",
      "function f(a: string, b?: number): string;",
    );
    expect(comparison.signatureLossMembers).toEqual([]);
    expect(comparison.decision).toBe("go");
  });

  test("extra markdown parameters are an addition, not a loss", () => {
    const comparison = compareFidelityToTsDefold(
      "function f(a: string, b: number): void;",
      "function f(a: string): void;",
    );
    expect(comparison.signatureLossMembers).toEqual([]);
    expect(comparison.decision).toBe("go");
  });

  test("gaining a return where ts-defold had void is an addition, not a loss", () => {
    const comparison = compareFidelityToTsDefold(
      "function f(a: string): string;",
      "function f(a: string): void;",
    );
    expect(comparison.signatureLossMembers).toEqual([]);
    expect(comparison.decision).toBe("go");
  });

  test("a const member is exempt — it has no parameter list to compare", () => {
    const comparison = compareFidelityToTsDefold("const C: number;", "const C: number;");
    expect(comparison.signatureLossMembers).toEqual([]);
    expect(comparison.decision).toBe("go");
  });

  test("a top-level comma inside a parameter's own type does not inflate the arity", () => {
    const comparison = compareFidelityToTsDefold(
      "function f(a: Record<string, number>): void;",
      "function f(a: Record<string, number>, b: string): void;",
    );
    expect(comparison.signatureLossMembers).toContain("f");
  });
});

// A markdown source that writes optionality in prose rather than as a `[name]`
// bracket emits every parameter required. Arity and names both match, so neither
// the missing-member, downgrade, nor signature-loss term fires — yet every
// existing call site that omitted the optional argument breaks. The loss needs a
// term of its own.
describe("compareFidelityToTsDefold optionality-loss term", () => {
  test("an optional ts-defold parameter emitted required is a loss no other term sees", () => {
    const comparison = compareFidelityToTsDefold(
      "function f(a: string): void;",
      "function f(a?: string): void;",
    );
    expect(comparison.optionalityLossMembers).toContain("f");
    expect(comparison.missingMembers).toEqual([]);
    expect(comparison.downgradedMembers).toEqual([]);
    expect(comparison.signatureLossMembers).toEqual([]);
    expect(comparison.decision).toBe("no-go");
  });

  test("optional on both sides is no loss", () => {
    const comparison = compareFidelityToTsDefold(
      "function f(a?: string): void;",
      "function f(a?: string): void;",
    );
    expect(comparison.optionalityLossMembers).toEqual([]);
    expect(comparison.decision).toBe("go");
  });

  test("markdown gaining optionality ts-defold lacked is an addition, not a loss", () => {
    const comparison = compareFidelityToTsDefold(
      "function f(a?: string): void;",
      "function f(a: string): void;",
    );
    expect(comparison.optionalityLossMembers).toEqual([]);
    expect(comparison.decision).toBe("go");
  });

  test("a `?` inside a parameter's own type is not the parameter's optionality", () => {
    const comparison = compareFidelityToTsDefold(
      "function g(cb: (x?: number) => void): void;",
      "function g(cb: (x?: number) => void): void;",
    );
    expect(comparison.optionalityLossMembers).toEqual([]);
    expect(comparison.decision).toBe("go");
  });

  test("markdown parameters past the ts-defold arity are unscored", () => {
    const comparison = compareFidelityToTsDefold(
      "function f(a?: string, b: number): void;",
      "function f(a?: string): void;",
    );
    expect(comparison.optionalityLossMembers).toEqual([]);
    expect(comparison.decision).toBe("go");
  });

  test("a const member is exempt — it has no parameter list to compare", () => {
    const comparison = compareFidelityToTsDefold("const C: number;", "const C: number;");
    expect(comparison.optionalityLossMembers).toEqual([]);
    expect(comparison.decision).toBe("go");
  });
});

// A ts-defold fixture whose `export = handle` names no readable shape — an
// undeclared token, or a handle that is a type rather than a const — presents a
// surface of one re-export handle, or of nothing at all. With nothing to compare
// against, every loss term is vacuously empty and the decision reads `go`
// against a surface the comparator never saw. The guard makes an uncomparable
// ts-defold side decisive on its own.
describe("compareFidelityToTsDefold opaque-surface term", () => {
  test("a ts-defold side that is only an `export =` handle is opaque, not comparable", () => {
    const comparison = compareFidelityToTsDefold(
      "function create(id: string): void;",
      ["declare const exportThis: Starly;", "export = exportThis;"].join("\n"),
    );
    expect(comparison.opaqueTsDefoldSurface).toBe(true);
    expect(comparison.decision).toBe("no-go");
  });

  test("a ts-defold side with no top-level member at all is opaque", () => {
    const comparison = compareFidelityToTsDefold(
      "function create(id: string): void;",
      ["interface CoreModule {", "  create(id: string): void;", "}", "export = CoreModule;"].join(
        "\n",
      ),
    );
    expect(comparison.tsDefoldMembers).toEqual([]);
    expect(comparison.opaqueTsDefoldSurface).toBe(true);
    expect(comparison.decision).toBe("no-go");
  });

  test("a real member beside the `export =` handle leaves the existing terms deciding", () => {
    const comparison = compareFidelityToTsDefold(
      "function create(id: string): void;",
      [
        "declare function create(id: string): void;",
        "declare const exportThis: Starly;",
        "export = exportThis;",
      ].join("\n"),
    );
    expect(comparison.opaqueTsDefoldSurface).toBe(false);
    expect(comparison.tsDefoldMembers).toEqual(["create", "exportThis"]);
    expect(comparison.missingMembers).toEqual(["exportThis"]);
    expect(comparison.decision).toBe("no-go");
  });

  test("the reported ts-defold surface still shows the handle the extractor saw", () => {
    const comparison = compareFidelityToTsDefold(
      "function create(id: string): void;",
      ["declare const exportThis: Starly;", "export = exportThis;"].join("\n"),
    );
    expect(comparison.tsDefoldMembers).toEqual(["exportThis"]);
  });

  test("a comparable ts-defold side is never opaque, so a shipped go cannot flip", () => {
    const comparison = compareFidelityToTsDefold(
      "function f(a: string): string;",
      "function f(a: string): string;",
    );
    expect(comparison.opaqueTsDefoldSurface).toBe(false);
    expect(comparison.decision).toBe("go");
  });
});

// `//* Section` is a line comment whose second character happens to be `*`. A
// stripper that removes block comments before line comments latches its `/*`
// onto the marker and deletes everything up to the next `*/` — the closing line
// of some later JSDoc — silently shrinking the ts-defold surface every term of
// the comparison is measured against.
describe("comment stripping treats `//*` as a line comment", () => {
  test("a `//*` section marker does not swallow the declaration after it", () => {
    const dts = ["export function a(): void;", "//* Section", "export function b(): void;"].join(
      "\n",
    );
    expect(tsDefoldMembers(dts)).toEqual(["a", "b"]);
  });

  test("declarations between a `//*` marker and a later JSDoc survive", () => {
    const dts = [
      "//* Advertisement",
      "export function adv_show_fullscreen_adv(): void;",
      "export function adv_show_rewarded_video(): void;",
      "/** Initialise the player. */",
      "export function player_init(): void;",
    ].join("\n");
    expect(tsDefoldMembers(dts)).toEqual([
      "adv_show_fullscreen_adv",
      "adv_show_rewarded_video",
      "player_init",
    ]);
  });

  test("a real block comment still hides the declaration it wraps", () => {
    const dts = [
      "export function kept(): void;",
      "/*",
      "export function hidden(): void;",
      "*/",
    ].join("\n");
    expect(tsDefoldMembers(dts)).toEqual(["kept"]);
  });

  test("a `//`-style URL inside a block comment does not terminate it early", () => {
    const dts = [
      "/** @see {@link https://example.com/x} */",
      "export function documented(): void;",
    ].join("\n");
    expect(tsDefoldMembers(dts)).toEqual(["documented"]);
  });

  test("a JSDoc mentioning `unknown` above a typed declaration is still not a downgrade", () => {
    const dts = [
      "/** Returns unknown when the SDK is absent. */",
      "function f(a: string): string;",
    ].join("\n");
    const comparison = compareFidelityToTsDefold(dts, dts);
    expect(comparison.downgradedMembers).toEqual([]);
    expect(comparison.decision).toBe("go");
  });
});

// A module whose whole surface is published through `export = handle` puts its
// members inside the handle's shape, where a `function`/`const` keyword scan
// cannot reach them. Reading the handle name as the surface makes every loss
// term vacuously empty in the same direction, so the comparison says nothing
// about the module it was run on. `export =` is the one form where flattening
// is right: the module *is* that object, so the shape's members are the
// module's own flat members — the same flattening `emitLibraryDeclarations`
// performs on the markdown side.
describe("tsDefoldSurface resolves an `export =` handle to its shape", () => {
  test("the handle's interface members replace the handle itself", () => {
    const dts = [
      "interface CoreModule {",
      "  c_width: number;",
      "  create(id: hash): void;",
      "}",
      "const exportThis: CoreModule;",
      "export = exportThis;",
    ].join("\n");
    expect(tsDefoldMembers(dts)).toEqual(["c_width", "create"]);
    const surface = tsDefoldSurface(dts);
    expect(surface.get("create")?.kind).toBe("function");
    expect(surface.get("c_width")?.kind).toBe("const");
  });

  test("the alias walks an intersection and unwraps `Readonly<>`, taking nothing from a non-object arm", () => {
    const dts = [
      "interface CoreModule {",
      "  c_width: number;",
      "  create(id: hash): void;",
      "}",
      "type CameraMap = LuaMap<hash, { behavior: hash; near: number }>;",
      "type Starley = CameraMap & Readonly<CoreModule>;",
      "const exportThis: Starley;",
      "export = exportThis;",
    ].join("\n");
    expect(tsDefoldMembers(dts)).toEqual(["c_width", "create"]);
  });

  test("a resolved member carries a real signature, so every derived term scores it", () => {
    const tsDefold = [
      "interface CoreModule {",
      "  activate(id: hash): vmath.matrix4;",
      "  get_offset(id: hash, distance: number): number;",
      "  get_view(id: hash): vmath.matrix4;",
      "  shake(id: hash, radius?: number): void;",
      "}",
      "const exportThis: CoreModule;",
      "export = exportThis;",
    ].join("\n");
    const markdown = [
      "function activate(id: hash): void;",
      "function get_offset(id: hash): number;",
      "function get_view(id: hash): unknown;",
      "function shake(id: hash, radius: number): void;",
    ].join("\n");
    const comparison = compareFidelityToTsDefold(markdown, tsDefold);
    expect(comparison.missingMembers).toEqual([]);
    expect(comparison.addedMembers).toEqual([]);
    expect(comparison.signatureLossMembers).toEqual(["activate", "get_offset"]);
    expect(comparison.downgradedMembers).toEqual(["get_view"]);
    expect(comparison.optionalityLossMembers).toEqual(["shake"]);
    expect(comparison.decision).toBe("no-go");
  });

  test("a handle typed by an undeclared token stays opaque", () => {
    const comparison = compareFidelityToTsDefold(
      "function create(id: hash): void;",
      ["const exportThis: Starly;", "export = exportThis;"].join("\n"),
    );
    expect(comparison.tsDefoldMembers).toEqual(["exportThis"]);
    expect(comparison.opaqueTsDefoldSurface).toBe(true);
  });

  test("a handle typed by a memberless shape stays opaque", () => {
    const comparison = compareFidelityToTsDefold(
      "function create(id: hash): void;",
      ["interface Empty {}", "const exportThis: Empty;", "export = exportThis;"].join("\n"),
    );
    expect(comparison.tsDefoldMembers).toEqual(["exportThis"]);
    expect(comparison.opaqueTsDefoldSurface).toBe(true);
  });

  test("a referenced-only shape contributes nothing and a non-handle const keeps its fields nested", () => {
    const dts = [
      "interface Options {",
      "  retries: number;",
      "}",
      "type Result = { ok: boolean };",
      "function run(options: Options): Result;",
      "const config: Options;",
    ].join("\n");
    expect(tsDefoldMembers(dts)).toEqual(["config", "run"]);
  });
});
