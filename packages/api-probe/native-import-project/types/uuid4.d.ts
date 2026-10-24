// Hand-authored module-form declaration, deliberately not the curated global
// d.ts, so the probe exercises the @globalTable lowering lane end to end.
/** @globalTable */
declare module "uuid4" {
  export function generate(): string;
}
