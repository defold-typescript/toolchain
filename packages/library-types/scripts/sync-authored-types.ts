import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { extractApiDoc } from "./extract-api-doc";

/**
 * The authored/forked front-end: a fourth `library-types` corpus mode beside the
 * LuaLS (`sync-luals-types.ts`), `.script_api` (`sync-script-api-types.ts`), and
 * markdown (`sync-markdown-types.ts`) lanes. The other three ingest a *non-*`.d.ts`
 * primary source and generate a declaration; this one is for a library whose
 * upstream has no usable structured source, so its `.d.ts` is hand-authored or
 * forked from the retired ts-defold `generated/` golden and vendored under
 * `fixtures/authored/<moduleId>.d.ts`.
 *
 * A vendored authored `.d.ts` is already target-form — a `declare module
 * '<moduleId>'` ambient — so the lane is light: it emits the vendored source
 * verbatim as the `generated/<namespace>.d.ts` golden and runs
 * `extractApiDoc` for the `api-doc/<namespace>.json` the docs-site consumes. The
 * emitted surface *is* the vendored authored source, so the go/no-go gate is a
 * forked-vs-generated identity diff (see the golden loop) — emission fidelity.
 * There is no *type* coverage comparison because upstream declares no types; the
 * *surface* is another matter, and a target that vendors its upstream `.lua` under
 * `upstreamLua` is measured on member names and arity by `authored-parity.ts`.
 * Beyond that, a corrected fork's accuracy rests on its manual audit against
 * upstream plus the per-library shape assertions in the sibling test.
 */
/**
 * Why a target's surface cannot be measured against upstream. A closed set: the
 * alternative to `upstreamLua` has to be a *chosen* category, because free prose
 * would let "nobody looked yet" and "looked, and it is genuinely unmeasurable"
 * read the same in the config.
 *
 * - `unresolved-path` — the `moduleId`-derived path does not resolve at the
 *   pinned `ref` (including a repository that no longer exists there).
 * - `no-module-file` — the upstream resolves but declares no single module file
 *   this target could be measured against.
 * - `unparseable-shape` — the module file exists but closes in a way
 *   `parseLuaSurface` refuses, such as a metatable that could delegate members
 *   no column-0 scan would find.
 */
export const PARITY_VERDICT_REASONS = [
  "no-module-file",
  "unresolved-path",
  "unparseable-shape",
] as const;

export type ParityVerdictReason = (typeof PARITY_VERDICT_REASONS)[number];

export interface ParityVerdict {
  reason: ParityVerdictReason;
  note: string;
}

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
  // Package-relative paths of the vendored upstream `.lua` sources this target's
  // surface is measured against (`authored-parity.ts`). Optional and defaulted to
  // `[]`: a target with no vendored upstream is simply unmeasured, which is why it
  // must not join `REQUIRED_FIELDS`.
  upstreamLua: string[];
  // Why this target vendors no upstream `.lua`. Mutually exclusive with a
  // non-empty `upstreamLua`, and one of the two is mandatory: neither field is
  // required on its own, but the *disjunction* is, so a target cannot land
  // unexamined and read as measured-and-clean. Absent on a measured target.
  parityVerdict?: ParityVerdict;
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

/** Validate the parity declaration: exactly one of a non-empty `upstreamLua` and
 * a well-formed `parityVerdict`. Enforced here rather than through
 * `REQUIRED_FIELDS` because neither field is required on its own — the bijection
 * between them is the gate. */
function validateParityDeclaration(
  label: string,
  upstreamLua: string[],
  verdict: ParityVerdict | undefined,
): void {
  if (upstreamLua.length > 0 && verdict !== undefined) {
    throw new Error(
      `authored-targets.json: entry ${label} declares both upstreamLua and parityVerdict — a measured target carries no verdict.`,
    );
  }
  if (upstreamLua.length === 0 && verdict === undefined) {
    throw new Error(
      `authored-targets.json: entry ${label} declares neither upstreamLua nor parityVerdict — vendor its upstream .lua, or record a parityVerdict saying why it cannot be measured.`,
    );
  }
  if (verdict === undefined) return;
  if (!(PARITY_VERDICT_REASONS as readonly string[]).includes(verdict.reason)) {
    throw new Error(
      `authored-targets.json: entry ${label} has parityVerdict reason "${verdict.reason}", which is not one of ${PARITY_VERDICT_REASONS.join(", ")}.`,
    );
  }
  if (typeof verdict.note !== "string" || verdict.note.trim() === "") {
    throw new Error(
      `authored-targets.json: entry ${label} has a parityVerdict with an empty note — say what was looked at and why it could not be measured.`,
    );
  }
}

/**
 * Read `authored-targets.json`, validate every required field per entry, and fill
 * optional defaults (`fidelity` → `fidelity/<namespace>.json`, `license` → "",
 * `upstreamLua` → []).
 * Throws on the first missing field naming both the field and the offending entry
 * (its `moduleId`, or its index when `moduleId` itself is absent) — the loud-fail
 * discipline `readMarkdownTargets`/`readScriptApiTargets`/`readLualsTargets` use.
 * Also throws when an entry's parity declaration is missing, doubled, or
 * malformed (see `validateParityDeclaration`).
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
    const upstreamLua = entry.upstreamLua ?? [];
    validateParityDeclaration(label, upstreamLua, entry.parityVerdict);
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
      upstreamLua,
      ...(entry.parityVerdict === undefined ? {} : { parityVerdict: entry.parityVerdict }),
    };
  });
}

function readAuthoredSource(packageRoot: string, target: AuthoredTarget): string {
  return readFileSync(join(packageRoot, target.authored), "utf8");
}

/**
 * The `generated/<namespace>.d.ts` golden, under whatever stem the entry pins —
 * a bare segment or the dotted `moduleId`. The vendored authored
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
