export type CtxPath = readonly string[];

/** Names one ctx node; JSON keeps a key that holds a dot apart from a nested path. */
export const ctxKey = (path: CtxPath): string => JSON.stringify(path);

export type Primitive = number | string | boolean | null;

export const isPrimitive = (value: unknown): value is Primitive =>
  value === null || ["number", "string", "boolean"].includes(typeof value);

/** Every primitive in a ctx value, by the key of its path. */
export function ctxLeaves(value: unknown): Map<string, Primitive> {
  const leaves = new Map<string, Primitive>();
  const walk = (node: unknown, at: CtxPath): void => {
    if (isPrimitive(node)) {
      leaves.set(ctxKey(at), node);
    } else if (typeof node === "object" && node !== null) {
      for (const [key, child] of Object.entries(node)) {
        walk(child, [...at, key]);
      }
    }
  };
  walk(value, []);
  return leaves;
}

/** The leaves of `next` that are new or hold another value than in `previous`. */
export function changedLeaves(previous: unknown, next: unknown): string[] {
  const before = ctxLeaves(previous);
  return [...ctxLeaves(next)]
    .filter(([key, value]) => !before.has(key) || !Object.is(before.get(key), value))
    .map(([key]) => key);
}
