export type RuleKey =
  | [kind: "on", event: string, index: number]
  | [kind: "after", key: string | number]
  | [kind: "every", key: string | number]
  | [kind: "always", index: number]
  | [kind: "update"];

/** The JSON text of a tuple, so no state path or event type can make two rules share an id. */
export function ruleId(statePath: string, ...key: RuleKey): string {
  return JSON.stringify([statePath, ...key]);
}
