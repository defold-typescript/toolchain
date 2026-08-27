import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The editor's own `GET /openapi.json`, recorded verbatim from a running 1.13.1
 * editor. Every value below is *derived* from it at load time and none is
 * restated, so a client written to a guessed envelope cannot pass. Suites share
 * this module rather than re-deriving, so two readers of the same recording
 * cannot disagree about what it says.
 */
export const EDITOR_SPEC = JSON.parse(
  readFileSync(join(import.meta.dir, "editor-openapi.json"), "utf8"),
) as {
  info: { title: string };
  components: { securitySchemes: Record<string, { scheme: string }> };
  paths: Record<
    string,
    {
      post?: {
        security?: readonly Record<string, readonly string[]>[];
        requestBody?: { content: Record<string, { example: string }> };
        responses: Record<string, { content?: Record<string, { example: string }> }>;
      };
    }
  >;
};

/** What a stub transport answers `GET /openapi.json` with. */
export const SPEC_BODY = JSON.stringify(EDITOR_SPEC);

export const EVAL_ROUTE = "/eval";

const EVAL_OP = EDITOR_SPEC.paths[EVAL_ROUTE]?.post;
const EVAL_SCHEME_NAME = Object.keys(EVAL_OP?.security?.[0] ?? {})[0] ?? "";

// "bearer" in the spec, "Bearer" on the wire -- the scheme name is what the
// fixture pins, the capitalization is HTTP's.
export const EVAL_AUTH_SCHEME = EDITOR_SPEC.components.securitySchemes[EVAL_SCHEME_NAME]?.scheme ?? "";

export const EVAL_REQUEST_MEDIA_TYPE = Object.keys(EVAL_OP?.requestBody?.content ?? {})[0] ?? "";

export const EVAL_MULTI_RETURN_EXAMPLE = EVAL_OP?.responses["200"]?.content?.[
  EVAL_REQUEST_MEDIA_TYPE
]?.example as string;

/** Every `/eval` outcome the recording documents other than success. */
export const EVAL_NON_SUCCESS_STATUSES: readonly number[] = Object.keys(
  EVAL_OP?.responses ?? {},
).flatMap((code) => (code === "200" ? [] : [Number(code)]));

function commonPrefix(a: string, b: string): string {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return a.slice(0, i);
}

// The success example is printed output followed by one line per returned value.
// Which trailing lines are the *returned* ones is read off the recording rather
// than assumed: extend the run upward from the last line for as long as the run
// still shares a non-empty prefix, and that prefix is the framing. Two lines are
// the minimum that can discriminate a marker from a whole line, which is why a
// re-recording that drops to a single return value must fail here instead of
// silently yielding bodies production's parser rejects.
const EVAL_RETURN_PREFIX = ((): string => {
  const lines = EVAL_MULTI_RETURN_EXAMPLE.split("\n");
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  let prefix = "";
  let taken = 0;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i] as string;
    const next = taken === 0 ? line : commonPrefix(prefix, line);
    if (taken > 0 && next === "") break;
    prefix = next;
    taken += 1;
  }
  if (taken < 2 || prefix === "") {
    throw new Error(
      `editor-openapi.json: the /eval 200 example no longer carries two prefixed return lines (${JSON.stringify(EVAL_MULTI_RETURN_EXAMPLE)})`,
    );
  }
  return prefix;
})();

/** A `200` `/eval` body returning `values`, framed the way the recording frames it. */
export function evalSuccessBody(...values: string[]): string {
  return `${values.map((value) => `${EVAL_RETURN_PREFIX}${value}`).join("\n")}\n`;
}
