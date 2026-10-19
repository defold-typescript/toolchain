// Reference names the rule cannot split into words: the reference writes these
// as one run of capitals.
export const ENGINE_TYPE_NAME_OVERRIDES: ReadonlyMap<string, string> = new Map([
  ["LIVEUPDATE", "LiveUpdate"],
  ["PIEBOUNDS", "PieBounds"],
  ["SYSFIELD", "SysField"],
]);

/**
 * The PascalCase TypeScript name of a reference type leaf (`EASING` ->
 * `Easing`, `sys_info` -> `SysInfo`, `b2Body` -> `B2Body`). A word written in
 * one case is capitalized; a mixed-case word keeps its inner capitals.
 */
export function engineTypeName(
  referenceLeaf: string,
  overrides: ReadonlyMap<string, string> = ENGINE_TYPE_NAME_OVERRIDES,
): string {
  const override = overrides.get(referenceLeaf);
  if (override !== undefined) return override;
  return referenceLeaf
    .split("_")
    .filter((part) => part.length > 0)
    .map((part) =>
      part === part.toUpperCase() || part === part.toLowerCase()
        ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
        : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join("");
}
