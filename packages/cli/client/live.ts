import type { MachineIndex } from "../src/hsm-view-index";
import type { LiveInstance, LiveMove } from "../src/hsm-view-live";
import { ruleId } from "../src/hsm-view-rule-id";
import type { Snapshot, SnapshotEntry } from "../src/hsm-view-session";

/** The `onMove` causes other than `event`; any other reason in a console line is an event's `type`. */
const CAUSES: ReadonlySet<string> = new Set(["after", "update", "stop", "reload", "always"]);

export interface LiveFrame {
  readonly snapshot: Snapshot;
  /** Reported leaves the loaded machine has no state for. */
  readonly unknown: readonly string[];
}

export interface LiveFrameOptions {
  readonly move?: LiveMove;
  /** Seconds since attach. */
  readonly t?: number;
}

function ancestry(leaf: string): string[] {
  const parts = leaf.split("/").filter(Boolean);
  return parts.map((_, i) => `/${parts.slice(0, i + 1).join("/")}`);
}

function moveEntry(move: LiveMove, t: number): SnapshotEntry {
  const cause = CAUSES.has(move.reason) ? move.reason : "event";
  return {
    kind: "transition",
    t,
    from: move.from,
    to: move.to,
    cause,
    event: cause === "event" ? { type: move.reason } : undefined,
  };
}

/**
 * The id the index gives the rule a reported move names. A report holds the rule's state and key
 * but not its kind, so every kind the reason allows is tried, and the rule counts only when
 * exactly one of them is a rule the index places.
 */
export function firedRules(index: MachineIndex, move: LiveMove): readonly string[] {
  if (move.rule === undefined) {
    return [];
  }
  const { source, key } = move.rule;
  const candidates: string[] = [];
  if (key === undefined) {
    if (move.reason === "update") {
      candidates.push(ruleId(source, "update"));
    }
  } else {
    candidates.push(ruleId(source, "on", move.reason, key));
    if (move.reason === "always") {
      candidates.push(ruleId(source, "always", key));
    }
    if (move.reason === "after") {
      // A list entry's id holds its index as a number, a record entry's its delay key as text.
      candidates.push(ruleId(source, "after", key), ruleId(source, "after", String(key)));
    }
  }
  const placed = candidates.filter((id) => index.rules[id] !== undefined);
  return placed.length === 1 ? placed : [];
}

/**
 * What the page shows for one reported state of a game's instance, as a snapshot the simulation
 * could have produced: the rule a move names fired, none rejected, no event accepted, no ctx.
 */
export function liveSnapshot(
  index: MachineIndex,
  previous: Snapshot | undefined,
  instance: LiveInstance,
  options: LiveFrameOptions = {},
): LiveFrame {
  const t = options.t ?? 0;
  const known = instance.leaves.filter((leaf) => index.states[leaf] !== undefined);
  const unknown = instance.leaves.filter((leaf) => index.states[leaf] === undefined);
  const active = [
    ...new Set(known.flatMap((leaf) => ancestry(leaf).filter((p) => index.states[p]))),
  ];
  const before = new Set(previous?.active ?? []);
  return {
    snapshot: {
      machines: previous?.machines ?? [],
      picked: previous?.picked,
      running: !instance.stopped,
      t,
      path: known[0],
      active,
      leaves: known,
      entered: active.filter((statePath) => !before.has(statePath)),
      fired: options.move === undefined ? [] : firedRules(index, options.move),
      rejected: [],
      accepts: [],
      ctx: undefined,
      entries: options.move === undefined ? [] : [moveEntry(options.move, t)],
    },
    unknown,
  };
}
