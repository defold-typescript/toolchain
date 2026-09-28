import { readVerdicts, type Verdict } from "../../types/scripts/engine-binding-verdicts";
import { INDEX_SLOT_CLASSIFICATIONS } from "../../types/src/index-slot-classifications";
import { contextFor, type ScriptKind } from "./contexts";
import type { PassResult } from "./exemptions";
import { PROBE_DENYLIST } from "./probe-denylist";
import type { ProbeCall } from "./witness";

// The positive arguments of a function's first probed signature, by name.
export interface SignatureArgs {
  readonly names: readonly string[];
  readonly args: readonly string[];
}

// An index the engine produced itself, handed back through the slot, and how
// the binding refuses that index minus one: it raises, or returns nil or false.
interface RoundTrip {
  readonly value: string;
  readonly refuses?: "nil" | "false";
}

// A statement block that raises when the slot's base is not its class's.
interface Check {
  readonly check: string;
}

type IndexContext = RoundTrip | Check;

export const PROBED_INDEX_CLASSES: ReadonlySet<string> = new Set(["native-1", "native-0"]);

const FIRST = "vmath.vector4(0.25, 0.5, 0.75, 1)";
const MIDDLE = "vmath.vector4(0.5, 0.5, 0.5, 0.5)";
const LAST = "vmath.vector4(1, 0.75, 0.5, 0.25)";
const VECTOR4S = "ReturnType<typeof vmath.vector4>[]";

// `{ index: 0 }` must reach the first element of the `tints[4]` constant and
// `{ index: 3 }` the last, read back as the zero-based TypeScript array.
function loweredSet(ns: "go" | "gui", target: string): Check {
  return {
    check: [
      `${ns}.set(${target}, "tints", ${FIRST}, { index: 0 });`,
      `${ns}.set(${target}, "tints", ${LAST}, { index: 3 });`,
      `const tints = ${ns}.get(${target}, "tints") as unknown as ${VECTOR4S};`,
      `if (tints[0] !== ${FIRST} || tints[3] !== ${LAST}) error("{ index: 0 } and { index: 3 } missed the first and last element");`,
    ].join(" "),
  };
}

function loweredGet(ns: "go" | "gui", target: string): Check {
  return {
    check: [
      `${ns}.set(${target}, "tints", ${FIRST}, { index: 0 });`,
      `${ns}.set(${target}, "tints", ${MIDDLE}, { index: 1 });`,
      `${ns}.set(${target}, "tints", ${LAST}, { index: 3 });`,
      `const tints = ${ns}.get(${target}, "tints") as unknown as ${VECTOR4S};`,
      `if (${ns}.get(${target}, "tints", { index: 0 }) !== tints[0] || ${ns}.get(${target}, "tints", { index: 3 }) !== tints[3]) error("{ index: 0 } and { index: 3 } read other elements than [0] and [3]");`,
    ].join(" "),
  };
}

const TINTED_NODE = 'gui.get_node("tinted")';
const FIXTURE_INDEX = "b2d.body.get_fixtures(b2d.get_body(COLLISION)!)[0]!.index";
const FIXTURE_CALLS = [
  "get_aabb",
  "get_density",
  "get_filter_data",
  "get_friction",
  "get_restitution",
  "get_shape",
  "get_type",
  "is_sensor",
  "refilter",
  "set_density",
  "set_filter_data",
  "set_friction",
  "set_restitution",
  "set_sensor",
  "set_shape",
  "test_point",
];

// Keyed like `INDEX_SLOT_CLASSIFICATIONS`. A lowered or passed-through slot
// with no entry is listed as unverified.
export const INDEX_CONTEXTS: Readonly<Record<string, IndexContext>> = {
  "go.set:param:options:index": loweredSet("go", "TINTED"),
  "go.get:param:options:index": loweredGet("go", "TINTED"),
  "gui.set:param:options:index": loweredSet("gui", TINTED_NODE),
  "gui.get:param:options:index": loweredGet("gui", TINTED_NODE),
  ...Object.fromEntries(
    FIXTURE_CALLS.map((name) => [
      `b2d.fixture.${name}:param:fixture_index`,
      { value: FIXTURE_INDEX },
    ]),
  ),
  "b2d.body.get_fixtures:return:fixtures:index": {
    check: `if (${FIXTURE_INDEX} !== 1) error("the first fixture's index is not 1");`,
  },
  "tilemap.get_tile:param:x": { value: "tilemap.get_bounds(TILEMAP)[0]", refuses: "nil" },
  "tilemap.get_tile:param:y": { value: "tilemap.get_bounds(TILEMAP)[1]", refuses: "nil" },
  "tilemap.get_tile_info:param:x": { value: "tilemap.get_bounds(TILEMAP)[0]", refuses: "nil" },
  "tilemap.get_tile_info:param:y": { value: "tilemap.get_bounds(TILEMAP)[1]", refuses: "nil" },
  "tilemap.set_tile:param:x": { value: "tilemap.get_bounds(TILEMAP)[0]", refuses: "false" },
  "tilemap.set_tile:param:y": { value: "tilemap.get_bounds(TILEMAP)[1]", refuses: "false" },
  "crash.set_user_field:param:index": { value: "0" },
  "crash.get_user_field:param:index": { value: "0" },
  "gui.get_index:return:index": {
    check: `if (gui.get_index(gui.get_node("box")) !== 0) error("the first root node's index is not 0");`,
  },
};

export interface Unverified {
  readonly key: string;
  readonly reason: string;
}

export interface IndexProbes {
  readonly calls: ProbeCall[];
  readonly unverified: Unverified[];
}

function parseKey(key: string): { fqn: string; kind: string; slot: string; field?: string } {
  const [fqn, kind, slot, field] = key.split(":") as [string, string, string, string?];
  return { fqn, kind, slot, ...(field === undefined ? {} : { field }) };
}

function scriptKind(fqn: string): ScriptKind {
  return contextFor(fqn.slice(0, fqn.lastIndexOf("."))).kind;
}

function roundTrip(fqn: string, position: number, signature: SignatureArgs, context: RoundTrip) {
  const call = (value: string) => {
    const args = signature.args.slice(0, Math.max(signature.args.length, position + 1));
    args[position] = value;
    return `${fqn}(${args.join(", ")})`;
  };
  const own = call("value");
  const shifted = call("value - 1");
  const refusal = context.refuses === "false" ? "false" : "undefined";
  const statements =
    context.refuses === undefined
      ? [
          `${own};`,
          `const [accepted] = pcall(() => ${shifted});`,
          'if (accepted) error("the engine accepts its own index minus one");',
        ]
      : [
          `if ((${own} as unknown) === ${refusal}) error("the engine refuses its own index");`,
          `if ((${shifted} as unknown) !== ${refusal}) error("the engine accepts its own index minus one");`,
        ];
  return [`const value = ${context.value};`, ...statements].join(" ");
}

// One call per lowered or passed-through slot that has a context and whose
// function this pass witnessed; every other such slot is unverified.
export function indexProbeCalls(signatures: ReadonlyMap<string, SignatureArgs>): IndexProbes {
  const calls: ProbeCall[] = [];
  const unverified: Unverified[] = [];
  for (const [key, classification] of INDEX_SLOT_CLASSIFICATIONS) {
    if (!PROBED_INDEX_CLASSES.has(classification.class)) continue;
    const context = INDEX_CONTEXTS[key];
    const { fqn, slot, field } = parseKey(key);
    if (context === undefined) {
      unverified.push({ key, reason: "no probe context" });
      continue;
    }
    const signature = signatures.get(fqn);
    if (signature === undefined) {
      unverified.push({ key, reason: "this pass witnesses no call to the function" });
      continue;
    }
    const variant = `index-${slot}${field === undefined ? "" : `-${field}`}`;
    let body: string;
    if ("check" in context) {
      body = context.check;
    } else {
      const position = signature.names.indexOf(slot);
      if (position === -1) throw new Error(`${key}: ${fqn} declares no parameter ${slot}`);
      body = roundTrip(fqn, position, signature, context);
    }
    calls.push({ name: fqn, variant, kind: scriptKind(fqn), call: `{ ${body} }`, index: key });
  }
  return { calls, unverified };
}

function denied(fqn: string): string | undefined {
  return (
    PROBE_DENYLIST[fqn] ?? PROBE_DENYLIST[`${fqn.slice(0, fqn.lastIndexOf("."))}.*`] ?? undefined
  );
}

// `<target|*>:<fqn>:manual[:<slot>]`: the static oracle could not read these
// slots, so a positive call to the function must end ok in the run, unless the
// denylist names why the probe never makes it.
export function manualCoverage(
  passes: readonly PassResult[],
  targetId: string,
  verdicts: Readonly<Record<string, Verdict>> = readVerdicts(),
): string[] {
  const ok = new Set<string>();
  for (const pass of passes) {
    const positive = new Set(
      pass.calls
        .filter((call) => call.negative === undefined && call.index === undefined)
        .map((call) => `${call.name}\t${call.variant}`),
    );
    for (const outcome of pass.outcomes) {
      if (outcome.outcome !== "ok") continue;
      if (positive.has(`${outcome.name}\t${outcome.variant}`)) ok.add(outcome.name);
    }
  }
  const uncovered: string[] = [];
  for (const [key, verdict] of Object.entries(verdicts)) {
    if (verdict.verdict !== "manual") continue;
    const [scope, ...rest] = key.split(":");
    if (scope !== "*" && scope !== targetId) continue;
    const fqn = rest[0] as string;
    if (ok.has(fqn) || denied(fqn) !== undefined) continue;
    uncovered.push(`${key}: no positive call to ${fqn} ended ok`);
  }
  return uncovered;
}
