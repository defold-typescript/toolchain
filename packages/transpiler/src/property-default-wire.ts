// What the property evaluator sends its child process on stdin.
export interface PropertyEvaluationRequest {
  readonly chunks: Readonly<Record<string, string>>;
  readonly entry: string;
  readonly names: readonly string[];
  readonly resourceKinds: readonly string[];
  readonly timeoutMs: number;
  readonly memoryLimitBytes: number;
}

const NUMBER_TAG = "$number";
const TAGGED_NUMBERS = new Set(["Infinity", "-Infinity", "-0", "NaN"]);

// JSON writes `Infinity` as `null` and `-0` as `0`, so those numbers cross the
// process boundary as `{ "$number": "<text>" }`.
export function encodeWire(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (typeof item === "number" && (!Number.isFinite(item) || Object.is(item, -0))) {
      return { [NUMBER_TAG]: Object.is(item, -0) ? "-0" : String(item) };
    }
    return item;
  });
}

export function decodeWire(text: string): unknown {
  return JSON.parse(text, (_key, item: unknown) => {
    const tagged = taggedNumber(item);
    return tagged === undefined ? item : Number(tagged);
  });
}

function taggedNumber(item: unknown): string | undefined {
  if (typeof item !== "object" || item === null || Array.isArray(item)) {
    return undefined;
  }
  const keys = Object.keys(item);
  const text = (item as Record<string, unknown>)[NUMBER_TAG];
  return keys.length === 1 && typeof text === "string" && TAGGED_NUMBERS.has(text)
    ? text
    : undefined;
}
