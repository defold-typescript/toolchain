import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { extractApiDoc } from "./extract-api-doc";

/**
 * The authored/forked front-end: a fourth `library-types` corpus mode beside the
 * LuaLS (`sync-luals-types.ts`), `.script_api` (`sync-script-api-types.ts`), and
 * markdown (`sync-markdown-types.ts`) lanes. The other three ingest a *non-*`.d.ts`
 * primary source and generate a declaration; this one is for a library whose
 * upstream has no usable structured source, so its `.d.ts` is hand-authored or
 * forked from the retired ts-defold surface and vendored under
 * `fixtures/authored/<moduleId>.d.ts`.
 *
 * A vendored authored `.d.ts` is already target-form — a `declare module
 * '<moduleId>'` ambient — so the lane is light: it emits the vendored source
 * verbatim as the bare-namespace `generated/<namespace>.d.ts` golden and runs
 * `extractApiDoc` for the `api-doc/<namespace>.json` the docs-site consumes. The
 * emitted surface *is* the vendored authored source, so the go/no-go gate is a
 * forked-vs-generated identity diff (see the golden loop) — emission fidelity.
 * There is no coverage comparison against a primary source because there is
 * none; a corrected fork's accuracy rests on its manual audit against upstream
 * plus the per-library shape assertions in the sibling test.
 */
export interface AuthoredTarget {
  repo: string;
  ref: string;
  // Package-relative path of the vendored authored/forked `.d.ts`
  // (`fixtures/authored/<moduleId>.d.ts`).
  authored: string;
  moduleId: string;
  namespace: string;
  generated: string;
  apiDoc: string;
  // Defaults to `fidelity/<namespace>.json` when omitted. A fork carries no
  // fidelity artifact — there is no primary source to measure against, and the
  // emit is lossless by construction — but the field mirrors the sibling lanes
  // so a future hand-authored target can record one.
  fidelity: string;
  // SPDX-style license id, surfaced by the docs-site provenance block. Optional
  // in the config; defaults to "".
  license: string;
}

export interface AuthoredTargets {
  targets: AuthoredTarget[];
}

const REQUIRED_FIELDS = [
  "repo",
  "ref",
  "authored",
  "moduleId",
  "namespace",
  "generated",
  "apiDoc",
] as const;

/**
 * Read `authored-targets.json`, validate every required field per entry, and fill
 * optional defaults (`fidelity` → `fidelity/<namespace>.json`, `license` → "").
 * Throws on the first missing field naming both the field and the offending entry
 * (its `moduleId`, or its index when `moduleId` itself is absent) — the loud-fail
 * discipline `readMarkdownTargets`/`readScriptApiTargets`/`readLualsTargets` use.
 */
export function readAuthoredTargets(packageRoot: string): AuthoredTarget[] {
  const parsed = JSON.parse(readFileSync(join(packageRoot, "authored-targets.json"), "utf8")) as {
    targets: Partial<AuthoredTarget>[];
  };
  return parsed.targets.map((entry, index) => {
    const label = typeof entry.moduleId === "string" ? entry.moduleId : `index ${index}`;
    for (const field of REQUIRED_FIELDS) {
      if (entry[field] === undefined) {
        throw new Error(
          `authored-targets.json: entry ${label} is missing required field "${field}".`,
        );
      }
    }
    return {
      repo: entry.repo as string,
      ref: entry.ref as string,
      authored: entry.authored as string,
      moduleId: entry.moduleId as string,
      namespace: entry.namespace as string,
      generated: entry.generated as string,
      apiDoc: entry.apiDoc as string,
      fidelity: entry.fidelity ?? `fidelity/${entry.namespace as string}.json`,
      license: entry.license ?? "",
    };
  });
}

function readAuthoredSource(packageRoot: string, target: AuthoredTarget): string {
  return readFileSync(join(packageRoot, target.authored), "utf8");
}

/**
 * The bare-namespace `generated/<namespace>.d.ts` golden. The vendored authored
 * `.d.ts` is already a `declare module '<moduleId>'` ambient, so the emit is the
 * source verbatim — the vendored surface passes through unchanged, which is what
 * makes the emission lossless. It says nothing about how that vendored surface
 * compares to upstream.
 */
export function emitAuthoredDeclaration(packageRoot: string, target: AuthoredTarget): string {
  return readAuthoredSource(packageRoot, target);
}

/** `extractApiDoc` the vendored `.d.ts` under the pinned publish namespace,
 * pretty-printed as the `api-doc/<namespace>.json` golden. */
export function lowerAuthoredApiDoc(packageRoot: string, target: AuthoredTarget): string {
  const doc = extractApiDoc(readAuthoredSource(packageRoot, target), target.namespace);
  return `${JSON.stringify(doc, null, 2)}\n`;
}

if (import.meta.main) {
  const root = join(import.meta.dir, "..");
  const argv = process.argv.slice(2);
  if (argv.includes("--emit")) {
    for (const target of readAuthoredTargets(root)) {
      const contents = emitAuthoredDeclaration(root, target);
      const dest = join(root, target.generated);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, contents);
      console.log(`emitted ${target.moduleId} -> ${target.generated}`);
    }
  }
  if (argv.includes("--api-doc")) {
    for (const target of readAuthoredTargets(root)) {
      const json = lowerAuthoredApiDoc(root, target);
      const dest = join(root, target.apiDoc);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, json);
      console.log(`lowered ${target.moduleId} -> ${target.apiDoc}`);
    }
  }
}
