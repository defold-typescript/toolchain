import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { FidelityReport } from "./luals-fidelity";
import { type OpenApiDoc, parseOpenApi } from "./parse-openapi-api";
import {
  computeScriptApiFidelity,
  type FetchText,
  loadTypeResolver,
  type ScriptApiDoc,
  type TypeResolver,
} from "./sync-script-api-types";

/**
 * The OpenAPI/proto ingestion front-end: a fifth `library-types` corpus mode
 * beside the LuaLS front-end (`sync-luals-types.ts`), the `.script_api` front-end
 * (`sync-script-api-types.ts`), the markdown front-end (`sync-markdown-types.ts`),
 * and the authored `.d.ts` lane. It reads a library's pinned REST swagger + realtime
 * `.proto` snapshot (`parseOpenApi`) into the shared ref-doc `doc` shape and routes
 * it through the same emitter (`generateModuleDeclaration`) and fidelity machinery.
 *
 * The swagger/proto name no publish alias, so the parsed doc carries bare element
 * names; each target pins the `namespace` this repo publishes under, and the doc is
 * *retargeted* — the bare names are prefixed onto that namespace — before emitting.
 *
 * A structured-source parse is likely **lower coverage** than the hand-written
 * ts-defold `.d.ts` it would replace (a REST swagger cannot describe a Lua client's
 * hand-written helpers or its realtime socket wrappers), so each cutover is gated:
 * `compareFidelityToTsDefold` reports the member surface lost versus the retired
 * ts-defold declaration, and the target's recorded `decision` (`go` / `no-go`) must
 * match. The parser + front-end land as the reusable foundation either way; only
 * the per-library cutover is gated. The gate helpers are shared verbatim with the
 * markdown lane rather than re-implemented.
 */
export {
  compareFidelityToTsDefold,
  type FidelityComparison,
  tsDefoldMembers,
  tsDefoldSurface,
} from "./sync-markdown-types";

export interface OpenApiTarget {
  repo: string;
  ref: string;
  swagger: string;
  proto: string;
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

export interface OpenApiTargets {
  targets: OpenApiTarget[];
}

const REQUIRED_FIELDS = [
  "repo",
  "ref",
  "swagger",
  "proto",
  "moduleId",
  "namespace",
  "generated",
  "apiDoc",
] as const;

/**
 * Read `openapi-targets.json` (or an in-memory override), validate every required
 * field per entry, and fill optional defaults (`fidelity` → `fidelity/<namespace>.json`,
 * `license` → ""). Throws on the first missing field naming both the field and the
 * offending entry (its `moduleId`, or its index when `moduleId` itself is absent) —
 * the loud-fail discipline `readMarkdownTargets`/`readLualsTargets` use. No network.
 */
export function readOpenApiTargets(packageRoot: string, rawOverride?: string): OpenApiTarget[] {
  const raw = rawOverride ?? readFileSync(join(packageRoot, "openapi-targets.json"), "utf8");
  const parsed = JSON.parse(raw) as { targets: Partial<OpenApiTarget>[] };
  return parsed.targets.map((entry, index) => {
    const label = typeof entry.moduleId === "string" ? entry.moduleId : `index ${index}`;
    for (const field of REQUIRED_FIELDS) {
      if (entry[field] === undefined) {
        throw new Error(
          `openapi-targets.json: entry ${label} is missing required field "${field}".`,
        );
      }
    }
    return {
      repo: entry.repo as string,
      ref: entry.ref as string,
      swagger: entry.swagger as string,
      proto: entry.proto as string,
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

function rawUrl(target: OpenApiTarget, path: string): string {
  return `https://raw.githubusercontent.com/${repoSlug(target.repo)}/${target.ref}/${path}`;
}

function swaggerFixturePath(packageRoot: string, target: OpenApiTarget): string {
  return join(packageRoot, "fixtures/openapi", `${target.moduleId}.swagger.json`);
}

function protoFixturePath(packageRoot: string, target: OpenApiTarget): string {
  return join(packageRoot, "fixtures/openapi", `${target.moduleId}.api.proto`);
}

/**
 * Snapshot the pinned swagger + realtime `.proto` into `fixtures/openapi/` via the
 * raw-content URL. Snapshot only — no parse. The `fetchText` seam keeps the pass
 * offline-testable; only the CLI `--fetch` arm wires the real network.
 */
export async function fetchOpenApiFixtures(
  packageRoot: string,
  target: OpenApiTarget,
  seams: { fetchText: FetchText },
): Promise<void> {
  for (const [path, dest] of [
    [target.swagger, swaggerFixturePath(packageRoot, target)],
    [target.proto, protoFixturePath(packageRoot, target)],
  ] as const) {
    const text = await seams.fetchText(rawUrl(target, path));
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, text);
  }
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

// nakama's structured surface resolves to `string`/`number`/`boolean`/`table`
// only, so the module-wrapped form never emits a core-types handle and this import
// never reaches the golden; it mirrors the sibling front-ends for the day an
// openapi target references a branded engine handle.
const OPENAPI_CORE_TYPES_IMPORT = "../src/core-types";

async function loadGenerate(
  packageRoot: string,
): Promise<RegenModule["generateModuleDeclaration"]> {
  const typesRoot = join(packageRoot, "..", "types");
  const regen = (await import(join(typesRoot, "scripts", "regen.ts"))) as RegenModule;
  return regen.generateModuleDeclaration;
}

function parseFixtureDoc(packageRoot: string, target: OpenApiTarget): OpenApiDoc {
  const swagger = readFileSync(swaggerFixturePath(packageRoot, target), "utf8");
  const proto = readFileSync(protoFixturePath(packageRoot, target), "utf8");
  return parseOpenApi(swagger, proto);
}

/**
 * Retarget the parsed doc onto the pinned publish namespace: prefix each bare
 * element name with `<namespace>.` and set `info.namespace`. Unlike the markdown
 * lane (which replaces the README's own alias), the swagger/proto names carry no
 * prefix, so retargeting *prepends* rather than rewrites.
 */
export function retargetDoc(doc: OpenApiDoc, namespace: string): OpenApiDoc {
  return {
    info: { ...doc.info, namespace },
    elements: doc.elements.map((element) => ({
      ...element,
      name: element.name.includes(".") ? element.name : `${namespace}.${element.name}`,
    })),
  };
}

function retargetedFixtureDoc(packageRoot: string, target: OpenApiTarget): OpenApiDoc {
  return retargetDoc(parseFixtureDoc(packageRoot, target), target.namespace);
}

/**
 * `parseOpenApi` -> retarget -> `generateModuleDeclaration`. Returns an importable
 * module keyed by `moduleId` (`declare module '<moduleId>'`).
 */
export async function emitOpenApiDeclaration(
  packageRoot: string,
  target: OpenApiTarget,
): Promise<string> {
  const generate = await loadGenerate(packageRoot);
  const doc = retargetedFixtureDoc(packageRoot, target);
  const { contents } = generate({
    namespace: target.namespace,
    doc,
    outFile: `${target.moduleId}.d.ts`,
    importsFrom: OPENAPI_CORE_TYPES_IMPORT,
    moduleId: target.moduleId,
  });
  return contents;
}

/** The api-doc golden is the retargeted ref-doc `doc` itself, pretty-printed. */
export function lowerOpenApiApiDoc(packageRoot: string, target: OpenApiTarget): string {
  const doc = retargetedFixtureDoc(packageRoot, target);
  return `${JSON.stringify(doc, null, 2)}\n`;
}

// The OpenAPI parser maps every swagger/proto type onto a resolvable token, so no
// token is expected to be lossy. The set stays empty and any unresolved token
// loud-fails — a brand-new source's unclassified token must not be swallowed as
// `unknown` at regen time. Mirror of the markdown lane's `KNOWN_LOSSY_TOKENS`.
const KNOWN_LOSSY_TOKENS = new Set<string>();

/**
 * openapi-scoped wrapper over the shared `computeScriptApiFidelity`. After the
 * report is built, any `unknownToken` outside `KNOWN_LOSSY_TOKENS` loud-fails. The
 * shared `computeScriptApiFidelity` is left untouched so the script_api/luals/markdown
 * goldens stay green.
 */
export function computeOpenApiFidelity(
  namespace: string,
  doc: OpenApiDoc,
  resolver: TypeResolver,
): FidelityReport {
  const report = computeScriptApiFidelity(namespace, doc as unknown as ScriptApiDoc, resolver);
  const unmappable = report.unknownTokens.filter((token) => !KNOWN_LOSSY_TOKENS.has(token));
  if (unmappable.length > 0) {
    throw new Error(
      `openapi fidelity [${namespace}]: unmappable type token(s) ${JSON.stringify(unmappable)} — resolve them or add to KNOWN_LOSSY_TOKENS`,
    );
  }
  return report;
}

export async function buildOpenApiFidelity(
  packageRoot: string,
  target: OpenApiTarget,
): Promise<FidelityReport> {
  const resolver = await loadTypeResolver(packageRoot);
  const doc = retargetedFixtureDoc(packageRoot, target);
  return computeOpenApiFidelity(target.namespace, doc, resolver);
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
    for (const target of readOpenApiTargets(root)) {
      await fetchOpenApiFixtures(root, target, { fetchText: defaultFetchText });
      console.log(`snapshotted ${target.moduleId} from ${repoSlug(target.repo)}@${target.ref}`);
    }
  }
  if (argv.includes("--emit")) {
    for (const target of readOpenApiTargets(root)) {
      const contents = await emitOpenApiDeclaration(root, target);
      const dest = join(root, target.generated);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, contents);
      console.log(`emitted ${target.moduleId} -> ${target.generated}`);
    }
  }
  if (argv.includes("--api-doc")) {
    for (const target of readOpenApiTargets(root)) {
      const json = lowerOpenApiApiDoc(root, target);
      const dest = join(root, target.apiDoc);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, json);
      console.log(`lowered ${target.moduleId} -> ${target.apiDoc}`);
    }
  }
  if (argv.includes("--fidelity")) {
    for (const target of readOpenApiTargets(root)) {
      const report = await buildOpenApiFidelity(root, target);
      const dest = join(root, target.fidelity);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, `${JSON.stringify(report, null, 2)}\n`);
      console.log(
        `${target.moduleId}: coverage ${(report.coverage * 100).toFixed(1)}% (${report.unknownFallbacks} unknown, ${report.undocumentedMembers} undocumented)`,
      );
    }
  }
}
