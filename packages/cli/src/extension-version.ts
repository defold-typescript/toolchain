// Per-extension version pin alongside the engine `--defold-target` pin. The
// declared identity of a `[dependencies]` URL is often a moving ref
// (`.../archive/master.zip`), so the reproducible identity of *what was
// resolved* is the sha256 digest of the resolved archive bytes, not a URL
// segment. `resolve` records that digest, seeds it into
// `package.json` `"defold-typescript": { "extensions": { url: sha256:… } }`
// when absent (never clobbering), and reports both the resolved and pinned
// version per extension in `--json` — the visible signal a user acts on to
// upgrade. Enforcement (fail/warn on resolved != pinned) is a follow-up; this
// slice is recorded and reported only.

import { createHash } from "node:crypto";

export function extensionArchiveVersion(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function readExtensionVersionPins(pkg: unknown): Record<string, string> {
  if (typeof pkg !== "object" || pkg === null) {
    return {};
  }
  const namespace = (pkg as Record<string, unknown>)["defold-typescript"];
  if (typeof namespace !== "object" || namespace === null) {
    return {};
  }
  const extensions = (namespace as Record<string, unknown>).extensions;
  if (typeof extensions !== "object" || extensions === null) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [url, version] of Object.entries(extensions as Record<string, unknown>)) {
    if (typeof version === "string") {
      out[url] = version;
    }
  }
  return out;
}

export function mergeResolvedVersionPins(
  pkg: unknown,
  resolved: Record<string, string>,
  liveUrls?: Iterable<string>,
): Record<string, unknown> {
  const base: Record<string, unknown> =
    typeof pkg === "object" && pkg !== null && !Array.isArray(pkg)
      ? { ...(pkg as Record<string, unknown>) }
      : {};
  const existingNamespace =
    typeof base["defold-typescript"] === "object" &&
    base["defold-typescript"] !== null &&
    !Array.isArray(base["defold-typescript"])
      ? { ...(base["defold-typescript"] as Record<string, unknown>) }
      : {};
  const existingExtensions =
    typeof existingNamespace.extensions === "object" &&
    existingNamespace.extensions !== null &&
    !Array.isArray(existingNamespace.extensions)
      ? { ...(existingNamespace.extensions as Record<string, unknown>) }
      : {};
  if (liveUrls !== undefined) {
    const live = new Set(liveUrls);
    for (const url of Object.keys(existingExtensions)) {
      if (!live.has(url)) {
        delete existingExtensions[url];
      }
    }
  }
  for (const [url, version] of Object.entries(resolved)) {
    if (!(url in existingExtensions)) {
      existingExtensions[url] = version;
    }
  }
  existingNamespace.extensions = existingExtensions;
  base["defold-typescript"] = existingNamespace;
  return base;
}
