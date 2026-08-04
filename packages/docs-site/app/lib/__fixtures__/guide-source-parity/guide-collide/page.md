# Colliding page

Both example roots hold `src/shared.ts`, so the root is inferred from the other
file this page quotes, which only the `two` root holds:

```ts title="src/beta.ts"
export const beta = 2;

export function useBeta(): number {
  return beta;
}
```

```ts title="src/shared.ts"
export const shared = "two";
```
