import { readVerdicts, type Verdict } from "../../types/scripts/engine-binding-verdicts";
import {
  INDEX_SLOT_CLASSIFICATIONS,
  type IndexSlotClassification,
} from "../../types/src/index-slot-classifications";
import { contextFor, type ScriptKind } from "./contexts";
import type { PassResult } from "./exemptions";
import { PROBE_DENYLIST } from "./probe-denylist";
import type { ProbeCall } from "./witness";

// The positive arguments of a function's first probed signature, by name.
export interface SignatureArgs {
  readonly names: readonly string[];
  readonly args: readonly string[];
}

// A slot addressing one of `count` elements by position in its native base.
// Each check is a statement block that raises when the slot misses. `at` is the
// probed function called with the slot set to a position; a context that reads
// the slot some other way (an options table, a return) ignores it. `base` is
// the slot's native base, so position `i` is TypeScript array element
// `i - base`.
interface IndexContext {
  // How many elements the slot addresses, as a TypeScript expression.
  readonly count: string;
  // Raises unless position `i` reaches element `i - base`.
  readonly reaches: (i: string, at: (i: string) => string, base: number) => string;
  // Raises unless the binding refuses `past`, the position one past the last.
  readonly beyond: (past: string, count: string, at: (i: string) => string) => string;
  // Argument overrides by parameter name, such as the body the slot indexes into.
  readonly args?: Readonly<Record<string, string>>;
}

export const PROBED_INDEX_CLASSES: ReadonlySet<string> = new Set(["native-1", "native-0"]);

// The base Defold counts a probed-class slot from: its first position.
export function indexBase(slotClass: string): number {
  return slotClass === "native-1" ? 1 : 0;
}

// The TypeScript array element position `i` addresses.
function element(i: string, base: number): string {
  return base === 0 ? i : `${i} - ${base}`;
}

const V4 = "ReturnType<typeof vmath.vector4>";
const tint = (i: string) => `vmath.vector4(0.25 * ${i}, 0.5, 0.75, 1)`;

function raises(call: string, what: string): string {
  return `{ const [accepted] = pcall(() => ${call}); if (accepted) error("${what}"); }`;
}

function returns(call: string, value: "undefined" | "false", what: string): string {
  return `if ((${call} as unknown) !== ${value}) error("${what}");`;
}

const PAST = "the engine accepts the position one past the last";

// `options.index` over the `tints[4]` constant, read back as a TypeScript
// array. `go.set` passes its options through a variable, which the call must
// leave as the caller wrote it.
function optionsSet(ns: "go" | "gui", target: string, viaVariable: boolean): IndexContext {
  return {
    count: "4",
    reaches: (i, _at, base) =>
      [
        viaVariable
          ? `const options = { index: ${i} }; ${ns}.set(${target}, "tints", ${tint(i)}, options); if (options.index !== ${i}) error("the call changed the caller's options");`
          : `${ns}.set(${target}, "tints", ${tint(i)}, { index: ${i} });`,
        `const tints = ${ns}.get(${target}, "tints") as unknown as ${V4}[];`,
        `if (tints[${element(i, base)}] !== ${tint(i)}) error("{ index: i } missed its element");`,
      ].join(" "),
    // The binding accepts a write past the end; it must not land in the array.
    beyond: (past, count) =>
      [
        `const before = ${ns}.get(${target}, "tints") as unknown as ${V4}[];`,
        `${ns}.set(${target}, "tints", vmath.vector4(0, 0, 0, 0), { index: ${past} });`,
        `const after = ${ns}.get(${target}, "tints") as unknown as ${V4}[];`,
        `for (let k = 0; k < ${count}; k++) if (after[k] !== before[k]) error("a write past the last element changed element k");`,
      ].join(" "),
  };
}

function optionsGet(ns: "go" | "gui", target: string): IndexContext {
  return {
    count: "4",
    reaches: (i, _at, base) =>
      [
        `${ns}.set(${target}, "tints", ${tint(i)}, { index: ${i} });`,
        `const tints = ${ns}.get(${target}, "tints") as unknown as ${V4}[];`,
        `if (${ns}.get(${target}, "tints", { index: ${i} }) !== tints[${element(i, base)}]) error("{ index: i } read another element");`,
      ].join(" "),
    beyond: (past) => raises(`${ns}.get(${target}, "tints", { index: ${past} })`, PAST),
  };
}

const TINTED_NODE = 'gui.get_node("tinted")';
const TRIO = "b2d.get_body(TRIO_COLLISION)!";
const TRIO_FIXTURES = `b2d.body.get_fixtures(${TRIO})`;
// `get_aabb` aborts the v2 engine on the three-fixture body, so it reads the
// probe's own body, whose fixture count earlier `create_fixture` probes raise.
const OWN = "b2d.get_body(COLLISION)!";

function fixtureBody(name: string): { body: string; count: string } {
  return name === "get_aabb"
    ? { body: OWN, count: `b2d.body.get_fixtures(${OWN}).length` }
    : { body: TRIO, count: "3" };
}
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
  "test_point",
];

// Each fixture of the three-fixture body is accepted, and `get_type` reads the
// type `get_fixtures` lists at the same position: the box, sphere, box order
// makes a shifted position read the wrong kind.
function fixtureContext(name: string): IndexContext {
  const { body, count } = fixtureBody(name);
  return {
    count,
    args: { body, child_index: "1" },
    reaches: (i, at, base) =>
      name === "get_type"
        ? `if (${at(i)} !== b2d.body.get_fixtures(${body})[${element(i, base)}]!.type) error("fixture i is not the one get_fixtures lists at i");`
        : `${at(i)};`,
    beyond: (past, _count, at) => raises(at(past), PAST),
  };
}

// The one child shape of a fixture.
function childContext(name: string): IndexContext {
  return {
    count: "1",
    args: { body: fixtureBody(name).body, fixture_index: "1" },
    reaches: (i, at) => `${at(i)};`,
    beyond: (past, _count, at) => raises(at(past), PAST),
  };
}

// Tiles 1, 2, 3 along the first row and 1, 4, 5 along the first column of
// `probe.tilemap`, whose bounds start at cell (1, 1).
const ROW = "[1, 2, 3]";
const COLUMN = "[1, 4, 5]";

function cell(axis: "x" | "y", i: string): string {
  return axis === "x" ? `${i}, 1` : `1, ${i}`;
}

function tileContext(fn: "set_tile" | "get_tile" | "get_tile_info", axis: "x" | "y"): IndexContext {
  const tiles = axis === "x" ? ROW : COLUMN;
  // A tilemap cell is 1-based.
  const call = (i: string) =>
    fn === "set_tile"
      ? `tilemap.set_tile(TILEMAP, "layer1", ${cell(axis, i)}, ${tiles}[${element(i, 1)}]!)`
      : `tilemap.${fn}(TILEMAP, "layer1", ${cell(axis, i)})`;
  return {
    count: "3",
    reaches: (i, _at, base) =>
      fn === "set_tile"
        ? `if (${call(i)} !== true) error("set_tile refused cell i");`
        : fn === "get_tile"
          ? `if (${call(i)} !== ${tiles}[${element(i, base)}]) error("cell i holds another tile");`
          : `if ((${call(i)} as { index: number } | undefined)?.index !== ${tiles}[${element(i, base)}]) error("cell i holds another tile");`,
    beyond: (past) =>
      fn === "set_tile"
        ? returns(`tilemap.set_tile(TILEMAP, "layer1", ${cell(axis, past)}, 1)`, "false", PAST)
        : returns(call(past), "undefined", PAST),
  };
}

// Keyed like `INDEX_SLOT_CLASSIFICATIONS`.
export const INDEX_CONTEXTS: Readonly<Record<string, IndexContext>> = {
  "go.set:param:options:index": optionsSet("go", "TINTED", true),
  "go.get:param:options:index": optionsGet("go", "TINTED"),
  "gui.set:param:options:index": optionsSet("gui", TINTED_NODE, false),
  "gui.get:param:options:index": optionsGet("gui", TINTED_NODE),
  ...Object.fromEntries(
    FIXTURE_CALLS.map((name) => [`b2d.fixture.${name}:param:fixture_index`, fixtureContext(name)]),
  ),
  ...Object.fromEntries(
    ["get_aabb", "get_filter_data", "set_filter_data"].map((name) => [
      `b2d.fixture.${name}:param:child_index`,
      childContext(name),
    ]),
  ),
  "b2d.body.get_fixtures:return:fixtures:index": {
    count: "3",
    reaches: (i, _at, base) =>
      `if (${TRIO_FIXTURES}[${element(i, base)}]!.index !== ${i}) error("the fixture listed at i has another index");`,
    beyond: (_past, count) =>
      [
        `const first = ${TRIO_FIXTURES}; const second = ${TRIO_FIXTURES};`,
        `if (first.length !== ${count}) error("the body does not list three fixtures");`,
        `for (let k = 0; k < ${count}; k++) if (first[k]!.index !== second[k]!.index) error("two calls list different indexes");`,
      ].join(" "),
  },
  ...Object.fromEntries(
    (["x", "y"] as const).flatMap((axis) =>
      (["set_tile", "get_tile", "get_tile_info"] as const).map((fn) => [
        `tilemap.${fn}:param:${axis}`,
        tileContext(fn, axis),
      ]),
    ),
  ),
  ...Object.fromEntries(
    (["x", "y"] as const).map((axis, slot) => [
      `tilemap.get_bounds:return:${axis}`,
      {
        count: "3",
        reaches: (_i: string, _at: (i: string) => string, base: number) =>
          `if (tilemap.get_bounds(TILEMAP)[${slot}] !== ${base}) error("the bounds do not start at the first cell");`,
        beyond: (_past: string, count: string) =>
          `if (tilemap.get_bounds(TILEMAP)[${slot + 2}] !== ${count}) error("the bounds are not three cells wide");`,
      },
    ]),
  ),
  // Both take 0 to USERFIELD_MAX - 1; `get_user_field` reads a crash dump, so
  // only the accepted range is checked.
  ...Object.fromEntries(
    ["set_user_field", "get_user_field"].map((name) => [
      `crash.${name}:param:index`,
      {
        count: "crash.USERFIELD_MAX",
        reaches: (i: string, at: (i: string) => string) => `${at(i)};`,
        beyond: (past: string, _count: string, at: (i: string) => string) => raises(at(past), PAST),
      },
    ]),
  ),
  // Earlier gui probes reorder the scene's root nodes, so fresh ones are made:
  // each follows the one made before it, and the first, moved to the bottom,
  // reads 0.
  "gui.get_index:return:index": {
    count: "3",
    reaches: (i, _at, base) =>
      [
        "const nodes = [0, 1, 2].map(() => gui.new_box_node(vmath.vector3(), vmath.vector3(1, 1, 0)));",
        `const ok = ${i} === ${base} ? (() => { gui.move_below(nodes[0]!, undefined); return gui.get_index(nodes[0]!) === ${base}; })() : gui.get_index(nodes[${element(i, base)}]!) === gui.get_index(nodes[${element(i, base)} - 1]!) + 1;`,
        "for (const node of nodes) gui.delete_node(node);",
        'if (!ok) error("a root node is not at the index its order gives");',
      ].join(" "),
    beyond: () => "",
  },
};

// A value an engine return produced, handed back through the slot it pairs
// with, reaching the element it came from. Keyed input, then return; `at` is the
// input called with the slot set to a value.
type RoundTrip = (at: (i: string) => string) => string;
const bounds = "const [x, y] = tilemap.get_bounds(TILEMAP);";
export const ROUND_TRIPS: Readonly<Record<string, Readonly<Record<string, RoundTrip>>>> = {
  ...Object.fromEntries(
    FIXTURE_CALLS.map((name) => [
      `b2d.fixture.${name}:param:fixture_index`,
      {
        "b2d.body.get_fixtures:return:fixtures:index": (at: (i: string) => string) => {
          const { body, count } = fixtureBody(name);
          const fixture = `b2d.body.get_fixtures(${body})[${count} - 1]!`;
          return name === "get_type"
            ? `const fixture = ${fixture}; if (${at("fixture.index")} !== fixture.type) error("the returned index reads another fixture");`
            : `${at(`${fixture}.index`)};`;
        },
      },
    ]),
  ),
  ...Object.fromEntries(
    (["x", "y"] as const).flatMap((axis) => [
      [
        `tilemap.get_tile:param:${axis}`,
        {
          [`tilemap.get_bounds:return:${axis}`]: () =>
            `${bounds} if (tilemap.get_tile(TILEMAP, "layer1", x, y) !== 1) error("the bounds origin reads another cell");`,
        },
      ],
      [
        `tilemap.get_tile_info:param:${axis}`,
        {
          [`tilemap.get_bounds:return:${axis}`]: () =>
            `${bounds} if ((tilemap.get_tile_info(TILEMAP, "layer1", x, y) as { index: number } | undefined)?.index !== 1) error("the bounds origin reads another cell");`,
        },
      ],
      [
        `tilemap.set_tile:param:${axis}`,
        {
          [`tilemap.get_bounds:return:${axis}`]: () =>
            `${bounds} if (tilemap.set_tile(TILEMAP, "layer1", x, y, 1) !== true) error("set_tile refused the bounds origin");`,
        },
      ],
    ]),
  ),
};

// Why each probed-class slot with no context is not checked in the engine.
export const UNPROBED_INDEX_SLOTS: Readonly<Record<string, string>> = {
  "b2d.fixture.set_shape:param:fixture_index":
    "Box2D v2 cannot change a fixture's shape kind, so one shape cannot fill every fixture of the box, sphere, box body",
  "b2d.body.destroy_fixture:param:fixture_index":
    "destroying a fixture changes the body every other fixture probe reads",
  "b2d.body.create_fixture:return:fixture:index":
    "creating a fixture changes the body every other fixture probe reads",
  "b2d.world.overlap_aabb:return:fixtures:index":
    "the result lists fixtures of every body in the box, so no position is known in advance",
  "b2d.world.overlap_shape:return:fixtures:index":
    "the result lists fixtures of every body under the shape, so no position is known in advance",
  "b2d.body.create_shape:return:result:index": "the v3 pass keeps no body with a known shape list",
  "b2d.body.destroy_shape:param:shape_index": "the v3 pass keeps no body with a known shape list",
  ...Object.fromEntries(
    [
      "are_contact_events_enabled",
      "are_hit_events_enabled",
      "are_pre_solve_events_enabled",
      "are_sensor_events_enabled",
      "enable_contact_events",
      "enable_hit_events",
      "enable_pre_solve_events",
      "enable_sensor_events",
      "get_body",
      "get_closest_point",
      "get_contact_capacity",
      "get_contact_data",
      "get_mass_data",
      "get_material",
      "get_sensor_capacity",
      "get_sensor_overlaps",
      "get_shape",
      "get_world",
      "is_valid",
      "ray_cast",
      "set_material",
      "set_shape",
    ].map((name) => [
      `b2d.shape.${name}:param:shape_index`,
      "the v3 pass keeps no body with a known shape list",
    ]),
  ),
  "client:send:param:i": "sending needs a connected socket peer",
  "client:send:param:j": "sending needs a connected socket peer",
  "client:send:return:index": "sending needs a connected socket peer",
  "client:send:return:lastindex": "sending needs a connected socket peer",
  "image.pixel:param:x": "an editor-only API; the engine runs no editor script",
  "image.pixel:param:y": "an editor-only API; the engine runs no editor script",
  "tilemap.tiles.get_info:return:info:index":
    "an editor-only API; the engine runs no editor script",
  "tilemap.tiles.get_tile:return:tile_index":
    "an editor-only API; the engine runs no editor script",
  "tilemap.tiles.set:param:tile_or_info": "an editor-only API; the engine runs no editor script",
  "tilemap.tiles.set:param:tile_or_info:index":
    "an editor-only API; the engine runs no editor script",
  "profiler.view_recorded_frame:param:frame_index:frame": "the probe records no profiler frames",
  "resource.create_atlas:param:table:frame_start": "the probe builds no atlas to animate",
  "resource.create_atlas:param:table:frame_end": "the probe builds no atlas to animate",
  "resource.set_atlas:param:table:frame_start": "the probe builds no atlas to animate",
  "resource.set_atlas:param:table:frame_end": "the probe builds no atlas to animate",
  "resource.create_atlas:param:table:animations:frames": "the probe builds no atlas to animate",
  "resource.set_atlas:param:table:animations:frames": "the probe builds no atlas to animate",
  "resource.set_texture:param:table:page": "the probe creates no array texture",
};

export interface Unverified {
  readonly key: string;
  readonly reason: string;
}

export interface IndexProbes {
  readonly calls: ProbeCall[];
  readonly unverified: Unverified[];
}

function parseKey(key: string): { fqn: string; slot: string; variant: string } {
  const [fqn, , slot, ...fields] = key.split(":") as [string, string, string, ...string[]];
  const variant = ["index", slot, ...fields].join("-");
  // A method key (`client:send:param:i`) splits one segment early.
  return fqn.includes(".") ? { fqn, slot, variant } : { fqn: `${fqn}:${slot}`, slot, variant };
}

function scriptKind(fqn: string): ScriptKind {
  return contextFor(fqn.slice(0, fqn.lastIndexOf("."))).kind;
}

// The call `fqn(...)` with the probed slot set to a position.
function caller(fqn: string, slot: string, signature: SignatureArgs, context: IndexContext) {
  const position = signature.names.indexOf(slot);
  return (i: string) => {
    const args = [...signature.args];
    for (const [name, value] of Object.entries(context.args ?? {})) {
      const at = signature.names.indexOf(name);
      if (at !== -1) args[at] = value;
    }
    if (position !== -1) args[position] = i;
    return `${fqn}(${args.join(", ")})`;
  };
}

// The first, a middle and the last position of each probed slot, the last also
// checking the position past it, and one call per return-to-argument pair.
// A probed-class slot with no context names its reason in
// `UNPROBED_INDEX_SLOTS`; one with neither is an error, so a new slot is never
// skipped silently.
export function indexProbeCalls(
  signatures: ReadonlyMap<string, SignatureArgs>,
  classifications: ReadonlyMap<string, IndexSlotClassification> = INDEX_SLOT_CLASSIFICATIONS,
): IndexProbes {
  const calls: ProbeCall[] = [];
  const unverified: Unverified[] = [];
  const probed = (key: string) => INDEX_CONTEXTS[key] !== undefined;
  for (const [key, classification] of classifications) {
    if (!PROBED_INDEX_CLASSES.has(classification.class)) continue;
    const context = INDEX_CONTEXTS[key];
    const { fqn, slot, variant } = parseKey(key);
    if (context === undefined) {
      const reason = UNPROBED_INDEX_SLOTS[key];
      if (reason === undefined) {
        throw new Error(`${key}: add an INDEX_CONTEXTS entry or an UNPROBED_INDEX_SLOTS reason`);
      }
      unverified.push({ key, reason });
      continue;
    }
    const signature = signatures.get(fqn);
    if (signature === undefined) {
      unverified.push({ key, reason: "this pass witnesses no call to the function" });
      continue;
    }
    const at = caller(fqn, slot, signature, context);
    const kind = scriptKind(fqn);
    const count = context.count;
    const base = indexBase(classification.class);
    const positions: [string, string][] =
      base === 1
        ? [
            ["first", "1"],
            ["middle", `math.floor(${count} / 2) + 1`],
            ["last", count],
          ]
        : [
            ["first", "0"],
            ["middle", `math.floor(${count} / 2)`],
            ["last", `${count} - 1`],
          ];
    const past = base === 1 ? `${count} + 1` : count;
    for (const [name, i] of positions) {
      const beyond = name === "last" ? ` ${context.beyond(past, count, at)}` : "";
      calls.push({
        name: fqn,
        variant: `${variant}-${name}`,
        kind,
        call: `{ const i = ${i}; ${context.reaches("i", at, base)}${beyond} }`,
        index: key,
      });
    }
    for (const pair of classification.pairsWith ?? []) {
      const trip = ROUND_TRIPS[key]?.[pair];
      if (trip === undefined) {
        if (!probed(pair)) {
          unverified.push({ key, reason: `no round trip from ${pair}, which is not probed` });
          continue;
        }
        throw new Error(`${key}: add a ROUND_TRIPS entry for ${pair}`);
      }
      calls.push({
        name: fqn,
        variant: `${variant}-from-${parseKey(pair).variant.slice("index-".length)}`,
        kind,
        call: `{ ${trip(at)} }`,
        index: key,
      });
    }
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
