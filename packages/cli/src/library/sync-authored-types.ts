import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractApiDoc } from "./extract-api-doc";
import { type ApiDocElement, importUpstreamDocs } from "./import-upstream-docs";
import { type ParityVerdict, readLibraryData } from "./library-data";
import { type LuaMember, parseLuaSurface } from "./parse-lua-surface";

/**
 * The authored/forked front-end: a fourth `library-types` corpus mode beside the
 * LuaLS (`sync-luals-types.ts`), `.script_api` (`sync-script-api-types.ts`), and
 * markdown (`sync-markdown-types.ts`) lanes. The other three ingest a *non-*`.d.ts`
 * primary source and generate a declaration; this one is for a library whose
 * upstream has no usable structured source, so its `.d.ts` is hand-authored or
 * forked from the retired ts-defold declarations and vendored under
 * `<library>/fork/<moduleId>.d.ts`.
 *
 * A vendored authored `.d.ts` is already target-form — a `declare module
 * '<moduleId>'` ambient — so the lane is light: it prints the vendored source
 * verbatim as the module's declaration and runs
 * `extractApiDoc` for the `api-doc/<namespace>.json` the docs-site consumes. The
 * api-doc alone carries one thing the fork does not: where a target vendors its
 * upstream `.lua` and the fork documents a member nowhere, upstream's own LuaDoc
 * summary is lowered in, marked `docSource: "upstream"` (see
 * `import-upstream-docs.ts`). The *emitted* surface is still the vendored authored
 * source untouched, so the go/no-go gate is a
 * forked-vs-printed identity diff (see the golden loop) — emission fidelity.
 * There is no *type* coverage comparison because upstream declares no types; the
 * *surface* is another matter, and a target that vendors its upstream `.lua` under
 * `upstreamLua` is measured on member names and arity by `authored-parity.ts`.
 * Beyond that, a corrected fork's accuracy rests on its manual audit against
 * upstream plus the per-library shape assertions in the sibling test.
 */
export interface AuthoredTarget {
  repo: string;
  ref: string;
  // Data-folder-relative path of the vendored authored/forked `.d.ts`
  // (`<library>/fork/<moduleId>.d.ts`).
  authored: string;
  moduleId: string;
  namespace: string;
  apiDoc: string;
  // Defaults to `fidelity/<namespace>.json` when omitted. A fork carries no
  // fidelity artifact — there is no primary source to measure against, and the
  // emit is lossless by construction — but the field mirrors the sibling lanes
  // so a future hand-authored target can record one.
  fidelity: string;
  // SPDX-style license id, surfaced by the docs-site provenance block. Optional
  // in the config; defaults to "".
  license: string;
  // Data-folder-relative paths of the vendored upstream `.lua` sources this target's
  // surface is measured against (`authored-parity.ts`). Optional and defaulted to
  // `[]`: a target with no vendored upstream is simply unmeasured, which is why it
  // must not join `FORK_REQUIRED` (`library-data.ts`).
  upstreamLua: string[];
  // The fork's interface for the instances upstream's `function M:name(...)` methods
  // serve, read from api-doc as the `TYPEDEF` of that name. Required by
  // `authored-parity.ts` once upstream defines a method, and absent otherwise.
  instanceType?: string;
  // Why this target vendors no upstream `.lua`. Mutually exclusive with a
  // non-empty `upstreamLua`, and one of the two is mandatory: neither field is
  // required on its own, but the *disjunction* is, so a target cannot land
  // unexamined and read as measured-and-clean. Absent on a measured target.
  parityVerdict?: ParityVerdict;
}

/**
 * Every library's forks, in library-folder order, read from its `library.json`
 * with the repo, ref and license it holds once; `fidelity` defaults to
 * `fidelity/<namespace>.json`, `license` to "" and `upstreamLua` to []. Throws on
 * the first missing field naming both the field and the offending entry, and when
 * an entry's parity declaration is missing, doubled, or malformed.
 */
export function readAuthoredTargets(dataDir: string): AuthoredTarget[] {
  return readLibraryData(dataDir).flatMap((library) => library.authored);
}

function readAuthoredSource(packageRoot: string, target: AuthoredTarget): string {
  return readFileSync(join(packageRoot, target.authored), "utf8");
}

/**
 * The printed declaration of the target's `moduleId`. The vendored authored
 * `.d.ts` is already a `declare module '<moduleId>'` ambient, so the emit is the
 * source verbatim — the vendored surface passes through unchanged, which is what
 * makes the emission lossless. It says nothing about how that vendored surface
 * compares to upstream.
 */
export function emitAuthoredDeclaration(packageRoot: string, target: AuthoredTarget): string {
  return readAuthoredSource(packageRoot, target);
}

/** The pinned upstream members by name, the way `authored-parity.ts` builds them:
 * a later definition of a name wins, matching Lua. Empty for a target that vendors
 * no upstream `.lua`, which is then never parsed. A `:` method is left out: it is a
 * member of the instance type, so its prose belongs to no module-level element of
 * the same name. */
function upstreamMembers(packageRoot: string, target: AuthoredTarget): Map<string, LuaMember> {
  const members = new Map<string, LuaMember>();
  for (const relative of target.upstreamLua) {
    for (const member of parseLuaSurface(readFileSync(join(packageRoot, relative), "utf8")).members)
      if (member.method !== true) members.set(member.name, member);
  }
  return members;
}

/**
 * `extractApiDoc` the vendored `.d.ts` under the pinned publish namespace, plus
 * upstream's own LuaDoc for the members the fork documents nowhere, pretty-printed
 * as the `api-doc/<namespace>.json` golden.
 *
 * The api-doc is therefore the fork *plus* imported upstream prose, and it is the
 * only artifact that is: the printed declaration stays the vendored
 * source verbatim, so the identity diff still proves the emit is lossless. An
 * imported element carries `docSource: "upstream"` through to the docs-site, which
 * marks it rather than presenting it as first-party. See `import-upstream-docs.ts`
 * for the merge rules.
 */
export function lowerAuthoredApiDoc(packageRoot: string, target: AuthoredTarget): string {
  // `extractApiDoc` returns `unknown`; the merge needs the element list, and
  // overwriting the existing `elements` key by spread keeps it in place, so the
  // golden's key order is unchanged.
  const doc = extractApiDoc(readAuthoredSource(packageRoot, target), target.namespace) as Record<
    string,
    unknown
  > & { elements: ApiDocElement[] };
  const elements = importUpstreamDocs(doc.elements, upstreamMembers(packageRoot, target));
  return `${JSON.stringify({ ...doc, elements }, null, 2)}\n`;
}
