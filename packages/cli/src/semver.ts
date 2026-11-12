function numericSegments(core: string): number[] {
  return core.split(".").map((seg) => {
    const n = Number.parseInt(seg, 10);
    return Number.isNaN(n) ? 0 : n;
  });
}

const NUMERIC_IDENTIFIER = /^\d+$/;

// `Number` rounds identifiers past 2^53 - 1, so distinct ones could compare equal.
function compareNumericIdentifier(a: string, b: string): number {
  const left = BigInt(a);
  const right = BigInt(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

function comparePrerelease(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  // A missing prerelease tail outranks any prerelease of the same core version.
  if (a === "") {
    return 1;
  }
  if (b === "") {
    return -1;
  }
  const left = a.split(".");
  const right = b.split(".");
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const l = left[i];
    const r = right[i];
    if (l === undefined) {
      return -1;
    }
    if (r === undefined) {
      return 1;
    }
    const lNumeric = NUMERIC_IDENTIFIER.test(l);
    const rNumeric = NUMERIC_IDENTIFIER.test(r);
    if (lNumeric !== rNumeric) {
      // Explicit, because the lexical fallback would rank `2` above `1alpha`.
      return lNumeric ? -1 : 1;
    }
    const cmp = lNumeric ? compareNumericIdentifier(l, r) : l.localeCompare(r);
    if (cmp !== 0) {
      return cmp;
    }
  }
  return 0;
}

// A string compare would rank 1.9.0 above 1.10.0 and ship an upgrade that never
// upgrades, so every segment is parsed as a number.
export function compareSemver(a: string, b: string): number {
  const [aCore = "", ...aPre] = a.split("-");
  const [bCore = "", ...bPre] = b.split("-");
  const left = numericSegments(aCore);
  const right = numericSegments(bCore);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const cmp = (left[i] ?? 0) - (right[i] ?? 0);
    if (cmp !== 0) {
      return cmp;
    }
  }
  return comparePrerelease(aPre.join("-"), bPre.join("-"));
}
