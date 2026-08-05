# Broken page

A whole-file quote that drifted from its source:

```ts title="src/alpha.ts"
export const alpha = 99;

export function useAlpha(): number {
  return alpha;
}
```

A `(partial)` that is not a contiguous slice:

```ts title="src/beta.ts (partial)"
export const beta = 2;
  return beta;
```

A file no example root holds:

```ts title="src/gamma.ts"
export const gamma = 3;
```

A `src/` title whose marker the parser cannot read:

```ts title="src/alpha.ts (Partial)"
export const alpha = 1;
```

A filename both example roots hold, which this page's other fences narrow to both
roots at once and so leave ambiguous:

```ts title="src/shared.ts"
export const shared = "one";
```

An untitled fence on a page that elsewhere claims source parity:

```ts
const untitled = true;
```
