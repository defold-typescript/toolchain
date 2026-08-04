# Sound page

The whole first file, quoted from the `one` example root:

```ts title="src/alpha.ts"
export const alpha = 1;

export function useAlpha(): number {
  return alpha;
}
```

A contiguous slice of the second file, which lives in the `two` root:

```ts title="src/beta.ts (partial)"
export function useBeta(): number {
  return beta;
}
```

An illustrative call that is not quoted from the file at all:

```ts title="src/delta.ts (snippet)"
const four = useDelta();
```
