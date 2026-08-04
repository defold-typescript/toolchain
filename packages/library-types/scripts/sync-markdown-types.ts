import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { FidelityReport } from "./luals-fidelity";
import { type MarkdownDoc, parseMarkdownApi } from "./parse-markdown-api";
import {
  computeScriptApiFidelity,
  type FetchText,
  loadTypeResolver,
  type ScriptApiDoc,
  type TypeResolver,
} from "./sync-script-api-types";

/**
 * The markdown ingestion front-end: a third `library-types` corpus mode beside
 * the LuaLS front-end (`sync-luals-types.ts`) and the `.script_api` front-end
 * (`sync-script-api-types.ts`). It reads a library's committed README/`.md`
 * snapshot (`parseMarkdownApi`) into the shared ref-doc `doc` shape and routes it
 * through the same emitter (`generateModuleDeclaration`) and fidelity machinery.
 *
 * The README documents its API under the library's own require alias (e.g.
 * `camera.` for defold-orthographic); each target pins the `namespace` this repo
 * publishes it under, so the parsed doc is *retargeted* onto that namespace
 * before emitting — the goldens are named for the target's `namespace` verbatim
 * (`generated/<namespace>.d.ts`, so `generated/orthographic.d.ts`), keeping the
 * file layout uniform with druid.
 *
 * A markdown parse is likely **lower fidelity** than the hand-written ts-defold
 * `.d.ts` it would replace (a README rarely documents constants or every
 * overload), so each cutover is gated: `compareFidelityToTsDefold` reports the
 * member surface lost versus the retired ts-defold declaration, and the target's
 * recorded `decision` (`go` / `no-go`) must match. The parser + front-end land as
 * the reusable foundation either way; only the per-library cutover is gated.
 */
export interface MarkdownTarget {
  repo: string;
  ref: string;
  markdown: string;
  moduleId: string;
  namespace: string;
  generated: string;
  apiDoc: string;
  // Defaults to `fidelity/<namespace>.json` when omitted.
  fidelity: string;
  // SPDX-style license id, surfaced by the docs-site provenance block. Optional
  // in the config; defaults to "".
  license: string;
  // The recorded fidelity go/no-go decision for this target. `no-go` keeps the
  // library ts-defold-sourced; `go` cuts it over. Optional until the gate runs.
  decision?: "go" | "no-go";
}

export interface MarkdownTargets {
  targets: MarkdownTarget[];
}

const REQUIRED_FIELDS = [
  "repo",
  "ref",
  "markdown",
  "moduleId",
  "namespace",
  "generated",
  "apiDoc",
] as const;

/**
 * Read `markdown-targets.json`, validate every required field per entry, and fill
 * optional defaults (`fidelity` → `fidelity/<namespace>.json`, `license` → "").
 * Throws on the first missing field naming both the field and the offending entry
 * (its `moduleId`, or its index when `moduleId` itself is absent) — the loud-fail
 * discipline `readScriptApiTargets`/`readLualsTargets` use. No network.
 */
export function readMarkdownTargets(packageRoot: string): MarkdownTarget[] {
  const parsed = JSON.parse(readFileSync(join(packageRoot, "markdown-targets.json"), "utf8")) as {
    targets: Partial<MarkdownTarget>[];
  };
  return parsed.targets.map((entry, index) => {
    const label = typeof entry.moduleId === "string" ? entry.moduleId : `index ${index}`;
    for (const field of REQUIRED_FIELDS) {
      if (entry[field] === undefined) {
        throw new Error(
          `markdown-targets.json: entry ${label} is missing required field "${field}".`,
        );
      }
    }
    return {
      repo: entry.repo as string,
      ref: entry.ref as string,
      markdown: entry.markdown as string,
      moduleId: entry.moduleId as string,
      namespace: entry.namespace as string,
      generated: entry.generated as string,
      apiDoc: entry.apiDoc as string,
      fidelity: entry.fidelity ?? `fidelity/${entry.namespace as string}.json`,
      license: entry.license ?? "",
      ...(entry.decision !== undefined ? { decision: entry.decision } : {}),
    };
  });
}

/** A GitHub repo URL reduced to the bare `<owner>/<repo>` slug. */
function repoSlug(repo: string): string {
  return repo
    .replace(/^https:\/\/github\.com\//, "")
    .replace(/\.git$/, "")
    .replace(/\/$/, "");
}

function rawUrl(target: MarkdownTarget): string {
  return `https://raw.githubusercontent.com/${repoSlug(target.repo)}/${target.ref}/${target.markdown}`;
}

function fixturePath(packageRoot: string, target: MarkdownTarget): string {
  return join(packageRoot, "fixtures/markdown", `${target.moduleId}.md`);
}

/**
 * Snapshot the pinned README/`.md` into `fixtures/markdown/<moduleId>.md` via the
 * raw-content URL. Snapshot only — no parse. The `fetchText` seam keeps the pass
 * offline-testable; only the CLI `--fetch` arm wires the real network.
 */
export async function fetchMarkdownFixture(
  packageRoot: string,
  target: MarkdownTarget,
  seams: { fetchText: FetchText },
): Promise<void> {
  const text = await seams.fetchText(rawUrl(target));
  const dest = fixturePath(packageRoot, target);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, text);
}

interface RegenModule {
  generateModuleDeclaration: (entry: {
    namespace: string;
    doc: unknown;
    outFile: string;
    importsFrom?: string;
    moduleId?: string;
  }) => { contents: string; dropped: string[] };
}

// orthographic references only ambient engine handles (`hash`/`url`/`vmath.*`),
// which the module-wrapped form emits as globals, so this import never reaches
// the golden; it mirrors the script_api front-end for the day a markdown target
// needs a core-types import.
const MARKDOWN_CORE_TYPES_IMPORT = "../src/core-types";

async function loadGenerate(
  packageRoot: string,
): Promise<RegenModule["generateModuleDeclaration"]> {
  const typesRoot = join(packageRoot, "..", "types");
  const regen = (await import(join(typesRoot, "scripts", "regen.ts"))) as RegenModule;
  return regen.generateModuleDeclaration;
}

function parseFixtureDoc(packageRoot: string, target: MarkdownTarget): MarkdownDoc {
  const text = readFileSync(fixturePath(packageRoot, target), "utf8");
  return parseMarkdownApi(text, target.moduleId);
}

/**
 * Retarget the parsed doc onto the pinned publish namespace: rewrite each
 * element's leading `<readmePrefix>.` to `<namespace>.` and set `info.namespace`.
 * The README's own alias (`camera`) becomes the target namespace (`orthographic`).
 */
export function retargetDoc(doc: MarkdownDoc, namespace: string): MarkdownDoc {
  const oldPrefix = `${doc.info.namespace}.`;
  return {
    info: { ...doc.info, namespace },
    elements: doc.elements.map((element) => ({
      ...element,
      name: element.name.startsWith(oldPrefix)
        ? `${namespace}.${element.name.slice(oldPrefix.length)}`
        : element.name,
    })),
  };
}

function retargetedFixtureDoc(packageRoot: string, target: MarkdownTarget): MarkdownDoc {
  return retargetDoc(parseFixtureDoc(packageRoot, target), target.namespace);
}

/**
 * `parseMarkdownApi` -> retarget -> `generateModuleDeclaration`. Returns an
 * importable module keyed by `moduleId` (`declare module '<moduleId>'`).
 */
export async function emitMarkdownDeclaration(
  packageRoot: string,
  target: MarkdownTarget,
): Promise<string> {
  const generate = await loadGenerate(packageRoot);
  const doc = retargetedFixtureDoc(packageRoot, target);
  const { contents } = generate({
    namespace: target.namespace,
    doc,
    outFile: `${target.moduleId}.d.ts`,
    importsFrom: MARKDOWN_CORE_TYPES_IMPORT,
    moduleId: target.moduleId,
  });
  return contents;
}

/** The api-doc golden is the retargeted ref-doc `doc` itself, pretty-printed. */
export function lowerMarkdownApiDoc(packageRoot: string, target: MarkdownTarget): string {
  const doc = retargetedFixtureDoc(packageRoot, target);
  return `${JSON.stringify(doc, null, 2)}\n`;
}

// Type tokens a human triaged as acceptably lossy for a markdown cutover. The
// allowlist is drained — every token orthographic's README uses now maps to a
// real TS type — but the mechanism stays: a new sibling's unexpected token
// loud-fails at regen until it is mapped or deliberately added here.
const KNOWN_LOSSY_TOKENS = new Set<string>([]);

/**
 * markdown-scoped wrapper over the shared `computeScriptApiFidelity`. After the
 * report is built, any `unknownToken` outside `KNOWN_LOSSY_TOKENS` loud-fails —
 * a brand-new library's unclassified token must not be swallowed as `unknown` at
 * regen time. The shared `computeScriptApiFidelity` is left untouched so the
 * script_api/luals goldens (which legitimately carry unknown tokens) stay green.
 */
export function computeMarkdownFidelity(
  namespace: string,
  doc: MarkdownDoc,
  resolver: TypeResolver,
): FidelityReport {
  const report = computeScriptApiFidelity(namespace, doc as unknown as ScriptApiDoc, resolver);
  const unmappable = report.unknownTokens.filter((token) => !KNOWN_LOSSY_TOKENS.has(token));
  if (unmappable.length > 0) {
    throw new Error(
      `markdown fidelity [${namespace}]: unmappable type token(s) ${JSON.stringify(unmappable)} — resolve them or add to KNOWN_LOSSY_TOKENS`,
    );
  }
  return report;
}

export async function buildMarkdownFidelity(
  packageRoot: string,
  target: MarkdownTarget,
): Promise<FidelityReport> {
  const resolver = await loadTypeResolver(packageRoot);
  const doc = retargetedFixtureDoc(packageRoot, target);
  return computeMarkdownFidelity(target.namespace, doc, resolver);
}

/** The result of comparing an emitted markdown surface against the ts-defold
 * `.d.ts` it would replace. `decision` is `no-go` whenever a ts-defold member is
 * absent from the markdown emit (a missing member), **or** a member both surfaces
 * share was downgraded to `unknown` by the markdown emit (a lost type), **or** a
 * shared member kept its name but lost part of its signature (dropped parameters,
 * or a non-`void` return collapsed to `void`), **or** a shared member kept its
 * arity but emitted an optional ts-defold parameter as required, **or** the
 * ts-defold side presents no comparable member at all (an opaque surface), which
 * would otherwise leave every other term vacuously empty and read as `go`. */
export interface FidelityComparison {
  tsDefoldMembers: string[];
  markdownMembers: string[];
  missingMembers: string[];
  addedMembers: string[];
  downgradedMembers: string[];
  signatureLossMembers: string[];
  optionalityLossMembers: string[];
  opaqueTsDefoldSurface: boolean;
  decision: "go" | "no-go";
}

interface TsDefoldMember {
  kind: "function" | "const";
  signature: string;
}

// Optional `export`, then `function`/`const`, then the member name. Bare (no
// `export`) declarations are valid inside `declare module` and the markdown
// emitter produces them, so `export` must not be required.
const MEMBER_DECL = /(?:export\s+)?(function|const)\s+([A-Za-z_]\w*)/g;

/** Strip block and line comments so keyword-shaped prose inside a doc comment
 * (e.g. "This function is called…") never latches onto `MEMBER_DECL`, and so a
 * `unknown` mentioned in JSDoc never reads as a real type downgrade. A single
 * left-to-right scan decides at each `/` which form opens, so `//*` — a section
 * marker some bindings use — reads as a line comment rather than as a block
 * comment running to the next block-comment terminator many declarations
 * later. */
function stripComments(dts: string): string {
  let out = "";
  let index = 0;
  while (index < dts.length) {
    if (dts[index] === "/" && dts[index + 1] === "/") {
      const end = dts.indexOf("\n", index);
      if (end === -1) break;
      index = end;
    } else if (dts[index] === "/" && dts[index + 1] === "*") {
      const end = dts.indexOf("*/", index + 2);
      index = end === -1 ? dts.length : end + 2;
    } else {
      out += dts[index];
      index++;
    }
  }
  return out;
}

/**
 * Extract every top-level `function`/`const` member of a module `.d.ts` — both
 * `export`ed and bare — with its declaration text (through the terminating
 * top-level `;`, balancing `()`/`{}` for multiline signatures and object-typed
 * consts). The emitted markdown module uses bare `function`, so a single
 * extractor serves both sides of the comparison.
 */
export function tsDefoldSurface(dts: string): Map<string, TsDefoldMember> {
  const src = stripComments(dts);
  const members = new Map<string, TsDefoldMember>();
  MEMBER_DECL.lastIndex = 0;
  let match = MEMBER_DECL.exec(src);
  while (match !== null) {
    const kind = match[1] as "function" | "const";
    const name = match[2] as string;
    let index = MEMBER_DECL.lastIndex;
    let parens = 0;
    let braces = 0;
    while (index < src.length) {
      const ch = src[index];
      if (ch === "(") parens++;
      else if (ch === ")") parens--;
      else if (ch === "{") braces++;
      else if (ch === "}") braces--;
      else if (ch === ";" && parens === 0 && braces === 0) break;
      index++;
    }
    const signature = src
      .slice(match.index, index + 1)
      .replace(/\s+/g, " ")
      .trim();
    if (!members.has(name)) members.set(name, { kind, signature });
    MEMBER_DECL.lastIndex = index + 1;
    match = MEMBER_DECL.exec(src);
  }
  return members;
}

/** The top-level member locals of a module `.d.ts`, sorted. */
export function tsDefoldMembers(dts: string): string[] {
  return [...tsDefoldSurface(dts).keys()].sort();
}

/** Whether a closing bracket at `index` really closes a type group. `>` is the
 * only ambiguous one: in `(x: string) => void` it belongs to the arrow, not to a
 * generic argument list. */
function closesGroup(text: string, index: number): boolean {
  const ch = text[index];
  if (ch === ")" || ch === "]" || ch === "}") return true;
  return ch === ">" && text[index - 1] !== "=";
}

function opensGroup(ch: string | undefined): boolean {
  return ch === "(" || ch === "[" || ch === "{" || ch === "<";
}

/** Split a parameter list on its top-level commas, so a comma inside a
 * parameter's own type (`Record<string, number>`, `[a, b]`) never reads as a
 * separator. */
function splitParameters(inner: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i] as string;
    if (opensGroup(ch)) depth++;
    else if (closesGroup(inner, i)) depth--;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter((part) => part !== "");
}

/** Whether a parameter slot is declared optional. Optionality is a `?` on the
 * parameter *name*; a `?` anywhere in the parameter's own type (`cb: (x?: number)
 * => void`) belongs to that type, not to the slot. */
function isOptionalParameter(parameter: string): boolean {
  return /^[A-Za-z_]\w*\?\s*:/.test(parameter.trim());
}

interface SignatureShape {
  parameters: string[];
  returnType: string;
}

/** The top-level parameter list and return type of a `function` declaration.
 * `undefined` when the text carries no balanced parameter list at all — a `const`
 * declaration, or a signature the extractor truncated. */
function signatureShape(signature: string): SignatureShape | undefined {
  const open = signature.indexOf("(");
  if (open === -1) return undefined;
  let depth = 0;
  let close = -1;
  for (let i = open; i < signature.length; i++) {
    if (opensGroup(signature[i])) depth++;
    else if (closesGroup(signature, i)) {
      depth--;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close === -1) return undefined;
  const tail = signature
    .slice(close + 1)
    .trim()
    .replace(/;\s*$/, "")
    .trim();
  return {
    parameters: splitParameters(signature.slice(open + 1, close)),
    returnType: tail.startsWith(":") ? tail.slice(1).trim() : "",
  };
}

/**
 * Compare the emitted markdown `.d.ts` against the ts-defold `.d.ts` it would
 * replace and derive the go/no-go decision. A ts-defold member absent from the
 * markdown emit is a missing member; a shared member whose markdown signature
 * introduced `unknown` the ts-defold declaration lacked is a type downgrade; a
 * shared member that kept its name but dropped parameters, or collapsed a
 * non-`void` return to `void`, is a signature loss; a shared member that kept
 * every ts-defold parameter but emitted an optional one as required is an
 * optionality loss. A ts-defold side whose only top-level declaration is its
 * `export =` re-export handle — or which declares no top-level member at all,
 * publishing through `interface`/`type` the extractor cannot read — is an opaque
 * surface: there is nothing to compare against, so every other term is vacuously
 * empty. Any of the five forces `no-go`.
 */
export function compareFidelityToTsDefold(
  markdownEmittedDts: string,
  tsDefoldDts: string,
): FidelityComparison {
  const tsMap = tsDefoldSurface(tsDefoldDts);
  const mdMap = tsDefoldSurface(markdownEmittedDts);
  const tsMembers = [...tsMap.keys()].sort();
  const mdMembers = [...mdMap.keys()].sort();
  const missingMembers = tsMembers.filter((name) => !mdMap.has(name));
  const addedMembers = mdMembers.filter((name) => !tsMap.has(name));
  const hasUnknown = (member: TsDefoldMember | undefined): boolean =>
    member !== undefined && /\bunknown\b/.test(member.signature);
  const downgradedMembers = tsMembers.filter(
    (name) => hasUnknown(mdMap.get(name)) && !hasUnknown(tsMap.get(name)),
  );
  const signatureLossMembers = tsMembers.filter((name) => {
    const ts = tsMap.get(name);
    const md = mdMap.get(name);
    if (ts === undefined || md === undefined) return false;
    if (ts.kind !== "function" || md.kind !== "function") return false;
    const tsShape = signatureShape(ts.signature);
    const mdShape = signatureShape(md.signature);
    if (tsShape === undefined || mdShape === undefined) return false;
    if (mdShape.parameters.length < tsShape.parameters.length) return true;
    // An unannotated ts-defold return has nothing to lose against.
    return (
      mdShape.returnType === "void" && tsShape.returnType !== "void" && tsShape.returnType !== ""
    );
  });
  const optionalityLossMembers = tsMembers.filter((name) => {
    const ts = tsMap.get(name);
    const md = mdMap.get(name);
    if (ts === undefined || md === undefined) return false;
    if (ts.kind !== "function" || md.kind !== "function") return false;
    const tsShape = signatureShape(ts.signature);
    const mdShape = signatureShape(md.signature);
    if (tsShape === undefined || mdShape === undefined) return false;
    return tsShape.parameters.some((parameter, index) => {
      const counterpart = mdShape.parameters[index];
      return (
        counterpart !== undefined &&
        isOptionalParameter(parameter) &&
        !isOptionalParameter(counterpart)
      );
    });
  });
  // `tsDefoldMembers` keeps reporting what the extractor really saw; only the
  // predicate discounts the re-export handle, so a record can still quote the
  // handle as the evidence for the surface being opaque.
  const reExportHandle = /export\s*=\s*(\w+)\s*;/.exec(tsDefoldDts)?.[1];
  const comparableTsMembers = tsMembers.filter((name) => name !== reExportHandle);
  const opaqueTsDefoldSurface = comparableTsMembers.length === 0;
  return {
    tsDefoldMembers: tsMembers,
    markdownMembers: mdMembers,
    missingMembers,
    addedMembers,
    downgradedMembers,
    signatureLossMembers,
    optionalityLossMembers,
    opaqueTsDefoldSurface,
    decision:
      missingMembers.length === 0 &&
      downgradedMembers.length === 0 &&
      signatureLossMembers.length === 0 &&
      optionalityLossMembers.length === 0 &&
      !opaqueTsDefoldSurface
        ? "go"
        : "no-go",
  };
}

/**
 * Evaluate one cutover candidate without writing anything: emit the markdown
 * surface in memory and compare it against the `fixtures/ts-defold/<moduleId>.d.ts`
 * it would replace.
 *
 * This is the entry point for a library whose markdown `namespace` *equals* its
 * live `moduleId` (defold-input, monarch), where the canonical
 * `generated`/`api-doc`/`fidelity` paths a registered target would write are the
 * very files the live ts-defold module already owns. Registering a no-go target
 * to obtain its comparison would overwrite them in place; passing an unregistered
 * in-memory target here computes the same decision and leaves them untouched.
 *
 * `snapshot` overrides the compared-against surface, package-root-relative. A
 * library that severed its ts-defold dependency (forking its surface into the
 * authored lane) has no `fixtures/ts-defold/` entry left, but its recorded
 * markdown verdict is still owed a comparison: a verbatim fork is byte-identical
 * to the retired snapshot, so pointing this at the vendored copy reproduces the
 * decision exactly.
 */
export async function evaluateMarkdownCandidate(
  packageRoot: string,
  target: MarkdownTarget,
  snapshot?: string,
): Promise<FidelityComparison & { emitted: string }> {
  const emitted = await emitMarkdownDeclaration(packageRoot, target);
  const tsDefold = readFileSync(
    join(packageRoot, snapshot ?? join("fixtures/ts-defold", `${target.moduleId}.d.ts`)),
    "utf8",
  );
  return { emitted, ...compareFidelityToTsDefold(emitted, tsDefold) };
}

const defaultFetchText: FetchText = async (url) => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetch failed: ${url} -> ${res.status} ${res.statusText}`);
  }
  return res.text();
};

if (import.meta.main) {
  const root = join(import.meta.dir, "..");
  const argv = process.argv.slice(2);
  if (argv.includes("--fetch")) {
    for (const target of readMarkdownTargets(root)) {
      await fetchMarkdownFixture(root, target, { fetchText: defaultFetchText });
      console.log(`snapshotted ${target.moduleId} from ${repoSlug(target.repo)}@${target.ref}`);
    }
  }
  if (argv.includes("--emit")) {
    for (const target of readMarkdownTargets(root)) {
      const contents = await emitMarkdownDeclaration(root, target);
      const dest = join(root, target.generated);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, contents);
      console.log(`emitted ${target.moduleId} -> ${target.generated}`);
    }
  }
  if (argv.includes("--api-doc")) {
    for (const target of readMarkdownTargets(root)) {
      const json = lowerMarkdownApiDoc(root, target);
      const dest = join(root, target.apiDoc);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, json);
      console.log(`lowered ${target.moduleId} -> ${target.apiDoc}`);
    }
  }
  if (argv.includes("--fidelity")) {
    for (const target of readMarkdownTargets(root)) {
      const report = await buildMarkdownFidelity(root, target);
      const dest = join(root, target.fidelity);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, `${JSON.stringify(report, null, 2)}\n`);
      console.log(
        `${target.moduleId}: coverage ${(report.coverage * 100).toFixed(1)}% (${report.unknownFallbacks} unknown, ${report.undocumentedMembers} undocumented)`,
      );
    }
  }
}
