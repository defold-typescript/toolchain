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
 * before emitting — the goldens are named for the single-segment `namespace`
 * (`generated/orthographic.d.ts`), keeping the file layout uniform with druid.
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
  return parseMarkdownApi(text);
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

export function computeMarkdownFidelity(
  namespace: string,
  doc: MarkdownDoc,
  resolver: TypeResolver,
): FidelityReport {
  return computeScriptApiFidelity(namespace, doc as unknown as ScriptApiDoc, resolver);
}

export async function buildMarkdownFidelity(
  packageRoot: string,
  target: MarkdownTarget,
): Promise<FidelityReport> {
  const resolver = await loadTypeResolver(packageRoot);
  const doc = retargetedFixtureDoc(packageRoot, target);
  return computeMarkdownFidelity(target.namespace, doc, resolver);
}

/** The result of comparing a markdown-parsed surface against the ts-defold
 * `.d.ts` it would replace. `decision` is `no-go` whenever any ts-defold member
 * is absent from the markdown parse (a material fidelity loss). */
export interface FidelityComparison {
  namespace: string;
  tsDefoldMembers: string[];
  markdownMembers: string[];
  missingMembers: string[];
  addedMembers: string[];
  decision: "go" | "no-go";
}

const TS_DEFOLD_MEMBER = /^\s*export\s+(?:function|const)\s+([A-Za-z_][\w]*)/gm;

/** Extract the exported top-level member locals from a ts-defold module `.d.ts`
 * (both `export function` and `export const`). */
export function tsDefoldMembers(dts: string): string[] {
  const names = new Set<string>();
  for (const match of dts.matchAll(TS_DEFOLD_MEMBER)) names.add(match[1] as string);
  return [...names].sort();
}

/** The function locals a retargeted markdown doc contributes (namespace stripped). */
export function markdownMembers(doc: MarkdownDoc): string[] {
  const prefix = `${doc.info.namespace}.`;
  const names = new Set<string>();
  for (const element of doc.elements) {
    names.add(element.name.startsWith(prefix) ? element.name.slice(prefix.length) : element.name);
  }
  return [...names].sort();
}

/**
 * Compare a retargeted markdown surface against the ts-defold `.d.ts` it would
 * replace and derive the go/no-go decision. Any ts-defold member (function or
 * constant) the markdown parse does not cover is a fidelity loss → `no-go`.
 */
export function compareFidelityToTsDefold(
  doc: MarkdownDoc,
  tsDefoldDts: string,
): FidelityComparison {
  const tsMembers = tsDefoldMembers(tsDefoldDts);
  const mdMembers = markdownMembers(doc);
  const md = new Set(mdMembers);
  const ts = new Set(tsMembers);
  const missingMembers = tsMembers.filter((name) => !md.has(name));
  const addedMembers = mdMembers.filter((name) => !ts.has(name));
  return {
    namespace: doc.info.namespace,
    tsDefoldMembers: tsMembers,
    markdownMembers: mdMembers,
    missingMembers,
    addedMembers,
    decision: missingMembers.length === 0 ? "go" : "no-go",
  };
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
