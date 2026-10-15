const VERSION_FROM_ID = /^defold-(\d+\.\d+\.\d+)$/;

// A ref-doc target names its release outright; a committed one carries it in
// its id.
export function versionOf(target: {
  readonly id: string;
  readonly source?: { readonly version: string } | null;
}): string {
  if (target.source) return target.source.version;
  const match = VERSION_FROM_ID.exec(target.id);
  if (!match?.[1]) throw new Error(`cannot derive a release version from target id "${target.id}"`);
  return match[1];
}

function versionTuple(version: string): number[] {
  return version.split(".").map((part) => Number.parseInt(part, 10));
}

export function compareVersions(a: string, b: string): number {
  const [ta, tb] = [versionTuple(a), versionTuple(b)];
  for (let index = 0; index < Math.max(ta.length, tb.length); index += 1) {
    const diff = (ta[index] ?? 0) - (tb[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
